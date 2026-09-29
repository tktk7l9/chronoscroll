import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SponsorSlot from './SponsorSlot.svelte';

const sponsorModule = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../sponsor.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../sponsor.ts')>();
	return {
		...actual,
		get CURRENT_SPONSOR() {
			return sponsorModule.current;
		},
	};
});

const valid = {
	name: 'テストスポンサー',
	href: 'https://example.com/sponsor',
	imageSrc: '/sponsor/banner.png',
	imageWidth: 300,
	imageHeight: 100,
	alt: 'スポンサーのバナー',
};

// CURRENT_SPONSOR is read on each mount, so the getter above swaps it per test
async function renderSlot() {
	return render(SponsorSlot);
}

describe('SponsorSlot', () => {
	it('stays hidden while there is no sponsor', async () => {
		sponsorModule.current = null;
		await renderSlot();
		expect(screen.queryByRole('complementary', { name: '広告' })).toBeNull();
	});

	it('shows a labelled ad with a sponsored link for a valid sponsor', async () => {
		sponsorModule.current = valid;
		await renderSlot();
		expect(screen.getByRole('complementary', { name: '広告' })).toBeInTheDocument();
		const link = screen.getByRole('link', { name: 'スポンサーのバナー' });
		expect(link).toHaveAttribute('href', valid.href);
		expect(link).toHaveAttribute('rel', 'noopener noreferrer sponsored');
	});

	it('refuses a sponsor that fails validation (e.g. an external image)', async () => {
		sponsorModule.current = { ...valid, imageSrc: 'https://tracker.example.com/banner.png' };
		await renderSlot();
		expect(screen.queryByRole('complementary', { name: '広告' })).toBeNull();
	});
});
