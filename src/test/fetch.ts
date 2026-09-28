import { vi } from 'vitest';

/**
 * Route-table fetch stub. Values are JSON bodies; a number is an HTTP error status;
 * a function is called per request (to hold or fail requests).
 */
export type Route = unknown | number | (() => Promise<Response> | Response);

export function stubFetch(routes: Record<string, Route>) {
	const calls: string[] = [];
	const fn = vi.fn(async (input: RequestInfo | URL) => {
		const url = String(input);
		calls.push(url);
		if (!(url in routes)) return new Response('not found', { status: 404 });
		const r = routes[url];
		if (typeof r === 'function') return (r as () => Promise<Response> | Response)();
		if (typeof r === 'number') return new Response('error', { status: r });
		return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } });
	});
	vi.stubGlobal('fetch', fn);
	return { fn, calls };
}
