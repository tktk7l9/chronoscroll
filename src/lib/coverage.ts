/**
 * 収録データの概要（総件数・収録期間）とイベント日付の表示フォーマッタ。
 * 収録期間の値は static/data/index.json 由来で、ビルド時に確定させてSSR HTMLへ焼き込む。
 */
import type { Precision } from './types.ts';

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

/**
 * イベントの日付ラベル。precision が粗いイベントは埋めた 01 を見せない
 * （month → 「1963年1月」、year → 「1963年」）。
 */
export function formatEventDate(iso: string, precision: Precision): string {
	const [y, m, d] = iso.split('-');
	if (precision === 'year') return `${Number(y)}年`;
	if (precision === 'month') return `${Number(y)}年${Number(m)}月`;
	return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}
