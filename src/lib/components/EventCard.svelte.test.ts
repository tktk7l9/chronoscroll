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

	it('preloads the image on hover and on press without breaking selection', async () => {
		const created: string[] = [];
		const OrigImage = globalThis.Image;
		globalThis.Image = class {
			set src(v: string) {
				created.push(v);
			}
		} as unknown as typeof Image;
		try {
			vi.useFakeTimers();
			const ev = makeEvent({
				image: { src: 'https://upload.wikimedia.org/x.jpg', width: 10, height: 10, credit: 'c' },
			});
			render(EventCard, { ...base, ev, onselect: vi.fn() });
			const button = screen.getByRole('button');
			await fireEvent.pointerEnter(button);
			await fireEvent.pointerLeave(button);
			await fireEvent.focus(button);
			await fireEvent.pointerDown(button);
			vi.runAllTimers();
			expect(created).toContain('https://upload.wikimedia.org/x.jpg');
		} finally {
			vi.useRealTimers();
			globalThis.Image = OrigImage;
		}
	});
});
