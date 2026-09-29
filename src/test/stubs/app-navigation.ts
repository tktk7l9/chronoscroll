// Test stand-in for SvelteKit's $app/navigation. Tests override these with vi.mock when they
// need to observe calls; the defaults run the afterNavigate callback once, like the first load
export function afterNavigate(fn: () => void): void {
	queueMicrotask(fn);
}
export function replaceState(_url: string, _state: unknown): void {}
