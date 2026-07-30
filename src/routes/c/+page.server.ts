/**
 * 特集の一覧ページ（prerender・JSなしの純静的HTML）。
 * テーマから歴史に入る導線を与え、個別イベントページへの内部リンクの起点にする。
 */
import { readFileSync } from 'node:fs';
import type { CollectionsIndex } from '$lib/types';
import type { PageServerLoad } from './$types';

export const prerender = true;
export const csr = false;

export const load: PageServerLoad = () => {
	const index = JSON.parse(
		readFileSync('static/data/collections.json', 'utf8'),
	) as CollectionsIndex;
	return { collections: index.collections };
};
