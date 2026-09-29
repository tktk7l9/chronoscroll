import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { makeMeta } from '../../test/fixtures.ts';
import { dayOf } from '../timescale.ts';
import Minimap from './Minimap.svelte';

const minDay = dayOf('1900-01-01');
const maxDay = dayOf('1999-12-31');

function setup(onjump = vi.fn()) {
	const utils = render(Minimap, {
		meta: makeMeta(),
		fromDay: dayOf('1990-01-01'),
		toDay: dayOf('1980-01-01'),
		minDay,
		maxDay,
		onjump,
	});
	const rail = utils.container.querySelector<HTMLElement>('.rail')!;
	rail.getBoundingClientRect = () => ({ top: 0, height: 100, left: 0, width: 10, right: 10, bottom: 100, x: 0, y: 0, toJSON() {} });
	return { ...utils, rail, onjump };
}

describe('Minimap', () => {
	it('is decorative for assistive tech and labels years every 50 years', () => {
		const { container, getByText } = setup();
		expect(container.querySelector('.minimap')).toHaveAttribute('aria-hidden', 'true');
		expect(getByText('1900')).toBeInTheDocument();
		expect(getByText('1950')).toBeInTheDocument();
	});

	it('describes each density segment with its period and event count', () => {
		const { container } = setup();
		const titles = [...container.querySelectorAll('.seg')].map((s) => s.getAttribute('title'));
		expect(titles).toEqual(['1900-1949 50件', '1950-1999 150件']);
	});

	it('jumps to the pressed position and follows a drag until release', async () => {
		const { rail, onjump } = setup();
		await fireEvent.pointerMove(rail, { clientY: 10 });
		expect(onjump).not.toHaveBeenCalled();

		await fireEvent.pointerDown(rail, { clientY: 0, pointerId: 1 });
		expect(onjump).toHaveBeenLastCalledWith(maxDay);
		await fireEvent.pointerMove(rail, { clientY: 100 });
		expect(onjump).toHaveBeenLastCalledWith(minDay);
		await fireEvent.pointerMove(rail, { clientY: 500 });
		expect(onjump).toHaveBeenLastCalledWith(minDay);
		await fireEvent.pointerCancel(rail);
		await fireEvent.pointerMove(rail, { clientY: 50 });
		expect(onjump).toHaveBeenCalledTimes(3);
	});
});
