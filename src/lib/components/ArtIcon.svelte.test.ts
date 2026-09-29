import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ArtIcon from './ArtIcon.svelte';
import BrandMark from './BrandMark.svelte';

describe('ArtIcon / BrandMark', () => {
	it('references the sprite symbol and stays decorative', () => {
		const { container } = render(ArtIcon, { id: 'rocket', size: 40 });
		const svg = container.querySelector('svg')!;
		expect(svg).toHaveAttribute('aria-hidden', 'true');
		expect(svg).toHaveAttribute('width', '40');
		expect(container.querySelector('use')).toHaveAttribute('href', '/art/sprite.svg#rocket');
	});

	it('uses the default icon size', () => {
		const { container } = render(ArtIcon, { id: 'x' });
		expect(container.querySelector('svg')).toHaveAttribute('width', '64');
	});

	it('renders the brand mark as a decorative svg', () => {
		const { container } = render(BrandMark, { size: 21 });
		expect(container.querySelector('svg')).toBeInTheDocument();
	});
});
