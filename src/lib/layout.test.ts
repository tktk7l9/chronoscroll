import { describe, expect, it } from 'vitest';
import { layoutCards } from './layout.ts';

describe('layoutCards', () => {
	it('stacks everything on the right in one column', () => {
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

	it('places distant cards at the ideal position (slightly above the dot)', () => {
		const placed = layoutCards([{ id: 'a', y: 500, height: 80 }], 2);
		expect(placed[0].top).toBe(486);
		expect(placed[0].dotY).toBe(500);
	});

	it('splits nearby cards left and right in two columns', () => {
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

	it('pushes to the side that frees up first when both are taken', () => {
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

	it('places on the right when the right frees up first', () => {
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

	it('alternates left and right on a tie', () => {
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
