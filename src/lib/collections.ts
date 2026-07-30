/**
 * 特集（テーマ別にイベントを束ねた読み物）のフロント側ヘルパ。
 * 実データの組み立てはビルド時（pipeline/lib/collections.ts）に済ませてあるので、
 * ここはURL・リンク生成まわりの純粋な計算だけを持つ。
 */
import { clampPxPerDay, dayOf } from './timescale.ts';

/** URLに乗るslug。/c/<slug> と ?k=<slug> の両方で使う */
const SLUG_RE = /^[a-z0-9-]+$/;

/** 長さ上限つきのslug検証。URLパラメータは何が来るか分からないので必ず通す */
export function isCollectionSlug(value: string): boolean {
	return value.length > 0 && value.length <= 64 && SLUG_RE.test(value);
}

export function collectionDetailPath(slug: string): string {
	return `/data/collections/${slug}.json`;
}

export function collectionPath(slug: string): string {
	return `/c/${slug}`;
}

/** 特集の全期間をだいたい3画面に収めたい高さ（px）。fitZoomの分子 */
export const TARGET_SPAN_PX = 2600;

/**
 * 特集の期間が画面に収まる初期ズーム（px/日）を求める。
 * SSR時点でビューポート高が分からないため、固定の目標高から逆算してclampする。
 */
export function fitZoom(fromDate: string, toDate: string): number {
	const spanDays = dayOf(toDate) - dayOf(fromDate);
	if (spanDays <= 0) return clampPxPerDay(TARGET_SPAN_PX);
	return clampPxPerDay(TARGET_SPAN_PX / spanDays);
}

/**
 * 特集ページから「年表で通して見る」で開くURL。
 * 期間の中央ではなく最新のできごとに着地させる（特集は年代が飛ぶので中央が空白帯に
 * なることがある。上=現在の年表を下へ辿る動きと揃えるほうが確実に中身が見える）。
 */
export function timelineHref(slug: string, fromDate: string, toDate: string): string {
	const z = Math.round(fitZoom(fromDate, toDate) * 10000) / 10000;
	return `/?k=${slug}&t=${toDate}&z=${z}`;
}
