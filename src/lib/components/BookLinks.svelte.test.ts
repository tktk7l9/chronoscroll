import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import BookLinks from './BookLinks.svelte';

describe('BookLinks', () => {
	it('renders nothing without books', () => {
		const { container } = render(BookLinks, { books: [] });
		expect(container.querySelector('section')).toBeNull();
	});

	it('lists books as sponsored links with an ad disclosure under the chosen heading level', () => {
		render(BookLinks, {
			headingLevel: 'h3',
			books: [
				{ title: '本A', author: '著者A', store: 'amazon', url: 'https://example.com/a' },
				{ title: '本B', store: 'rakuten', url: 'https://example.com/b' },
			],
		});
		expect(screen.getByRole('heading', { level: 3, name: '関連書籍' })).toBeInTheDocument();
		expect(screen.getByText(/広告/)).toBeInTheDocument();
		const a = screen.getByRole('link', { name: /本A/ });
		expect(a).toHaveAttribute('href', 'https://example.com/a');
		expect(a).toHaveAttribute('rel', 'noopener noreferrer sponsored');
		expect(a).toHaveAttribute('target', '_blank');
		expect(screen.getByText('著者A')).toBeInTheDocument();
		expect(screen.getAllByRole('listitem')).toHaveLength(2);
	});

	it('defaults to an h2 heading', () => {
		render(BookLinks, { books: [{ title: '本', store: 'amazon', url: 'https://example.com/c' }] });
		expect(screen.getByRole('heading', { level: 2, name: '関連書籍' })).toBeInTheDocument();
	});
});
