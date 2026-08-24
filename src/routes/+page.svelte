<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { afterNavigate, replaceState } from '$app/navigation';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import DetailDialog from '$lib/components/DetailDialog.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SearchBox from '$lib/components/SearchBox.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import Timeline from '$lib/components/Timeline.svelte';
	import { formatCount, formatJpDate } from '$lib/coverage';
	import { withCollection } from '$lib/filters';
	import type { SearchHit } from '$lib/search';
	import { timelineData } from '$lib/state/data.svelte';
	import type { NewsEvent } from '$lib/types';
	import { DEFAULT_URL_STATE, parseUrlState, serializeUrlState } from '$lib/url-state';
	// 収録件数と期間はビルド時に確定させる（実行時のfetch待ちにしないことで
	// pop-in/CLSを避け、prerender済みHTMLとOGP/descriptionにも実数を載せる）
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

	// replaceState はルーター初期化前に呼べないため、初回ナビゲーション完了後に解禁
	afterNavigate(() => {
		routerReady = true;
	});

	// 共有ディープリンクで未ロードのイベントが選択されていたら、該当チャンクをロード
	$effect(() => {
		if (selectedId !== null && selected === null && timelineData.meta) {
			void timelineData.loadById(selectedId, selectedId.slice(0, 10));
		}
	});

	// 特集の絞り込み。id集合は詳細JSON（イベント本体つき）から解決するので、
	// これ1回の取得でチャンクを読まずに特集の全件が年表に並ぶ
	$effect(() => {
		const slug = collectionSlug;
		if (slug === null) {
			if (filter.collectionIds !== null) filter = withCollection(filter, null);
			return;
		}
		void timelineData.loadCollection(slug).then((detail) => {
			if (collectionSlug !== slug) return;
			// 取得に失敗したら絞り込まない（年表は通常表示のまま）
			filter = withCollection(filter, detail && new Set(detail.events.map((e) => e.id)));
		});
	});

	// URL同期（表示位置・ズーム・フィルタ・選択・特集）
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
		replaceState(qs !== '' ? `?${qs}` : location.pathname, {});
	});

	function onselect(ev: NewsEvent): void {
		selectedId = ev.id;
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
	<meta property="og:url" content="https://chronoscroll.vercel.app/" />
	<meta property="og:image" content="https://chronoscroll.vercel.app/ogp.png" />
	<meta property="og:site_name" content="chronoscroll" />
	<meta name="twitter:card" content="summary_large_image" />
	<!-- 初期データをJS起動と並列で取得する。
	     crossorigin属性は付けない（same-originのfetch()とcredentialsモードを一致させないと
	     preloadが未消費になり二重取得+接続保持でnetworkidleが来なくなる） -->
	<link rel="preload" href="/data/index.json" as="fetch" />
	<link rel="preload" href="/data/overview.json" as="fetch" />
</svelte:head>

<header class="site-header">
	<div class="row">
		<a class="brand" href="/">
			<BrandMark size={21} />
			<span class="brand-name">chronoscroll</span>
			<span class="brand-sub">歴史ニュース年表</span>
		</a>
		<div class="tools">
			<!-- /c は csr=false の純静的ページなのでフルリロードで遷移する -->
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
				<button type="button" class="cb-clear" onclick={() => (collectionSlug = null)}>
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

<main>
	{#if timelineData.loadError}
		<p class="error">データの読み込みに失敗しました: {timelineData.loadError}</p>
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
	onclose={() => (selectedId = null)}
	onselectrelated={(id) => (selectedId = id)}
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
		/* 狭い画面では検索欄が縮んで収まるようにする（テーマ切替がはみ出すのを防ぐ） */
		min-width: 0;
	}
	.row.filters {
		justify-content: flex-start;
		gap: 10px;
		/* FilterBar自体が横スクロールするので、この行は決して折り返さない
		   （折り返すとヘッダー高が変わり main の padding-top とズレる） */
		flex-wrap: nowrap;
		min-width: 0;
	}

	.nav-link {
		flex: none;
		font-size: 0.78rem;
		color: var(--ink-muted);
		text-decoration: none;
		padding: 3px 2px;
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
		color: var(--accent);
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
	.cb-clear {
		flex: none;
		padding: 2px 9px;
		font-family: inherit;
		font-size: 0.68rem;
		color: var(--ink-muted);
		background: var(--bg-elevated);
		border: 1px solid var(--line);
		border-radius: 999px;
		cursor: pointer;
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
		/* 縮小はツール側（検索欄）に寄せ、サイト名は常に全文表示する */
		flex: none;
	}
	.brand-name {
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

	/* 収録データの範囲。値はビルド時に確定しているため高さは固定＝CLSなし */
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

	.error {
		padding: 120px 20px;
		text-align: center;
		color: var(--ink-muted);
	}

	.site-footer {
		padding: 28px 20px 40px;
		text-align: center;
		font-size: 0.75rem;
		color: var(--ink-muted);
		border-top: 1px solid var(--line);
	}
</style>
