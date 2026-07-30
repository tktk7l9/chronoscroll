<script lang="ts">
	import ArtIcon from '$lib/components/ArtIcon.svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import { formatCount } from '$lib/coverage';

	let { data } = $props();

	const canonical = 'https://chronoscroll.vercel.app/c';
	const description =
		'アニメ、ブレイクダンス、観葉植物、AI──テーマごとに歴史のできごとを年代順に束ねた特集の一覧。';

	function spanLabel(from: string, to: string): string {
		return `${from.slice(0, 4)}年〜${to.slice(0, 4)}年`;
	}
</script>

<svelte:head>
	<title>特集一覧 | chronoscroll</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="特集一覧 | chronoscroll" />
	<meta property="og:description" content={description} />
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
</header>

<main>
	<h1>特集</h1>
	<p class="lead">
		ひとつのテーマを決めて、その歴史だけを年代順に読む。年表の中から関係するできごとを集め、
		足りない部分は出典つきで書き足しています。
	</p>

	<ul class="cards">
		{#each data.collections as c (c.slug)}
			<li>
				<a class="card" href="/c/{c.slug}">
					{#if c.icon}
						<span class="icon"><ArtIcon id={c.icon} size={64} /></span>
					{/if}
					<span class="body">
						<span class="title">{c.title}</span>
						<span class="clead">{c.lead}</span>
						<span class="meta">全{formatCount(c.count)}件 · {spanLabel(c.fromDate, c.toDate)}</span>
					</span>
				</a>
			</li>
		{/each}
	</ul>
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
		max-width: 720px;
		margin: 0 auto;
		padding: 34px 20px 30px;
	}

	h1 {
		margin: 0 0 10px;
		font-family: var(--font-serif);
		font-size: 1.5rem;
	}
	.lead {
		margin: 0 0 26px;
		font-size: 0.9rem;
		line-height: 1.9;
		color: var(--ink-muted);
	}

	.cards {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 14px;
	}
	@media (min-width: 620px) {
		.cards {
			grid-template-columns: 1fr 1fr;
		}
	}

	.card {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		height: 100%;
		padding: 16px 18px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--bg-elevated);
		text-decoration: none;
		color: inherit;
		box-shadow: var(--shadow);
	}
	.card:hover {
		border-color: var(--line-strong);
	}
	.icon {
		flex: none;
		color: var(--accent);
		line-height: 0;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.title {
		font-family: var(--font-serif);
		font-size: 1.05rem;
		font-weight: 700;
		line-height: 1.4;
	}
	.clead {
		font-size: 0.82rem;
		line-height: 1.75;
		color: var(--ink-muted);
	}
	.meta {
		font-size: 0.72rem;
		color: var(--ink-muted);
		font-variant-numeric: tabular-nums;
	}

	.page-footer {
		padding: 22px 20px 34px;
		text-align: center;
		font-size: 0.75rem;
		color: var(--ink-muted);
		border-top: 1px solid var(--line);
	}
</style>
