<script lang="ts">
	import type { FilterState } from '../filters.ts';
	import { toggleIn } from '../filters.ts';
	import type { Category, Region } from '../types.ts';
	import { CATEGORIES, CATEGORY_LABELS } from '../types.ts';

	let {
		filter = $bindable(),
	}: {
		filter: FilterState;
	} = $props();

	const regions: { value: Region; label: string }[] = [
		{ value: 'japan', label: '日本' },
		{ value: 'world', label: '世界' },
	];

	function toggleRegion(r: Region): void {
		filter = { ...filter, regions: toggleIn(filter.regions, r) };
	}
	function toggleCategory(c: Category): void {
		filter = { ...filter, categories: toggleIn(filter.categories, c) };
	}
	function clearAll(): void {
		filter = { regions: null, categories: null };
	}

	const anyActive = $derived(filter.regions !== null || filter.categories !== null);
</script>

<div class="filterbar" role="group" aria-label="表示フィルタ">
	<div class="group">
		{#each regions as r (r.value)}
			<button
				type="button"
				class="chip"
				class:on={filter.regions?.has(r.value) ?? false}
				aria-pressed={filter.regions?.has(r.value) ?? false}
				onclick={() => toggleRegion(r.value)}
			>
				{r.label}
			</button>
		{/each}
	</div>
	<span class="sep" aria-hidden="true"></span>
	<div class="group">
		{#each CATEGORIES as c (c)}
			<button
				type="button"
				class="chip cat"
				data-cat={c}
				class:on={filter.categories?.has(c) ?? false}
				aria-pressed={filter.categories?.has(c) ?? false}
				onclick={() => toggleCategory(c)}
			>
				{CATEGORY_LABELS[c]}
			</button>
		{/each}
	</div>
	{#if anyActive}
		<button type="button" class="clear" onclick={clearAll}>解除</button>
	{/if}
</div>

<style>
	.filterbar {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: nowrap;
		overflow-x: auto;
		scrollbar-width: none;
		padding: 2px;
	}
	.filterbar::-webkit-scrollbar {
		display: none;
	}

	.group {
		display: flex;
		gap: 6px;
		flex: none;
	}

	.sep {
		flex: none;
		width: 1px;
		height: 18px;
		background: var(--line);
	}

	.chip {
		flex: none;
		padding: 4px 12px;
		font-size: 0.75rem;
		font-family: inherit;
		color: var(--ink-muted);
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 999px;
		cursor: pointer;
		transition: background 0.12s ease, color 0.12s ease;
		--chip-color: var(--accent);
	}
	.chip.cat[data-cat='politics'] { --chip-color: var(--cat-politics); }
	.chip.cat[data-cat='economy'] { --chip-color: var(--cat-economy); }
	.chip.cat[data-cat='culture'] { --chip-color: var(--cat-culture); }
	.chip.cat[data-cat='science'] { --chip-color: var(--cat-science); }
	.chip.cat[data-cat='sports'] { --chip-color: var(--cat-sports); }
	.chip.cat[data-cat='disaster'] { --chip-color: var(--cat-disaster); }
	.chip.cat[data-cat='society'] { --chip-color: var(--cat-society); }
	.chip.cat[data-cat='war'] { --chip-color: var(--cat-war); }

	.chip:hover {
		border-color: var(--chip-color);
		color: var(--ink);
	}
	.chip.on {
		background: var(--chip-color);
		border-color: var(--chip-color);
		color: var(--bg-elevated);
		font-weight: 600;
	}

	.clear {
		flex: none;
		padding: 4px 10px;
		font-size: 0.72rem;
		font-family: inherit;
		color: var(--accent);
		background: transparent;
		border: none;
		cursor: pointer;
		text-decoration: underline;
	}
</style>
