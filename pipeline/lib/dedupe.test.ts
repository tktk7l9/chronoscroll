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
	it('文字bigramの集合を作る', () => {
		expect(textBigrams('東京')).toEqual(new Set(['東京']));
		expect(textBigrams('東京都')).toEqual(new Set(['東京', '京都']));
	});

	it('1文字以下は空集合', () => {
		expect(textBigrams('')).toEqual(new Set());
		expect(textBigrams('あ')).toEqual(new Set());
	});
});

describe('bigramJaccard', () => {
	it('完全一致は1', () => {
		const a = textBigrams('阪神・淡路大震災が発生');
		expect(bigramJaccard(a, a)).toBe(1);
	});

	it('無関係な文は低い類似度', () => {
		const a = textBigrams('東京オリンピックが開幕した');
		const b = textBigrams('ベルリンの壁が崩壊した');
		expect(bigramJaccard(a, b)).toBeLessThan(0.3);
	});

	it('両方空集合なら1（境界ケース）', () => {
		expect(bigramJaccard(new Set(), new Set())).toBe(1);
	});

	it('実データ同等の言い換えは閾値を超える', () => {
		const a = textBigrams('全国の新聞で夕刊が廃止');
		const b = textBigrams('全国の新聞で夕刊が廃止。');
		expect(bigramJaccard(a, b)).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
	});
});

describe('overlapCoefficient', () => {
	it('小さい方が完全に大きい方に含まれれば1', () => {
		const a = textBigrams('兵庫県南部地震');
		const b = textBigrams('午前5時46分に兵庫県南部地震が発生した');
		expect(overlapCoefficient(a, b)).toBe(1);
	});

	it('どちらかが空なら0', () => {
		expect(overlapCoefficient(new Set(), textBigrams('あいう'))).toBe(0);
	});
});

describe('linkOverlap', () => {
	it('共通リンクの割合を小さい方基準で返す', () => {
		expect(linkOverlap(['兵庫県南部地震', '阪神・淡路大震災'], ['明石海峡', '兵庫県南部地震', '阪神・淡路大震災'])).toBe(1);
	});

	it('共通リンクがなければ0', () => {
		expect(linkOverlap(['ガス事業法'], ['競馬法'])).toBe(0);
	});

	it('片方がリンクなしなら0', () => {
		expect(linkOverlap([], ['何か'])).toBe(0);
	});
});

describe('duplicateIds', () => {
	// 実データで確認された重複ペア（「YYYY年」「YYYY年の日本」の両ページに載っていた表現違い）
	it('同日+類似文面はスコアが高い方を残す（実データ再現: 長崎原爆投下）', () => {
		const drop = duplicateIds([
			c('a', '1945-08-09', '午前11時02分、米軍が長崎市への原子爆弾投下。', ['長崎市', '原子爆弾'], 90),
			c('b', '1945-08-09', '午前11時02分、米軍が長崎市へ原子爆弾投下。', ['長崎市', '原子爆弾'], 60),
		]);
		expect(drop).toEqual(new Set(['b']));
	});

	it('先頭リンクが違っても本文が似ていれば重複と判定する（実データ再現: 硫黄島の戦い）', () => {
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

	// containmentは高いがJaccardは閾値未満のケース: リンク先が重なっていれば重複と判定する
	it('短い見出し文が長い説明文に包含される場合、リンクが重なれば重複と判定する（実データ再現: 阪神・淡路大震災）', () => {
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

	// これが今回の設計変更の核心: containmentだけで判定すると、同日に成立した
	// 別々の法律を誤って同一視してしまう。リンク先の実体が異なれば重複としない。
	it('定型文が支配的な短文同士でも、リンク先の実体が異なれば重複としない（実データ再現: 同日成立の別法案）', () => {
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

	it('スコア同点なら本文が長い方を残す', () => {
		const drop = duplicateIds([
			c('short', '2000-01-01', '全国の新聞で夕刊が廃止', [], 50),
			c('long', '2000-01-01', '全国の新聞で夕刊が廃止。', [], 50),
		]);
		expect(drop).toEqual(new Set(['short']));
	});

	it('protected（curated参照）idはスコアに関わらず勝つ', () => {
		const drop = duplicateIds(
			[c('curated', '2000-01-01', '全国の新聞で夕刊が廃止', [], 10), c('auto', '2000-01-01', '全国の新聞で夕刊が廃止。', [], 99)],
			new Set(['curated']),
		);
		expect(drop).toEqual(new Set(['auto']));
	});

	it('日付が違えば別イベント', () => {
		const drop = duplicateIds([
			c('a', '2000-01-01', '全国の新聞で夕刊が廃止'),
			c('b', '2000-01-02', '全国の新聞で夕刊が廃止'),
		]);
		expect(drop.size).toBe(0);
	});

	it('同日でも文面もリンクも無関係なら別イベントのまま', () => {
		const drop = duplicateIds([
			c('a', '1964-10-10', '東京オリンピックが開幕した', ['東京オリンピック']),
			c('b', '1964-10-10', 'ベトナムで軍事クーデターが発生した', ['ベトナム']),
		]);
		expect(drop.size).toBe(0);
	});

	it('推移的な3件クラスタは1件に集約される（A~B, B~Cだが A と C は直接非類似でも同クラスタ）', () => {
		const drop = duplicateIds([
			c('a', '2000-01-01', 'XXXXX新聞で夕刊が廃止された模様', [], 80),
			c('b', '2000-01-01', 'XXXXX新聞で夕刊が廃止された', [], 60),
			c('c', '2000-01-01', '新聞で夕刊が廃止された旨の発表', [], 40),
		]);
		expect(drop.size).toBe(2);
		const remaining = ['a', 'b', 'c'].filter((id) => !drop.has(id));
		expect(remaining).toEqual(['a']);
	});

	it('カスタム閾値を指定できる（Jaccard経路のみに影響する）', () => {
		const items = [
			c('a', '2000-01-01', '全国の新聞で夕刊が廃止', [], 80),
			c('b', '2000-01-01', '全国の新聞で夕刊が廃止。', [], 60),
		];
		const dropLoose = duplicateIds(items, new Set(), 0.3);
		const dropStrict = duplicateIds(items, new Set(), 0.99);
		expect(dropLoose.size).toBeGreaterThan(0);
		// 高いJaccard閾値でもcontainment経路(リンクなし同士はlinkOverlap=0で不成立)は通らない
		expect(dropStrict.size).toBe(0);
	});

	it('本文が短すぎる場合はcontainment経路が働かない（境界: minLen<8）', () => {
		const drop = duplicateIds([
			c('a', '2000-01-01', '中止', ['同一議案'], 50),
			c('b', '2000-01-01', '中止が決定した', ['同一議案'], 50),
		]);
		expect(drop.size).toBe(0);
	});
});
