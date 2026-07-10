import type { NewsEvent } from './types.ts';
import { dayOf } from './timescale.ts';
import type { FilterState } from './filters.ts';
import { matchesFilter } from './filters.ts';

/** day number を前計算したイベント。day降順（新しい→古い）で保持する */
export interface EventPoint {
	ev: NewsEvent;
	day: number;
}

/** イベント一覧を day 降順（新しい順）の EventPoint[] にする */
export function toPoints(events: readonly NewsEvent[]): EventPoint[] {
	return events
		.map((ev) => ({ ev, day: dayOf(ev.date) }))
		.sort((a, b) => (a.day === b.day ? (a.ev.id < b.ev.id ? -1 : 1) : b.day - a.day));
}

/** day降順配列内で、day <= fromDay となる最初のindex */
export function firstIndexAtOrBelow(points: readonly EventPoint[], fromDay: number): number {
	let lo = 0;
	let hi = points.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (points[mid].day > fromDay) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/**
 * ピクセル密度の上限でさらに間引く。
 * LOD閾値は全体平均密度ベースなので、イベントが時間的に密集する区間では
 * カードが理想位置から大きく押し流される。重要度の高い順に採用し、
 * 縦方向 minPx 以内に maxPerBand 件を超えないようにする。
 */
export function capDensity(
	points: readonly EventPoint[],
	pxPerDay: number,
	minPx: number,
	maxPerBand: number,
	pinnedId?: string,
): EventPoint[] {
	const prio = (p: EventPoint): number => (p.ev.id === pinnedId ? Infinity : p.ev.importance);
	const byImportance = [...points].sort((a, b) => prio(b) - prio(a));
	const acceptedYs: number[] = [];
	const accepted = new Set<EventPoint>();
	for (const p of byImportance) {
		const y = -p.day * pxPerDay;
		let near = 0;
		for (const ay of acceptedYs) {
			if (Math.abs(ay - y) < minPx) near++;
		}
		if (near >= maxPerBand) continue;
		acceptedYs.push(y);
		accepted.add(p);
	}
	return points.filter((p) => accepted.has(p));
}

/**
 * 可視範囲 [toDay, fromDay]（fromDayが新しい側）かつ importance >= threshold
 * かつフィルタに合致するイベントを返す。
 * pinnedId のイベントは範囲内なら閾値・フィルタに関わらず含める（検索ジャンプ先の保証）。
 */
export function queryVisible(
	points: readonly EventPoint[],
	fromDay: number,
	toDay: number,
	threshold: number,
	filter: FilterState,
	pinnedId?: string,
): EventPoint[] {
	const out: EventPoint[] = [];
	for (let i = firstIndexAtOrBelow(points, fromDay); i < points.length; i++) {
		const p = points[i];
		if (p.day < toDay) break;
		if (
			p.ev.id === pinnedId ||
			(p.ev.importance >= threshold && matchesFilter(p.ev, filter))
		) {
			out.push(p);
		}
	}
	return out;
}
