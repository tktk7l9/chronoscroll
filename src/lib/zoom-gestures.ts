/**
 * 年表のズーム操作は window に載せる（ctrl/⌘+ホイールをブラウザから奪うため）。
 * 詳細モーダル表示中は年表ズームは掛けないが、preventDefault は必ず行う。
 * 先に return するとブラウザのページズームが走り、閉じたあとも残る。
 */

export interface CtrlWheelLike {
	ctrlKey: boolean;
	metaKey: boolean;
	preventDefault: () => void;
}

/**
 * ctrl/⌘+ホイールなら preventDefault し、年表ズームを掛けてよいかを返す。
 * 修飾なしは無視（通常スクロールに任せる）。
 */
export function takeCtrlWheel(e: CtrlWheelLike, locked: boolean): boolean {
	if (!e.ctrlKey && !e.metaKey) return false;
	e.preventDefault();
	return !locked;
}

/**
 * 2本指の touchmove なら、ピンチ中またはロック中は preventDefault する。
 * 戻り値は年表ピンチを掛けてよいか（ロック中・未開始は false）。
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
