/**
 * 収録データの概要（総件数・収録期間）の表示フォーマッタ。
 * 値は static/data/index.json 由来で、ビルド時に確定させてSSR HTMLへ焼き込む。
 */

/**
 * 27014 → 「27,014」。
 * Intl/toLocaleString を使わないのは、SSR(Node)とクライアント(ブラウザ)の
 * ICUデータ差で桁区切りがズレるとハイドレーション不一致になるため。
 */
export function formatCount(n: number): string {
	return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** ISO yyyy-mm-dd → 「1868年1月1日」（月日のゼロ埋めは外す） */
export function formatJpDate(iso: string): string {
	const [y, m, d] = iso.split('-');
	return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}
