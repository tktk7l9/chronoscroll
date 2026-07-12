/**
 * 近似重複の排除。
 * 「YYYY年」と「YYYY年の日本」には同じできごとが表現違いの別文面で載ることが多い
 * （例:「兵庫県南部地震（阪神・淡路大震災）」対「阪神・淡路大震災」）。
 *
 * 判定は2段構え:
 *   1. 本文の文字bigram Jaccardが高い → 重複（安全な主判定）
 *   2. 一方が他方に文面として包含される関係（containmentが高い）でも、
 *      「◯◯法の一部を改正する法律案が参議院本会議で可決、成立。」のような定型文が
 *      支配的な短文同士だと、実際には別の議案なのに誤判定しうる。
 *      そのため containment 単独では採用せず、内部リンク先（話題の実体）が
 *      重なっている場合に限って重複と認める。
 */

export interface DedupeCandidate {
	id: string;
	date: string;
	text: string;
	textLength: number;
	score: number;
	/** 本文中の内部リンク先タイトル一覧（話題の実体を表す追加シグナル） */
	links: readonly string[];
}

export const SIMILARITY_THRESHOLD = 0.5;
const CONTAINMENT_THRESHOLD = 0.82;
const LINK_OVERLAP_THRESHOLD = 0.5;
const MIN_TEXT_LENGTH_FOR_CONTAINMENT = 8;

export function textBigrams(text: string): Set<string> {
	const set = new Set<string>();
	for (let i = 0; i < text.length - 1; i++) set.add(text.slice(i, i + 2));
	return set;
}

/** Jaccard係数（積集合/和集合）。両方空なら同一とみなし1 */
export function bigramJaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
	if (a.size === 0 && b.size === 0) return 1;
	let intersection = 0;
	for (const x of a) if (b.has(x)) intersection++;
	return intersection / (a.size + b.size - intersection);
}

/** 包含係数（積集合/小さい方の集合サイズ）。どちらかが空なら0 */
export function overlapCoefficient(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
	if (a.size === 0 || b.size === 0) return 0;
	let intersection = 0;
	for (const x of a) if (b.has(x)) intersection++;
	return intersection / Math.min(a.size, b.size);
}

/** 内部リンク先タイトル集合の包含係数 */
export function linkOverlap(a: readonly string[], b: readonly string[]): number {
	return overlapCoefficient(new Set(a), new Set(b));
}

function isDuplicateText(
	a: Pick<DedupeCandidate, 'text' | 'textLength' | 'links'>,
	b: Pick<DedupeCandidate, 'text' | 'textLength' | 'links'>,
	threshold: number,
): boolean {
	const bgA = textBigrams(a.text);
	const bgB = textBigrams(b.text);
	if (bigramJaccard(bgA, bgB) >= threshold) return true;

	// containment単独は定型文で誤判定するため、リンク先の実体一致を追加要件にする
	if (linkOverlap(a.links, b.links) < LINK_OVERLAP_THRESHOLD) return false;
	const minLen = Math.min(a.textLength, b.textLength);
	return minLen >= MIN_TEXT_LENGTH_FOR_CONTAINMENT && overlapCoefficient(bgA, bgB) >= CONTAINMENT_THRESHOLD;
}

class UnionFind {
	private readonly parent: number[];
	constructor(n: number) {
		this.parent = Array.from({ length: n }, (_, i) => i);
	}
	find(x: number): number {
		while (this.parent[x] !== x) {
			this.parent[x] = this.parent[this.parent[x]];
			x = this.parent[x];
		}
		return x;
	}
	union(a: number, b: number): void {
		const ra = this.find(a);
		const rb = this.find(b);
		if (ra !== rb) this.parent[ra] = rb;
	}
}

/**
 * 落とすべきidの集合を返す。
 * 同日グループ内で isDuplicateText が真のもの同士を1クラスタとみなし
 * （推移的：A~B, B~Cが繋がればA,B,Cは1クラスタ）、各クラスタから
 * 勝者（protected優先 > score > 本文の長さ）以外を落とす。
 */
export function duplicateIds(
	items: readonly DedupeCandidate[],
	protectedIds: ReadonlySet<string> = new Set(),
	threshold = SIMILARITY_THRESHOLD,
): Set<string> {
	const byDate = new Map<string, number[]>();
	items.forEach((it, i) => {
		const arr = byDate.get(it.date);
		if (arr) arr.push(i);
		else byDate.set(it.date, [i]);
	});

	const beats = (a: DedupeCandidate, b: DedupeCandidate): boolean => {
		const ap = protectedIds.has(a.id);
		const bp = protectedIds.has(b.id);
		if (ap !== bp) return ap;
		if (a.score !== b.score) return a.score > b.score;
		return a.textLength >= b.textLength;
	};

	const drop = new Set<string>();

	for (const indices of byDate.values()) {
		if (indices.length < 2) continue;
		const uf = new UnionFind(indices.length);
		for (let a = 0; a < indices.length; a++) {
			for (let b = a + 1; b < indices.length; b++) {
				if (isDuplicateText(items[indices[a]], items[indices[b]], threshold)) {
					uf.union(a, b);
				}
			}
		}

		const clusters = new Map<number, number[]>();
		indices.forEach((_, local) => {
			const root = uf.find(local);
			const arr = clusters.get(root);
			if (arr) arr.push(local);
			else clusters.set(root, [local]);
		});

		for (const locals of clusters.values()) {
			if (locals.length < 2) continue;
			let winner = items[indices[locals[0]]];
			for (let k = 1; k < locals.length; k++) {
				const cand = items[indices[locals[k]]];
				if (beats(cand, winner)) winner = cand;
			}
			for (const local of locals) {
				const it = items[indices[local]];
				if (it.id !== winner.id) drop.add(it.id);
			}
		}
	}

	return drop;
}
