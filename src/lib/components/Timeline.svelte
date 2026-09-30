<script lang="ts">
	import { tick } from 'svelte';
	import { eventsPerDayInRange } from '../chunks.ts';
	import type { FilterState } from '../filters.ts';
	import { isFiltering, matchesFilter } from '../filters.ts';
	import { importanceThreshold, needsChunkData, tickStepYears } from '../lod.ts';
	import { layoutCards } from '../layout.ts';
	import {
		clampPxPerDay,
		dayOf,
		dayToY,
		isoOf,
		totalHeight,
		visibleDayRange,
		yToDay,
		zoomAt,
		type TimeScale,
	} from '../timescale.ts';
	import type { NewsEvent } from '../types.ts';
	import { capDensity, queryVisible } from '../viewport.ts';
	import { formatWareki } from '../wareki.ts';
	import { takeCtrlWheel, takePinchMove } from '../zoom-gestures.ts';
	import type { TimelineData } from '../state/data.svelte.ts';
	import EventCard from './EventCard.svelte';
	import Minimap from './Minimap.svelte';
	import ZoomControls from './ZoomControls.svelte';

	const CARD_H_NORMAL = 112;
	const CARD_H_BIG = 158;
	const PAD_TOP = 150;
	const PAD_BOTTOM = 240;

	let {
		data,
		filter,
		initialCenter = null,
		initialPxPerDay = null,
		highlightId = null,
		locked = false,
		onselect,
		onviewchange,
	}: {
		data: TimelineData;
		filter: FilterState;
		initialCenter?: string | null;
		initialPxPerDay?: number | null;
		highlightId?: string | null;
		/** The detail modal is open. Timeline zoom is not applied, but the browser's page zoom is still blocked */
		locked?: boolean;
		onselect: (ev: NewsEvent) => void;
		onviewchange?: (centerIso: string, pxPerDay: number) => void;
	} = $props();

	let scrollY = $state(0);
	let vh = $state(0);
	let vw = $state(0);
	let pxPerDay = $state(0.08);
	let ready = $state(false);

	const minDay = $derived(data.meta ? dayOf(data.meta.minDate) : dayOf('1868-01-01'));
	const maxDay = $derived(data.meta ? dayOf(data.meta.maxDate) : dayOf('2026-01-01'));
	const scale: TimeScale = $derived({
		minDay,
		maxDay,
		pxPerDay,
		padTop: PAD_TOP,
		padBottom: PAD_BOTTOM,
	});
	const height = $derived(totalHeight(scale));
	const columns = $derived(vw >= 760 ? 2 : (1 as 1 | 2));
	const range = $derived(visibleDayRange(scale, scrollY, vh));
	const bufferDays = $derived(vh / pxPerDay);
	// Filtering lowers the density, so correct the LOD threshold by the filter pass rate
	const filterSelectivity = $derived.by(() => {
		if (!isFiltering(filter)) return 1;
		const pts = data.points;
		if (pts.length === 0) return 1;
		let n = 0;
		for (const p of pts) if (matchesFilter(p.ev, filter)) n++;
		return Math.max(0.005, n / pts.length);
	});
	// LOD density uses the actual density of "the era in view". The all-time average (0.375 events/day)
	// would be off by 12x, since the actual density per decade ranges from 0.14 to 1.67, making the Meiji era sparse and the 2000s onward
	// overcrowded (capDensity discarding 70%+ of the events that passed the threshold)
	const localEventsPerDay = $derived(
		data.meta
			? eventsPerDayInRange(data.meta.chunks, range.fromDay + bufferDays, range.toDay - bufferDays)
			: data.eventsPerDay,
	);
	const adjustedEventsPerDay = $derived(localEventsPerDay * filterSelectivity);
	// Do not apply LOD while filtering by a collection. Collection events are given low importance
	// so they do not pollute the main timeline, so density correction alone would let the threshold hide every one of them.
	// The count is limited to one collection (a few dozen events), so thinning by capDensity alone is enough
	const threshold = $derived(
		filter.collectionIds !== null ? 0 : importanceThreshold(pxPerDay, adjustedEventsPerDay),
	);
	// From overview to decade zoom, the threshold is above the overview.json threshold, so loading chunks adds nothing.
	// Stop fetching chunks until they are actually needed to avoid wasting bandwidth at startup
	const chunksNeeded = $derived(needsChunkData(pxPerDay, adjustedEventsPerDay));
	const visible = $derived(
		ready
			? queryVisible(
					data.points,
					range.fromDay + bufferDays,
					range.toDay - bufferDays,
					threshold,
					filter,
					highlightId ?? undefined,
				)
			: [],
	);
	// In dense stretches, thin further by pixel density so cards are not pushed away
	const capped = $derived(
		capDensity(visible, pxPerDay, CARD_H_NORMAL * 0.95, columns, highlightId ?? undefined),
	);
	const placed = $derived.by(() => {
		const items = capped.map((p) => ({
			id: p.ev.id,
			y: dayToY(scale, p.day),
			height: p.ev.svg ? CARD_H_BIG : CARD_H_NORMAL,
		}));
		return layoutCards(items, columns).map((c, i) => ({ ...c, ev: capped[i].ev }));
	});

	function clampDay(day: number): number {
		return Math.min(maxDay, Math.max(minDay, day));
	}

	const ticks = $derived.by(() => {
		if (!ready) return [];
		const step = tickStepYears(pxPerDay);
		const newest = Number(isoOf(clampDay(range.fromDay + bufferDays)).slice(0, 4));
		const oldest = Number(isoOf(clampDay(range.toDay - bufferDays)).slice(0, 4));
		const out: { year: number; y: number; wareki: string | null }[] = [];
		for (let y = Math.ceil(oldest / step) * step; y <= newest; y += step) {
			out.push({
				year: y,
				y: dayToY(scale, dayOf(`${y}-01-01`)),
				wareki: formatWareki(`${y}-01-01`),
			});
		}
		return out;
	});

	const centerLabel = $derived.by(() => {
		const iso = isoOf(Math.round(clampDay(yToDay(scale, scrollY + vh / 2))));
		return { year: iso.slice(0, 4), wareki: formatWareki(iso) };
	});

	// Initialization: apply the initial zoom and position once the metadata arrives
	$effect(() => {
		if (ready || !data.meta || vh === 0) return;
		pxPerDay = clampPxPerDay(initialPxPerDay ?? (vh * 6) / Math.max(1, maxDay - minDay));
		ready = true;
		if (initialCenter !== null) {
			const day = dayOf(initialCenter);
			requestAnimationFrame(() => {
				window.scrollTo({ top: dayToY(scale, day) - vh / 2 });
			});
		}
	});

	// Lazy-load chunks for the visible range.
	// The initial view can be drawn from overview alone, so delay slightly to avoid competing with LCP for bandwidth
	let chunkLoadingEnabled = $state(false);
	$effect(() => {
		if (!ready) return;
		const t = setTimeout(() => (chunkLoadingEnabled = true), 900);
		return () => clearTimeout(t);
	});
	// While filtering by a collection, the detail JSON already contains every included event, so loading chunks
	// adds nothing to the display (it is filtered out). That would be up to several MB of wasted fetches, so stop it
	$effect(() => {
		if (ready && chunkLoadingEnabled && chunksNeeded && filter.collectionIds === null) {
			data.ensureRange(range.fromDay + bufferDays, range.toDay - bufferDays);
		}
	});

	// Notify the parent of view changes (debounced)
	$effect(() => {
		if (!ready) return;
		const center = isoOf(Math.round(clampDay(yToDay(scale, scrollY + vh / 2))));
		const z = pxPerDay;
		const t = setTimeout(() => onviewchange?.(center, z), 400);
		return () => clearTimeout(t);
	});

	// scrollTo only after the height from the zoom is in the DOM (calling it earlier clamps to the document height)
	async function applyZoom(newPx: number, anchorViewportY: number): Promise<void> {
		const r = zoomAt(scale, window.scrollY, anchorViewportY, newPx);
		pxPerDay = r.scale.pxPerDay;
		await tick();
		window.scrollTo({ top: r.scrollTop });
	}

	/** From the ± buttons etc.: zoom by a factor around the center of the viewport */
	export function zoomStep(factor: number): void {
		void applyZoom(pxPerDay * factor, vh / 2);
	}

	/** Jump from search. Zoom in to at least the "year" level so the context is visible, then move */
	export async function jumpTo(dateIso: string, minPx = 8): Promise<void> {
		if (pxPerDay < minPx) pxPerDay = clampPxPerDay(minPx);
		await tick();
		const day = clampDay(dayOf(dateIso));
		window.scrollTo({ top: dayToY(scale, day) - vh / 2, behavior: 'instant' });
	}

	/** Jump from the minimap (keeps the zoom) */
	function jumpToDay(day: number): void {
		window.scrollTo({ top: dayToY(scale, clampDay(day)) - vh / 2, behavior: 'instant' });
	}

	export function currentPxPerDay(): number {
		return pxPerDay;
	}

	// ctrl/⌘ + wheel zooms (registered manually because passive:false is required)
	$effect(() => {
		const isLocked = locked;
		const onWheel = (e: WheelEvent) => {
			if (!takeCtrlWheel(e, isLocked)) return;
			applyZoom(pxPerDay * Math.exp(-e.deltaY * 0.0022), e.clientY);
		};
		window.addEventListener('wheel', onWheel, { passive: false });
		return () => window.removeEventListener('wheel', onWheel);
	});

	// Pinch zoom
	let pinch: { dist: number; midY: number } | null = null;
	function measure(e: TouchEvent): { dist: number; midY: number } {
		const [a, b] = [e.touches[0], e.touches[1]];
		return {
			dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
			midY: (a.clientY + b.clientY) / 2,
		};
	}
	$effect(() => {
		const isLocked = locked;
		const start = (e: TouchEvent) => {
			if (e.touches.length === 2 && !isLocked) pinch = measure(e);
		};
		const move = (e: TouchEvent) => {
			if (!takePinchMove(e.touches.length, isLocked, pinch !== null, () => e.preventDefault())) {
				return;
			}
			const prev = pinch;
			if (!prev) return;
			const m = measure(e);
			pinch = m;
			void applyZoom(pxPerDay * (m.dist / prev.dist), m.midY).then(() => {
				window.scrollBy(0, prev.midY - m.midY);
			});
		};
		const end = () => {
			pinch = null;
		};
		window.addEventListener('touchstart', start, { passive: true });
		window.addEventListener('touchmove', move, { passive: false });
		window.addEventListener('touchend', end, { passive: true });
		window.addEventListener('touchcancel', end, { passive: true });
		return () => {
			window.removeEventListener('touchstart', start);
			window.removeEventListener('touchmove', move);
			window.removeEventListener('touchend', end);
			window.removeEventListener('touchcancel', end);
		};
	});

	function onDblClick(e: MouseEvent): void {
		applyZoom(pxPerDay * 2.2, e.clientY);
	}

	// Era jump (era-chip tap; the way to move around on mobile, which has no minimap)
	let jumpOpen = $state(false);
	const jumpDecades = $derived.by(() => {
		const out: number[] = [];
		const first = Math.floor(Number(isoOf(maxDay).slice(0, 4)) / 10) * 10;
		const last = Math.floor(Number(isoOf(minDay).slice(0, 4)) / 10) * 10;
		for (let d = first; d >= last; d -= 10) out.push(d);
		return out;
	});
	function jumpToDecade(decade: number | null): void {
		jumpOpen = false;
		// The panel unmounts with the focused button in it, so put focus back on the chip (SHIG 60)
		eraChip?.focus({ preventScroll: true });
		if (decade === null) {
			window.scrollTo({ top: 0 });
			return;
		}
		jumpToDay(dayOf(`${Math.min(decade + 5, Number(isoOf(maxDay).slice(0, 4)))}-01-01`));
	}
	let eraChip = $state<HTMLButtonElement>();
	// Close on click outside the panel. Escape also closes and returns focus to the button (SHIG 60)
	$effect(() => {
		if (!jumpOpen) return;
		const close = (e: PointerEvent) => {
			if (!(e.target as HTMLElement).closest('.era-nav')) jumpOpen = false;
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			jumpOpen = false;
			// Only pull focus back when the key came from the panel (or nowhere). Escape in
			// another widget, e.g. the search box, must not move focus into the timeline.
			// Check the event target: the search box blurs itself before this runs.
			const from = e.target as HTMLElement | null;
			if (from && from !== document.body && !from.closest?.('.era-nav')) return;
			e.preventDefault();
			eraChip?.focus();
		};
		window.addEventListener('pointerdown', close);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('pointerdown', close);
			window.removeEventListener('keydown', onKey);
		};
	});

	// Keyboard: ↑↓ = previous/next event / + and - = zoom
	function focusCard(id: string): void {
		const el = document.querySelector<HTMLButtonElement>(`.card[data-id="${id}"] .hit`);
		el?.focus({ preventScroll: true });
	}

	$effect(() => {
		const isLocked = locked;
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
			if (isLocked) return;
			if (e.key === '+' || e.key === '=') {
				e.preventDefault();
				zoomStep(2);
				return;
			}
			if (e.key === '-') {
				e.preventDefault();
				zoomStep(0.5);
				return;
			}
			if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
			const center = window.scrollY + vh / 2;
			const sorted = [...placed].sort((a, b) => a.dotY - b.dotY);
			const next =
				e.key === 'ArrowDown'
					? sorted.find((c) => c.dotY > center + 6)
					: [...sorted].reverse().find((c) => c.dotY < center - 6);
			if (!next) return;
			e.preventDefault();
			window.scrollTo({ top: next.dotY - vh / 2 });
			requestAnimationFrame(() => focusCard(next.id));
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<svelte:window bind:scrollY bind:innerHeight={vh} bind:innerWidth={vw} />

<!-- Navigation widgets come before the cards in DOM order so a keyboard user reaches
     zoom and era jump without tabbing through every visible card. They are position:fixed,
     so the visual layout is unchanged (SHIG 59) -->
{#if ready && data.meta}
	<Minimap
		meta={data.meta}
		fromDay={range.fromDay}
		toDay={range.toDay}
		{minDay}
		{maxDay}
		onjump={jumpToDay}
	/>
{/if}

{#if ready}
	<ZoomControls {pxPerDay} onzoomto={(px) => void applyZoom(px, vh / 2)} />
{/if}

{#if ready}
	<div class="era-nav">
		<button
			bind:this={eraChip}
			type="button"
			class="era-chip"
			aria-expanded={jumpOpen}
			aria-label="年代へジャンプ（現在 {centerLabel.year}年）"
			onclick={() => (jumpOpen = !jumpOpen)}
		>
			<span class="era-year">{centerLabel.year}</span>
			{#if centerLabel.wareki}<span class="era-wareki">{centerLabel.wareki}</span>{/if}
			<span class="era-caret" aria-hidden="true">▾</span>
		</button>
		{#if jumpOpen}
			<div class="jump-panel" role="group" aria-label="年代を選択">
				<button type="button" class="jump-latest" onclick={() => jumpToDecade(null)}>
					最新へ
				</button>
				<div class="jump-grid">
					{#each jumpDecades as d (d)}
						<button type="button" onclick={() => jumpToDecade(d)}>
							{d}<span class="jump-s">s</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}

<!-- style:height is not added during SSR (inline style attributes violate the strict CSP).
     Before ready, a CSS min-height placeholder keeps the footer off screen to prevent CLS -->
<div
	class="timeline"
	class:single={columns === 1}
	class:is-ready={ready}
	style:height={ready ? `${height}px` : undefined}
	ondblclick={onDblClick}
	role="presentation"
>
	<div class="spine" aria-hidden="true"></div>

	{#each ticks as t (t.year)}
		<div class="tick" style:top="{t.y}px" aria-hidden="true">
			<span class="tick-label">
				<span class="tick-year">{t.year}</span>
				{#if t.wareki}<span class="tick-wareki">{t.wareki}</span>{/if}
			</span>
		</div>
	{/each}

	{#each placed as item (item.id)}
		<div class="dot" style:top="{item.dotY}px" data-cat={item.ev.category} aria-hidden="true"></div>
		<div class="connector {item.side}" style:top="{item.dotY}px" aria-hidden="true"></div>
		<EventCard
			ev={item.ev}
			top={item.top}
			side={item.side}
			single={columns === 1}
			height={item.ev.svg ? CARD_H_BIG : CARD_H_NORMAL}
			highlighted={highlightId === item.ev.id}
			{onselect}
		/>
	{/each}
</div>

<style>
	.timeline {
		position: relative;
		overflow: clip;
	}
	.timeline:not(.is-ready) {
		/* Approximation of the initial zoom (whole period ≈ 6 screens). The difference from the real size after ready happens outside the viewport, so it does not affect CLS */
		min-height: 600vh;
	}

	.spine {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 2px;
		transform: translateX(-50%);
		background: linear-gradient(to bottom, transparent, var(--line-strong) 60px);
	}
	.single .spine { left: 26px; }

	.tick {
		position: absolute;
		left: 0;
		right: 0;
		border-top: 1px dashed var(--line);
	}
	.tick-label {
		position: absolute;
		top: 0;
		left: 12px;
		transform: translateY(-50%);
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
		padding: 2px 10px;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 999px;
	}
	.tick-year {
		font-family: var(--font-serif);
		font-size: 0.95rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.tick-wareki {
		font-size: 0.7rem;
		color: var(--ink-muted);
	}
	.single .tick-label { left: 46px; }

	.dot {
		position: absolute;
		left: 50%;
		width: 11px;
		height: 11px;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		background: var(--cat-color, var(--spine));
		border: 2px solid var(--bg);
		box-shadow: 0 0 0 1px var(--line-strong);
		z-index: 1;
		animation: dot-in 0.22s cubic-bezier(0.34, 1.4, 0.64, 1) backwards;
	}
	@keyframes dot-in {
		from {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.4);
		}
	}
	.dot[data-cat='politics'] { --cat-color: var(--cat-politics); }
	.dot[data-cat='economy'] { --cat-color: var(--cat-economy); }
	.dot[data-cat='culture'] { --cat-color: var(--cat-culture); }
	.dot[data-cat='science'] { --cat-color: var(--cat-science); }
	.dot[data-cat='sports'] { --cat-color: var(--cat-sports); }
	.dot[data-cat='disaster'] { --cat-color: var(--cat-disaster); }
	.dot[data-cat='war'] { --cat-color: var(--cat-war); }
	.dot[data-cat='society'] { --cat-color: var(--cat-society); }
	.single .dot { left: 26px; }

	.connector {
		position: absolute;
		height: 1.5px;
		width: 30px;
		background: var(--line-strong);
		transform: translateY(-50%);
		animation: connector-in 0.28s ease-out backwards;
	}
	@keyframes connector-in {
		from {
			opacity: 0;
		}
	}
	.connector.right { left: calc(50% + 5px); }
	.connector.left { right: calc(50% + 5px); }
	.single .connector.right,
	.single .connector.left {
		left: 31px;
		right: auto;
		width: 20px;
	}

	.era-nav {
		position: fixed;
		top: 112px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 6;
	}
	.era-chip {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 6px 18px;
		background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
		backdrop-filter: blur(6px);
		border: 1px solid var(--line);
		border-radius: 999px;
		box-shadow: var(--shadow);
		color: inherit;
		cursor: pointer;
		font-family: inherit;
	}
	.era-chip:hover {
		border-color: var(--line-strong);
	}
	.era-caret {
		font-size: 0.65rem;
		color: var(--ink-muted);
	}

	.jump-panel {
		position: absolute;
		top: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		width: 264px;
		padding: 10px;
		background: var(--bg-elevated);
		border: 1px solid var(--line);
		border-radius: 12px;
		box-shadow: var(--shadow);
		transform-origin: top center;
		animation: panel-pop 0.18s cubic-bezier(0.22, 1.2, 0.36, 1) backwards;
	}
	@keyframes panel-pop {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(-4px) scale(0.94);
		}
	}
	.jump-grid button,
	.jump-latest {
		transition: color 0.12s ease, border-color 0.12s ease, transform 0.08s ease;
	}
	.jump-grid button:active,
	.jump-latest:active {
		transform: scale(0.94);
	}
	.jump-latest {
		width: 100%;
		margin-bottom: 8px;
		padding: 7px 0;
		font-family: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		/* Same tint as the collection banner: the plain accent is 4.3:1 on it in light mode (WCAG 1.4.3) */
		color: color-mix(in srgb, var(--accent) 85%, var(--ink));
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
		border-radius: 8px;
		cursor: pointer;
	}
	.jump-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
	}
	.jump-grid button {
		padding: 7px 0;
		font-family: var(--font-serif);
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 8px;
		cursor: pointer;
	}
	.jump-grid button:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.jump-s {
		font-size: 0.65rem;
		color: var(--ink-muted);
	}
	.era-year {
		font-family: var(--font-serif);
		font-size: 1.3rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.era-wareki {
		font-size: 0.8rem;
		color: var(--ink-muted);
	}

	/* On mobile, move to the bottom left so it does not overlap cards (the bottom right has the zoom buttons) */
	@media (max-width: 759px) {
		.era-nav {
			top: auto;
			bottom: 20px;
			left: 14px;
			transform: none;
		}
		.era-chip {
			padding: 4px 14px;
		}
		.era-year {
			font-size: 1.05rem;
		}
		.jump-panel {
			top: auto;
			bottom: calc(100% + 8px);
			left: 0;
			transform: none;
			transform-origin: bottom left;
			animation-name: panel-pop-mobile;
		}
	}
	@keyframes panel-pop-mobile {
		from {
			opacity: 0;
			transform: translateY(4px) scale(0.94);
		}
	}
</style>
