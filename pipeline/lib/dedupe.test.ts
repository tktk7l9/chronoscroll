import { describe, expect, it } from 'vitest';
import {
	SIMILARITY_THRESHOLD,
	bigramJaccard,
	duplicateIds,
	linkOverlap,
	overlapCoefficient,
	textBigrams,
	type DedupeCandidate,
} from './dedupe.ts';

function c(
	id: string,
	date: string,
	text: string,
	links: readonly string[] = [],
	score = 50,
): DedupeCandidate {
	return { id, date, text, textLength: text.length, score, links };
}

describe('textBigrams', () => {
	it('builds a set of character bigrams', () => {
		expect(textBigrams('東京')).toEqual(new Set(['東京']));
		expect(textBigrams('東京都')).toEqual(new Set(['東京', '京都']));
	});

	it('empty set for one character or less', () => {
		expect(textBigrams('')).toEqual(new Set());
		expect(textBigrams('あ')).toEqual(new Set());
	});
});

describe('bigramJaccard', () => {
	it('1 for an exact match', () => {
		const a = textBigrams('阪神・淡路大震災が発生');
		expect(bigramJaccard(a, a)).toBe(1);
	});

	it('low similarity for unrelated sentences', () => {
		const a = textBigrams('東京オリンピックが開幕した');
		const b = textBigrams('ベルリンの壁が崩壊した');
		expect(bigramJaccard(a, b)).toBeLessThan(0.3);
	});

	it('1 when both sets are empty (edge case)', () => {
		expect(bigramJaccard(new Set(), new Set())).toBe(1);
	});

	it('a real-data-like paraphrase exceeds the threshold', () => {
		const a = textBigrams('全国の新聞で夕刊が廃止');
		const b = textBigrams('全国の新聞で夕刊が廃止。');
		expect(bigramJaccard(a, b)).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
	});
});

describe('overlapCoefficient', () => {
	it('1 when the smaller set is fully contained in the larger', () => {
		const a = textBigrams('兵庫県南部地震');
		const b = textBigrams('午前5時46分に兵庫県南部地震が発生した');
		expect(overlapCoefficient(a, b)).toBe(1);
	});

	it('0 when either is empty', () => {
		expect(overlapCoefficient(new Set(), textBigrams('あいう'))).toBe(0);
	});
});

describe('linkOverlap', () => {
	it('returns the shared-link ratio based on the smaller side', () => {
		expect(linkOverlap(['兵庫県南部地震', '阪神・淡路大震災'], ['明石海峡', '兵庫県南部地震', '阪神・淡路大震災'])).toBe(1);
	});

	it('0 without shared links', () => {
		expect(linkOverlap(['ガス事業法'], ['競馬法'])).toBe(0);
	});

	it('0 when one side has no links', () => {
		expect(linkOverlap([], ['何か'])).toBe(0);
	});
});

describe('duplicateIds', () => {
	// Duplicate pairs confirmed in real data (different wordings that appeared on both 「YYYY年」 and 「YYYY年の日本」 pages)
	it('same day + similar text keeps the higher score (real data: Nagasaki atomic bombing)', () => {
		const drop = duplicateIds([
			c('a', '1945-08-09', '午前11時02分、米軍が長崎市への原子爆弾投下。', ['長崎市', '原子爆弾'], 90),
			c('b', '1945-08-09', '午前11時02分、米軍が長崎市へ原子爆弾投下。', ['長崎市', '原子爆弾'], 60),
		]);
		expect(drop).toEqual(new Set(['b']));
	});

	it('treats similar text as a duplicate even with a different first link (real data: Battle of Iwo Jima)', () => {
		const drop = duplicateIds([
			c(
				'x',
				'1945-03-26',
				'硫黄島で最後までアメリカ軍に抗戦していた栗林中将配下の部隊が全滅（硫黄島の組織的戦闘終結）。',
				['硫黄島', '栗林忠道'],
				70,
			),
			c(
				'y',
				'1945-03-26',
				'硫黄島で最後までアメリカ軍に抗戦していた栗林中将配下の部隊が全滅（硫黄島の戦い終結）。',
				['硫黄島の戦い'],
				95,
			),
		]);
		expect(drop.size).toBe(1);
	});

	// Case with high containment but Jaccard below the threshold: judged a duplicate if the link targets overlap
	it('treats a short headline contained in a long description as a duplicate when links overlap (real data: Great Hanshin earthquake)', () => {
		const drop = duplicateIds([
			c('short', '1995-01-17', '兵庫県南部地震（阪神・淡路大震災）', ['兵庫県南部地震', '阪神・淡路大震災'], 40),
			c(
				'long',
				'1995-01-17',
				'午前5時46分、明石海峡を震源とする直下型地震、「兵庫県南部地震（阪神・淡路大震災）」が発生。',
				['明石海峡', '兵庫県南部地震', '阪神・淡路大震災'],
				90,
			),
		]);
		expect(drop).toEqual(new Set(['short']));
	});

	// This is the core of this design change: judging by containment alone would wrongly treat
	// separate laws enacted on the same day as the same. If the link target entities differ, it is not a duplicate.
	it('does not merge boilerplate-dominated short texts whose linked entities differ (real data: separate bills passed the same day)', () => {
		const drop = duplicateIds([
			c(
				'gas-law',
				'2022-11-11',
				'ガス事業法及び独立行政法人エネルギー・金属鉱物資源機構法の一部を改正する法律案が参議院本会議で可決、成立。',
				['ガス事業法', '独立行政法人エネルギー・金属鉱物資源機構法', '参議院', '本会議'],
				60,
			),
			c('horse-law', '2022-11-11', '競馬法の一部を改正する法律案が参議院本会議で可決、成立。', ['競馬法'], 60),
		]);
		expect(drop.size).toBe(0);
	});

	it('keeps the longer text on a score tie', () => {
		const drop = duplicateIds([
			c('short', '2000-01-01', '全国の新聞で夕刊が廃止', [], 50),
			c('long', '2000-01-01', '全国の新聞で夕刊が廃止。', [], 50),
		]);
		expect(drop).toEqual(new Set(['short']));
	});

	it('a protected (curated) id wins regardless of score', () => {
		const drop = duplicateIds(
			[c('curated', '2000-01-01', '全国の新聞で夕刊が廃止', [], 10), c('auto', '2000-01-01', '全国の新聞で夕刊が廃止。', [], 99)],
			new Set(['curated']),
		);
		expect(drop).toEqual(new Set(['auto']));
	});

	it('different dates mean different events', () => {
		const drop = duplicateIds([
			c('a', '2000-01-01', '全国の新聞で夕刊が廃止'),
			c('b', '2000-01-02', '全国の新聞で夕刊が廃止'),
		]);
		expect(drop.size).toBe(0);
	});

	it('keeps events separate on the same day when text and links are unrelated', () => {
		const drop = duplicateIds([
			c('a', '1964-10-10', '東京オリンピックが開幕した', ['東京オリンピック']),
			c('b', '1964-10-10', 'ベトナムで軍事クーデターが発生した', ['ベトナム']),
		]);
		expect(drop.size).toBe(0);
	});

	it('collapses a transitive 3-event cluster into one (A~B, B~C, same cluster even if A and C are not similar)', () => {
		const drop = duplicateIds([
			c('a', '2000-01-01', 'XXXXX新聞で夕刊が廃止された模様', [], 80),
			c('b', '2000-01-01', 'XXXXX新聞で夕刊が廃止された', [], 60),
			c('c', '2000-01-01', '新聞で夕刊が廃止された旨の発表', [], 40),
		]);
		expect(drop.size).toBe(2);
		const remaining = ['a', 'b', 'c'].filter((id) => !drop.has(id));
		expect(remaining).toEqual(['a']);
	});

	it('accepts a custom threshold (affects only the Jaccard path)', () => {
		const items = [
			c('a', '2000-01-01', '全国の新聞で夕刊が廃止', [], 80),
			c('b', '2000-01-01', '全国の新聞で夕刊が廃止。', [], 60),
		];
		const dropLoose = duplicateIds(items, new Set(), 0.3);
		const dropStrict = duplicateIds(items, new Set(), 0.99);
		expect(dropLoose.size).toBeGreaterThan(0);
		// Even with a high Jaccard threshold, the containment path does not pass (without links on either side, linkOverlap=0 fails)
		expect(dropStrict.size).toBe(0);
	});

	it('the containment path does not apply to too short texts (boundary: minLen<8)', () => {
		const drop = duplicateIds([
			c('a', '2000-01-01', '中止', ['同一議案'], 50),
			c('b', '2000-01-01', '中止が決定した', ['同一議案'], 50),
		]);
		expect(drop.size).toBe(0);
	});
});
