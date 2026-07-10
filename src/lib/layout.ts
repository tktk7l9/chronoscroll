/**
 * タイムラインカードの配置。中央スパインの左右（モバイルは片側）に、
 * 時間軸上の理想位置へできるだけ近く、重ならないように置く。
 */

export interface LayoutInput {
	id: string;
	/** 時間軸上の理想y（イベントの日時に対応する点） */
	y: number;
	height: number;
}

export interface PlacedCard {
	id: string;
	/** カード上端のy */
	top: number;
	side: 'left' | 'right';
	/** スパイン上の点のy（コネクタ描画用） */
	dotY: number;
}

/** カード上端は点よりこのpxだけ上に置く（点がカード見出し付近に来る） */
const DOT_OFFSET = 14;

/**
 * y昇順（画面上→下）で渡すこと。
 * 2カラム時は「より上に置ける側」を選び、同点なら左右交互。
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
