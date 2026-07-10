/**
 * 注目度スコアリング。
 * 生スコア = リンク先記事のWikidata sitelink数（言語版数）ベース。
 * 新しい年代ほど記事が充実する偏りを、十年単位のパーセンタイル正規化で補正する。
 */

/**
 * データセット内で頻出するリンク先を減衰させるIDF風の重み。
 * 国名・大都市（アメリカ合衆国等）は文脈として何百回も出るため、
 * sitelink数が大きくてもイベント固有の主題より重くならないようにする。
 */
export function idfWeight(documentFrequency: number): number {
	return 1 / (1 + Math.log(Math.max(1, documentFrequency)));
}

/** sitelink数の上限。国・大都市級の巨大記事が主題記事を圧倒しないよう頭打ちにする */
export const SITELINK_CAP = 150;
/** 地名・言語など「文脈」記事の減衰率 */
export const GEO_WEIGHT = 0.35;

const GEO_SUFFIX_RE =
	/(共和国|王国|帝国|連邦|公国|首長国|合衆国|自由国|連合王国|民主共和国|人民共和国|社会主義共和国)$|(州|省|市|都|府|県|地方|大陸|半島)$|[^物]語$/;

const GEO_NAMES = new Set([
	'アメリカ','米国','イギリス','グレートブリテン及びアイルランド連合王国','フランス','ドイツ','イタリア','スペイン','ポルトガル','オランダ','ベルギー','スイス','オーストリア','ギリシャ','トルコ','ロシア','ソビエト連邦','ソ連','中国','中華人民共和国','中華民国','台湾','韓国','大韓民国','北朝鮮','朝鮮民主主義人民共和国','朝鮮','インド','パキスタン','イラン','イラク','イスラエル','エジプト','カナダ','メキシコ','ブラジル','アルゼンチン','チリ','ペルー','コロンビア','ベネズエラ','キューバ','オーストラリア','ニュージーランド','デンマーク','スウェーデン','ノルウェー','フィンランド','ポーランド','ハンガリー','チェコ','ウクライナ','ルーマニア','ブルガリア','セルビア','クロアチア','アイルランド','アイスランド','ベトナム','タイ王国','タイ','フィリピン','インドネシア','マレーシア','シンガポール','ミャンマー','カンボジア','ラオス','モンゴル','アフガニスタン','サウジアラビア','シリア','レバノン','ヨルダン','リビア','チュニジア','アルジェリア','モロッコ','エチオピア','ケニア','ナイジェリア','ガーナ','スーダン','南アフリカ','日本','東京','大阪','京都','ロンドン','パリ','ニューヨーク','ワシントンD.C.','ベルリン','モスクワ','北京','上海','ソウル','ローマ','ウィーン','香港','ヨーロッパ','アジア','アフリカ','北アメリカ','南アメリカ','オセアニア','国際連合','国際連盟',
]);

/** 国・都市・言語など、イベントの「文脈」でしかない可能性が高いリンク先か */
export function isGeoLikeTarget(target: string): boolean {
	return GEO_NAMES.has(target) || GEO_SUFFIX_RE.test(target);
}

/** 1日平均ページビューをsitelink相当スケールへ変換する除数 */
export const PAGEVIEW_SCALE = 10;

/**
 * リンク1本の寄与スコア。
 * 基礎値 = max(sitelink数, ページビュー換算) を頭打ちし、
 * 頻出リンクをIDFで、地名的リンクを定率で減衰する。
 * ページビュー併用の理由: ja版は記事分割の粒度が独特で、日本の重大事件ほど
 * ja特化のWikidata項目になりsitelinksが過小になる（例: 関東大震災=3言語版）。
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

/** リンク先ごとのsitelink数から、イベント1件の生スコアを出す */
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
 * 十年グループ内パーセンタイル（0-100・小数1桁）。
 * importance = (自分より下の件数 + 同値の半分) / 件数 * 100
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

/** arr（昇順）内で value 未満の要素数 */
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

/** arr（昇順）内で value 以下の要素数 */
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
