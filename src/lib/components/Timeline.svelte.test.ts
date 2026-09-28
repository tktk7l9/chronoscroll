import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '../../test/fetch.ts';
import { makeEvent, makeMeta } from '../../test/fixtures.ts';
import { EMPTY_FILTER, type FilterState } from '../filters.ts';
import { TimelineData } from '../state/data.svelte.ts';
import type { NewsEvent } from '../types.ts';
import Timeline from './Timeline.svelte';

const recent = [
	makeEvent({ id: 'e-1998', date: '1998-02-07', title: '長野五輪開幕', importance: 100 }),
	makeEvent({ id: 'e-1995', date: '1995-01-17', title: '阪神・淡路大震災', importance: 100, category: 'disaster' }),
	makeEvent({ id: 'e-1991', date: '1991-12-26', title: 'ソ連崩壊', importance: 100, region: 'world' }),
];
const lowImportance = makeEvent({ id: 'e-1996-low', date: '1996-06-01', title: '小さなできごと', importance: 1 });

async function loadedData(events: NewsEvent[] = recent): Promise<TimelineData> {
	stubFetch({ '/data/index.json': makeMeta(), '/data/overview.json': events });
	const data = new TimelineData();
	await data.init();
	return data;
}

async function setup(props: Record<string, unknown> = {}, events?: NewsEvent[]) {
	const data = await loadedData(events);
	const onselect = vi.fn();
	const onviewchange = vi.fn();
	const utils = render(Timeline, { data, filter: EMPTY_FILTER, onselect, onviewchange, ...props });
	// The first frame measures the window, then the timeline becomes ready
	await screen.findByRole('group', { name: 'ズーム操作' });
	return { ...utils, data, onselect, onviewchange, user: userEvent.setup() };
}

function sliderValue(): number {
	return Number(screen.getByRole('slider').getAttribute('aria-valuenow'));
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('Timeline', () => {
	it('waits for the data before showing controls', () => {
		render(Timeline, { data: new TimelineData(), filter: EMPTY_FILTER, onselect: vi.fn() });
		expect(screen.queryByRole('group', { name: 'ズーム操作' })).toBeNull();
		expect(screen.queryByRole('button', { name: /年代へジャンプ/ })).toBeNull();
	});

	it('shows the newest events at the top with the current year, and opens one on click', async () => {
		const { user, onselect } = await setup();
		expect(screen.getByRole('button', { name: /長野五輪開幕/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /阪神・淡路大震災/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /年代へジャンプ（現在 19\d\d年）/ })).toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: /長野五輪開幕/ }));
		expect(onselect).toHaveBeenCalledWith(expect.objectContaining({ id: 'e-1998' }));
	});

	it('hides events that the filter excludes', async () => {
		const filter: FilterState = { ...EMPTY_FILTER, categories: new Set(['disaster']) };
		await setup({ filter });
		expect(screen.getByRole('button', { name: /阪神・淡路大震災/ })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /長野五輪開幕/ })).toBeNull();
	});

	it('shows low-importance events while a collection is filtered (no LOD)', async () => {
		const events = [...recent, lowImportance];
		const { rerender } = await setup({}, events);
		expect(screen.queryByRole('button', { name: /小さなできごと/ })).toBeNull();
		await rerender({ filter: { ...EMPTY_FILTER, collectionIds: new Set(['e-1996-low']) } });
		expect(screen.getByRole('button', { name: /小さなできごと/ })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /長野五輪開幕/ })).toBeNull();
	});

	it('highlights the event jumped to from search', async () => {
		const { container } = await setup({ highlightId: 'e-1995' });
		expect(container.querySelector('.card[data-id="e-1995"]')).toHaveClass('highlighted');
	});

	it('reports the view to the parent after scrolling settles', async () => {
		const { onviewchange } = await setup();
		await waitFor(() => expect(onviewchange).toHaveBeenCalled(), { timeout: 1500 });
		const [center, px] = onviewchange.mock.lastCall!;
		expect(center).toMatch(/^19\d\d-\d\d-\d\d$/);
		expect(px).toBeGreaterThan(0);
	});

	it('zooms with the buttons, the + / - keys and double-click', async () => {
		const { user, container } = await setup();
		const start = sliderValue();
		await user.click(screen.getByRole('button', { name: 'ズームイン' }));
		const afterIn = sliderValue();
		expect(afterIn).toBeGreaterThan(start);

		await user.keyboard('-');
		expect(sliderValue()).toBeLessThan(afterIn);
		await user.keyboard('+');
		expect(sliderValue()).toBe(afterIn);
		await user.keyboard('=');
		expect(sliderValue()).toBeGreaterThan(afterIn);

		const beforeDbl = sliderValue();
		await fireEvent.dblClick(container.querySelector('.timeline')!, { clientY: 300 });
		expect(sliderValue()).toBeGreaterThan(beforeDbl);
	});

	it('zooms with ctrl + wheel and with a two-finger pinch', async () => {
		await setup();
		const start = sliderValue();
		await act(() => {
			window.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, ctrlKey: true, clientY: 200, cancelable: true }));
		});
		const afterWheel = sliderValue();
		expect(afterWheel).toBeGreaterThan(start);
		// A plain wheel scrolls instead
		await act(() => {
			window.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, cancelable: true }));
		});
		expect(sliderValue()).toBe(afterWheel);

		const touches = (d: number) =>
			[
				{ clientX: 100, clientY: 300 - d },
				{ clientX: 100, clientY: 300 + d },
			] as unknown as TouchList;
		const touch = (type: string, list: TouchList) => {
			const e = new Event(type, { cancelable: true }) as TouchEvent;
			Object.defineProperty(e, 'touches', { value: list });
			window.dispatchEvent(e);
		};
		await act(() => touch('touchstart', touches(50)));
		await act(() => touch('touchmove', touches(150)));
		await waitFor(() => expect(sliderValue()).toBeGreaterThan(afterWheel));
		const afterPinch = sliderValue();
		await act(() => touch('touchend', [] as unknown as TouchList));
		// After the fingers lift, a lone move does nothing
		await act(() => touch('touchmove', touches(300)));
		expect(sliderValue()).toBe(afterPinch);
	});

	it('ignores zoom keys and gestures while the detail modal is open, and keys typed in inputs', async () => {
		const { rerender, user } = await setup();
		const start = sliderValue();
		await rerender({ locked: true });
		await user.keyboard('+');
		await act(() => {
			window.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, ctrlKey: true, cancelable: true }));
		});
		expect(sliderValue()).toBe(start);

		await rerender({ locked: false });
		const input = document.createElement('input');
		document.body.append(input);
		input.focus();
		await user.keyboard('+');
		expect(sliderValue()).toBe(start);
		input.remove();
	});

	it('moves focus between events with the arrow keys', async () => {
		const { user } = await setup();
		const focusedId = () => document.activeElement?.closest('.card')?.getAttribute('data-id');
		await user.keyboard('{ArrowDown}');
		await waitFor(() => expect(focusedId()).toBeTruthy());
		const older = focusedId();
		await user.keyboard('{ArrowUp}');
		await waitFor(() => expect(focusedId()).not.toBe(older));
		const newer = focusedId();
		expect(newer! > older!).toBe(true);
		await user.keyboard('{ArrowDown}');
		await waitFor(() => expect(focusedId()).toBe(older));
		// Other keys pass through
		await user.keyboard('{ArrowLeft}');
		expect(focusedId()).toBe(older);
	});

	it('jumps by decade from the era chip and closes with Escape or an outside click', async () => {
		const { user } = await setup();
		const chip = screen.getByRole('button', { name: /年代へジャンプ/ });
		await user.click(chip);
		expect(chip).toHaveAttribute('aria-expanded', 'true');
		const panel = screen.getByRole('group', { name: '年代を選択' });
		const decades = within(panel)
			.getAllByRole('button')
			.map((b) => b.textContent!.trim());
		expect(decades).toEqual(['最新へ', '1990s', '1980s', '1970s', '1960s', '1950s', '1940s', '1930s', '1920s', '1910s', '1900s']);

		await user.click(within(panel).getByRole('button', { name: '1920s' }));
		expect(screen.queryByRole('group', { name: '年代を選択' })).toBeNull();
		expect(window.scrollY).toBeGreaterThan(0);
		await waitFor(() => expect(chip).toHaveAccessibleName(/現在 192\d年/));

		await user.click(chip);
		await user.click(screen.getByRole('button', { name: '最新へ' }));
		expect(window.scrollY).toBe(0);

		// Escape inside the panel closes it and returns focus to the chip (SHIG 60)
		await user.click(chip);
		screen.getByRole('button', { name: '1950s' }).focus();
		await user.keyboard('{Escape}');
		expect(screen.queryByRole('group', { name: '年代を選択' })).toBeNull();
		expect(chip).toHaveFocus();

		// Other keys leave it open; a click outside closes it
		await user.click(chip);
		await user.keyboard('a');
		expect(screen.getByRole('group', { name: '年代を選択' })).toBeInTheDocument();
		await user.click(document.body);
		expect(screen.queryByRole('group', { name: '年代を選択' })).toBeNull();
	});

	it('does not steal focus when Escape comes from another widget', async () => {
		const { user } = await setup();
		const chip = screen.getByRole('button', { name: /年代へジャンプ/ });
		await user.click(chip);
		const input = document.createElement('input');
		document.body.append(input);
		input.focus();
		await user.keyboard('{Escape}');
		expect(screen.queryByRole('group', { name: '年代を選択' })).toBeNull();
		expect(input).toHaveFocus();
		input.remove();
	});

	it('restores a shared position and zoom, and jumps from search', async () => {
		const { component } = await setup({ initialCenter: '1950-06-01', initialPxPerDay: 2 });
		await waitFor(() => expect(window.scrollY).toBeGreaterThan(0));
		expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '年');
		await waitFor(() =>
			expect(screen.getByRole('button', { name: /年代へジャンプ/ })).toHaveAccessibleName(/現在 1950年/),
		);

		expect((component as { currentPxPerDay(): number }).currentPxPerDay()).toBe(2);
		await act(() => (component as { jumpTo(d: string): Promise<void> }).jumpTo('1995-01-17'));
		// Search jumps zoom in to at least the year level
		expect((component as { currentPxPerDay(): number }).currentPxPerDay()).toBe(8);
		await waitFor(() =>
			expect(screen.getByRole('button', { name: /年代へジャンプ/ })).toHaveAccessibleName(/現在 1995年/),
		);
		await act(() => (component as { jumpTo(d: string): Promise<void> }).jumpTo('1920-01-01'));
		expect((component as { currentPxPerDay(): number }).currentPxPerDay()).toBe(8);
	});

	it('jumps from the minimap', async () => {
		const { container } = await setup();
		const rail = container.ownerDocument.querySelector<HTMLElement>('.minimap .rail')!;
		rail.getBoundingClientRect = () => ({ top: 0, height: 100, left: 0, width: 10, right: 10, bottom: 100, x: 0, y: 0, toJSON() {} });
		await fireEvent.pointerDown(rail, { clientY: 80, pointerId: 1 });
		expect(window.scrollY).toBeGreaterThan(0);
	});

	it('lazy-loads decade chunks once zoomed in far enough', async () => {
		const { rerender, data } = await setup({ initialPxPerDay: 20 });
		const ensure = vi.spyOn(data, 'ensureRange');
		await waitFor(() => expect(ensure).toHaveBeenCalled(), { timeout: 2000 });
		ensure.mockClear();
		// Collection mode never fetches chunks
		await rerender({ filter: { ...EMPTY_FILTER, collectionIds: new Set(['x']) } });
		await new Promise((r) => setTimeout(r, 50));
		expect(ensure).not.toHaveBeenCalled();
	});

	it('uses a single column on narrow screens', async () => {
		Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
		try {
			const { container } = await setup();
			expect(container.querySelector('.timeline')).toHaveClass('single');
		} finally {
			Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
		}
	});
});
