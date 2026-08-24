import { describe, expect, it, vi } from 'vitest';
import { takeCtrlWheel, takePinchMove } from './zoom-gestures.ts';

function wheel(mods: { ctrlKey?: boolean; metaKey?: boolean } = {}) {
	return {
		ctrlKey: mods.ctrlKey ?? false,
		metaKey: mods.metaKey ?? false,
		preventDefault: vi.fn(),
	};
}

describe('takeCtrlWheel', () => {
	it('修飾なしは触らない', () => {
		const e = wheel();
		expect(takeCtrlWheel(e, false)).toBe(false);
		expect(e.preventDefault).not.toHaveBeenCalled();
	});

	it('ctrl/⌘+ホイールは常に preventDefault する', () => {
		const ctrl = wheel({ ctrlKey: true });
		expect(takeCtrlWheel(ctrl, false)).toBe(true);
		expect(ctrl.preventDefault).toHaveBeenCalledOnce();

		const meta = wheel({ metaKey: true });
		expect(takeCtrlWheel(meta, false)).toBe(true);
		expect(meta.preventDefault).toHaveBeenCalledOnce();
	});

	it('ロック中も preventDefault し、年表ズームは掛けない', () => {
		const e = wheel({ ctrlKey: true });
		expect(takeCtrlWheel(e, true)).toBe(false);
		expect(e.preventDefault).toHaveBeenCalledOnce();
	});
});

describe('takePinchMove', () => {
	it('1本指は触らない', () => {
		const preventDefault = vi.fn();
		expect(takePinchMove(1, false, true, preventDefault)).toBe(false);
		expect(preventDefault).not.toHaveBeenCalled();
	});

	it('未開始の2本指はブラウザに任せる', () => {
		const preventDefault = vi.fn();
		expect(takePinchMove(2, false, false, preventDefault)).toBe(false);
		expect(preventDefault).not.toHaveBeenCalled();
	});

	it('ピンチ中は preventDefault して年表ズームを掛ける', () => {
		const preventDefault = vi.fn();
		expect(takePinchMove(2, false, true, preventDefault)).toBe(true);
		expect(preventDefault).toHaveBeenCalledOnce();
	});

	it('ロック中はピンチ未開始でも preventDefault し、年表ズームは掛けない', () => {
		const preventDefault = vi.fn();
		expect(takePinchMove(2, true, false, preventDefault)).toBe(false);
		expect(preventDefault).toHaveBeenCalledOnce();
	});

	it('ロック中にピンチが残っていても年表ズームは掛けない', () => {
		const preventDefault = vi.fn();
		expect(takePinchMove(2, true, true, preventDefault)).toBe(false);
		expect(preventDefault).toHaveBeenCalledOnce();
	});
});
