import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MAX_PX_PER_DAY, MIN_PX_PER_DAY } from '../timescale.ts';
import ZoomControls from './ZoomControls.svelte';

describe('ZoomControls', () => {
	it('zooms in and out by a factor of two from the buttons', async () => {
		const user = userEvent.setup();
		const onzoomto = vi.fn();
		render(ZoomControls, { pxPerDay: 2, onzoomto });
		await user.click(screen.getByRole('button', { name: 'ズームイン' }));
		expect(onzoomto).toHaveBeenLastCalledWith(4);
		await user.click(screen.getByRole('button', { name: 'ズームアウト' }));
		expect(onzoomto).toHaveBeenLastCalledWith(1);
	});

	it('names the keyboard shortcuts on the buttons and keeps the level readable without the slider (SHIG 22, 94)', () => {
		const { container } = render(ZoomControls, { pxPerDay: 3.1, onzoomto: vi.fn() });
		expect(screen.getByRole('button', { name: 'ズームイン' })).toHaveAttribute('aria-keyshortcuts', '+');
		expect(screen.getByRole('button', { name: 'ズームイン' })).toHaveAttribute('title', 'ズームイン（+ キー）');
		expect(screen.getByRole('button', { name: 'ズームアウト' })).toHaveAttribute('aria-keyshortcuts', '-');
		const readout = container.querySelector('.level-readout')!;
		expect(readout).toHaveTextContent('年');
		expect(readout).not.toHaveAttribute('aria-hidden');
	});

	it('disables the button at each end of the zoom range', () => {
		const { unmount } = render(ZoomControls, { pxPerDay: MAX_PX_PER_DAY, onzoomto: vi.fn() });
		expect(screen.getByRole('button', { name: 'ズームイン' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'ズームアウト' })).toBeEnabled();
		unmount();
		render(ZoomControls, { pxPerDay: MIN_PX_PER_DAY, onzoomto: vi.fn() });
		expect(screen.getByRole('button', { name: 'ズームアウト' })).toBeDisabled();
	});

	it('exposes the level on an accessible vertical slider that follows the prop', async () => {
		const { rerender } = render(ZoomControls, { pxPerDay: 3.1, onzoomto: vi.fn() });
		const slider = screen.getByRole('slider', { name: 'ズームレベル（現在: 年）' });
		expect(slider).toHaveAttribute('aria-valuetext', '年');
		expect(slider).toHaveAttribute('aria-orientation', 'vertical');
		const before = Number(slider.getAttribute('aria-valuenow'));
		await rerender({ pxPerDay: 62 });
		expect(slider).toHaveAttribute('aria-valuetext', '日');
		expect(Number(slider.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
	});

	it('steps the zoom with the arrow keys on the slider and ignores other keys', async () => {
		const user = userEvent.setup();
		const onzoomto = vi.fn();
		render(ZoomControls, { pxPerDay: 3, onzoomto });
		screen.getByRole('slider').focus();
		await user.keyboard('{ArrowUp}');
		expect(onzoomto).toHaveBeenLastCalledWith(4.5);
		await user.keyboard('{ArrowRight}');
		expect(onzoomto).toHaveBeenLastCalledWith(4.5);
		await user.keyboard('{ArrowDown}');
		expect(onzoomto).toHaveBeenLastCalledWith(2);
		await user.keyboard('{ArrowLeft}');
		expect(onzoomto).toHaveBeenCalledTimes(4);
		await user.keyboard('{Home}');
		expect(onzoomto).toHaveBeenCalledTimes(4);
	});

	it('jumps to a level when its label is clicked and highlights the current one', async () => {
		const user = userEvent.setup();
		const onzoomto = vi.fn();
		render(ZoomControls, { pxPerDay: 0.42, onzoomto });
		// The labels are hidden from assistive tech (the slider carries the value), so query by text
		const labels = screen.getAllByText('月');
		const monthStop = labels.find((el) => el.tagName === 'BUTTON')!;
		await user.click(monthStop);
		expect(onzoomto).toHaveBeenLastCalledWith(17.9);
		expect(screen.getAllByText('十年').find((el) => el.tagName === 'BUTTON')).toHaveClass('active');
	});

	it('drags along the track to pick a zoom (top = max, bottom = min)', async () => {
		const onzoomto = vi.fn();
		render(ZoomControls, { pxPerDay: 1, onzoomto });
		const track = screen.getByRole('slider');
		track.getBoundingClientRect = () => ({ top: 100, height: 200, left: 0, width: 10, right: 10, bottom: 300, x: 0, y: 100, toJSON() {} });

		// Moving without pressing does nothing
		await fireEvent.pointerMove(track, { clientY: 150 });
		expect(onzoomto).not.toHaveBeenCalled();

		await fireEvent.pointerDown(track, { clientY: 100, pointerId: 1 });
		expect(onzoomto.mock.lastCall![0]).toBeCloseTo(MAX_PX_PER_DAY);
		await fireEvent.pointerMove(track, { clientY: 400 });
		expect(onzoomto.mock.lastCall![0]).toBeCloseTo(MIN_PX_PER_DAY);
		await fireEvent.pointerUp(track);
		await fireEvent.pointerMove(track, { clientY: 200 });
		expect(onzoomto).toHaveBeenCalledTimes(2);
	});
});
