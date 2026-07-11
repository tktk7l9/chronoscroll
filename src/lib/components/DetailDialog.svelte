<script lang="ts">
	import type { NewsEvent } from '../types.ts';
	import { CATEGORY_LABELS, REGION_LABELS } from '../types.ts';
	import { formatWareki } from '../wareki.ts';
	import ArtIcon from './ArtIcon.svelte';

	let { ev = null, onclose }: { ev: NewsEvent | null; onclose: () => void } = $props();

	let dialog = $state<HTMLDialogElement>();
	let closing = $state(false);

	$effect(() => {
		if (!dialog) return;
		if (ev && !dialog.open) {
			closing = false;
			dialog.showModal();
		} else if (!ev && dialog.open) {
			dialog.close();
		}
	});

	/** 閉幕アニメーションを流してから close する（reduced-motion時は即時） */
	function requestClose(): void {
		if (!dialog?.open || closing) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			dialog.close();
			return;
		}
		closing = true;
		setTimeout(() => {
			closing = false;
			dialog?.close();
		}, 170);
	}

	const dateLabel = $derived.by(() => {
		if (!ev) return '';
		const [y, m, d] = ev.date.split('-');
		if (ev.precision === 'year') return `${y}年`;
		if (ev.precision === 'month') return `${y}年${Number(m)}月`;
		return `${y}年${Number(m)}月${Number(d)}日`;
	});
	const wareki = $derived(ev ? formatWareki(ev.date) : null);
</script>

<dialog
	bind:this={dialog}
	class:closing
	onclose={() => onclose()}
	oncancel={(e) => {
		e.preventDefault();
		requestClose();
	}}
	onclick={(e) => {
		if (e.target === dialog) requestClose();
	}}
>
	{#if ev}
		<article data-cat={ev.category}>
			<header>
				<p class="when">
					<time datetime={ev.date}>{dateLabel}</time>
					{#if wareki}<span class="wareki">{wareki}</span>{/if}
				</p>
				<h2>{ev.title}</h2>
				<p class="chips">
					<span class="chip cat">{CATEGORY_LABELS[ev.category]}</span>
					<span class="chip">{REGION_LABELS[ev.region]}</span>
				</p>
			</header>

			{#if ev.image}
				<figure>
					<img
						src={ev.image.src}
						width={ev.image.width}
						height={ev.image.height}
						alt=""
						loading="lazy"
					/>
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

			<footer>
				<h3>出典・引用元</h3>
				<ul>
					{#each ev.sources as s (s.url)}
						<li><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label} ↗</a></li>
					{/each}
				</ul>
				<!-- 個別ページはcsr=falseの純静的HTML。__data.jsonを配信しないためフルリロードで遷移する -->
				<p class="permalink">
					<a href="/e/{ev.id}" data-sveltekit-reload>このできごとの個別ページ</a>
				</p>
			</footer>

			<button type="button" class="close" onclick={requestClose} aria-label="閉じる">
				×
			</button>
		</article>
	{/if}
</dialog>

<style>
	dialog {
		width: min(92vw, 600px);
		max-height: 86dvh;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--bg-elevated);
		color: var(--ink);
		box-shadow: 0 8px 40px rgb(0 0 0 / 0.25);
	}
	dialog::backdrop {
		background: rgb(20 16 10 / 0.55);
		backdrop-filter: blur(2px);
	}

	/* 開閉アニメーション（transform/opacityのみ・compositor合成） */
	dialog[open] {
		animation: dialog-in 0.26s cubic-bezier(0.22, 1.1, 0.36, 1);
	}
	dialog[open]::backdrop {
		animation: backdrop-in 0.22s ease-out;
	}
	dialog.closing {
		animation: dialog-out 0.17s ease-in forwards;
	}
	dialog.closing::backdrop {
		animation: backdrop-out 0.17s ease-in forwards;
	}
	@keyframes dialog-in {
		from {
			opacity: 0;
			transform: translateY(14px) scale(0.965);
		}
	}
	@keyframes dialog-out {
		to {
			opacity: 0;
			transform: translateY(8px) scale(0.975);
		}
	}
	@keyframes backdrop-in {
		from {
			opacity: 0;
		}
	}
	@keyframes backdrop-out {
		to {
			opacity: 0;
		}
	}

	/* 中身のステージング（開いた瞬間に上から順に立ち上がる） */
	article > :global(*) {
		animation: content-rise 0.34s cubic-bezier(0.22, 1, 0.36, 1) backwards;
	}
	article > :global(*:nth-child(2)) {
		animation-delay: 0.05s;
	}
	article > :global(*:nth-child(3)) {
		animation-delay: 0.09s;
	}
	article > :global(*:nth-child(4)) {
		animation-delay: 0.13s;
	}
	article > :global(*:nth-child(5)) {
		animation-delay: 0.17s;
	}
	@keyframes content-rise {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
	}

	article {
		position: relative;
		padding: 26px 28px 22px;
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
		align-items: baseline;
		gap: 10px;
		font-size: 0.85rem;
		color: var(--ink-muted);
		font-variant-numeric: tabular-nums;
	}
	.wareki {
		font-size: 0.75rem;
	}

	h2 {
		margin: 0 0 10px;
		font-family: var(--font-serif);
		font-size: 1.25rem;
		line-height: 1.5;
	}

	.chips {
		margin: 0 0 14px;
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
		margin: 0 0 14px;
	}
	img {
		display: block;
		width: 100%;
		height: auto;
		max-height: 320px;
		object-fit: contain;
		border-radius: 8px;
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
		padding: 10px 0 18px;
		color: var(--cat-color);
	}

	.summary {
		margin: 0 0 18px;
		line-height: 1.9;
		font-size: 0.95rem;
	}

	footer h3 {
		margin: 0 0 6px;
		font-size: 0.75rem;
		color: var(--ink-muted);
		font-weight: 600;
	}
	footer ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	footer a {
		font-size: 0.85rem;
	}
	.permalink {
		margin: 10px 0 0;
		font-size: 0.75rem;
	}
	.permalink a {
		color: var(--ink-muted);
		font-size: 0.75rem;
	}

	.close {
		position: absolute;
		top: 10px;
		right: 12px;
		width: 34px;
		height: 34px;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--ink-muted);
		font-size: 1.3rem;
		line-height: 1;
		cursor: pointer;
	}
	.close:hover {
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}
</style>
