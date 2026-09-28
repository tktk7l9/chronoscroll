import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PageNav from './PageNav.svelte';

describe('PageNav', () => {
	it('links back to the timeline with a full reload and to the collections list', () => {
		render(PageNav);
		const nav = screen.getByRole('navigation', { name: 'サイト内' });
		const timeline = screen.getByRole('link', { name: '年表' });
		expect(nav).toContainElement(timeline);
		expect(timeline).toHaveAttribute('href', '/');
		expect(timeline).toHaveAttribute('data-sveltekit-reload');
		expect(screen.getByRole('link', { name: '特集' })).not.toHaveAttribute('aria-current');
	});

	it('marks the collections link as the current page', () => {
		render(PageNav, { current: 'collections' });
		expect(screen.getByRole('link', { name: '特集' })).toHaveAttribute('aria-current', 'page');
	});
});
