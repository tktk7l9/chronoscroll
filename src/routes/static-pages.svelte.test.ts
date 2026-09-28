import { render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { makeCollection, makeEvent } from '../test/fixtures.ts';
import Layout from './+layout.svelte';
import CollectionsPage from './c/+page.svelte';
import CollectionPage from './c/[slug]/+page.svelte';
import EventPage from './e/[id]/+page.svelte';

function metaContent(selector: string): string | null {
	return document.head.querySelector(selector)?.getAttribute('content') ?? null;
}

describe('/c collections list', () => {
	it('lists each collection with its lead, size and period', () => {
		render(CollectionsPage, {
			data: {
				collections: [
					makeCollection({ slug: 'anime', title: 'アニメの歴史', lead: 'リード', count: 1234, icon: 'film', fromDate: '1917-01-01', toDate: '2020-12-31' }),
					makeCollection({ slug: 'plants', title: '観葉植物' }),
				],
			},
		});
		expect(document.title).toBe('特集一覧 | chronoscroll');
		expect(screen.getByRole('heading', { level: 1, name: '特集' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: '特集' })).toHaveAttribute('aria-current', 'page');
		const card = screen.getByRole('link', { name: /アニメの歴史/ });
		expect(card).toHaveAttribute('href', '/c/anime');
		expect(card).toHaveTextContent('全1,234件 · 1917年〜2020年');
		expect(card.querySelector('use')).toHaveAttribute('href', '/art/sprite.svg#film');
		expect(screen.getByRole('link', { name: /観葉植物/ }).querySelector('svg')).toBeNull();
	});
});

describe('/c/[slug] collection page', () => {
	const detail = {
		...makeCollection({ slug: 'quakes', title: '地震の歴史', description: '説明', icon: 'quake', count: 2, fromDate: '1891-10-28', toDate: '1995-01-17' }),
		events: [
			makeEvent({ id: '1891-10-28-nobi', date: '1891-10-28', title: '濃尾地震', category: 'disaster', svg: 'quake' }),
			makeEvent({ id: '1850-01-01-edo', date: '1850-01-01', precision: 'year', title: '江戸のできごと' }),
		],
	};

	it('reads as a themed list linking to each event and to the timeline', () => {
		render(CollectionPage, { data: { detail, prev: { slug: 'anime', title: 'アニメの歴史' }, next: { slug: 'war', title: '戦争' } } });
		expect(document.title).toBe('地震の歴史 | chronoscroll');
		expect(metaContent('meta[property="og:image"]')).toMatch(/\/ogp\/c-quakes\.png$/);
		expect(screen.getByRole('heading', { level: 1, name: '地震の歴史' })).toBeInTheDocument();
		expect(screen.getByText('全2件 · 1891年〜1995年')).toBeInTheDocument();
		// Both the header nav and the breadcrumb lead back to the list; neither is marked current
		const toList = screen.getAllByRole('link', { name: '特集' });
		expect(toList.map((l) => l.getAttribute('href'))).toEqual(['/c', '/c']);
		expect(toList.every((l) => !l.hasAttribute('aria-current'))).toBe(true);

		const cta = screen.getByRole('link', { name: '年表で通して見る →' });
		expect(cta.getAttribute('href')).toMatch(/^\/\?.*k=quakes/);
		expect(cta).toHaveAttribute('data-sveltekit-reload');

		const items = screen.getAllByRole('listitem').filter((li) => li.closest('ol'));
		expect(items).toHaveLength(2);
		expect(within(items[0]).getByRole('link', { name: '濃尾地震' })).toHaveAttribute('href', '/e/1891-10-28-nobi');
		expect(within(items[0]).getByText(/明治24年/)).toBeInTheDocument();
		// Before Meiji there is no era name
		expect(items[1].querySelector('.wareki')).toBeNull();

		const neighbours = screen.getByRole('navigation', { name: '前後の特集' });
		expect(within(neighbours).getByRole('link', { name: /前の特集/ })).toHaveAttribute('href', '/c/anime');
		expect(within(neighbours).getByRole('link', { name: /次の特集/ })).toHaveAttribute('href', '/c/war');
	});

	it('omits missing neighbours and the cover icon', () => {
		render(CollectionPage, { data: { detail: { ...detail, icon: undefined }, prev: null, next: null } });
		const neighbours = screen.getByRole('navigation', { name: '前後の特集' });
		expect(within(neighbours).queryAllByRole('link')).toHaveLength(0);
		expect(document.querySelector('.cover')).toBeNull();
	});
});

describe('/e/[id] event page', () => {
	const ev = makeEvent({
		id: '1964-10-10-olympics',
		date: '1964-10-10',
		title: '東京オリンピック開幕',
		summary: 'あ'.repeat(140),
		category: 'sports',
		region: 'both',
		image: { src: 'https://upload.wikimedia.org/o.jpg', width: 640, height: 480, credit: 'https://commons.wikimedia.org/wiki/File:o.jpg' },
		related: [{ id: '1964-10-01-shinkansen', date: '1964-10-01', title: '東海道新幹線開業' }],
	});

	it('shows the event with sources, related events, collections and neighbours', () => {
		render(EventPage, {
			data: {
				ev,
				books: [{ title: '五輪の本', store: 'amazon', url: 'https://example.com/b' }],
				collections: [makeCollection({ slug: 'sports', title: 'スポーツ史', count: 12 })],
				prev: { id: '1964-10-01-shinkansen', title: '東海道新幹線開業', date: '1964-10-01' },
				next: { id: '1964-11-09-sato', title: '佐藤内閣発足', date: '1964-11-09' },
			},
		});
		expect(document.title).toBe('東京オリンピック開幕（1964年10月10日） | chronoscroll');
		// Long summaries are trimmed for the meta description
		expect(metaContent('meta[name="description"]')).toBe(`${'あ'.repeat(129)}…`);
		expect(screen.getByRole('heading', { level: 1, name: '東京オリンピック開幕' })).toBeInTheDocument();
		expect(screen.getByText('昭和39年')).toBeInTheDocument();
		expect(screen.getByText('日本・世界')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: '画像: Wikimedia Commons' })).toBeInTheDocument();

		const back = screen.getByRole('link', { name: '年表でこの位置を開く →' });
		expect(back).toHaveAttribute('href', '/?t=1964-10-10&z=8&e=1964-10-10-olympics');

		expect(screen.getByRole('link', { name: /スポーツ史/ })).toHaveTextContent('全12件');
		const related = screen.getByRole('heading', { name: '関連するできごと' }).closest('section')!;
		expect(within(related).getByRole('link', { name: /東海道新幹線開業/ })).toHaveAttribute('href', '/e/1964-10-01-shinkansen');
		expect(screen.getByRole('heading', { level: 2, name: '関連書籍' })).toBeInTheDocument();

		const neighbours = screen.getByRole('navigation', { name: '前後のできごと' });
		expect(within(neighbours).getByRole('link', { name: /前のできごと/ })).toHaveAttribute('href', '/e/1964-10-01-shinkansen');
		expect(within(neighbours).getByRole('link', { name: /次のできごと/ })).toHaveAttribute('href', '/e/1964-11-09-sato');
	});

	it('falls back to the illustration and hides empty sections', () => {
		const plain = makeEvent({ id: '1850-01-01-x', date: '1850-01-01', svg: 'ship', summary: '短い要約' });
		render(EventPage, { data: { ev: plain, books: [], collections: [], prev: null, next: null } });
		expect(metaContent('meta[name="description"]')).toBe('短い要約');
		expect(document.querySelector('img')).toBeNull();
		expect(document.querySelector('.art use')).toHaveAttribute('href', '/art/sprite.svg#ship');
		expect(screen.queryByRole('heading', { name: '関連するできごと' })).toBeNull();
		expect(screen.queryByRole('heading', { name: '収録されている特集' })).toBeNull();
		// 1850 is before Meiji, so no era name is shown
		expect(document.querySelector('.wareki')).toBeNull();
	});

	it('shows neither image nor illustration when the event has none', () => {
		render(EventPage, { data: { ev: makeEvent(), books: [], collections: [], prev: null, next: null } });
		expect(document.querySelector('figure, .art')).toBeNull();
	});
});

describe('root layout', () => {
	it('renders the page and registers the favicon', () => {
		render(Layout, { children: createRawSnippet(() => ({ render: () => '<p>中身</p>' })) });
		expect(screen.getByText('中身')).toBeInTheDocument();
		expect(document.head.querySelector('link[rel="icon"]')).toBeInTheDocument();
	});
});
