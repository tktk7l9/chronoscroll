/**
 * Collection detail page (all prerendered, pure static HTML without JS).
 * As a coherent themed read, it bundles internal links to the event pages.
 */
import { readFileSync } from 'node:fs';
import { error } from '@sveltejs/kit';
import { isCollectionSlug } from '#lib/collections.js';
import type { CollectionDetail, CollectionsIndex } from '#lib/types.js';
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
	// slug comes from entries, but always check both its format and existence before using it to build a path
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
