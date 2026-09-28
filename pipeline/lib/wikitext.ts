/**
 * Pure functions that extract "できごと" (events) from the wikitext of ja.wikipedia "YYYY年" pages.
 * No network access (testable with fixtures).
 */

export interface WikiLink {
	target: string;
	label: string;
}

export interface RawEvent {
	year: number;
	month: number | null;
	day: number | null;
	precision: 'day' | 'month' | 'year';
	/** Body converted to plain text */
	text: string;
	/** Internal links in the body (date and year links already excluded) */
	links: WikiLink[];
	/** Region hint taken from a leading tag such as 「【日本】」 in the body */
	regionHint?: 'japan' | 'world' | 'both';
}

/** Extract only the contents of the "== できごと ==" section (variants such as 「出来事・事柄」 are allowed) */
export function extractEventsSection(wikitext: string): string | null {
	const m = wikitext.match(/^==\s*(?:できごと|出来事)[^=\n]*==\s*$/m);
	if (!m || m.index === undefined) return null;
	const from = m.index + m[0].length;
	const rest = wikitext.slice(from);
	const next = rest.match(/^==[^=].*==\s*$/m);
	return next && next.index !== undefined ? rest.slice(0, next.index) : rest;
}

/** Whether a link is not used for scoring, e.g. date links and year links */
export function isDateLikeTarget(target: string): boolean {
	return (
		/^\d{1,2}月(\d{1,2}日)?(\s*\(旧暦\))?$/.test(target) ||
		/^\d{1,4}年$/.test(target) ||
		/^(慶応|明治|大正|昭和|平成|令和)(\d{1,2}年)?$/.test(target) ||
		/^\d{1,4}年代$/.test(target)
	);
}

/** {{仮リンク|label|...}} → label; strip other templates, refs, comments, and emphasis */
export function stripMarkup(wikitext: string): string {
	let s = wikitext;
	s = s.replace(/<!--[\s\S]*?-->/g, '');
	s = s.replace(/<ref[^>]*\/>/gi, '');
	s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
	// Other HTML tags (<sup> etc.): strip only the tags and keep the contents
	s = s.replace(/<\/?[a-z][^>]*>/gi, '');
	s = s.replace(/\{\{仮リンク\|([^|{}]*)[^{}]*\}\}/g, '$1');
	// Strip nested templates from the inside out
	let prev = '';
	while (prev !== s) {
		prev = s;
		s = s.replace(/\{\{[^{}]*\}\}/g, '');
	}
	s = s.replace(/'{2,}/g, '');
	return s;
}

/** Replace [[target|label]] / [[target]] with the label while collecting the links */
export function replaceLinks(text: string): { text: string; links: WikiLink[] } {
	const links: WikiLink[] = [];
	const out = text.replace(/\[\[([^[\]|]*)(?:\|([^[\]]*))?\]\]/g, (_, target: string, label?: string) => {
		const t = target.trim();
		// File and category links are removed along with their text
		if (/^(?:ファイル|File|画像|Image|Category|カテゴリ):/i.test(t)) return '';
		const l = (label ?? t).trim();
		if (!isDateLikeTarget(t)) links.push({ target: t, label: l });
		return l;
	});
	return { text: out, links };
}

/**
 * Separator between the date and the body. Besides dashes, full-width/half-width colons also occur
 * (e.g. the 2001 page and the 1953 Japan page use 「M月D日：本文」 throughout).
 */
const SEP = '[-–—−‐：:]';

/**
 * Collapse range notations such as 「8月25日～8月26日 - 本文」 to just the start date.
 * Without this the date is not parsed and falls back to the start of the month (precision=month).
 * The second date may also be a link with the month omitted, such as 「[[8月26日|26日]]」.
 */
export function collapseDateRange(text: string): string {
	return text.replace(
		/^((?:\[\[)?\d{1,2}月\d{1,2}日(?:\]\])?)\s*(?:[〜～~]|から)\s*(?:\[\[)?(?:\d{1,2}月)?\d{1,2}日(?:\|[^\]|]*)?(?:\]\])?/,
		'$1',
	);
}

export interface ForcedDate {
	month: number | null;
	day: number | null;
	precision: RawEvent['precision'];
}

/** Whether the line is date-only, like 「[[10月1日]]」 or 「[[3月]] -」 (parent of multiple same-day events). Also handles unlinked dates */
export function parseDateOnly(stripped: string): ForcedDate | null {
	const m = stripped.match(
		new RegExp(
			`^(?:\\[\\[)?(\\d{1,2})月(?:(\\d{1,2})日)?(\\s*\\(旧暦\\))?(?:\\]\\])?\\s*${SEP}?\\s*$`,
		),
	);
	if (!m) return null;
	const month = Number(m[1]);
	if (month < 1 || month > 12) return null;
	if (m[2] !== undefined) {
		const day = Number(m[2]);
		if (day < 1 || day > 31) return null;
		// Old-calendar (旧暦) dates can be off from the Gregorian calendar by up to about a month, so do not claim day precision
		return { month, day, precision: m[3] ? 'month' : 'day' };
	}
	return { month, day: null, precision: 'month' };
}

/** Parse one bullet line (passed with the leading 「* 」 already removed) */
export function parseBulletLine(
	content: string,
	year: number,
	sectionMonth: number | null,
	forced?: ForcedDate,
): RawEvent | null {
	const stripped = collapseDateRange(stripMarkup(content).trim());
	if (stripped === '') return null;

	let month = forced ? forced.month : sectionMonth;
	let day: number | null = forced ? forced.day : null;
	let precision: RawEvent['precision'] = forced
		? forced.precision
		: sectionMonth === null
			? 'year'
			: 'month';
	let body = stripped;

	// 「[[M月D日]]（old-calendar note etc.） - 本文」 / 「[[M月]] - 本文」. Also handles unlinked dates.
	// Even for nested lines (with forced), prefer the line's own date if it has one
	const dm = stripped.match(
		new RegExp(
			`^(?:\\[\\[)?(\\d{1,2})月(?:(\\d{1,2})日)?(\\s*\\(旧暦\\))?(?:\\]\\])?\\s*(?:（[^）]*）|\\([^)]*\\))?\\s*${SEP}\\s*(.*)$`,
		),
	);
	if (dm) {
		month = Number(dm[1]);
		if (dm[2] !== undefined) {
			day = Number(dm[2]);
			// Old-calendar dates do not claim day precision (still used for positioning)
			precision = dm[3] ? 'month' : 'day';
		} else {
			precision = 'month';
		}
		body = dm[4];
	}

	// Remove the second date of a date range (「[[10月22日]] - [[10月24日]] - 本文」),
	// season prefixes such as 「夏 - 」, and the 「日付不明 - 」 (date unknown) marker
	body = body.replace(new RegExp(`^(?:\\[\\[)?\\d{1,2}月\\d{1,2}日(?:\\]\\])?\\s*${SEP}\\s*`), '');
	body = body.replace(
		new RegExp(`^(春|夏|秋|冬|年初|年央|年末|上半期|下半期|日付不明)\\s*${SEP}\\s*`),
		'',
	);

	// Collect leading tags such as 「【日本】」 or 「【世界・アメリカ合衆国】」 as a region hint
	let regionHint: RawEvent['regionHint'];
	const tag = body.match(/^【([^】]{1,24})】\s*/);
	if (tag) {
		const inner = tag[1];
		const hasJapan = /日本/.test(inner);
		const hasOther = /・/.test(inner) ? inner.split('・').some((s) => !/日本/.test(s)) : !hasJapan;
		regionHint = hasJapan && hasOther ? 'both' : hasJapan ? 'japan' : 'world';
		body = body.slice(tag[0].length);
		// When the tag doubles as the subject, as in 「【ブラジル】の前大統領が…」, keep the word in the body
		if (body.startsWith('の')) body = inner + body;
	}
	// Drop the particle 「の」 left at the start after removing a flag template ({{BRA}} etc.)
	body = body.replace(/^の/, '');

	const { text, links } = replaceLinks(body);
	const clean = text
		.replace(/（\s*）|\(\s*\)/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (clean === '') return null;
	if (month !== null && (month < 1 || month > 12)) return null;
	if (day !== null && (day < 1 || day > 31)) return null;

	return { year, month, day, precision, text: clean, links, ...(regionHint ? { regionHint } : {}) };
}

/** Get RawEvent[] from the whole wikitext of a year page */
export function parseYearPage(wikitext: string, year: number): RawEvent[] {
	const section = extractEventsSection(wikitext);
	if (section === null) return [];

	const events: RawEvent[] = [];
	let sectionMonth: number | null = null;
	/** If the preceding 「*」 was date-only, that date (the following 「**」 is the event body) */
	let pendingDate: ForcedDate | null = null;

	// Remove multi-line HTML comments first (so commented-out bullets are not picked up)
	for (const line of section.replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
		const heading = line.match(/^===+\s*(.+?)\s*===+\s*$/);
		if (heading) {
			const hm = heading[1].match(/^(\d{1,2})月$/);
			sectionMonth = hm ? Number(hm[1]) : null;
			pendingDate = null;
			continue;
		}
		const sub = line.match(/^\*\*(?!\*)\s*(.*)$/);
		if (sub) {
			// A nested line following a date-only parent is an event on that date. Other nested lines are supplements to the parent and are ignored
			if (pendingDate) {
				const ev = parseBulletLine(sub[1], year, sectionMonth, pendingDate);
				if (ev) events.push(ev);
			}
			continue;
		}
		const bullet = line.match(/^\*(?!\*)\s*(.*)$/);
		if (!bullet) continue;
		const dateOnly = parseDateOnly(stripMarkup(bullet[1]).trim());
		if (dateOnly) {
			pendingDate = dateOnly;
			continue;
		}
		pendingDate = null;
		const ev = parseBulletLine(bullet[1], year, sectionMonth);
		if (ev) events.push(ev);
	}
	return events;
}

/** 32-bit FNV-1a. Used for stable event IDs */
export function fnv1a(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

/** RawEvent → ISO date (month/year precision padded with 01) and ID */
export function eventDateAndId(ev: RawEvent): { date: string; id: string } {
	const mm = String(ev.month ?? 1).padStart(2, '0');
	const dd = String(ev.day ?? 1).padStart(2, '0');
	const date = `${ev.year}-${mm}-${dd}`;
	return { date, id: `${date}-${fnv1a(ev.text)}` };
}
