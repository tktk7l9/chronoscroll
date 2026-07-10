<script lang="ts">
	import { tick } from 'svelte';
	import type { FilterState } from '../filters.ts';
	import { isFiltering, matchesFilter } from '../filters.ts';
	import { importanceThreshold, tickStepYears } from '../lod.ts';
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
	import type { TimelineData } from '../state/data.svelte.ts';
	import EventCard from './EventCard.svelte';
	import Minimap from './Minimap.svelte';

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
		onselect,
		onviewchange,
	}: {
		data: TimelineData;
		filter: FilterState;
		initialCenter?: string | null;
		initialPxPerDay?: number | null;
		highlightId?: string | null;
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
	// フィルタ適用中は密度が下がるため、フィルタ通過率でLOD閾値を補正する
	const filterSelectivity = $derived.by(() => {
		if (!isFiltering(filter)) return 1;
		const pts = data.points;
		if (pts.length === 0) return 1;
		let n = 0;
		for (const p of pts) if (matchesFilter(p.ev, filter)) n++;
		return Math.max(0.005, n / pts.length);
	});
	const threshold = $derived(
		importanceThreshold(pxPerDay, data.eventsPerDay * filterSelectivity),
	);
	const range = $derived(visibleDayRange(scale, scrollY, vh));
	const bufferDays = $derived(vh / pxPerDay);
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
	// 密集区間ではカードが押し流されないよう、ピクセル密度でさらに間引く
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

	// 初期化: メタ到着後に初期ズーム・初期位置を適用
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

	// 可視範囲のチャンク遅延ロード。
	// 初期表示は overview だけで描けるため、LCPと帯域を奪い合わないよう少し遅らせる
	let chunkLoadingEnabled = $state(false);
	$effect(() => {
		if (!ready) return;
		const t = setTimeout(() => (chunkLoadingEnabled = true), 900);
		return () => clearTimeout(t);
	});
	$effect(() => {
		if (ready && chunkLoadingEnabled) {
			data.ensureRange(range.fromDay + bufferDays, range.toDay - bufferDays);
		}
	});

	// ビュー変更を親へ通知（デバウンス）
	$effect(() => {
		if (!ready) return;
		const center = isoOf(Math.round(clampDay(yToDay(scale, scrollY + vh / 2))));
		const z = pxPerDay;
		const t = setTimeout(() => onviewchange?.(center, z), 400);
		return () => clearTimeout(t);
	});

	// ズーム反映後の高さがDOMに乗ってから scrollTo する（先に呼ぶと文書高さでクランプされる）
	async function applyZoom(newPx: number, anchorViewportY: number): Promise<void> {
		const r = zoomAt(scale, window.scrollY, anchorViewportY, newPx);
		pxPerDay = r.scale.pxPerDay;
		await tick();
		window.scrollTo({ top: r.scrollTop });
	}

	/** ±ボタン等から: ビューポート中央を基準に倍率ズーム */
	export function zoomStep(factor: number): void {
		void applyZoom(pxPerDay * factor, vh / 2);
	}

	/** 検索からのジャンプ。文脈が見えるよう「年」レベル以上にズームインしてから移動 */
	export async function jumpTo(dateIso: string, minPx = 8): Promise<void> {
		if (pxPerDay < minPx) pxPerDay = clampPxPerDay(minPx);
		await tick();
		const day = clampDay(dayOf(dateIso));
		window.scrollTo({ top: dayToY(scale, day) - vh / 2, behavior: 'instant' });
	}

	/** ミニマップからのジャンプ（ズーム維持） */
	function jumpToDay(day: number): void {
		window.scrollTo({ top: dayToY(scale, clampDay(day)) - vh / 2, behavior: 'instant' });
	}

	export function currentPxPerDay(): number {
		return pxPerDay;
	}

	// ctrl/⌘ + ホイールでズーム（passive:false が必要なので手動で登録）
	$effect(() => {
		const onWheel = (e: WheelEvent) => {
			if (!e.ctrlKey && !e.metaKey) return;
			e.preventDefault();
			applyZoom(pxPerDay * Math.exp(-e.deltaY * 0.0022), e.clientY);
		};
		window.addEventListener('wheel', onWheel, { passive: false });
		return () => window.removeEventListener('wheel', onWheel);
	});

	// ピンチズーム
	let pinch: { dist: number; midY: number } | null = null;
	function measure(e: TouchEvent): { dist: number; midY: number } {
		const [a, b] = [e.touches[0], e.touches[1]];
		return {
			dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
			midY: (a.clientY + b.clientY) / 2,
		};
	}
	$effect(() => {
		const start = (e: TouchEvent) => {
			if (e.touches.length === 2) pinch = measure(e);
		};
		const move = (e: TouchEvent) => {
			if (!pinch || e.touches.length !== 2) return;
			e.preventDefault();
			const m = measure(e);
			const prev = pinch;
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

	// キーボード操作: ↑↓=前後のイベントへ / +・-=ズーム
	function focusCard(id: string): void {
		const el = document.querySelector<HTMLButtonElement>(`.card[data-id="${id}"] .hit`);
		el?.focus({ preventScroll: true });
	}

	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
			if (document.querySelector('dialog[open]')) return;
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

<!-- style:height はSSRでは付与しない（インラインstyle属性が厳格CSPに違反するため） -->
<div
	class="timeline"
	class:single={columns === 1}
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
	<div class="era-chip" aria-hidden="true">
		<span class="era-year">{centerLabel.year}</span>
		{#if centerLabel.wareki}<span class="era-wareki">{centerLabel.wareki}</span>{/if}
	</div>
{/if}

<style>
	.timeline {
		position: relative;
		overflow: clip;
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
	}
	.connector.right { left: calc(50% + 5px); }
	.connector.left { right: calc(50% + 5px); }
	.single .connector.right,
	.single .connector.left {
		left: 31px;
		right: auto;
		width: 20px;
	}

	.era-chip {
		position: fixed;
		top: 112px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 6px 18px;
		background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
		backdrop-filter: blur(6px);
		border: 1px solid var(--line);
		border-radius: 999px;
		box-shadow: var(--shadow);
		z-index: 5;
		pointer-events: none;
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

	/* モバイルではカードと重ならないよう左下へ（右下はズームボタン） */
	@media (max-width: 759px) {
		.era-chip {
			top: auto;
			bottom: 20px;
			left: 14px;
			transform: none;
			padding: 4px 14px;
		}
		.era-year {
			font-size: 1.05rem;
		}
	}
</style>
