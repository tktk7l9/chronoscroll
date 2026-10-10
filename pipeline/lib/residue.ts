/**
 * Detection of wiki markup / template residue in generated event text (title + summary).
 *
 * The year-page parser (wikitext.ts) strips templates and refs line by line, so a few constructs survive as fragments:
 * a <ref>{{Cite …}} that continues on the next line leaves 「{{Cite news」 at the end of the text, an unparsed date
 * form such as 「4月9–13日 - 」 stays in front of the body, 「…も参照」 cross references of the year page come along,
 * and a {{仮リンク|記事名|…|label=表示名}} is rendered with its first argument (「暗殺事件される」).
 * Changing the parser output would change the ids (id = date + hash of the text), so the text is corrected through
 * content/curated/ instead. This module only flags residue so the monthly refresh surfaces new cases
 * (build.ts stats, pipeline/content.test.ts). Pure functions, no IO.
 */
import type { NewsEvent } from '../../src/lib/types.ts';

export interface ResiduePattern {
	name: string;
	/** What the match looks like (for the report) */
	description: string;
	re: RegExp;
}

/** Separators used between a date and the body on the year pages (see SEP in wikitext.ts) */
const SEP = '[-–—−‐]';

export const RESIDUE_PATTERNS: readonly ResiduePattern[] = [
	{ name: 'braces', description: 'unclosed template, usually a <ref>{{Cite …}} that spans lines', re: /\{\{|\}\}/ },
	{ name: 'wikilink', description: '[[…]] that spans lines (file links)', re: /\[\[|\]\]/ },
	{
		name: 'ref_tag',
		description: '<ref> or another HTML tag',
		re: /<\/?ref\b|<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/i,
	},
	{ name: 'html_entity', description: '&nbsp; or another HTML entity', re: /&(?:[a-z]+|#\d+);/i },
	{
		name: 'template_param',
		description: 'template name or parameter left as text',
		re: /\blabel\s*=|仮リンク|要出典|要検証/,
	},
	{
		name: 'noun_verb',
		description: '「…事件される」: a 仮リンク rendered with its first argument instead of its label',
		re: /事件(?:され|した)/,
	},
	{
		name: 'leading_date',
		description: 'date fragment left in front of the body (unparsed date form such as 「9–13日 - 」)',
		re: new RegExp(`^.{0,12}?\\d{1,2}[日月]\\s*${SEP}`),
	},
	{ name: 'see_also', description: 'year-page cross reference (「…も参照」)', re: /も参照|を参照/ },
	{
		name: 'edge_separator',
		description: 'text starts or ends with a separator',
		re: new RegExp(`^\\s*(?:${SEP}|[:：])|${SEP}\\s*$`),
	},
	{ name: 'double_punct', description: '「。。」 or 「、、」', re: /。。|、、/ },
	{ name: 'empty_quote', description: '「」 left by a dropped template', re: /「」|『』/ },
];

const BRACKET_PAIRS: readonly [string, string][] = [
	['「', '」'],
	['『', '』'],
	['（', '）'],
	['(', ')'],
	['【', '】'],
	['《', '》'],
	['〈', '〉'],
	['［', '］'],
	['[', ']'],
];

function count(text: string, ch: string): number {
	return text.split(ch).length - 1;
}

/** Bracket pairs whose opening and closing counts differ, as 「「」」-style labels */
export function unbalancedBrackets(text: string): string[] {
	return BRACKET_PAIRS.filter(([open, close]) => count(text, open) !== count(text, close)).map(
		([open, close]) => `${open}${close}`,
	);
}

export interface FindResidueOptions {
	/** Also check bracket balance (off for a title truncated with 「…」, which is unbalanced by design) */
	balance?: boolean;
}

/** Names of the residue patterns found in one text (plus 'unbalanced' when bracket counts differ) */
export function findResidue(text: string, { balance = true }: FindResidueOptions = {}): string[] {
	const names = RESIDUE_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
	if (balance && unbalancedBrackets(text).length > 0) names.push('unbalanced');
	return names;
}

/** Residue pattern names found in an event's summary or title */
export function eventResidue(ev: Pick<NewsEvent, 'title' | 'summary'>): string[] {
	const names = new Set(findResidue(ev.summary));
	for (const n of findResidue(ev.title, { balance: !ev.title.endsWith('…') })) names.add(n);
	return [...names];
}

export interface ResidueSummary {
	/** Events with at least one pattern */
	flagged: number;
	/** Event ids per pattern name, in input order */
	byPattern: Map<string, string[]>;
}

export function residueSummary(events: readonly Pick<NewsEvent, 'id' | 'title' | 'summary'>[]): ResidueSummary {
	const byPattern = new Map<string, string[]>();
	let flagged = 0;
	for (const ev of events) {
		const names = eventResidue(ev);
		if (names.length === 0) continue;
		flagged++;
		for (const n of names) {
			const ids = byPattern.get(n);
			if (ids) ids.push(ev.id);
			else byPattern.set(n, [ev.id]);
		}
	}
	return { flagged, byPattern };
}

export interface CeilingExcess {
	name: string;
	count: number;
	ceiling: number;
}

/**
 * Residue classes whose event count is above the allowed ceiling (a class missing from `ceiling` allows none).
 * pipeline/content.test.ts keeps the committed data at or below its per-class ceiling, so fixed cases cannot come back
 * and new ones cannot pile up unnoticed.
 */
export function residueOverCeiling(
	summary: ResidueSummary,
	ceiling: Readonly<Record<string, number>>,
): CeilingExcess[] {
	return [...summary.byPattern]
		.map(([name, ids]) => ({ name, count: ids.length, ceiling: ceiling[name] ?? 0 }))
		.filter((x) => x.count > x.ceiling);
}

/** Multi-line report for the build log: counts per pattern (descending) with the first few ids */
export function formatResidueReport(summary: ResidueSummary, total: number, sampleSize = 8): string {
	const lines = [`⚠️ markup residue in generated text: ${summary.flagged} of ${total} events (fix via content/curated/)`];
	const rows = [...summary.byPattern].sort((a, b) => b[1].length - a[1].length);
	for (const [name, ids] of rows) {
		const desc = RESIDUE_PATTERNS.find((p) => p.name === name)?.description ?? 'bracket counts differ';
		const more = ids.length > sampleSize ? `, … (+${ids.length - sampleSize})` : '';
		lines.push(`  ${name}: ${ids.length} — ${desc}: ${ids.slice(0, sampleSize).join(', ')}${more}`);
	}
	return lines.join('\n');
}
