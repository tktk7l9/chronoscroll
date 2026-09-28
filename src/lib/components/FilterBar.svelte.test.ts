import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EMPTY_FILTER, type FilterState } from '../filters.ts';
import FilterBar from './FilterBar.svelte';

function setup(initial: FilterState = EMPTY_FILTER) {
	let filter = $state(initial);
	render(FilterBar, {
		props: {
			get filter() {
				return filter;
			},
			set filter(v: FilterState) {
				filter = v;
			},
		},
	});
	return { user: userEvent.setup(), current: () => filter };
}

describe('FilterBar', () => {
	it('shows every region and category chip unpressed with no reset button', () => {
		setup();
		expect(screen.getByRole('group', { name: '表示フィルタ' })).toBeInTheDocument();
		for (const name of ['日本', '世界', '政治', '経済', '文化', '科学', 'スポーツ', '災害', '社会', '戦争']) {
			expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
		}
		expect(screen.queryByRole('button', { name: 'すべて表示' })).toBeNull();
	});

	it('toggles a region on and off and writes it back to the bound filter', async () => {
		const { user, current } = setup();
		const japan = screen.getByRole('button', { name: '日本' });
		await user.click(japan);
		expect(japan).toHaveAttribute('aria-pressed', 'true');
		expect([...(current().regions ?? [])]).toEqual(['japan']);
		await user.click(japan);
		expect(japan).toHaveAttribute('aria-pressed', 'false');
		expect(current().regions).toBeNull();
	});

	it('combines category chips and resets region/category with すべて表示 but keeps the collection', async () => {
		const ids = new Set(['a']);
		const { user, current } = setup({ ...EMPTY_FILTER, collectionIds: ids });
		await user.click(screen.getByRole('button', { name: '経済' }));
		await user.click(screen.getByRole('button', { name: '戦争' }));
		await user.click(screen.getByRole('button', { name: '世界' }));
		expect([...(current().categories ?? [])].sort()).toEqual(['economy', 'war']);

		await user.click(screen.getByRole('button', { name: 'すべて表示' }));
		expect(current().regions).toBeNull();
		expect(current().categories).toBeNull();
		expect(current().collectionIds).toBe(ids);
		expect(screen.getByRole('button', { name: '経済' })).toHaveAttribute('aria-pressed', 'false');
		expect(screen.queryByRole('button', { name: 'すべて表示' })).toBeNull();
	});

	it('is operable from the keyboard', async () => {
		const { user, current } = setup();
		await user.tab();
		expect(screen.getByRole('button', { name: '日本' })).toHaveFocus();
		await user.keyboard('{Enter}');
		expect(current().regions?.has('japan')).toBe(true);
	});
});
