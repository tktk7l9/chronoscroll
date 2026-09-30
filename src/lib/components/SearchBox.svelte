<script lang="ts">
	import { prefersReducedData, type ConnectionLike } from '../preload.ts';
	import { searchStatusMessage, type SearchHit, type SearchStatus } from '../search.ts';
	import type { SearchRequest, SearchResponse } from '../workers/search.worker.ts';
	import SearchWorker from '../workers/search.worker.ts?worker';

	let {
		query = $bindable(''),
		onjump,
	}: {
		query?: string;
		onjump: (hit: SearchHit) => void;
	} = $props();

	let worker: Worker | null = null;
	let seq = 0;
	let hits = $state<SearchHit[]>([]);
	let status = $state<SearchStatus>('idle');
	let open = $state(false);
	let activeIndex = $state(-1);
	let inputEl = $state<HTMLInputElement>();

	const listId = 'search-results';
	const message = $derived(searchStatusMessage(status, query, hits.length));
	const showHits = $derived(status !== 'error' && status !== 'loading' && hits.length > 0);
	const expanded = $derived(open && query.trim() !== '' && (showHits || message !== null));

	function ensureWorker(): Worker {
		if (!worker) {
			worker = new SearchWorker();
			worker.onmessage = (e: MessageEvent<SearchResponse>) => {
				if (e.data.seq !== seq) return;
				if (e.data.status === 'ready') {
					hits = e.data.hits;
					status = 'ready';
					activeIndex = hits.length > 0 ? 0 : -1;
				} else if (e.data.status === 'loading') {
					status = 'loading';
				} else {
					status = 'error';
				}
			};
		}
		return worker;
	}

	$effect(() => {
		const q = query.trim();
		if (q === '') {
			hits = [];
			status = 'idle';
			return;
		}
		const t = setTimeout(() => {
			seq++;
			ensureWorker().postMessage({ seq, query: q } satisfies SearchRequest);
		}, 200);
		return () => clearTimeout(t);
	});

	// The index (several MB) used to be fetched on the first keystroke, so the first search
	// waited a couple of seconds. Start it when the reader shows intent (SHIG 14, 65, 61)
	let warmed = false;
	function warm(): void {
		if (warmed) return;
		const nav = navigator as Navigator & { connection?: ConnectionLike };
		if (prefersReducedData(nav.connection)) return;
		warmed = true;
		ensureWorker().postMessage({ warm: true } satisfies SearchRequest);
	}

	function choose(hit: SearchHit): void {
		open = false;
		onjump(hit);
	}

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIndex = Math.min(hits.length - 1, activeIndex + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIndex = Math.max(0, activeIndex - 1);
		} else if (e.key === 'Enter' && activeIndex >= 0 && hits[activeIndex]) {
			e.preventDefault();
			choose(hits[activeIndex]);
		} else if (e.key === 'Escape') {
			open = false;
			inputEl?.blur();
		}
	}

	/** Global shortcut "/" focuses search */
	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
			const target = e.target as HTMLElement | null;
			if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
			e.preventDefault();
			inputEl?.focus();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<div class="searchbox" role="search">
	<input
		bind:this={inputEl}
		bind:value={query}
		type="search"
		placeholder="検索（/）"
		aria-label="ニュースを検索"
		role="combobox"
		aria-autocomplete="list"
		aria-expanded={expanded}
		aria-controls={listId}
		aria-activedescendant={expanded && showHits && activeIndex >= 0
			? `${listId}-${activeIndex}`
			: undefined}
		onfocus={() => {
			open = true;
			warm();
		}}
		onpointerenter={warm}
		onblur={() => setTimeout(() => (open = false), 150)}
		onkeydown={onKeydown}
	/>
	{#if expanded}
		<div class="results">
			<!-- The listbox exists whenever the popup is expanded (even while empty), so aria-controls
			     always points at a real element. axe: aria-required-attr / aria-valid-attr-value -->
			<div id={listId} role="listbox" aria-label="検索結果">
				{#if showHits}
					{#each hits as hit, i (hit.id)}
						<button
							type="button"
							id="{listId}-{i}"
							role="option"
							tabindex="-1"
							aria-selected={i === activeIndex}
							class="hit"
							class:active={i === activeIndex}
							onmousedown={(e) => {
								e.preventDefault();
								choose(hit);
							}}
						>
							<span class="date">{hit.date.slice(0, 7).replace('-', '.')}</span>
							<span class="text">{hit.text}</span>
						</button>
					{/each}
				{/if}
			</div>
			{#if message}
				<p class="hint" role="status">{message}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.searchbox {
		position: relative;
		/* When the parent is flex, min-width:auto (= the input's fixed width) becomes the shrink floor,
		   pushing other header elements out on narrow screens. Allow 0 and absorb it in the search field */
		min-width: 0;
	}

	input {
		width: min(260px, 38vw);
		/* Follows the shrunken .searchbox. While there is room, the width above applies, so the look is unchanged */
		max-width: 100%;
		min-width: 0;
		padding: 7px 12px;
		font-size: 0.85rem;
		font-family: inherit;
		color: var(--ink);
		background: var(--bg-elevated);
		border: 1px solid var(--line);
		border-radius: 999px;
	}
	input:focus {
		outline: 2px solid var(--focus);
		outline-offset: 1px;
	}

	.results {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		/* right:0 is relative to "the right edge of the search field", so at 92vw it overflows the left edge of the screen by
		   the theme toggle to its right plus side margins, cutting off the first digits of dates. Subtract that (72px) from the viewport width to fit */
		width: min(430px, calc(100vw - 72px));
		max-height: 55vh;
		overflow-y: auto;
		background: var(--bg-elevated);
		border: 1px solid var(--line);
		border-radius: 12px;
		box-shadow: var(--shadow);
		padding: 6px;
		z-index: 20;
		transform-origin: top right;
		animation: results-in 0.16s cubic-bezier(0.22, 1.1, 0.36, 1) backwards;
	}
	@keyframes results-in {
		from {
			opacity: 0;
			transform: translateY(-4px) scale(0.97);
		}
	}
	input {
		transition: width 0.2s ease, border-color 0.15s ease;
	}
	input:focus {
		width: min(300px, 44vw);
	}

	.hint {
		margin: 0;
		padding: 12px;
		font-size: 0.8rem;
		color: var(--ink-muted);
	}

	.hit {
		display: flex;
		gap: 10px;
		width: 100%;
		padding: 8px 10px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		align-items: baseline;
	}
	.hit:hover,
	.hit.active {
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}

	.date {
		flex: none;
		font-size: 0.72rem;
		color: var(--ink-muted);
		font-variant-numeric: tabular-nums;
	}

	.text {
		font-size: 0.8rem;
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
