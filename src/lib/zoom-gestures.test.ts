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
	it('leaves unmodified wheel alone', () => {
		const e = wheel();
		expect(takeCtrlWheel(e, false)).toBe(false);
		expect(e.preventDefault).not.toHaveBeenCalled();
	});

	it('always calls preventDefault for ctrl/cmd+wheel', () => {
		const ctrl = wheel({ ctrlKey: true });
		expect(takeCtrlWheel(ctrl, false)).toBe(true);
		expect(ctrl.preventDefault).toHaveBeenCalledOnce();

		const meta = wheel({ metaKey: true });
		expect(takeCtrlWheel(meta, false)).toBe(true);
		expect(meta.preventDefault).toHaveBeenCalledOnce();
	});

	it('calls preventDefault while locked without zooming the timeline', () => {
		const e = wheel({ ctrlKey: true });
		expect(takeCtrlWheel(e, true)).toBe(false);
		expect(e.preventDefault).toHaveBeenCalledOnce();
	});
});

describe('takePinchMove', () => {
	it('leaves one finger alone', () => {
		const preventDefault = vi.fn();
		expect(takePinchMove(1, false, true, preventDefault)).toBe(false);
		expect(preventDefault).not.toHaveBeenCalled();
	});

	it('leaves a not-yet-started two-finger touch to the browser', () => {
		const preventDefault = vi.fn();
		expect(takePinchMove(2, false, false, preventDefault)).toBe(false);
		expect(preventDefault).not.toHaveBeenCalled();
	});

	it('calls preventDefault and zooms the timeline during a pinch', () => {
		const preventDefault = vi.fn();
		expect(takePinchMove(2, false, true, preventDefault)).toBe(true);
		expect(preventDefault).toHaveBeenCalledOnce();
	});

	it('calls preventDefault while locked even before a pinch starts, without zooming', () => {
		const preventDefault = vi.fn();
		expect(takePinchMove(2, true, false, preventDefault)).toBe(false);
		expect(preventDefault).toHaveBeenCalledOnce();
	});

	it('does not zoom the timeline while locked even if a pinch remains', () => {
		const preventDefault = vi.fn();
		expect(takePinchMove(2, true, true, preventDefault)).toBe(false);
		expect(preventDefault).toHaveBeenCalledOnce();
	});
});
