<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/env';
	import { afterNavigate, goto } from '$app/navigation';
	import BrandMark from '#lib/components/BrandMark.svelte';
	import DetailDialog from '#lib/components/DetailDialog.svelte';
	import FilterBar from '#lib/components/FilterBar.svelte';
	import SearchBox from '#lib/components/SearchBox.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import Timeline from '#lib/components/Timeline.svelte';
	import { formatCount, formatJpDate } from '#lib/coverage.js';
	import { withCollection } from '#lib/filters.js';
	import { absoluteUrl } from '#lib/site.js';
	import type { SearchHit } from '#lib/search.js';
	import { timelineData } from '#lib/state/data.svelte.js';
	import type { NewsEvent } from '#lib/types.js';
	import { DEFAULT_URL_STATE, parseUrlState, serializeUrlState } from '#lib/url-state.js';
	// The count and period are fixed at build time (not waiting on a runtime fetch
	// avoids pop-in/CLS and puts the real numbers into the prerendered HTML and OGP/description)
	import { maxDate, minDate, total } from '../../static/data/index.json';

	const coverage = {
		count: formatCount(total),
		from: formatJpDate(minDate),
		to: formatJpDate(maxDate),
	};

	const initial = browser ? parseUrlState(new URLSearchParams(location.search)) : DEFAULT_URL_STATE;

	let filter = $state(initial.filter);
	let query = $state(initial.query);
	let selectedId = $state<string | null>(initial.selectedId);
	let view = $state({ center: initial.centerDate, pxPerDay: initial.pxPerDay });
	let highlightId = $state<string | null>(null);
	let timeline = $state<ReturnType<typeof Timeline>>();
	let routerReady = $state(false);
	let collectionSlug = $state<string | null>(initial.collection);
	// Events left behind by following related links inside the dialog (the way back, SHIG 60)
	let detailHistory = $state<string[]>([]);

	const selected = $derived(selectedId !== null ? (timelineData.byId(selectedId) ?? null) : null);
	const selectedBooks = $derived(selectedId !== null ? timelineData.booksById(selectedId) : []);
	const selectedCollections = $derived(
		selectedId !== null ? timelineData.collectionsByEvent(selectedId) : [],
	);
	const activeCollection = $derived(
		collectionSlug !== null
			? (timelineData.collections.find((c) => c.slug === collectionSlug) ?? null)
			: null,
	);

	onMount(() => {
		void timelineData.init();
	});

	// goto cannot be called before the router initializes, so enable it after the first navigation completes
	// (the shallow URL updates below also fire afterNavigate in SvelteKit 3; ignore those)
	afterNavigate(({ shallow }) => {
		if (shallow) return;
		routerReady = true;
	});

	// If a shared deep link selects an event that is not loaded yet, load its chunk
	$effect(() => {
		if (selectedId !== null && selected === null && timelineData.meta) {
			void timelineData.loadById(selectedId, selectedId.slice(0, 10));
		}
	});

	// Filter by collection. The id set is resolved from the detail JSON (with event bodies), so
	// this single fetch lines up every event of the collection on the timeline without loading chunks
	$effect(() => {
		const slug = collectionSlug;
		if (slug === null) {
			if (filter.collectionIds !== null) filter = withCollection(filter, null);
			return;
		}
		void timelineData.loadCollection(slug).then((detail) => {
			if (collectionSlug !== slug) return;
			// If fetching fails, do not filter (the timeline stays in its normal view)
			filter = withCollection(filter, detail && new Set(detail.events.map((e) => e.id)));
		});
	});

	// URL sync (position, zoom, filters, selection, collection)
	$effect(() => {
		if (!routerReady) return;
		const params = serializeUrlState({
			centerDate: view.center,
			pxPerDay: view.pxPerDay,
			filter,
			query,
			selectedId,
			collection: collectionSlug,
		});
		const qs = params.toString();
		void goto(qs !== '' ? `?${qs}` : location.pathname, { shallow: true, replace: true });
	});

	function onselect(ev: NewsEvent): void {
		selectedId = ev.id;
	}
	async function onselectrelated(id: string): Promise<void> {
		// Related events usually sit in another decade, i.e. in a chunk that is not loaded yet.
		// Selecting the id first would render `selected` null, close the dialog and drop the
		// selection before the chunk arrives, so load it while the current event stays open
		const from = selectedId;
		const target = await timelineData.loadById(id, id.slice(0, 10));
		if (target === undefined || selectedId !== from) return;
		if (from !== null) detailHistory = [...detailHistory, from];
		selectedId = id;
	}
	function onback(): void {
		const prev = detailHistory.at(-1);
		if (prev === undefined) return;
		detailHistory = detailHistory.slice(0, -1);
		selectedId = prev;
	}
	function oncloseDetail(): void {
		selectedId = null;
		detailHistory = [];
	}

	let highlightTimer: ReturnType<typeof setTimeout> | undefined;
	async function onJump(hit: SearchHit): Promise<void> {
		await timelineData.loadById(hit.id, hit.date);
		timeline?.jumpTo(hit.date);
		highlightId = hit.id;
		clearTimeout(highlightTimer);
		highlightTimer = setTimeout(() => (highlightId = null), 4000);
	}
</script>

<svelte:head>
	<title>chronoscroll — 歴史ニュースの縦スクロール年表</title>
	<meta
		name="description"
		content="{coverage.from}から{coverage.to}までの国内外の歴史ニュース全{coverage.count}件を、ズームで詳しさが変わる縦スクロール年表で。"
	/>
	<meta property="og:type" content="website" />
	<meta property="og:title" content="chronoscroll — 歴史ニュースの縦スクロール年表" />
	<meta
		property="og:description"
		content="歴史ニュース全{coverage.count}件（{coverage.from}〜{coverage.to}）。ズームするほど歴史が細かく見える無限スクロール年表。"
	/>
	<meta property="og:url" content={absoluteUrl('/')} />
	<meta property="og:image" content={absoluteUrl('/ogp.png')} />
	<meta property="og:site_name" content="chronoscroll" />
	<meta name="twitter:card" content="summary_large_image" />
	<!-- Fetch the initial data in parallel with JS startup.
	     No crossorigin attribute (unless the credentials mode matches the same-origin fetch(),
	     the preload goes unused, causing a double fetch + a held connection so networkidle never comes) -->
	<link rel="preload" href="/data/index.json" as="fetch" />
	<!-- Only the card-only overview is preloaded; the full overview.json follows once it arrives -->
	<link rel="preload" href="/data/overview-lite.json" as="fetch" />
</svelte:head>

<!-- Skip past the header controls straight to the timeline (SHIG 20, 59) -->
<a class="skip-link" href="#timeline">年表へ移動</a>

<header class="site-header">
	<div class="row">
		<a class="brand" href="/">
			<BrandMark size={21} />
			<!-- The site name is the page's only level-one heading (WCAG 1.3.1, SHIG 59) -->
			<h1 class="brand-name">chronoscroll</h1>
			<span class="brand-sub">歴史ニュース年表</span>
		</a>
		<div class="tools">
			<!-- /c is a pure static page with csr=false, so navigate with a full reload -->
			<a class="nav-link" href="/c" data-sveltekit-reload>特集</a>
			<SearchBox bind:query onjump={onJump} />
			<ThemeToggle />
		</div>
	</div>
	<div class="row filters">
		{#if collectionSlug !== null}
			<p class="collection-banner">
				<span class="cb-label">特集</span>
				<a class="cb-title" href="/c/{collectionSlug}" data-sveltekit-reload>
					{activeCollection ? activeCollection.title : collectionSlug}
				</a>
				{#if activeCollection}
					<!-- What the narrowed view holds; the header total stays the whole corpus (SHIG 28, 25) -->
					<span class="cb-count">全{formatCount(activeCollection.count)}件</span>
				{/if}
				<button
					type="button"
					class="cb-clear"
					aria-label="特集の絞り込みを解除"
					onclick={() => (collectionSlug = null)}
				>
					解除
				</button>
			</p>
		{/if}
		<FilterBar bind:filter />
	</div>
	<p class="coverage">
		<span class="vh">収録データ: </span>
		<span class="cov-count">全{coverage.count}件</span>
		<span class="cov-sep" aria-hidden="true">·</span>
		<time datetime={minDate}>{coverage.from}</time>
		<span aria-hidden="true">〜</span>
		<span class="vh">から</span>
		<time datetime={maxDate}>{coverage.to}</time>
		<span class="vh">まで</span>
	</p>
</header>

<main id="timeline" tabindex="-1">
	{#if timelineData.loadError}
		<!-- Say what to do next instead of echoing the raw exception (SHIG 11, 55) -->
		<div class="error" role="alert">
			<p>年表のデータを読み込めませんでした。</p>
			<p>通信状況を確かめてから、もう一度読み込んでください。</p>
			<button type="button" class="retry" onclick={() => location.reload()}>再読み込み</button>
		</div>
	{:else}
		<Timeline
			bind:this={timeline}
			data={timelineData}
			{filter}
			initialCenter={initial.centerDate}
			initialPxPerDay={initial.pxPerDay}
			{highlightId}
			locked={selected !== null}
			{onselect}
			onviewchange={(center, pxPerDay) => {
				view = { center, pxPerDay };
			}}
		/>
	{/if}
</main>

<DetailDialog
	ev={selected}
	books={selectedBooks}
	collections={selectedCollections}
	canBack={detailHistory.length > 0}
	onclose={oncloseDetail}
	{onselectrelated}
	{onback}
/>

<footer class="site-footer">
	<p>
		データ: <a href="https://ja.wikipedia.org/" target="_blank" rel="noopener noreferrer">Wikipedia</a>
		（<a
			href="https://creativecommons.org/licenses/by-sa/4.0/deed.ja"
			target="_blank"
			rel="noopener noreferrer">CC BY-SA 4.0</a
		>） / 画像: Wikimedia Commons
	</p>
</footer>

<style>
	.site-header {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 18px 8px;
		background: color-mix(in srgb, var(--bg) 88%, transparent);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--line);
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 10px;
		/* On narrow screens let the search field shrink to fit (prevents the theme toggle from overflowing) */
		min-width: 0;
	}
	.row.filters {
		justify-content: flex-start;
		gap: 10px;
		/* FilterBar scrolls horizontally itself, so this row must never wrap
		   (wrapping changes the header height and misaligns it with main's padding-top) */
		flex-wrap: nowrap;
		min-width: 0;
	}

	.nav-link {
		flex: none;
		display: inline-flex;
		align-items: center;
		/* 7mm touch target (SHIG 78) */
		min-height: 32px;
		font-size: 0.78rem;
		color: var(--ink-muted);
		text-decoration: none;
		padding: 0 4px;
	}
	.nav-link:hover {
		color: var(--accent);
	}

	.collection-banner {
		flex: none;
		display: flex;
		align-items: center;
		gap: 7px;
		margin: 0;
		padding: 3px 4px 3px 8px;
		border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
		border-radius: 999px;
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		font-size: 0.75rem;
		max-width: 62%;
	}
	.cb-label {
		flex: none;
		font-size: 0.65rem;
		font-weight: 700;
		/* The plain accent reads 4.0:1 on the tinted banner; darken it a step to clear 4.5:1 (WCAG 1.4.3) */
		color: color-mix(in srgb, var(--accent) 85%, var(--ink));
		letter-spacing: 0.04em;
	}
	.cb-title {
		color: inherit;
		text-decoration: none;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.cb-title:hover {
		text-decoration: underline;
	}
	.cb-count {
		flex: none;
		font-size: 0.68rem;
		color: var(--ink-muted);
		font-variant-numeric: tabular-nums;
	}
	.cb-clear {
		flex: none;
		position: relative;
		padding: 2px 9px;
		font-family: inherit;
		font-size: 0.68rem;
		color: var(--ink-muted);
		background: var(--bg-elevated);
		border: 1px solid var(--line);
		border-radius: 999px;
		cursor: pointer;
	}
	/* Widen the hotspot without changing the pill's look (SHIG 78, 93) */
	.cb-clear::after {
		content: '';
		position: absolute;
		inset: -6px -4px;
	}
	.cb-clear:hover {
		color: var(--ink);
		border-color: var(--line-strong);
	}
	.brand {
		display: inline-flex;
		align-items: baseline;
		gap: 8px;
		text-decoration: none;
		color: inherit;
		/* Shrinking goes to the tools (search field); the site name is always shown in full */
		flex: none;
	}
	.brand-name {
		margin: 0;
		font-family: var(--font-serif);
		font-weight: 700;
		font-size: 1.1rem;
		letter-spacing: 0.02em;
	}
	.brand-sub {
		font-size: 0.72rem;
		color: var(--ink-muted);
		white-space: nowrap;
	}
	.brand-name {
		white-space: nowrap;
	}

	/* Range of the covered data. The values are fixed at build time, so the height is fixed = no CLS */
	.coverage {
		display: flex;
		align-items: baseline;
		gap: 5px;
		margin: 0;
		font-size: 0.7rem;
		line-height: 1.4;
		color: var(--ink-muted);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.cov-count {
		color: var(--ink);
		font-weight: 600;
	}
	.cov-sep {
		color: var(--line-strong);
	}
	.vh {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (max-width: 560px) {
		.brand-sub {
			display: none;
		}
		.row {
			gap: 8px;
		}
		.site-header {
			padding: 8px 12px;
		}
		.coverage {
			font-size: 0.66rem;
			gap: 4px;
		}
	}

	main {
		padding-top: 118px;
	}
	main:focus {
		outline: none;
	}

	/* Hidden until focused, then shown above the fixed header */
	.skip-link {
		position: fixed;
		top: 8px;
		left: 8px;
		z-index: 20;
		padding: 8px 14px;
		border-radius: 8px;
		background: var(--bg-elevated);
		color: var(--ink);
		border: 1px solid var(--line-strong);
		box-shadow: var(--shadow);
		transform: translateY(-200%);
	}
	.skip-link:focus-visible {
		transform: none;
	}

	.error {
		padding: 120px 20px;
		text-align: center;
		color: var(--ink-muted);
	}
	.error p {
		margin: 0 0 6px;
	}
	.retry {
		margin-top: 14px;
		min-height: 36px;
		padding: 6px 18px;
		font-family: inherit;
		font-size: 0.85rem;
		color: var(--ink);
		background: var(--bg-elevated);
		border: 1px solid var(--line-strong);
		border-radius: 999px;
		cursor: pointer;
	}

	.site-footer {
		padding: 28px 20px 40px;
		text-align: center;
		font-size: 0.75rem;
		color: var(--ink-muted);
		border-top: 1px solid var(--line);
	}
	/* On phones the fixed era chip and zoom buttons sit over the footer; leave room below the text (SHIG 85, 16) */
	@media (max-width: 759px) {
		.site-footer {
			padding-bottom: 132px;
		}
	}
</style>
