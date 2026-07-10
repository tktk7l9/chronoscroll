/**
 * ja.wikipedia「YYYY年」ページの wikitext から「できごと」を抽出する純関数群。
 * ネットワークは触らない（fixtureでテスト可能）。
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
	/** プレーンテキスト化した本文 */
	text: string;
	/** 本文中の内部リンク（日付・年リンクは除外済み） */
	links: WikiLink[];
	/** 本文先頭の「【日本】」等のタグから得た地域ヒント */
	regionHint?: 'japan' | 'world' | 'both';
}

/** 「== できごと ==」セクションの中身だけを取り出す（「出来事・事柄」等の変種も許容） */
export function extractEventsSection(wikitext: string): string | null {
	const m = wikitext.match(/^==\s*(?:できごと|出来事)[^=\n]*==\s*$/m);
	if (!m || m.index === undefined) return null;
	const from = m.index + m[0].length;
	const rest = wikitext.slice(from);
	const next = rest.match(/^==[^=].*==\s*$/m);
	return next && next.index !== undefined ? rest.slice(0, next.index) : rest;
}

/** 日付リンクや年リンクなど、スコアリングに使わないリンクか */
export function isDateLikeTarget(target: string): boolean {
	return (
		/^\d{1,2}月(\d{1,2}日)?(\s*\(旧暦\))?$/.test(target) ||
		/^\d{1,4}年$/.test(target) ||
		/^(慶応|明治|大正|昭和|平成|令和)(\d{1,2}年)?$/.test(target) ||
		/^\d{1,4}年代$/.test(target)
	);
}

/** {{仮リンク|label|...}} → label、その他テンプレート・ref・コメント・強調を除去 */
export function stripMarkup(wikitext: string): string {
	let s = wikitext;
	s = s.replace(/<!--[\s\S]*?-->/g, '');
	s = s.replace(/<ref[^>]*\/>/gi, '');
	s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
	// その他のHTMLタグ（<sup>等）はタグのみ除去して中身を残す
	s = s.replace(/<\/?[a-z][^>]*>/gi, '');
	s = s.replace(/\{\{仮リンク\|([^|{}]*)[^{}]*\}\}/g, '$1');
	// ネストしたテンプレートを内側から除去
	let prev = '';
	while (prev !== s) {
		prev = s;
		s = s.replace(/\{\{[^{}]*\}\}/g, '');
	}
	s = s.replace(/'{2,}/g, '');
	return s;
}

/** [[target|label]] / [[target]] をラベルに置換しつつリンクを収集する */
export function replaceLinks(text: string): { text: string; links: WikiLink[] } {
	const links: WikiLink[] = [];
	const out = text.replace(/\[\[([^[\]|]*)(?:\|([^[\]]*))?\]\]/g, (_, target: string, label?: string) => {
		const t = target.trim();
		// ファイル・カテゴリリンクは本文ごと除去
		if (/^(?:ファイル|File|画像|Image|Category|カテゴリ):/i.test(t)) return '';
		const l = (label ?? t).trim();
		if (!isDateLikeTarget(t)) links.push({ target: t, label: l });
		return l;
	});
	return { text: out, links };
}

export interface ForcedDate {
	month: number | null;
	day: number | null;
	precision: RawEvent['precision'];
}

/** 「[[10月1日]]」「[[3月]] -」のような日付だけの行か（同日複数イベントの親）。リンクなし表記にも対応 */
export function parseDateOnly(stripped: string): ForcedDate | null {
	const m = stripped.match(
		/^(?:\[\[)?(\d{1,2})月(?:(\d{1,2})日)?(\s*\(旧暦\))?(?:\]\])?\s*[-–—−‐]?\s*$/,
	);
	if (!m) return null;
	const month = Number(m[1]);
	if (month < 1 || month > 12) return null;
	if (m[2] !== undefined) {
		const day = Number(m[2]);
		if (day < 1 || day > 31) return null;
		// 旧暦の日付はグレゴリオ暦と最大1ヶ月程度ズレるため、日単位の精度は主張しない
		return { month, day, precision: m[3] ? 'month' : 'day' };
	}
	return { month, day: null, precision: 'month' };
}

/** 箇条書き1行を解析する（先頭の「* 」は除去済みで渡す） */
export function parseBulletLine(
	content: string,
	year: number,
	sectionMonth: number | null,
	forced?: ForcedDate,
): RawEvent | null {
	const stripped = stripMarkup(content).trim();
	if (stripped === '') return null;

	let month = forced ? forced.month : sectionMonth;
	let day: number | null = forced ? forced.day : null;
	let precision: RawEvent['precision'] = forced
		? forced.precision
		: sectionMonth === null
			? 'year'
			: 'month';
	let body = stripped;

	// 「[[M月D日]]（旧暦注記など） - 本文」/「[[M月]] - 本文」。リンクなし日付にも対応。
	// ネスト行（forcedあり）でも自前の日付があればそちらを優先する
	const dm = stripped.match(
		/^(?:\[\[)?(\d{1,2})月(?:(\d{1,2})日)?(\s*\(旧暦\))?(?:\]\])?\s*(?:（[^）]*）|\([^)]*\))?\s*[-–—−‐]\s*(.*)$/,
	);
	if (dm) {
		month = Number(dm[1]);
		if (dm[2] !== undefined) {
			day = Number(dm[2]);
			// 旧暦日付は日単位の精度を主張しない（位置決めには使う）
			precision = dm[3] ? 'month' : 'day';
		} else {
			precision = 'month';
		}
		body = dm[4];
	}

	// 日付レンジ表記（「[[10月22日]] - [[10月24日]] - 本文」）の2つ目の日付と、
	// 「夏 - 」のような季節プレフィックスを除去
	body = body.replace(/^(?:\[\[)?\d{1,2}月\d{1,2}日(?:\]\])?\s*[-–—−‐]\s*/, '');
	body = body.replace(/^(春|夏|秋|冬|年初|年央|年末|上半期|下半期)\s*[-–—−‐]\s*/, '');

	// 先頭の「【日本】」「【世界・アメリカ合衆国】」等のタグは地域ヒントとして回収
	let regionHint: RawEvent['regionHint'];
	const tag = body.match(/^【([^】]{1,24})】\s*/);
	if (tag) {
		const inner = tag[1];
		const hasJapan = /日本/.test(inner);
		const hasOther = /・/.test(inner) ? inner.split('・').some((s) => !/日本/.test(s)) : !hasJapan;
		regionHint = hasJapan && hasOther ? 'both' : hasJapan ? 'japan' : 'world';
		body = body.slice(tag[0].length);
		// 「【ブラジル】の前大統領が…」のようにタグが主語を兼ねる場合は語を本文に残す
		if (body.startsWith('の')) body = inner + body;
	}
	// 国旗テンプレート（{{BRA}}等）の除去で先頭に残った助詞「の」は落とす
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

/** 年ページのwikitext全体から RawEvent[] を得る */
export function parseYearPage(wikitext: string, year: number): RawEvent[] {
	const section = extractEventsSection(wikitext);
	if (section === null) return [];

	const events: RawEvent[] = [];
	let sectionMonth: number | null = null;
	/** 直前の「*」が日付のみだった場合、その日付（続く「**」がイベント本体） */
	let pendingDate: ForcedDate | null = null;

	// 複数行にまたがるHTMLコメントを先に除去（コメントアウトされた箇条書きを拾わない）
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
			// 日付のみの親に続くネストは、その日付のイベント。それ以外のネストは親の補足なので無視
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

/** 32bit FNV-1a。安定したイベントIDに使う */
export function fnv1a(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

/** RawEvent → ISO日付（month/year precisionは01埋め）とID */
export function eventDateAndId(ev: RawEvent): { date: string; id: string } {
	const mm = String(ev.month ?? 1).padStart(2, '0');
	const dd = String(ev.day ?? 1).padStart(2, '0');
	const date = `${ev.year}-${mm}-${dd}`;
	return { date, id: `${date}-${fnv1a(ev.text)}` };
}
