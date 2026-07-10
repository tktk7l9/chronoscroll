<script lang="ts">
	import type { NewsEvent } from '../types.ts';
	import { CATEGORY_LABELS } from '../types.ts';
	import ArtIcon from './ArtIcon.svelte';

	let {
		ev,
		top,
		side,
		single,
		height,
		highlighted = false,
		onselect,
	}: {
		ev: NewsEvent;
		top: number;
		side: 'left' | 'right';
		single: boolean;
		height: number;
		highlighted?: boolean;
		onselect: (ev: NewsEvent) => void;
	} = $props();

	const dateLabel = $derived.by(() => {
		const [y, m, d] = ev.date.split('-');
		if (ev.precision === 'year') return `${y}年`;
		if (ev.precision === 'month') return `${y}.${m}`;
		return `${y}.${m}.${d}`;
	});
</script>

<article
	class="card {side}"
	class:single
	class:big={!!ev.svg}
	class:highlighted
	data-cat={ev.category}
	data-id={ev.id}
	style:top="{top}px"
	style:height="{height}px"
>
	<button type="button" class="hit" onclick={() => onselect(ev)}>
		{#if ev.svg}
			<span class="art"><ArtIcon id={ev.svg} size={64} /></span>
		{/if}
		<span class="body">
			<span class="meta">
				<time datetime={ev.date}>{dateLabel}</time>
				<span class="cat">{CATEGORY_LABELS[ev.category]}</span>
			</span>
			<span class="title">{ev.title}</span>
		</span>
	</button>
</article>

<style>
	.card {
		position: absolute;
		width: min(38vw, 360px);
		--cat-color: var(--cat-society);
	}
	.card[data-cat='politics'] { --cat-color: var(--cat-politics); }
	.card[data-cat='economy'] { --cat-color: var(--cat-economy); }
	.card[data-cat='culture'] { --cat-color: var(--cat-culture); }
	.card[data-cat='science'] { --cat-color: var(--cat-science); }
	.card[data-cat='sports'] { --cat-color: var(--cat-sports); }
	.card[data-cat='disaster'] { --cat-color: var(--cat-disaster); }
	.card[data-cat='war'] { --cat-color: var(--cat-war); }

	.card.right { left: calc(50% + 36px); }
	.card.left { right: calc(50% + 36px); }
	.card.single { left: 52px; right: auto; width: min(calc(100vw - 72px), 420px); }

	.hit {
		display: flex;
		align-items: stretch;
		gap: 12px;
		width: 100%;
		height: 100%;
		padding: 10px 14px;
		text-align: left;
		background: var(--bg-elevated);
		color: inherit;
		border: 1px solid var(--line);
		border-left: 3px solid var(--cat-color);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		cursor: pointer;
		transition: transform 0.15s ease, box-shadow 0.15s ease;
		overflow: hidden;
	}
	.hit:hover {
		transform: translateY(-1px);
		box-shadow: 0 2px 4px rgb(31 28 23 / 0.1), 0 8px 24px rgb(31 28 23 / 0.1);
	}

	.card.highlighted .hit {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
		animation: pulse 1.2s ease-out 2;
	}
	@keyframes pulse {
		0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 55%, transparent); }
		100% { box-shadow: 0 0 0 14px transparent; }
	}

	.art {
		flex: none;
		align-self: center;
		color: var(--cat-color);
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}

	.meta {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: 0.75rem;
		color: var(--ink-muted);
	}
	.meta time {
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.03em;
	}
	.cat { color: var(--cat-color); font-weight: 600; }

	.title {
		font-size: 0.9rem;
		line-height: 1.45;
		font-weight: 600;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.card.big .title {
		font-size: 1rem;
		-webkit-line-clamp: 4;
		line-clamp: 4;
	}

	@media (prefers-reduced-motion: reduce) {
		.hit { transition: none; }
		.card.highlighted .hit { animation: none; }
	}
</style>
