/**
 * Collection listing page (prerendered, pure static HTML without JS).
 * Gives a path into history by theme and serves as a starting point for internal links to event pages.
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
