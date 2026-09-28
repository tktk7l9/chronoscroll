/**
 * Prominence scoring.
 * Raw score = based on the Wikidata sitelink count (number of language editions) of the linked articles.
 * The bias that newer eras have richer articles is corrected by per-decade percentile normalization.
 */

/**
 * IDF-like weight that decays link targets that appear frequently in the dataset.
 * Country names and big cities (アメリカ合衆国 etc.) appear hundreds of times as context,
 * so even with large sitelink counts they must not outweigh the event's own subject.
 */
export function idfWeight(documentFrequency: number): number {
	return 1 / (1 + Math.log(Math.max(1, documentFrequency)));
}

/** Cap on the sitelink count, so huge country/big-city articles do not overwhelm the subject article */
export const SITELINK_CAP = 150;
/** Decay rate for "context" articles such as place names and languages */
export const GEO_WEIGHT = 0.35;

const GEO_SUFFIX_RE =
	/(共和国|王国|帝国|連邦|公国|首長国|合衆国|自由国|連合王国|民主共和国|人民共和国|社会主義共和国)$|(州|省|市|都|府|県|地方|大陸|半島)$|[^物]語$/;

const GEO_NAMES = new Set([
	'アメリカ','米国','イギリス','グレートブリテン及びアイルランド連合王国','フランス','ドイツ','イタリア','スペイン','ポルトガル','オランダ','ベルギー','スイス','オーストリア','ギリシャ','トルコ','ロシア','ソビエト連邦','ソ連','中国','中華人民共和国','中華民国','台湾','韓国','大韓民国','北朝鮮','朝鮮民主主義人民共和国','朝鮮','インド','パキスタン','イラン','イラク','イスラエル','エジプト','カナダ','メキシコ','ブラジル','アルゼンチン','チリ','ペルー','コロンビア','ベネズエラ','キューバ','オーストラリア','ニュージーランド','デンマーク','スウェーデン','ノルウェー','フィンランド','ポーランド','ハンガリー','チェコ','ウクライナ','ルーマニア','ブルガリア','セルビア','クロアチア','アイルランド','アイスランド','ベトナム','タイ王国','タイ','フィリピン','インドネシア','マレーシア','シンガポール','ミャンマー','カンボジア','ラオス','モンゴル','アフガニスタン','サウジアラビア','シリア','レバノン','ヨルダン','リビア','チュニジア','アルジェリア','モロッコ','エチオピア','ケニア','ナイジェリア','ガーナ','スーダン','南アフリカ','日本','東京','大阪','京都','ロンドン','パリ','ニューヨーク','ワシントンD.C.','ベルリン','モスクワ','北京','上海','ソウル','ローマ','ウィーン','香港','ヨーロッパ','アジア','アフリカ','北アメリカ','南アメリカ','オセアニア','国際連合','国際連盟',
]);

/** Whether the link target is likely just "context" for the event, such as a country, city, or language */
export function isGeoLikeTarget(target: string): boolean {
	return GEO_NAMES.has(target) || GEO_SUFFIX_RE.test(target);
}

/** Divisor that converts average daily page views to the sitelink-equivalent scale */
export const PAGEVIEW_SCALE = 10;

/**
 * Score contribution of a single link.
 * Base value = max(sitelink count, page-view equivalent), capped;
 * frequent links decay by IDF, and place-name-like links decay at a fixed rate.
 * Why page views are used too: ja.wikipedia splits articles at its own granularity, and the more serious a Japanese incident is,
 * the more likely it is a ja-only Wikidata item with too few sitelinks (e.g. 関東大震災 = 3 language editions).
 */
export function linkScore(
	target: string,
	sitelinks: number,
	df: number,
	pageviewsDaily = 0,
): number {
	const magnitude = Math.min(
		SITELINK_CAP,
		Math.max(sitelinks, pageviewsDaily / PAGEVIEW_SCALE),
	);
	const base = magnitude * idfWeight(df);
	return isGeoLikeTarget(target) ? base * GEO_WEIGHT : base;
}

/** Raw score of one event from the sitelink counts of its link targets */
export function rawScore(counts: number[]): number {
	if (counts.length === 0) return 0;
	const sorted = [...counts].sort((a, b) => b - a);
	const second = sorted.length > 1 ? sorted[1] : 0;
	return sorted[0] + 0.15 * second;
}

export function decadeOf(year: number): number {
	return Math.floor(year / 10) * 10;
}

/**
 * Percentile within the decade group (0-100, one decimal place).
 * importance = (count below self + half of ties) / count * 100
 */
export function percentileByDecade(
	items: readonly { id: string; year: number; raw: number }[],
): Map<string, number> {
	const byDecade = new Map<number, number[]>();
	for (const it of items) {
		const d = decadeOf(it.year);
		const arr = byDecade.get(d);
		if (arr) arr.push(it.raw);
		else byDecade.set(d, [it.raw]);
	}
	for (const arr of byDecade.values()) arr.sort((a, b) => a - b);

	const result = new Map<string, number>();
	for (const it of items) {
		const arr = byDecade.get(decadeOf(it.year))!;
		const below = lowerBound(arr, it.raw);
		const upper = upperBound(arr, it.raw);
		const equal = upper - below;
		const pct = ((below + equal / 2) / arr.length) * 100;
		result.set(it.id, Math.round(pct * 10) / 10);
	}
	return result;
}

/** Number of elements in arr (ascending) less than value */
export function lowerBound(arr: readonly number[], value: number): number {
	let lo = 0;
	let hi = arr.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (arr[mid] < value) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** Number of elements in arr (ascending) less than or equal to value */
export function upperBound(arr: readonly number[], value: number): number {
	let lo = 0;
	let hi = arr.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (arr[mid] <= value) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}
