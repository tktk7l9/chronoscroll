<script lang="ts">
	import type { SearchHit } from '../search.ts';
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
	let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let open = $state(false);
	let activeIndex = $state(-1);
	let inputEl = $state<HTMLInputElement>();

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

	/** グローバルショートカット「/」で検索へ */
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
		onfocus={() => (open = true)}
		onblur={() => setTimeout(() => (open = false), 150)}
		onkeydown={onKeydown}
	/>
	{#if open && query.trim() !== ''}
		<div class="results" role="listbox" aria-label="検索結果">
			{#if status === 'loading'}
				<p class="hint">索引を準備中…</p>
			{:else if status === 'error'}
				<p class="hint">検索でエラーが発生しました</p>
			{:else if hits.length === 0 && status === 'ready'}
				<p class="hint">見つかりませんでした</p>
			{:else}
				{#each hits as hit, i (hit.id)}
					<button
						type="button"
						role="option"
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
	{/if}
</div>

<style>
	.searchbox {
		position: relative;
	}

	input {
		width: min(260px, 38vw);
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
		width: min(430px, 92vw);
		max-height: 55vh;
		overflow-y: auto;
		background: var(--bg-elevated);
		border: 1px solid var(--line);
		border-radius: 12px;
		box-shadow: var(--shadow);
		padding: 6px;
		z-index: 20;
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
