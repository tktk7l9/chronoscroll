import { readFileSync, readdirSync } from 'node:fs';
import type { NewsEvent } from '$lib/types';

export const prerender = true;

const BASE = 'https://chronoscroll.vercel.app';

export function GET(): Response {
	const ids: string[] = [];
	for (const f of readdirSync('static/data/chunks')) {
		for (const e of JSON.parse(readFileSync(`static/data/chunks/${f}`, 'utf8')) as NewsEvent[]) {
			ids.push(e.id);
		}
	}
	const urls = [`${BASE}/`, ...ids.map((id) => `${BASE}/e/${id}`)];
	const xml =
		'<?xml version="1.0" encoding="UTF-8"?>' +
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
		urls.map((u) => `<url><loc>${u}</loc></url>`).join('') +
		'</urlset>';
	return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}
