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
		/** 可視範囲（新しい側） */
		fromDay: number;
		/** 可視範囲（古い側） */
		toDay: number;
		minDay: number;
		maxDay: number;
		onjump: (day: number) => void;
	} = $props();

	let rail = $state<HTMLElement>();
	let dragging = $state(false);

	const span = $derived(Math.max(1, maxDay - minDay));

	/** day → レール内の割合位置（0=上端=最新） */
	function pos(day: number): number {
		return Math.min(1, Math.max(0, (maxDay - day) / span));
	}

	// 十年ごとの密度セグメント（単一色相・濃淡のsequential表現）
	const segments = $derived.by(() => {
		const max = Math.max(...meta.decades.map((d) => d.count));
		return meta.decades.map((d) => {
			const startYear = Number(d.key.slice(0, 4));
			const from = Math.max(minDay, dayOf(`${startYear}-01-01`));
			const to = Math.min(maxDay, dayOf(`${startYear + 9}-12-31`));
			return {
				key: d.key,
				top: pos(to) * 100,
				height: (pos(from) - pos(to)) * 100,
				intensity: 0.14 + 0.66 * (d.count / max),
				label: `${startYear}年代 ${d.count}件`,
			};
		});
	});

	const viewTop = $derived(pos(Math.min(fromDay, maxDay)) * 100);
	const viewHeight = $derived(
		Math.max(0.8, (pos(Math.max(toDay, minDay)) - pos(Math.min(fromDay, maxDay))) * 100),
	);

	// 50年ごとの目盛りラベル
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
