<script lang="ts">
	import type { IndexMeta } from '../types.ts';
	import { dayOf, isoOf } from '../timescale.ts';

	let {
		meta,
		fromDay,
		toDay,
		minDay,
		maxDay,
		onjump,
	}: {
		meta: IndexMeta;
		/** Visible range (newer side) */
		fromDay: number;
		/** Visible range (older side) */
		toDay: number;
		minDay: number;
		maxDay: number;
		onjump: (day: number) => void;
	} = $props();

	let rail = $state<HTMLElement>();
	let dragging = $state(false);

	const span = $derived(Math.max(1, maxDay - minDay));

	/** day → fractional position in the rail (0 = top = newest) */
	function pos(day: number): number {
		return Math.min(1, Math.max(0, (maxDay - day) / span));
	}

	// Per-chunk density segments (single hue, sequential light-to-dark encoding).
	// 5-year chunks are compared by density normalized by their period
	const segments = $derived.by(() => {
		const density = (c: (typeof meta.chunks)[number]) => c.count / (c.toYear - c.fromYear + 1);
		const max = Math.max(...meta.chunks.map(density));
		return meta.chunks.map((c) => {
			const from = Math.max(minDay, dayOf(`${c.fromYear}-01-01`));
			const to = Math.min(maxDay, dayOf(`${c.toYear}-12-31`));
			return {
				key: c.key,
				top: pos(to) * 100,
				height: (pos(from) - pos(to)) * 100,
				intensity: 0.14 + 0.66 * (density(c) / max),
				label: `${c.fromYear}-${c.toYear} ${c.count}件`,
			};
		});
	});

	const viewTop = $derived(pos(Math.min(fromDay, maxDay)) * 100);
	const viewHeight = $derived(
		Math.max(0.8, (pos(Math.max(toDay, minDay)) - pos(Math.min(fromDay, maxDay))) * 100),
	);

	// Tick labels every 50 years
	const labels = $derived.by(() => {
		const out: { year: number; top: number }[] = [];
		const minYear = Number(isoOf(minDay).slice(0, 4));
		const maxYear = Number(isoOf(maxDay).slice(0, 4));
		for (let y = Math.ceil(minYear / 50) * 50; y <= maxYear; y += 50) {
			out.push({ year: y, top: pos(dayOf(`${y}-01-01`)) * 100 });
		}
		return out;
	});

	function dayAtPointer(e: PointerEvent): number {
		if (!rail) return maxDay;
		const rect = rail.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
		return maxDay - ratio * span;
	}

	function onPointerDown(e: PointerEvent): void {
		dragging = true;
		rail?.setPointerCapture(e.pointerId);
		onjump(dayAtPointer(e));
	}
	function onPointerMove(e: PointerEvent): void {
		if (dragging) onjump(dayAtPointer(e));
	}
	function onPointerUp(): void {
		dragging = false;
	}
</script>

<div class="minimap" aria-hidden="true">
	<div
		class="rail"
		role="presentation"
		bind:this={rail}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
	>
		{#each segments as s (s.key)}
			<div
				class="seg"
				style:top="{s.top}%"
				style:height="{s.height}%"
				style:opacity={s.intensity}
				title={s.label}
			></div>
		{/each}
		<div class="view" style:top="{viewTop}%" style:height="{viewHeight}%"></div>
	</div>
	<div class="labels">
		{#each labels as l (l.year)}
			<span class="ylabel" style:top="{l.top}%">{l.year}</span>
		{/each}
	</div>
</div>

<style>
	.minimap {
		position: fixed;
		top: 50%;
		right: 14px;
		transform: translateY(-50%);
		height: min(56vh, 460px);
		display: flex;
		gap: 5px;
		z-index: 5;
	}

	.rail {
		position: relative;
		width: 14px;
		border-radius: 7px;
		background: color-mix(in srgb, var(--ink) 5%, transparent);
		border: 1px solid var(--line);
		cursor: pointer;
		touch-action: none;
		overflow: hidden;
	}

	.seg {
		position: absolute;
		left: 0;
		right: 0;
		background: var(--accent);
		pointer-events: none;
	}

	.view {
		position: absolute;
		left: -1px;
		right: -1px;
		border: 2px solid var(--ink);
		border-radius: 4px;
		background: color-mix(in srgb, var(--bg-elevated) 25%, transparent);
		pointer-events: none;
		box-sizing: border-box;
	}

	.labels {
		position: relative;
		width: 30px;
		pointer-events: none;
	}
	.ylabel {
		position: absolute;
		transform: translateY(-50%);
		font-size: 0.6rem;
		color: var(--ink-muted);
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 759px) {
		.minimap {
			display: none;
		}
	}
</style>
