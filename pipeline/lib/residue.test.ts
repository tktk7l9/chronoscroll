import { describe, expect, it } from 'vitest';
import {
	RESIDUE_PATTERNS,
	eventResidue,
	findResidue,
	formatResidueReport,
	residueOverCeiling,
	residueSummary,
	unbalancedBrackets,
} from './residue.ts';

describe('findResidue', () => {
	it('returns nothing for clean text', () => {
		expect(findResidue('東海道本線の国府津 - 静岡間が開通（国府津 - 沼津間は後の御殿場線）。')).toEqual([]);
		expect(findResidue('第46回選抜高等学校野球大会の決勝戦が行われ、報徳高校が池田高校を3対1で破り、初優勝。')).toEqual([]);
	});

	it.each([
		['braces', '日清食品が「カップヌードル」を発売{{Cite web|和書|url=https://example.com'],
		['braces', '要約の途中に}}が残る'],
		['wikilink', '[[ファイル:Example.png|サムネイル|説明]]東海道本線が開通。'],
		['ref_tag', '金星の太陽面通過が起こった<ref name="x" />。'],
		['ref_tag', '記録は<sup>注</sup>のとおり。'],
		['html_entity', '最高速度325.7&nbsp;km/hを記録。'],
		['html_entity', '8月4日 &#8211; 進水した。'],
		['template_param', 'サラ・クラーク|label=黒杖官を指名。'],
		['template_param', '仮リンクの跡が残る。'],
		['template_param', '世界初{{要検証範囲}}の航海。'],
		['noun_verb', 'ブット元首相がベーナズィール・ブットー暗殺事件される。'],
		['noun_verb', 'マハトマ・ガンディー暗殺事件した。'],
		['leading_date', '4月9–13日 - 英国、アビシニア遠征'],
		['leading_date', '8月15,16日 - エクアドル地震'],
		['leading_date', '17日 - 国立西洋美術館が世界遺産に登録'],
		['leading_date', '8月 - アメリカ軍による空爆が激化。'],
		['leading_date', '1月2日-広島市の宇品港で転覆事故が発生。'],
		['leading_season', '夏頃 - 1勝もあげられずに負け続ける競走馬が注目される。'],
		['leading_season', '夏季 - 結膜炎が世界的に大流行する。'],
		['leading_season', '年末：株価が急落。'],
		['see_also', '明治改暦も参照'],
		['see_also', '詳しくはニホンオオカミを参照。'],
		['edge_separator', '- 日韓首脳会談。歴史認識合意せず。'],
		['edge_separator', ':東京では午前7時32分頃に金環となった。'],
		['edge_separator', '全農林警職法事件 -'],
		['double_punct', '平安神宮が放火され本殿など9棟が焼失。。'],
		['double_punct', '京都、、奈良で地震。'],
		['empty_quote', '次の探査目標（小惑星「」、2031年7月到着予定）へ向かった。'],
		['empty_quote', '作品『』が出版された。'],
	])('flags %s in %s', (name, text) => {
		expect(findResidue(text)).toContain(name);
	});

	it('does not flag a season word that is part of the sentence', () => {
		expect(findResidue('夏の甲子園で初優勝。')).toEqual([]);
		expect(findResidue('春闘で賃上げ率が過去最高に。')).toEqual([]);
		expect(findResidue('冬季オリンピックが開幕（ - 28日）。')).toEqual([]);
	});

	it('does not flag dates inside the body or the usual range notation', () => {
		expect(findResidue('昭和最後の日となり、昭和64年は、昭和元年（12月25日 - 31日）と並び7日間のみとなった。')).toEqual([]);
		expect(findResidue('国体夏季大会が開幕（ - 24日、秋季大会は10月26日 - 31日）。')).toEqual([]);
		expect(findResidue('東京都港区の環状第2号線地下トンネル区間の地上部に虎ノ門ヒルズが竣工。')).toEqual([]);
	});

	it('reports unbalanced brackets unless balance checking is off', () => {
		expect(findResidue('夫婦別姓とする太政官指令が通達される（1898年の民法制定まで)')).toEqual(['unbalanced']);
		expect(findResidue('夫婦別姓とする太政官指令が通達される（1898年の民法制定まで)', { balance: false })).toEqual([]);
	});

	it('every pattern has a unique name and a description', () => {
		const names = RESIDUE_PATTERNS.map((p) => p.name);
		expect(new Set(names).size).toBe(names.length);
		for (const p of RESIDUE_PATTERNS) expect(p.description.length).toBeGreaterThan(0);
	});
});

describe('unbalancedBrackets', () => {
	it('lists the pairs whose counts differ', () => {
		expect(unbalancedBrackets('「a」『b』（c）(d)【e】《f》〈g〉［h］[i]')).toEqual([]);
		expect(unbalancedBrackets('鳥取県立倉吉農学校(現倉吉農業高等学校）開校')).toEqual(['（）', '()']);
		expect(unbalancedBrackets('ローレルスピリット」を発売')).toEqual(['「」']);
	});
});

describe('eventResidue', () => {
	it('unites the patterns of summary and title', () => {
		expect(
			eventResidue({ title: '17日 - 国立西洋美術館が世界遺産に', summary: '国立西洋美術館が世界遺産に登録{{Cite news' }),
		).toEqual(['braces', 'leading_date']);
	});

	it('skips the balance check for a title truncated with 「…」', () => {
		expect(eventResidue({ title: '日産自動車が「ローレルスピリット」を発売（「1981年にFF化された「サニー…', summary: '発売。' })).toEqual([]);
		expect(eventResidue({ title: '日産自動車が「ローレルスピリット」を発売（「1981年', summary: '発売。' })).toEqual(['unbalanced']);
	});
});

describe('residueSummary / formatResidueReport', () => {
	const events = [
		{ id: 'a', title: 'A', summary: 'きれいな要約。' },
		{ id: 'b', title: 'B', summary: '発売{{Cite web' },
		{ id: 'c', title: 'C', summary: '4日 - 訪問{{Cite news' },
		{ id: 'd', title: 'D', summary: '8月 - 空爆' },
	];

	it('counts flagged events and groups ids per pattern', () => {
		const s = residueSummary(events);
		expect(s.flagged).toBe(3);
		expect([...s.byPattern]).toEqual([
			['braces', ['b', 'c']],
			['leading_date', ['c', 'd']],
		]);
	});

	it('formats counts in descending order with a sample of ids', () => {
		const text = formatResidueReport(residueSummary(events), 4, 1);
		expect(text).toBe(
			[
				'⚠️ markup residue in generated text: 3 of 4 events (fix via content/curated/)',
				'  braces: 2 — unclosed template, usually a <ref>{{Cite …}} that spans lines: b, … (+1)',
				'  leading_date: 2 — date fragment left in front of the body (unparsed date form such as 「9–13日 - 」): c, … (+1)',
			].join('\n'),
		);
	});

	it('lists the classes above their ceiling; a class without a ceiling allows none', () => {
		const s = residueSummary(events);
		expect(residueOverCeiling(s, { braces: 2, leading_date: 2 })).toEqual([]);
		expect(residueOverCeiling(s, { braces: 1, leading_date: 3 })).toEqual([{ name: 'braces', count: 2, ceiling: 1 }]);
		expect(residueOverCeiling(s, { braces: 2 })).toEqual([{ name: 'leading_date', count: 2, ceiling: 0 }]);
		expect(residueOverCeiling(residueSummary([]), {})).toEqual([]);
	});

	it('describes the unbalanced pseudo pattern and lists all ids when they fit', () => {
		const text = formatResidueReport(residueSummary([{ id: 'x', title: 'X', summary: '開校(現在）' }]), 1);
		expect(text).toContain('  unbalanced: 1 — bracket counts differ: x');
		expect(text).not.toContain('+');
	});
});
