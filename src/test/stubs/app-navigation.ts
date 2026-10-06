// Test stand-in for SvelteKit's $app/navigation. Tests override these with vi.mock when they
// need to observe calls; the defaults run the afterNavigate callback once, like the first load
export function afterNavigate(fn: (nav: { shallow: boolean }) => void): void {
	queueMicrotask(() => fn({ shallow: false }));
}
export function goto(_url: string, _opts?: unknown): Promise<void> {
	return Promise.resolve();
}
