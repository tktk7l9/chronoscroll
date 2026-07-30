import { load } from 'js-yaml';
import type { CollectionDetail, CollectionMeta, NewsEvent } from '../../src/lib/types.ts';
import type { CuratedEntry } from './curate.ts';
import { sortEvents } from './emit.ts';

/**
 * content/collections/<slug>.yaml の中身。
 * entries は CuratedEntry と同型にしてあり、build.ts が curated 層へそのまま流す。
 * これで「新規イベントの生成」「既存イベントの部分上書き」「近似重複除去からのid保護」
 * 「relatedIdsの手動指定」が全て既存経路のまま成立する。
 */
export interface CollectionSource {
	slug: string;
	title: string;
	lead: string;
	description: string;
	icon?: string;
	entries: CuratedEntry[];
}

/** URLに乗るslug。/c/<slug> と ?k=<slug> の両方で使う */
export const COLLECTION_SLUG_RE = /^[a-z0-9-]+$/;

function requireString(value: unknown, label: string): string {
	if (typeof value !== 'string' || value === '') {
		throw new Error(`特集の${label}が空です`);
	}
	return value;
}

export function parseCollectionYaml(yamlText: string): CollectionSource {
	// js-yaml は空入力そのものを投げるため、先に自前のメッセージで弾く
	if (yamlText.trim() === '') throw new Error('特集YAMLが空です');
	const data = load(yamlText);
	if (data == null || typeof data !== 'object' || Array.isArray(data)) {
		throw new Error('特集YAMLはマッピング（slug/title/...）である必要があります');
	}
	const raw = data as Record<string, unknown>;
	const slug = requireString(raw.slug, 'slug');
	if (!COLLECTION_SLUG_RE.test(slug)) {
		throw new Error(`特集のslugは英小文字・数字・ハイフンのみ使えます: ${slug}`);
	}
	const title = requireString(raw.title, `title(${slug})`);
	const lead = requireString(raw.lead, `lead(${slug})`);
	const description = requireString(raw.description, `description(${slug})`);
	if (raw.icon !== undefined && (typeof raw.icon !== 'string' || raw.icon === '')) {
		throw new Error(`特集のicon(${slug})が空です`);
	}
	if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
		throw new Error(`特集(${slug})のentriesが空です`);
	}
	for (const entry of raw.entries as { id?: unknown }[]) {
		if (typeof entry?.id !== 'string' || entry.id === '') {
			throw new Error(`特集(${slug})のエントリに id がありません: ${JSON.stringify(entry)}`);
		}
	}
	return {
		slug,
		title,
		lead,
		description,
		...(raw.icon === undefined ? {} : { icon: raw.icon as string }),
		entries: raw.entries as CuratedEntry[],
	};
}

/** 全特集のentriesを平坦化する。build.tsがcurated層と結合して同じ経路に流す */
export function collectionCuratedEntries(
	sources: readonly CollectionSource[],
): CuratedEntry[] {
	return sources.flatMap((s) => s.entries);
}

/**
 * 特集1本を、収録イベント本体つきの配信用データに組み立てる。
 * 同一idの重複指定は最初の1件に畳み、存在しないidは黙って落とす
 * （typo検出は unmatchedCollectionIds が担当する）。
 */
export function buildCollectionDetail(
	source: CollectionSource,
	byId: ReadonlyMap<string, NewsEvent>,
): CollectionDetail {
	const seen = new Set<string>();
	const events: NewsEvent[] = [];
	for (const entry of source.entries) {
		if (seen.has(entry.id)) continue;
		const ev = byId.get(entry.id);
		if (ev === undefined) continue;
		seen.add(entry.id);
		events.push(ev);
	}
	if (events.length === 0) {
		throw new Error(`特集(${source.slug})に収録できるイベントが1件もありません`);
	}
	const sorted = sortEvents(events);
	return {
		slug: source.slug,
		title: source.title,
		lead: source.lead,
		description: source.description,
		...(source.icon === undefined ? {} : { icon: source.icon }),
		count: sorted.length,
		fromDate: sorted[0].date,
		toDate: sorted[sorted.length - 1].date,
		events: sorted,
	};
}

/** 配信用データから一覧用のメタだけを取り出す（イベント本体を落とす） */
export function toCollectionMeta(detail: CollectionDetail): CollectionMeta {
	const { events: _events, ...meta } = detail;
	return meta;
}

/** イベントid → 所属する特集slug[] の逆引き。個別ページの「収録されている特集」に使う */
export function eventCollectionIndex(
	details: readonly CollectionDetail[],
): Record<string, string[]> {
	const index: Record<string, string[]> = {};
	for (const detail of details) {
		for (const ev of detail.events) {
			index[ev.id] = [...(index[ev.id] ?? []), detail.slug];
		}
	}
	return index;
}

/**
 * 最終的なイベントid集合に存在しない参照を特集ごとに返す（typo検出用）。
 * 月次のWikipedia再生成で自動生成id（本文のハッシュ）が変わった場合もここに出る。
 */
export function unmatchedCollectionIds(
	sources: readonly CollectionSource[],
	validIds: ReadonlySet<string>,
): { slug: string; ids: string[] }[] {
	return sources
		.map((s) => ({ slug: s.slug, ids: s.entries.map((e) => e.id).filter((id) => !validIds.has(id)) }))
		.filter((r) => r.ids.length > 0);
}
