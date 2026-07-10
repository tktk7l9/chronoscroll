import { describe, expect, it } from 'vitest';
import {
	GEO_WEIGHT,
	SITELINK_CAP,
	decadeOf,
	idfWeight,
	isGeoLikeTarget,
	linkScore,
	lowerBound,
	percentileByDecade,
	rawScore,
	upperBound,
} from './score.ts';

describe('isGeoLikeTarget', () => {
	it('国名・都市名リストに一致する', () => {
		expect(isGeoLikeTarget('アメリカ')).toBe(true);
		expect(isGeoLikeTarget('スイス')).toBe(true);
		expect(isGeoLikeTarget('東京')).toBe(true);
	});

	it('接尾辞パターン（〜共和国/〜県/〜語など）に一致する', () => {
		expect(isGeoLikeTarget('アイルランド自由国')).toBe(true);
		expect(isGeoLikeTarget('ワイマール共和国')).toBe(true);
		expect(isGeoLikeTarget('神奈川県')).toBe(true);
		expect(isGeoLikeTarget('チェコ語')).toBe(true);
	});

	it('イベント固有の記事は地名扱いしない', () => {
		expect(isGeoLikeTarget('関東大震災')).toBe(false);
		expect(isGeoLikeTarget('1964年東京オリンピック')).toBe(false);
		expect(isGeoLikeTarget('源氏物語')).toBe(false);
	});
});

describe('linkScore', () => {
	it('sitelink数はCAPで頭打ちになる', () => {
		expect(linkScore('関東大震災', 400, 1)).toBe(SITELINK_CAP);
		expect(linkScore('関東大震災', 80, 1)).toBe(80);
	});

	it('地名的リンクは減衰する', () => {
		expect(linkScore('アメリカ', 100, 1)).toBeCloseTo(100 * GEO_WEIGHT);
	});

	it('頻出リンクはIDFで減衰する', () => {
		expect(linkScore('何かの記事', 100, 100)).toBeLessThan(linkScore('何かの記事', 100, 2));
	});

	it('ページビューがsitelinksを補完する（ja記事分割バイアス対策）', () => {
		// sitelinks=3 でも 1500view/日 なら 150相当（CAP）まで引き上がる
		expect(linkScore('関東大震災', 3, 1, 1500)).toBe(SITELINK_CAP);
		// 両方低ければ低いまま
		expect(linkScore('マイナー記事', 3, 1, 20)).toBe(3);
	});
});

describe('idfWeight', () => {
	it('df=1で1、頻出するほど減衰する', () => {
		expect(idfWeight(1)).toBe(1);
		expect(idfWeight(100)).toBeLessThan(idfWeight(10));
		expect(idfWeight(1000)).toBeGreaterThan(0);
	});

	it('df=0でも1として扱う（ガード）', () => {
		expect(idfWeight(0)).toBe(1);
	});
});

describe('rawScore', () => {
	it('リンクなしは0', () => {
		expect(rawScore([])).toBe(0);
	});

	it('単一リンクは最大値のみ', () => {
		expect(rawScore([120])).toBe(120);
	});

	it('複数リンクは最大 + 0.15×次点', () => {
		expect(rawScore([100, 40, 10])).toBe(106);
		expect(rawScore([40, 100])).toBe(106);
	});
});

describe('decadeOf', () => {
	it('十年単位に丸める', () => {
		expect(decadeOf(1964)).toBe(1960);
		expect(decadeOf(1870)).toBe(1870);
		expect(decadeOf(2026)).toBe(2020);
	});
});

describe('lowerBound / upperBound', () => {
	const arr = [1, 3, 3, 5, 9];
	it('lowerBound は value 未満の件数', () => {
		expect(lowerBound(arr, 3)).toBe(1);
		expect(lowerBound(arr, 0)).toBe(0);
		expect(lowerBound(arr, 10)).toBe(5);
	});
	it('upperBound は value 以下の件数', () => {
		expect(upperBound(arr, 3)).toBe(3);
		expect(upperBound(arr, 0)).toBe(0);
		expect(upperBound(arr, 9)).toBe(5);
	});
});

describe('percentileByDecade', () => {
	it('十年グループ内でパーセンタイル化する', () => {
		const items = [
			{ id: 'a', year: 1960, raw: 10 },
			{ id: 'b', year: 1964, raw: 20 },
			{ id: 'c', year: 1969, raw: 30 },
			{ id: 'd', year: 1969, raw: 40 },
		];
		const m = percentileByDecade(items);
		expect(m.get('a')).toBe(12.5);
		expect(m.get('b')).toBe(37.5);
		expect(m.get('c')).toBe(62.5);
		expect(m.get('d')).toBe(87.5);
	});

	it('同値は同じパーセンタイルになる', () => {
		const items = [
			{ id: 'a', year: 1900, raw: 5 },
			{ id: 'b', year: 1900, raw: 5 },
		];
		const m = percentileByDecade(items);
		expect(m.get('a')).toBe(50);
		expect(m.get('b')).toBe(50);
	});

	it('別の十年は互いに影響しない', () => {
		const items = [
			{ id: 'old', year: 1870, raw: 1 },
			{ id: 'new1', year: 2020, raw: 100 },
			{ id: 'new2', year: 2020, raw: 200 },
		];
		const m = percentileByDecade(items);
		expect(m.get('old')).toBe(50);
		expect(m.get('new1')).toBe(25);
		expect(m.get('new2')).toBe(75);
	});
});
