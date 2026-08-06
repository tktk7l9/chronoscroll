import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createImagePreloader, prefersReducedData } from './preload.ts';

describe('prefersReducedData', () => {
	it('connection未対応（undefined）なら先読みする', () => {
		expect(prefersReducedData(undefined)).toBe(false);
	});

	it('データセーバー指定なら先読みしない', () => {
		expect(prefersReducedData({ saveData: true })).toBe(true);
	});

	it('2g/slow-2gなら先読みしない', () => {
		expect(prefersReducedData({ effectiveType: '2g' })).toBe(true);
		expect(prefersReducedData({ effectiveType: 'slow-2g' })).toBe(true);
	});

	it('3g以上なら先読みする', () => {
		expect(prefersReducedData({ effectiveType: '3g' })).toBe(false);
		expect(prefersReducedData({ effectiveType: '4g' })).toBe(false);
		expect(prefersReducedData({ saveData: false })).toBe(false);
		expect(prefersReducedData({})).toBe(false);
	});
});

describe('createImagePreloader', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('ホバーが続いた時だけ取りに行く', () => {
		const load = vi.fn();
		const p = createImagePreloader(load, { dwellMs: 120 });

		p.schedule('a.jpg');
		vi.advanceTimersByTime(119);
		expect(load).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(load).toHaveBeenCalledExactlyOnceWith('a.jpg');
	});

	it('留まる前に離れたら取りに行かない（年表を横切っただけ）', () => {
		const load = vi.fn();
		const p = createImagePreloader(load, { dwellMs: 120 });

		p.schedule('a.jpg');
		vi.advanceTimersByTime(60);
		p.cancel();
		vi.advanceTimersByTime(500);
		expect(load).not.toHaveBeenCalled();
	});

	it('次のカードへ移ると前の予約は捨てられる', () => {
		const load = vi.fn();
		const p = createImagePreloader(load, { dwellMs: 120 });

		p.schedule('a.jpg');
		vi.advanceTimersByTime(60);
		p.schedule('b.jpg');
		vi.advanceTimersByTime(120);

		expect(load).toHaveBeenCalledExactlyOnceWith('b.jpg');
	});

	it('同じURLは一度しか取りに行かない', () => {
		const load = vi.fn();
		const p = createImagePreloader(load, { dwellMs: 120 });

		p.schedule('a.jpg');
		vi.advanceTimersByTime(120);
		p.schedule('a.jpg');
		vi.advanceTimersByTime(120);
		p.preloadNow('a.jpg');

		expect(load).toHaveBeenCalledTimes(1);
	});

	it('preloadNowは待たずに取りに行く（クリック直前）', () => {
		const load = vi.fn();
		const p = createImagePreloader(load);

		p.preloadNow('a.jpg');
		expect(load).toHaveBeenCalledExactlyOnceWith('a.jpg');
	});

	it('preloadNowはホバー予約を置き換える', () => {
		const load = vi.fn();
		const p = createImagePreloader(load, { dwellMs: 120 });

		p.schedule('a.jpg');
		p.preloadNow('b.jpg');
		vi.advanceTimersByTime(500);

		expect(load).toHaveBeenCalledExactlyOnceWith('b.jpg');
	});

	it('画像のないカードでは何もしない', () => {
		const load = vi.fn();
		const p = createImagePreloader(load, { dwellMs: 120 });

		p.schedule(undefined);
		p.schedule(null);
		p.schedule('');
		p.preloadNow(undefined);
		vi.advanceTimersByTime(500);

		expect(load).not.toHaveBeenCalled();
	});

	it('skipがtrueの間は先読みしない', () => {
		const load = vi.fn();
		let saving = true;
		const p = createImagePreloader(load, { dwellMs: 120, skip: () => saving });

		p.schedule('a.jpg');
		p.preloadNow('a.jpg');
		vi.advanceTimersByTime(500);
		expect(load).not.toHaveBeenCalled();

		// 設定が変わったら以降は先読みする（取得済み扱いにはしない）
		saving = false;
		p.schedule('a.jpg');
		vi.advanceTimersByTime(120);
		expect(load).toHaveBeenCalledExactlyOnceWith('a.jpg');
	});

	it('既定のdwellは120ms', () => {
		const load = vi.fn();
		const p = createImagePreloader(load);

		p.schedule('a.jpg');
		vi.advanceTimersByTime(119);
		expect(load).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('予約がない状態でcancelしても壊れない', () => {
		const load = vi.fn();
		const p = createImagePreloader(load);

		expect(() => p.cancel()).not.toThrow();
		expect(load).not.toHaveBeenCalled();
	});
});
