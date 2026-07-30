/**
 * 特集の個別ページ（全件prerender・JSなしの純静的HTML）。
 * テーマ単位のまとまった読み物として、個別イベントページへの内部リンクを束ねる。
 */
import { readFileSync } from 'node:fs';
import { error } from '@sveltejs/kit';
import { isCollectionSlug } from '$lib/collections';
import type { CollectionDetail, CollectionsIndex } from '$lib/types';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = true;
export const csr = false;

let index: CollectionsIndex | null = null;

function loadIndex(): CollectionsIndex {
	if (!index) {
		index = JSON.parse(readFileSync('static/data/collections.json', 'utf8')) as CollectionsIndex;
	}
	return index;
}

export const entries: EntryGenerator = () =>
	loadIndex().collections.map((c) => ({ slug: c.slug }));

export const load: PageServerLoad = ({ params }) => {
	const { collections } = loadIndex();
	const i = collections.findIndex((c) => c.slug === params.slug);
	// slug は entries 由来だが、パス組み立てに使う前に必ず形式と存在の両方を確かめる
	if (i === -1 || !isCollectionSlug(params.slug)) error(404, '特集が見つかりません');
	const detail = JSON.parse(
		readFileSync(`static/data/collections/${params.slug}.json`, 'utf8'),
	) as CollectionDetail;
	const pick = (n: number) => {
		const c = collections[n];
		return c ? { slug: c.slug, title: c.title } : null;
	};
	return { detail, prev: pick(i - 1), next: pick(i + 1) };
};
