/**
 * Placement of timeline cards. They go on the left and right of the center spine (one side on mobile),
 * as close as possible to their ideal position on the time axis, without overlapping.
 */

export interface LayoutInput {
	id: string;
	/** Ideal y on the time axis (the point corresponding to the event's date) */
	y: number;
	height: number;
}

export interface PlacedCard {
	id: string;
	/** y of the card's top edge */
	top: number;
	side: 'left' | 'right';
	/** y of the point on the spine (for drawing the connector) */
	dotY: number;
}

/** Place the card's top edge this many px above the point (so the point sits near the card heading) */
const DOT_OFFSET = 14;

/**
 * Pass items in ascending y (top to bottom of the screen).
 * With two columns, pick "the side where it can go higher"; on a tie, alternate left and right.
 */
export function layoutCards(
	items: readonly LayoutInput[],
	columns: 1 | 2,
	gap = 12,
): PlacedCard[] {
	const cursors = { left: -Infinity, right: -Infinity };
	const placed: PlacedCard[] = [];

	items.forEach((item, i) => {
		const ideal = item.y - DOT_OFFSET;
		let side: 'left' | 'right';
		if (columns === 1) {
			side = 'right';
		} else {
			const topLeft = Math.max(ideal, cursors.left);
			const topRight = Math.max(ideal, cursors.right);
			if (topLeft < topRight) side = 'left';
			else if (topRight < topLeft) side = 'right';
			else side = i % 2 === 0 ? 'right' : 'left';
		}
		const top = Math.max(ideal, cursors[side]);
		cursors[side] = top + item.height + gap;
		placed.push({ id: item.id, top, side, dotY: item.y });
	});

	return placed;
}
