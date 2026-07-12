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
	import type { SearchHit } from '$lib/search';
	import { timelineData } from '$lib/state/data.svelte';
	import type { NewsEvent } from '$lib/types';
	import { DEFAULT_URL_STATE, parseUrlState, serializeUrlState } from '$lib/url-state';

	const initial = browser ? parseUrlState(new URLSearchParams(location.search)) : DEFAULT_URL_STATE;

	let filter = $state(initial.filter);
	let query = $state(initial.query);
	let selectedId = $state<string | null>(initial.selectedId);
	let view = $state({ center: initial.centerDate, pxPerDay: initial.pxPerDay });
	let highlightId = $state<string | null>(null);
	let timeline = $state<ReturnType<typeof Timeline>>();
	let routerReady = $state(false);

	const selected = $derived(selectedId !== null ? (timelineData.byId(selectedId) ?? null) : null);

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

	// URL同期（表示位置・ズーム・フィルタ・選択）
	$effect(() => {
		if (!routerReady) return;
		const params = serializeUrlState({
			centerDate: view.center,
			pxPerDay: view.pxPerDay,
			filter,
			query,
			selectedId,
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
		content="1868年（明治）から現在までの国内外の歴史ニュース13,000件超を、ズームで詳しさが変わる縦スクロール年表で。"
	/>
	<meta property="og:type" content="website" />
	<meta property="og:title" content="chronoscroll — 歴史ニュースの縦スクロール年表" />
	<meta
		property="og:description"
		content="1868年（明治）から現在までの歴史ニュース13,000件超。ズームするほど歴史が細かく見える無限スクロール年表。"
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
			<SearchBox bind:query onjump={onJump} />
			<ThemeToggle />
		</div>
	</div>
	<div class="row filters">
		<FilterBar bind:filter />
	</div>
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
			{onselect}
			onviewchange={(center, pxPerDay) => {
				view = { center, pxPerDay };
			}}
		/>
	{/if}
</main>

<DetailDialog
	ev={selected}
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
	}
	.row.filters {
		justify-content: flex-start;
	}
	.brand {
		display: inline-flex;
		align-items: baseline;
		gap: 8px;
		text-decoration: none;
		color: inherit;
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
	}

	main {
		padding-top: 96px;
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
