import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { media } from './env.ts';

// jsdom gaps. Only the behaviour the components rely on is emulated.

// <dialog>: showModal/close toggle `open` and close fires the `close` event, like browsers
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
	HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
		this.open = true;
	};
	HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
		if (!this.open) return;
		this.open = false;
		this.dispatchEvent(new Event('close'));
	};
}

// matchMedia: tests flip `reducedMotion` to cover both animation paths
window.matchMedia = (query: string) =>
	({
		matches: query.includes('prefers-reduced-motion') ? media.reducedMotion : false,
		media: query,
		onchange: null,
		addEventListener() {},
		removeEventListener() {},
		addListener() {},
		removeListener() {},
		dispatchEvent: () => false,
	}) as MediaQueryList;

Element.prototype.setPointerCapture ??= function () {};
Element.prototype.releasePointerCapture ??= function () {};

// window.scrollTo: jsdom does not implement it (it only logs). Move scrollY and fire `scroll`
// so components bound to scrollY see the new position
window.scrollTo = ((arg1: ScrollToOptions | number, arg2?: number) => {
	const top = typeof arg1 === 'number' ? (arg2 ?? 0) : (arg1.top ?? window.scrollY);
	Object.defineProperty(window, 'scrollY', { value: Math.max(0, top), configurable: true });
	Object.defineProperty(window, 'pageYOffset', { value: Math.max(0, top), configurable: true });
	window.dispatchEvent(new Event('scroll'));
}) as typeof window.scrollTo;
window.scrollBy = ((x: number, y: number) => {
	void x;
	window.scrollTo(0, window.scrollY + y);
}) as typeof window.scrollBy;

afterEach(() => {
	media.reducedMotion = false;
	window.scrollTo(0, 0);
	document.documentElement.removeAttribute('data-theme');
	document.documentElement.className = '';
	localStorage.clear();
});
