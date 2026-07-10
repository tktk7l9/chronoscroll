/**
 * セマンティックズームのLOD（詳細度）。
 * importance は十年内パーセンタイル（0-100・ほぼ一様分布）なので、
 * 「画面上のイベント密度が一定になる」閾値を連続的に計算できる。
 */
import { MAX_PX_PER_DAY, MIN_PX_PER_DAY } from './timescale.ts';

/** 表示イベント1件あたりに確保したい縦px（小さいほど密に出す） */
export const MIN_PX_PER_EVENT = 110;

/**
 * このズーム（px/日）で表示すべき importance の下限。
 * fraction = 表示したい件数割合 = (pxPerDay / minPxPerEvent) / eventsPerDay
 */
export function importanceThreshold(
	pxPerDay: number,
	eventsPerDay: number,
	minPxPerEvent = MIN_PX_PER_EVENT,
): number {
	if (eventsPerDay <= 0) return 0;
	const fraction = pxPerDay / minPxPerEvent / eventsPerDay;
	const threshold = 100 * (1 - fraction);
	return Math.min(100, Math.max(0, threshold));
}

export type ZoomLevel = '概観' | '十年' | '年' | '月' | '日';

/** ズームレベルの表示名（px/日の帯で判定） */
export function zoomLevelLabel(pxPerDay: number): ZoomLevel {
	if (pxPerDay < 0.15) return '概観';
	if (pxPerDay < 1.2) return '十年';
	if (pxPerDay < 8) return '年';
	if (pxPerDay < 40) return '月';
	return '日';
}

/** ズームゲージ用: pxPerDay → 0..1（対数スケール、0=最小ズーム/概観・1=最大ズーム/日） */
export function zoomToT(pxPerDay: number): number {
	const lo = Math.log(MIN_PX_PER_DAY);
	const hi = Math.log(MAX_PX_PER_DAY);
	return Math.min(1, Math.max(0, (Math.log(pxPerDay) - lo) / (hi - lo)));
}

/** ズームゲージ用: 0..1 → pxPerDay */
export function tToZoom(t: number): number {
	const lo = Math.log(MIN_PX_PER_DAY);
	const hi = Math.log(MAX_PX_PER_DAY);
	return Math.exp(lo + Math.min(1, Math.max(0, t)) * (hi - lo));
}

/** ゲージの目盛り: 各ズームレベルの代表値（レベル帯の対数中央） */
export const ZOOM_STOPS: readonly { label: ZoomLevel; pxPerDay: number }[] = [
	{ label: '概観', pxPerDay: 0.077 },
	{ label: '十年', pxPerDay: 0.42 },
	{ label: '年', pxPerDay: 3.1 },
	{ label: '月', pxPerDay: 17.9 },
	{ label: '日', pxPerDay: 62 },
] as const;

/** 目盛りの刻み（年数）。ズームに応じて 50年→10年→5年→1年 */
export function tickStepYears(pxPerDay: number): number {
	const pxPerYear = pxPerDay * 365.25;
	if (pxPerYear >= 180) return 1;
	if (pxPerYear >= 40) return 5;
	if (pxPerYear >= 18) return 10;
	return 50;
}
