<script lang="ts">
	import { ZOOM_STOPS, tToZoom, zoomLevelLabel, zoomToT } from '../lod.ts';
	import { MAX_PX_PER_DAY, MIN_PX_PER_DAY } from '../timescale.ts';

	let {
		pxPerDay,
		onzoomto,
	}: {
		pxPerDay: number;
		onzoomto: (pxPerDay: number) => void;
	} = $props();

	const t = $derived(zoomToT(pxPerDay));
	const level = $derived(zoomLevelLabel(pxPerDay));
	const atMax = $derived(pxPerDay >= MAX_PX_PER_DAY * 0.999);
	const atMin = $derived(pxPerDay <= MIN_PX_PER_DAY * 1.001);

	let track = $state<HTMLElement>();
	let dragging = $state(false);

	function zoomAtPointer(e: PointerEvent): void {
		if (!track) return;
		const rect = track.getBoundingClientRect();
		const ratio = 1 - Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
		onzoomto(tToZoom(ratio));
	}
	function onPointerDown(e: PointerEvent): void {
		dragging = true;
		track?.setPointerCapture(e.pointerId);
		zoomAtPointer(e);
	}
	function onPointerMove(e: PointerEvent): void {
		if (dragging) zoomAtPointer(e);
	}
	function onPointerUp(): void {
		dragging = false;
	}
	function onKeyDown(e: KeyboardEvent): void {
		if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
			e.preventDefault();
			onzoomto(pxPerDay * 1.5);
		} else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
			e.preventDefault();
			onzoomto(pxPerDay / 1.5);
		}
	}
</script>

<div class="zoomctl" role="group" aria-label="ズーム操作">
	<button
		type="button"
		class="zbtn"
		onclick={() => onzoomto(pxPerDay * 2)}
		disabled={atMax}
		aria-label="ズームイン"
	>
		＋
	</button>

	<div class="slider">
		<div class="labels" aria-hidden="true">
			{#each ZOOM_STOPS as s (s.label)}
				<button
					type="button"
					class="stop"
					class:active={level === s.label}
					style:bottom="calc({zoomToT(s.pxPerDay) * 100}% - 0.55em)"
					onclick={() => onzoomto(s.pxPerDay)}
					tabindex="-1"
				>
					{s.label}
				</button>
			{/each}
		</div>
		<div
			class="track"
			bind:this={track}
			role="slider"
			tabindex="0"
			aria-label="ズームレベル（現在: {level}）"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={Math.round(t * 100)}
			aria-valuetext={level}
			aria-orientation="vertical"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			onkeydown={onKeyDown}
		>
			<div class="fill" style:height="{t * 100}%"></div>
			{#each ZOOM_STOPS as s (s.label)}
				<span class="notch" style:bottom="{zoomToT(s.pxPerDay) * 100}%"></span>
			{/each}
			<div class="thumb" style:bottom="{t * 100}%"></div>
		</div>
	</div>

	<button
		type="button"
		class="zbtn"
		onclick={() => onzoomto(pxPerDay / 2)}
		disabled={atMin}
		aria-label="ズームアウト"
	>
		−
	</button>
</div>

<style>
	.zoomctl {
		position: fixed;
		right: 16px;
		bottom: 20px;
		z-index: 5;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 8px;
		padding: 10px;
		background: color-mix(in srgb, var(--bg-elevated) 92%, transparent);
		backdrop-filter: blur(6px);
		border: 1px solid var(--line);
		border-radius: 12px;
		box-shadow: var(--shadow);
	}

	.zbtn {
		width: 38px;
		height: 34px;
		border: 1px solid var(--line);
		border-radius: 9px;
		background: var(--bg-elevated);
		color: var(--ink);
		font-size: 1.05rem;
		cursor: pointer;
	}
	.zbtn:hover:not(:disabled) {
		border-color: var(--line-strong);
	}
	.zbtn:disabled {
		opacity: 0.32;
		cursor: default;
	}

	.slider {
		display: flex;
		align-items: stretch;
		gap: 7px;
		height: 150px;
		margin: 2px 5px 2px 0;
	}

	.labels {
		position: relative;
		width: 2.6em;
	}
	.stop {
		position: absolute;
		right: 0;
		padding: 1px 3px;
		border: none;
		background: none;
		font-family: inherit;
		font-size: 0.62rem;
		line-height: 1.1;
		color: var(--ink-muted);
		cursor: pointer;
		white-space: nowrap;
	}
	.stop:hover {
		color: var(--accent);
	}
	.stop.active {
		color: var(--accent);
		font-weight: 700;
	}

	.track {
		position: relative;
		width: 12px;
		border-radius: 6px;
		background: color-mix(in srgb, var(--ink) 8%, transparent);
		border: 1px solid var(--line);
		cursor: pointer;
		touch-action: none;
	}
	.fill {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		border-radius: 6px;
		background: color-mix(in srgb, var(--accent) 30%, transparent);
		pointer-events: none;
	}
	.notch {
		position: absolute;
		left: 2px;
		right: 2px;
		height: 1.5px;
		transform: translateY(50%);
		background: var(--line-strong);
		opacity: 0.6;
		pointer-events: none;
	}
	.thumb {
		position: absolute;
		left: 50%;
		transform: translate(-50%, 50%);
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--bg-elevated);
		border: 2.5px solid var(--accent);
		box-shadow: var(--shadow);
		pointer-events: none;
	}

	@media (max-width: 759px) {
		.slider {
			height: 116px;
		}
		.zoomctl {
			padding: 8px;
		}
	}
</style>
