/**
 * Guards for the hand-written content layer, plus a warn-level scan of the generated data.
 *
 * - content/curated and content/collections: titles and summaries must be free of markup residue, and a `date`
 *   override must stay in the year of the id (hard fail: this is our own text, see pipeline/lib/residue.ts and
 *   crossYearDateOverrides).
 * - static/data/chunks: the committed data must carry the curated title/summary/date (catches a forgotten
 *   regeneration). Residue in the generated text is only reported, so a new case on Wikipedia never blocks the
 *   monthly data refresh (data-refresh.yml runs the tests before it opens the PR); build.ts prints the same report.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { NewsEvent } from '../src/lib/types.ts';
import { parseCollectionYaml } from './lib/collections.ts';
import { crossYearDateOverrides, parseCuratedYaml, type CuratedEntry } from './lib/curate.ts';
import { findResidue, formatResidueReport, residueOverCeiling, residueSummary } from './lib/residue.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Most events allowed per residue class in the committed data (a class not listed allows none). It only goes down:
 * lower an entry in the same commit as the fixes; when new cases appear, fix them in content/curated/fixes.yaml
 * instead of raising it. Left on purpose (2026-10): leading_date 1938-01-01-1a7d4cff and 1944-02-01-74b78a28 (the
 * year page links one day and shows another, and no source settles it), see_also 2021-03-01-99bcdb98 (a bare
 * 「…も参照」 line without event text; the earthquake is 2021-03-20-975b7871).
 */
const RESIDUE_CEILING: Readonly<Record<string, number>> = { leading_date: 2, see_also: 1 };

function yamlFiles(dir: string): string[] {
	return readdirSync(join(ROOT, dir))
		.filter((f) => /\.ya?ml$/.test(f))
		.sort()
		.map((f) => join(ROOT, dir, f));
}

/** Every hand-written entry with the file it comes from (collections last, as in build.ts) */
function loadEntries(): { file: string; entry: CuratedEntry }[] {
	const out: { file: string; entry: CuratedEntry }[] = [];
	for (const file of yamlFiles('content/curated')) {
		for (const entry of parseCuratedYaml(readFileSync(file, 'utf8'))) out.push({ file, entry });
	}
	for (const file of yamlFiles('content/collections')) {
		for (const entry of parseCollectionYaml(readFileSync(file, 'utf8')).entries) out.push({ file, entry });
	}
	return out;
}

function loadEvents(): Map<string, NewsEvent> {
	const byId = new Map<string, NewsEvent>();
	const dir = join(ROOT, 'static/data/chunks');
	for (const f of readdirSync(dir)) {
		for (const e of JSON.parse(readFileSync(join(dir, f), 'utf8')) as NewsEvent[]) byId.set(e.id, e);
	}
	return byId;
}

describe('hand-written content (content/curated, content/collections)', () => {
	const entries = loadEntries();

	it('has no markup residue in titles and summaries', () => {
		const problems: string[] = [];
		for (const { file, entry } of entries) {
			for (const field of ['title', 'summary'] as const) {
				const text = entry[field];
				if (text === undefined) continue;
				// A title truncated with 「…」 is unbalanced by design (same rule as eventResidue)
				const found = findResidue(text, { balance: field === 'summary' || !text.endsWith('…') });
				if (found.length > 0) problems.push(`${file}: ${entry.id} ${field} [${found.join(', ')}] ${text}`);
			}
		}
		expect(problems).toEqual([]);
	});

	it('keeps every date override within the year of the id', () => {
		expect(crossYearDateOverrides(entries.map((x) => x.entry))).toEqual([]);
	});
});

describe('generated data (static/data/chunks)', () => {
	const events = loadEvents();

	it('carries the curated title, summary and date of every matched entry', () => {
		// The same id may appear in several files; the last one wins (collections after curated), as in applyCurated
		const effective = new Map<string, CuratedEntry>();
		for (const { entry } of loadEntries()) {
			effective.set(entry.id, { ...(effective.get(entry.id) ?? { id: entry.id }), ...entry });
		}
		const mismatches: string[] = [];
		const unmatched: string[] = [];
		for (const [id, entry] of effective) {
			const ev = events.get(id);
			if (!ev) {
				unmatched.push(id);
				continue;
			}
			for (const field of ['title', 'summary', 'date'] as const) {
				if (entry[field] !== undefined && ev[field] !== entry[field]) {
					mismatches.push(`${id} ${field}: data "${ev[field]}" vs curated "${entry[field]}"`);
				}
			}
		}
		// Ids that no longer exist after a refresh are reported by build.ts (⚠️ curated ids with no match)
		if (unmatched.length > 0) console.warn(`curated ids not in the data: ${unmatched.join(', ')}`);
		expect(mismatches).toEqual([]);
	});

	it('reports markup residue without failing (fix via content/curated/)', () => {
		const summary = residueSummary([...events.values()]);
		if (summary.flagged > 0) {
			// Vitest hides console output of passing tests, so write to stderr directly. Under GitHub Actions the
			// first line also becomes a warning annotation on the run (the monthly data-refresh job runs this test)
			const report = formatResidueReport(summary, events.size);
			const counts = [...summary.byPattern].map(([n, ids]) => `${n} ${ids.length}`).join(', ');
			if (process.env.GITHUB_ACTIONS) {
				process.stderr.write(`::warning title=markup residue in generated text::${summary.flagged} events (${counts})\n`);
			}
			process.stderr.write(`${report}\n`);
		}
		expect(summary.byPattern.size).toBeGreaterThanOrEqual(0);
	});

	it('keeps residue per class at or below the committed ceiling', () => {
		const over = residueOverCeiling(residueSummary([...events.values()]), RESIDUE_CEILING);
		const text = over.map((x) => `${x.name} ${x.count} > ${x.ceiling}`).join(', ');
		// The monthly data-refresh job runs the tests before it opens its PR and must not be blocked by a new case on
		// Wikipedia: it only annotates the run, and CI on main fails until the cases are fixed in fixes.yaml
		if (over.length > 0 && process.env.GITHUB_WORKFLOW === 'data-refresh') {
			process.stderr.write(`::warning title=markup residue above the ceiling::${text}\n`);
			return;
		}
		expect(over, `residue above the ceiling (${text}); fix the cases in content/curated/fixes.yaml`).toEqual([]);
	});
});
