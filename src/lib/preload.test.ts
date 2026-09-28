import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createImagePreloader, prefersReducedData } from './preload.ts';

describe('prefersReducedData', () => {
	it('preloads when connection is unsupported (undefined)', () => {
		expect(prefersReducedData(undefined)).toBe(false);
	});

	it('does not preload with Data Saver on', () => {
		expect(prefersReducedData({ saveData: true })).toBe(true);
	});

	it('does not preload on 2g/slow-2g', () => {
		expect(prefersReducedData({ effectiveType: '2g' })).toBe(true);
		expect(prefersReducedData({ effectiveType: 'slow-2g' })).toBe(true);
	});

	it('preloads on 3g or better', () => {
		expect(prefersReducedData({ effectiveType: '3g' })).toBe(false);
		expect(prefersReducedData({ effectiveType: '4g' })).toBe(false);
		expect(prefersReducedData({ saveData: false })).toBe(false);
		expect(prefersReducedData({})).toBe(false);
	});
});

describe('createImagePreloader', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('fetches only when the hover lasts', () => {
		const load = vi.fn();
		const p = createImagePreloader(load, { dwellMs: 120 });

		p.schedule('a.jpg');
		vi.advanceTimersByTime(119);
		expect(load).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(load).toHaveBeenCalledExactlyOnceWith('a.jpg');
	});

	it('does not fetch when leaving before the dwell (just crossing the timeline)', () => {
		const load = vi.fn();
		const p = createImagePreloader(load, { dwellMs: 120 });

		p.schedule('a.jpg');
		vi.advanceTimersByTime(60);
		p.cancel();
		vi.advanceTimersByTime(500);
		expect(load).not.toHaveBeenCalled();
	});

	it('moving to the next card drops the previous schedule', () => {
		const load = vi.fn();
		const p = createImagePreloader(load, { dwellMs: 120 });

		p.schedule('a.jpg');
		vi.advanceTimersByTime(60);
		p.schedule('b.jpg');
		vi.advanceTimersByTime(120);

		expect(load).toHaveBeenCalledExactlyOnceWith('b.jpg');
	});

	it('fetches the same URL only once', () => {
		const load = vi.fn();
		const p = createImagePreloader(load, { dwellMs: 120 });

		p.schedule('a.jpg');
		vi.advanceTimersByTime(120);
		p.schedule('a.jpg');
		vi.advanceTimersByTime(120);
		p.preloadNow('a.jpg');

		expect(load).toHaveBeenCalledTimes(1);
	});

	it('preloadNow fetches without waiting (right before a click)', () => {
		const load = vi.fn();
		const p = createImagePreloader(load);

		p.preloadNow('a.jpg');
		expect(load).toHaveBeenCalledExactlyOnceWith('a.jpg');
	});

	it('preloadNow replaces the hover schedule', () => {
		const load = vi.fn();
		const p = createImagePreloader(load, { dwellMs: 120 });

		p.schedule('a.jpg');
		p.preloadNow('b.jpg');
		vi.advanceTimersByTime(500);

		expect(load).toHaveBeenCalledExactlyOnceWith('b.jpg');
	});

	it('does nothing for a card without an image', () => {
		const load = vi.fn();
		const p = createImagePreloader(load, { dwellMs: 120 });

		p.schedule(undefined);
		p.schedule(null);
		p.schedule('');
		p.preloadNow(undefined);
		vi.advanceTimersByTime(500);

		expect(load).not.toHaveBeenCalled();
	});

	it('does not preload while skip is true', () => {
		const load = vi.fn();
		let saving = true;
		const p = createImagePreloader(load, { dwellMs: 120, skip: () => saving });

		p.schedule('a.jpg');
		p.preloadNow('a.jpg');
		vi.advanceTimersByTime(500);
		expect(load).not.toHaveBeenCalled();

		// Once the setting changes, prefetch from then on (not treated as already fetched)
		saving = false;
		p.schedule('a.jpg');
		vi.advanceTimersByTime(120);
		expect(load).toHaveBeenCalledExactlyOnceWith('a.jpg');
	});

	it('the default dwell is 120ms', () => {
		const load = vi.fn();
		const p = createImagePreloader(load);

		p.schedule('a.jpg');
		vi.advanceTimersByTime(119);
		expect(load).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('cancel without a schedule does not break', () => {
		const load = vi.fn();
		const p = createImagePreloader(load);

		expect(() => p.cancel()).not.toThrow();
		expect(load).not.toHaveBeenCalled();
	});
});
