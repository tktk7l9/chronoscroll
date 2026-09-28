import { describe, expect, it } from 'vitest';
import { layoutCards } from './layout.ts';

describe('layoutCards', () => {
	it('1カラムでは全て右側に積む', () => {
		const placed = layoutCards(
			[
				{ id: 'a', y: 100, height: 80 },
				{ id: 'b', y: 110, height: 80 },
			],
			1,
		);
		expect(placed.every((p) => p.side === 'right')).toBe(true);
		// b does not overlap a and is pushed down
		expect(placed[1].top).toBeGreaterThanOrEqual(placed[0].top + 80);
	});

	it('離れたカードは理想位置（点の少し上）に置かれる', () => {
		const placed = layoutCards([{ id: 'a', y: 500, height: 80 }], 2);
		expect(placed[0].top).toBe(486);
		expect(placed[0].dotY).toBe(500);
	});

	it('2カラムでは近接カードが左右に分かれる', () => {
		const placed = layoutCards(
			[
				{ id: 'a', y: 100, height: 80 },
				{ id: 'b', y: 105, height: 80 },
			],
			2,
		);
		expect(placed[0].side).not.toBe(placed[1].side);
		// On the opposite side, so it can go almost at its ideal position
		expect(placed[1].top).toBeLessThan(placed[0].top + 80);
	});

	it('両側が埋まっていたら空きの早い側に押し出す', () => {
		const placed = layoutCards(
			[
				{ id: 'a', y: 100, height: 200 },
				{ id: 'b', y: 100, height: 80 },
				{ id: 'c', y: 105, height: 80 },
			],
			2,
		);
		const c = placed[2];
		// c goes to b's side (the one that frees up first)
		expect(c.side).toBe(placed[1].side);
		expect(c.top).toBeGreaterThanOrEqual(placed[1].top + 80);
	});

	it('右側が先に空く場合は右に置く', () => {
		const placed = layoutCards(
			[
				{ id: 'x', y: 100, height: 40 },
				{ id: 'a', y: 100, height: 300 },
				{ id: 'c', y: 110, height: 40 },
			],
			2,
		);
		expect(placed[0].side).toBe('right');
		expect(placed[1].side).toBe('left');
		expect(placed[2].side).toBe('right');
	});

	it('同点なら左右交互', () => {
		const placed = layoutCards(
			[
				{ id: 'a', y: 100, height: 40 },
				{ id: 'b', y: 400, height: 40 },
			],
			2,
		);
		// Both sides are free for both cards (tie) → right, left in index order
		expect(placed[0].side).toBe('right');
		expect(placed[1].side).toBe('left');
	});
});
