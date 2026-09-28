/**
 * Near-duplicate removal.
 * The same event often appears in 「YYYY年」 and 「YYYY年の日本」 with different wording
 * (e.g. 「兵庫県南部地震（阪神・淡路大震災）」 vs 「阪神・淡路大震災」).
 *
 * Two-stage check:
 *   1. High character-bigram Jaccard of the body → duplicate (safe primary check)
 *   2. Even when one text is contained in the other (high containment),
 *      short texts dominated by boilerplate such as 「◯◯法の一部を改正する法律案が参議院本会議で可決、成立。」
 *      can be misjudged even though they are actually different bills.
 *      So containment alone is not accepted; it counts as a duplicate only when
 *      the internal link targets (the topic entities) overlap.
 */

export interface DedupeCandidate {
	id: string;
	date: string;
	text: string;
	textLength: number;
	score: number;
	/** Titles of the internal link targets in the body (an extra signal for the topic entity) */
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

/** Jaccard coefficient (intersection/union). If both are empty they are considered identical: 1 */
export function bigramJaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
	if (a.size === 0 && b.size === 0) return 1;
	let intersection = 0;
	for (const x of a) if (b.has(x)) intersection++;
	return intersection / (a.size + b.size - intersection);
}

/** Containment coefficient (intersection/size of the smaller set). 0 if either is empty */
export function overlapCoefficient(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
	if (a.size === 0 || b.size === 0) return 0;
	let intersection = 0;
	for (const x of a) if (b.has(x)) intersection++;
	return intersection / Math.min(a.size, b.size);
}

/** Containment coefficient of the internal link target title sets */
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

	// containment alone misjudges boilerplate, so also require the link target entities to match
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
 * Return the set of ids to drop.
 * Within a same-day group, events for which isDuplicateText is true are treated as one cluster
 * (transitive: if A~B and B~C connect, then A, B, C form one cluster), and from each cluster
 * everything except the winner (protected first > score > body length) is dropped.
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
