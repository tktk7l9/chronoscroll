<script lang="ts">
	import { timelineHref } from '$lib/collections';
	import ArtIcon from '$lib/components/ArtIcon.svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import SponsorSlot from '$lib/components/SponsorSlot.svelte';
	import { formatCount, formatEventDate } from '$lib/coverage';
	import { CATEGORY_LABELS } from '$lib/types';
	import { formatWareki } from '$lib/wareki';

	let { data } = $props();

	const c = $derived(data.detail);
	const canonical = $derived(`https://chronoscroll.vercel.app/c/${c.slug}`);
	const spanLabel = $derived(`${c.fromDate.slice(0, 4)}年〜${c.toDate.slice(0, 4)}年`);
	// 年表側は特集を ?k=<slug> で絞り込む。期間が画面に収まる初期ズームも一緒に渡す
	const onTimeline = $derived(timelineHref(c.slug, c.fromDate, c.toDate));
</script>

<svelte:head>
	<title>{c.title} | chronoscroll</title>
	<meta name="description" content={c.description} />
	<link rel="canonical" href={canonical} />
	<meta property="og:type" content="article" />
	<meta property="og:title" content="{c.title} | chronoscroll" />
	<meta property="og:description" content={c.description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content="https://chronoscroll.vercel.app/ogp.png" />
	<meta property="og:site_name" content="chronoscroll" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<header class="page-header">
	<a class="brand" href="/">
		<BrandMark size={19} />
		<span class="brand-name">chronoscroll</span>
		<span class="brand-sub">歴史ニュース年表</span>
	</a>
	<a class="up" href="/c">特集一覧</a>
</header>

<main>
	<article>
		<p class="crumb"><a href="/c">特集</a></p>
		{#if c.icon}
			<p class="cover"><ArtIcon id={c.icon} size={96} /></p>
		{/if}
		<h1>{c.title}</h1>
		<p class="lead">{c.lead}</p>
		<p class="meta">全{formatCount(c.count)}件 · {spanLabel}</p>

		<p class="cta">
			<!-- 年表(/)はcsr有効なルート。特集ページはcsr=falseなのでフルリロードで渡す -->
			<a class="timeline-link" href={onTimeline} data-sveltekit-reload>年表で通して見る →</a>
		</p>

		<ol class="items">
			{#each c.events as ev (ev.id)}
				{@const wareki = formatWareki(ev.date)}
				<li data-cat={ev.category}>
					<p class="when">
						<time datetime={ev.date}>{formatEventDate(ev.date, ev.precision)}</time>
						{#if wareki}<span class="wareki">{wareki}</span>{/if}
						<span class="chip cat">{CATEGORY_LABELS[ev.category]}</span>
					</p>
					<h2><a href="/e/{ev.id}">{ev.title}</a></h2>
					{#if ev.svg}
						<span class="mark" aria-hidden="true"><ArtIcon id={ev.svg} size={44} /></span>
					{/if}
					<p class="summary">{ev.summary}</p>
				</li>
			{/each}
		</ol>

		<SponsorSlot />

		<nav class="neighbors" aria-label="前後の特集">
			{#if data.prev}
				<a class="prev" href="/c/{data.prev.slug}">
					<span class="dir">← 前の特集</span>
					<span class="ntitle">{data.prev.title}</span>
				</a>
			{/if}
			{#if data.next}
				<a class="next" href="/c/{data.next.slug}">
					<span class="dir">次の特集 →</span>
					<span class="ntitle">{data.next.title}</span>
				</a>
			{/if}
		</nav>
	</article>
</main>

<footer class="page-footer">
	<p>
		データ: <a href="https://ja.wikipedia.org/" target="_blank" rel="noopener noreferrer">Wikipedia</a>
		（<a
			href="https://creativecommons.org/licenses/by-sa/4.0/deed.ja"
			target="_blank"
			rel="noopener noreferrer">CC BY-SA 4.0</a
		>）。各できごとの出典は個別ページに記載しています。 /
		<a href="/">chronoscroll — 歴史ニュースの縦スクロール年表</a>
	</p>
</footer>

<style>
	.page-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--line);
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
		font-size: 1.05rem;
	}
	.brand-sub {
		font-size: 0.7rem;
		color: var(--ink-muted);
	}
	.up {
		flex: none;
		font-size: 0.78rem;
		color: var(--accent);
	}

	main {
		max-width: 660px;
		margin: 0 auto;
		padding: 30px 20px 30px;
	}

	.crumb {
		margin: 0 0 14px;
		font-size: 0.75rem;
	}
	.crumb a {
		color: var(--ink-muted);
	}

	.cover {
		margin: 0 0 10px;
		color: var(--accent);
		line-height: 0;
	}

	h1 {
		margin: 0 0 12px;
		font-family: var(--font-serif);
		font-size: 1.6rem;
		line-height: 1.45;
	}
	.lead {
		margin: 0 0 10px;
		font-size: 0.95rem;
		line-height: 1.95;
	}
	.meta {
		margin: 0 0 22px;
		font-size: 0.75rem;
		color: var(--ink-muted);
		font-variant-numeric: tabular-nums;
	}

	.cta {
		margin: 0 0 30px;
	}
	.timeline-link {
		display: inline-block;
		padding: 9px 18px;
		background: var(--accent);
		color: var(--bg-elevated);
		text-decoration: none;
		border-radius: 999px;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.items {
		margin: 0 0 26px;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--line);
	}
	.items li {
		position: relative;
		padding: 20px 0 18px 18px;
		border-bottom: 1px solid var(--line);
		--cat-color: var(--cat-society);
	}
	.items li[data-cat='politics'] { --cat-color: var(--cat-politics); }
	.items li[data-cat='economy'] { --cat-color: var(--cat-economy); }
	.items li[data-cat='culture'] { --cat-color: var(--cat-culture); }
	.items li[data-cat='science'] { --cat-color: var(--cat-science); }
	.items li[data-cat='sports'] { --cat-color: var(--cat-sports); }
	.items li[data-cat='disaster'] { --cat-color: var(--cat-disaster); }
	.items li[data-cat='war'] { --cat-color: var(--cat-war); }

	/* 左端の縦線＝年表の背骨を思わせるガイド */
	.items li::before {
		content: '';
		position: absolute;
		left: 0;
		top: 26px;
		bottom: 18px;
		width: 2px;
		background: color-mix(in srgb, var(--cat-color) 40%, transparent);
		border-radius: 2px;
	}

	.when {
		margin: 0 0 5px;
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 9px;
		font-size: 0.8rem;
		color: var(--ink-muted);
		font-variant-numeric: tabular-nums;
	}
	.wareki {
		font-size: 0.72rem;
	}
	.chip {
		font-size: 0.68rem;
		padding: 1px 9px;
		border: 1px solid var(--line);
		border-radius: 999px;
	}
	.chip.cat {
		color: var(--cat-color);
		border-color: color-mix(in srgb, var(--cat-color) 45%, transparent);
		font-weight: 600;
	}

	.items h2 {
		margin: 0 0 6px;
		font-family: var(--font-serif);
		font-size: 1.06rem;
		line-height: 1.55;
	}
	.items h2 a {
		text-decoration: none;
		color: inherit;
	}
	.items h2 a:hover {
		text-decoration: underline;
		text-decoration-color: var(--cat-color);
		text-underline-offset: 3px;
	}

	.mark {
		float: right;
		margin: 0 0 6px 14px;
		color: var(--cat-color);
		line-height: 0;
	}

	.summary {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.95;
		color: var(--ink);
	}

	.neighbors {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		border-top: 1px solid var(--line);
		padding-top: 18px;
	}
	.neighbors a {
		display: flex;
		flex-direction: column;
		gap: 3px;
		max-width: 46%;
		text-decoration: none;
		color: inherit;
	}
	.neighbors .next {
		margin-left: auto;
		text-align: right;
	}
	.dir {
		font-size: 0.72rem;
		color: var(--accent);
	}
	.ntitle {
		font-size: 0.82rem;
		color: var(--ink-muted);
	}

	.page-footer {
		padding: 22px 20px 34px;
		text-align: center;
		font-size: 0.75rem;
		color: var(--ink-muted);
		border-top: 1px solid var(--line);
	}
</style>
