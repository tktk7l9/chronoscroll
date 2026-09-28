/**
 * Timeline zoom gestures are attached to window (to take ctrl/⌘+wheel away from the browser).
 * While the detail modal is open, timeline zoom is not applied, but preventDefault is always called.
 * Returning early lets the browser's page zoom run, and it persists after closing.
 */

export interface CtrlWheelLike {
	ctrlKey: boolean;
	metaKey: boolean;
	preventDefault: () => void;
}

/**
 * For ctrl/⌘+wheel, call preventDefault and return whether timeline zoom may be applied.
 * Without a modifier, ignore it (leave it to normal scrolling).
 */
export function takeCtrlWheel(e: CtrlWheelLike, locked: boolean): boolean {
	if (!e.ctrlKey && !e.metaKey) return false;
	e.preventDefault();
	return !locked;
}

/**
 * For a two-finger touchmove, call preventDefault while pinching or locked.
 * Returns whether a timeline pinch may be applied (false while locked or not started).
 */
export function takePinchMove(
	touchCount: number,
	locked: boolean,
	pinchActive: boolean,
	preventDefault: () => void,
): boolean {
	if (touchCount !== 2) return false;
	if (!pinchActive && !locked) return false;
	preventDefault();
	return pinchActive && !locked;
}
