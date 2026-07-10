<script lang="ts">
	import ArtIcon from '$lib/components/ArtIcon.svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import { CATEGORY_LABELS, REGION_LABELS } from '$lib/types';
	import { formatWareki } from '$lib/wareki';

	let { data } = $props();

	const ev = $derived(data.ev);
	const dateLabel = $derived.by(() => {
		const [y, m, d] = ev.date.split('-');
		if (ev.precision === 'year') return `${y}年`;
		if (ev.precision === 'month') return `${y}年${Number(m)}月`;
		return `${y}年${Number(m)}月${Number(d)}日`;
	});
	const wareki = $derived(formatWareki(ev.date));
	const timelineUrl = $derived(`/?t=${ev.date}&z=8&e=${ev.id}`);
	const canonical = $derived(`https://chronoscroll.vercel.app/e/${ev.id}`);
	const metaDescription = $derived(
		ev.summary.length > 130 ? `${ev.summary.slice(0, 129)}…` : ev.summary,
	);
</script>

<svelte:head>
	<title>{ev.title}（{dateLabel}） | chronoscroll</title>
	<meta name="description" content={metaDescription} />
	<link rel="canonical" href={canonical} />
	<meta property="og:type" content="article" />
	<meta property="og:title" content="{ev.title}（{dateLabel}）" />
	<meta property="og:description" content={metaDescription} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content="https://chronoscroll.vercel.app/ogp.png" />
	<meta property="og:site_name" content="chronoscroll" />
	<meta name="twitter:card" content="summary" />
</svelte:head>

<header class="page-header">
	<a class="brand" href="/">
		<BrandMark size={19} />
		<span class="brand-name">chronoscroll</span>
		<span class="brand-sub">歴史ニュース年表</span>
	</a>
</header>

<main>
	<article data-cat={ev.category}>
		<p class="when">
			<time datetime={ev.date}>{dateLabel}</time>
			{#if wareki}<span class="wareki">{wareki}</span>{/if}
		</p>
		<h1>{ev.title}</h1>
		<p class="chips">
			<span class="chip cat">{CATEGORY_LABELS[ev.category]}</span>
			<span class="chip">{REGION_LABELS[ev.region]}</span>
		</p>

		{#if ev.image}
			<figure>
				<img src={ev.image.src} width={ev.image.width} height={ev.image.height} alt="" />
				<figcaption>
					<a href={ev.image.credit} target="_blank" rel="noopener noreferrer">
						画像: Wikimedia Commons
					</a>
				</figcaption>
			</figure>
		{:else if ev.svg}
			<div class="art"><ArtIcon id={ev.svg} size={112} /></div>
		{/if}

		<p class="summary">{ev.summary}</p>

		<p class="cta">
			<a class="timeline-link" href={timelineUrl} data-sveltekit-reload>年表でこの位置を開く →</a>
		</p>

		<section class="sources">
			<h2>出典・引用元</h2>
			<ul>
				{#each ev.sources as s (s.url)}
					<li><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label} ↗</a></li>
				{/each}
			</ul>
		</section>

		<nav class="neighbors" aria-label="前後のできごと">
			{#if data.prev}
				<a class="prev" href="/e/{data.prev.id}">
					<span class="dir">← 前のできごと</span>
					<span class="ntitle">{data.prev.title}</span>
				</a>
			{/if}
			{#if data.next}
				<a class="next" href="/e/{data.next.id}">
					<span class="dir">次のできごと →</span>
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
		>） / <a href="/">chronoscroll — 歴史ニュースの縦スクロール年表</a>
	</p>
</footer>

<style>
	.page-header {
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

	main {
		max-width: 640px;
		margin: 0 auto;
		padding: 34px 20px 30px;
	}

	article {
		--cat-color: var(--cat-society);
	}
	article[data-cat='politics'] { --cat-color: var(--cat-politics); }
	article[data-cat='economy'] { --cat-color: var(--cat-economy); }
	article[data-cat='culture'] { --cat-color: var(--cat-culture); }
	article[data-cat='science'] { --cat-color: var(--cat-science); }
	article[data-cat='sports'] { --cat-color: var(--cat-sports); }
	article[data-cat='disaster'] { --cat-color: var(--cat-disaster); }
	article[data-cat='war'] { --cat-color: var(--cat-war); }

	.when {
		margin: 0 0 4px;
		display: flex;
		gap: 10px;
		align-items: baseline;
		color: var(--ink-muted);
		font-size: 0.9rem;
		font-variant-numeric: tabular-nums;
	}
	.wareki {
		font-size: 0.78rem;
	}

	h1 {
		margin: 0 0 10px;
		font-family: var(--font-serif);
		font-size: 1.45rem;
		line-height: 1.5;
	}

	.chips {
		margin: 0 0 18px;
		display: flex;
		gap: 8px;
	}
	.chip {
		font-size: 0.72rem;
		padding: 2px 10px;
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--ink-muted);
	}
	.chip.cat {
		color: var(--cat-color);
		border-color: color-mix(in srgb, var(--cat-color) 45%, transparent);
		font-weight: 600;
	}

	figure {
		margin: 0 0 16px;
	}
	img {
		display: block;
		width: 100%;
		height: auto;
		max-height: 360px;
		object-fit: contain;
		border-radius: 10px;
		background: color-mix(in srgb, var(--ink) 6%, transparent);
	}
	figcaption {
		margin-top: 4px;
		font-size: 0.7rem;
		text-align: right;
	}
	figcaption a {
		color: var(--ink-muted);
	}

	.art {
		display: flex;
		justify-content: center;
		padding: 8px 0 20px;
		color: var(--cat-color);
	}

	.summary {
		margin: 0 0 22px;
		line-height: 2;
		font-size: 1rem;
	}

	.cta {
		margin: 0 0 26px;
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

	.sources h2 {
		margin: 0 0 6px;
		font-size: 0.78rem;
		color: var(--ink-muted);
	}
	.sources ul {
		margin: 0 0 26px;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.9rem;
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
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.page-footer {
		padding: 22px 20px 34px;
		text-align: center;
		font-size: 0.75rem;
		color: var(--ink-muted);
		border-top: 1px solid var(--line);
	}
</style>
