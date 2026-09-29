import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeEvent } from '../../test/fixtures.ts';
import EventCard from './EventCard.svelte';

const base = { top: 10, side: 'left' as const, single: false, height: 112 };

describe('EventCard', () => {
	it.each([
		['day', '1923.09.01'],
		['month', '1923.09'],
		['year', '1923年'],
	] as const)('formats a %s-precision date as %s', (precision, label) => {
		render(EventCard, {
			...base,
			ev: makeEvent({ date: '1923-09-01', precision, category: 'disaster' }),
			onselect: vi.fn(),
		});
		expect(screen.getByText(label)).toBeInTheDocument();
		expect(screen.getByText('災害')).toBeInTheDocument();
	});

	it('opens the event when clicked or activated from the keyboard', async () => {
		const user = userEvent.setup();
		const onselect = vi.fn();
		const ev = makeEvent({ title: '関東大震災' });
		render(EventCard, { ...base, ev, onselect });
		const button = screen.getByRole('button', { name: /関東大震災/ });
		await user.click(button);
		expect(onselect).toHaveBeenLastCalledWith(ev);
		button.focus();
		await user.keyboard('{Enter}');
		expect(onselect).toHaveBeenCalledTimes(2);
	});

	it('marks a highlighted card and shows the illustration for curated events', () => {
		const { container } = render(EventCard, {
			...base,
			ev: makeEvent({ svg: 'quake' }),
			highlighted: true,
			onselect: vi.fn(),
		});
		const article = container.querySelector('article')!;
		expect(article).toHaveClass('highlighted', 'big');
		expect(container.querySelector('use')).toHaveAttribute('href', '/art/sprite.svg#quake');
	});

	it('preloads the image after a hover dwell, not on a brief pass, and at once on press', async () => {
		const created: string[] = [];
		const OrigImage = globalThis.Image;
		globalThis.Image = class {
			set src(v: string) {
				created.push(v);
			}
		} as unknown as typeof Image;
		// The preloader is shared across cards and never fetches a URL twice, so use a fresh URL per step
		const card = (name: string) => {
			const onselect = vi.fn();
			const ev = makeEvent({
				id: name,
				title: name,
				image: { src: `https://upload.wikimedia.org/${name}.jpg`, width: 10, height: 10, credit: 'c' },
			});
			render(EventCard, { ...base, ev, onselect });
			return { button: screen.getByRole('button', { name: new RegExp(name) }), url: ev.image!.src, onselect, ev };
		};
		try {
			vi.useFakeTimers();

			// A pointer that only passes over the card is cancelled before the dwell ends
			const pass = card('pass');
			await fireEvent.pointerEnter(pass.button);
			await fireEvent.pointerLeave(pass.button);
			vi.runAllTimers();
			expect(created).not.toContain(pass.url);

			// Hover or keyboard focus that stays fetches after the dwell
			const hover = card('hover');
			await fireEvent.pointerEnter(hover.button);
			expect(created).not.toContain(hover.url);
			vi.runAllTimers();
			expect(created).toContain(hover.url);
			const focus = card('focus');
			await fireEvent.focus(focus.button);
			vi.runAllTimers();
			expect(created).toContain(focus.url);

			// Pressing fetches immediately and the click still opens the event
			const press = card('press');
			await fireEvent.pointerDown(press.button);
			expect(created).toContain(press.url);
			await fireEvent.click(press.button);
			expect(press.onselect).toHaveBeenCalledWith(press.ev);
		} finally {
			vi.useRealTimers();
			globalThis.Image = OrigImage;
		}
	});
});
