import { describe, expect, it } from 'vitest';
import {
	eventDateAndId,
	extractEventsSection,
	fnv1a,
	isDateLikeTarget,
	parseBulletLine,
	parseDateOnly,
	parseYearPage,
	replaceLinks,
	stripMarkup,
} from './wikitext.ts';

describe('extractEventsSection', () => {
	it('extracts the events section up to the next heading', () => {
		const wt = '導入\n== できごと ==\n本文A\n== 誕生 ==\n本文B';
		expect(extractEventsSection(wt)).toBe('\n本文A\n');
	});

	it('handles the 出来事 spelling and headings without spaces', () => {
		expect(extractEventsSection('==出来事==\nX\n== 死去 ==\nY')).toBe('\nX\n');
	});

	it('handles variant headings such as 出来事・事柄 (1995 page)', () => {
		expect(extractEventsSection('== 出来事・事柄 ==\nX\n== 周年 ==\nY')).toBe('\nX\n');
	});

	it('goes to the end without a next level-2 heading', () => {
		expect(extractEventsSection('== できごと ==\nA\n=== 1月 ===\nB')).toBe('\nA\n=== 1月 ===\nB');
	});

	it('null without the section', () => {
		expect(extractEventsSection('== 誕生 ==\nX')).toBeNull();
	});
});

describe('isDateLikeTarget', () => {
	it('excludes date, year, era and decade links', () => {
		expect(isDateLikeTarget('1月2日')).toBe(true);
		expect(isDateLikeTarget('11月22日 (旧暦)')).toBe(true);
		expect(isDateLikeTarget('3月')).toBe(true);
		expect(isDateLikeTarget('1964年')).toBe(true);
		expect(isDateLikeTarget('明治')).toBe(true);
		expect(isDateLikeTarget('昭和39年')).toBe(true);
		expect(isDateLikeTarget('1960年代')).toBe(true);
	});

	it('does not exclude regular article links', () => {
		expect(isDateLikeTarget('東京オリンピック')).toBe(false);
		expect(isDateLikeTarget('国際連合')).toBe(false);
	});
});

describe('stripMarkup', () => {
	it('removes comments and refs', () => {
		expect(stripMarkup('A<!-- コメント -->B<ref name="x"/>C<ref>出典</ref>D')).toBe('ABCD');
	});

	it('replaces 仮リンク with its label', () => {
		expect(stripMarkup('{{仮リンク|パスタ戦争|en|Pasta War}}が起きた')).toBe('パスタ戦争が起きた');
	});

	it('removes nested templates', () => {
		expect(stripMarkup('A{{main|{{lang|en|X}}}}B')).toBe('AB');
	});

	it('removes emphasis markup', () => {
		expect(stripMarkup("'''太字'''と''斜体''")).toBe('太字と斜体');
	});

	it('removes only HTML tags and keeps their content', () => {
		expect(stripMarkup('プルトニウム (<sup>238</sup>Pu) を合成')).toBe(
			'プルトニウム (238Pu) を合成',
		);
	});
});

describe('replaceLinks', () => {
	it('replaces links with labels and collects them', () => {
		const r = replaceLinks('[[中華人民共和国]]と[[フランス第五共和政|フランス]]が国交樹立。');
		expect(r.text).toBe('中華人民共和国とフランスが国交樹立。');
		expect(r.links).toEqual([
			{ target: '中華人民共和国', label: '中華人民共和国' },
			{ target: 'フランス第五共和政', label: 'フランス' },
		]);
	});

	it('keeps date links in text but does not collect them', () => {
		const r = replaceLinks('[[1964年]]の[[東京オリンピック]]');
		expect(r.text).toBe('1964年の東京オリンピック');
		expect(r.links).toEqual([{ target: '東京オリンピック', label: '東京オリンピック' }]);
	});

	it('removes file and category links entirely', () => {
		const r = replaceLinks('[[ファイル:foo.jpg|thumb]]本文[[Category:何か]]');
		expect(r.text).toBe('本文');
		expect(r.links).toEqual([]);
	});
});

describe('parseBulletLine', () => {
	it('parses a line with a date link at day precision', () => {
		const ev = parseBulletLine('[[1月27日]] - [[中華人民共和国]]と[[フランス]]が国交樹立。', 1964, 1);
		expect(ev).toEqual({
			year: 1964,
			month: 1,
			day: 27,
			precision: 'day',
			text: '中華人民共和国とフランスが国交樹立。',
			links: [
				{ target: '中華人民共和国', label: '中華人民共和国' },
				{ target: 'フランス', label: 'フランス' },
			],
		});
	});

	it('skips old-calendar notes (including links in full-width parentheses)', () => {
		const ev = parseBulletLine(
			'[[1月2日]]（明治4年[[11月22日 (旧暦)|11月22日]]） - 府県廃合を完了（3府72県）。',
			1872,
			1,
		);
		expect(ev?.day).toBe(2);
		expect(ev?.precision).toBe('day');
		expect(ev?.text).toBe('府県廃合を完了（3府72県）。');
	});

	it('does not claim day precision when the date link itself is old-calendar', () => {
		const ev = parseBulletLine('[[1月2日 (旧暦)]] - 何かが起きた。', 1870, 1);
		expect(ev).toMatchObject({ month: 1, day: 2, precision: 'month' });
		expect(parseDateOnly('[[1月2日 (旧暦)]]')).toEqual({ month: 1, day: 2, precision: 'month' });
	});

	it('a month-only link gives month precision', () => {
		const ev = parseBulletLine('[[3月]] - 何かが起きた。', 1900, 1);
		expect(ev?.month).toBe(3);
		expect(ev?.day).toBeNull();
		expect(ev?.precision).toBe('month');
	});

	it('no date link inside a month section gives month precision', () => {
		const ev = parseBulletLine('[[国際連合]]で何かが決まった。', 1950, 6);
		expect(ev?.month).toBe(6);
		expect(ev?.precision).toBe('month');
	});

	it('no date link outside a section gives year precision', () => {
		const ev = parseBulletLine('この年の出来事。', 1900, null);
		expect(ev?.month).toBeNull();
		expect(ev?.precision).toBe('year');
	});

	it('null for empty or markup-only lines', () => {
		expect(parseBulletLine('', 1900, null)).toBeNull();
		expect(parseBulletLine('{{main|1964年の日本}}', 1964, null)).toBeNull();
		expect(parseBulletLine('[[ファイル:foo.jpg|thumb]]', 1964, 1)).toBeNull();
	});

	it('null for an invalid month/day', () => {
		expect(parseBulletLine('何か', 1900, 13)).toBeNull();
		expect(parseBulletLine('何か', 1900, 0)).toBeNull();
		expect(parseBulletLine('[[2月32日]] - 何か', 1900, null)).toBeNull();
		expect(parseBulletLine('[[2月0日]] - 何か', 1900, null)).toBeNull();
	});

	it('uses the forced date (parent date of a nested list)', () => {
		const ev = parseBulletLine('[[東海道新幹線]]開業。', 1964, 10, {
			month: 10,
			day: 1,
			precision: 'day',
		});
		expect(ev).toMatchObject({ month: 10, day: 1, precision: 'day', text: '東海道新幹線開業。' });
	});

	it('cleans up empty parentheses after removing templates', () => {
		const ev = parseBulletLine('[[10月10日]] - [[東京]]（{{JPN}}）で開会。', 1964, 10);
		expect(ev?.text).toBe('東京で開会。');
	});

	it('parses dates written without links', () => {
		const ev = parseBulletLine('4月15日 - そごう主要店舗が閉店。', 2008, 4);
		expect(ev).toMatchObject({ month: 4, day: 15, precision: 'day', text: 'そごう主要店舗が閉店。' });
	});

	it('removes the second date of a date range from the text', () => {
		const ev = parseBulletLine('[[10月22日]] - [[10月24日]] - 首脳会議が開催。', 2024, 10);
		expect(ev).toMatchObject({ day: 22, text: '首脳会議が開催。' });
	});

	it('removes a season prefix from the text', () => {
		expect(parseBulletLine('夏 - 何かが流行した。', 1932, null)?.text).toBe('何かが流行した。');
	});

	it('takes a 【region】 tag as a region hint and removes it from the text', () => {
		expect(parseBulletLine('[[8月8日]] - 【日本】閉会式が行われた。', 2021, 8)).toMatchObject({
			text: '閉会式が行われた。',
			regionHint: 'japan',
		});
		expect(parseBulletLine('【アメリカ合衆国】大統領選挙。', 2021, 11)?.regionHint).toBe('world');
		// When the tag doubles as the subject, put the word back into the body
		expect(parseBulletLine('【日本】の皇族が成年を迎えた。', 2021, 12)?.text).toBe(
			'日本の皇族が成年を迎えた。',
		);
		// Drop the leftovers from flag-template removal (a leading particle)
		expect(parseBulletLine('{{BRA}}の前大統領が演説した。', 2023, 1)?.text).toBe(
			'前大統領が演説した。',
		);
		expect(parseBulletLine('【世界・日本】共同声明。', 2021, 1)?.regionHint).toBe('both');
		expect(parseBulletLine('【日本・アメリカ合衆国】首脳会談。', 2021, 1)?.regionHint).toBe('both');
	});
});

describe('parseDateOnly', () => {
	it('detects date-only lines', () => {
		expect(parseDateOnly('[[10月1日]]')).toEqual({ month: 10, day: 1, precision: 'day' });
		expect(parseDateOnly('[[3月]] -')).toEqual({ month: 3, day: null, precision: 'month' });
		expect(parseDateOnly('10月1日')).toEqual({ month: 10, day: 1, precision: 'day' });
		expect(parseDateOnly('[[10月1日]]：')).toEqual({ month: 10, day: 1, precision: 'day' });
		expect(parseDateOnly('10月1日:')).toEqual({ month: 10, day: 1, precision: 'day' });
	});

	it('null for lines with text or invalid dates', () => {
		expect(parseDateOnly('[[10月1日]] - 何かが起きた。')).toBeNull();
		expect(parseDateOnly('[[13月1日]]')).toBeNull();
		expect(parseDateOnly('[[2月32日]]')).toBeNull();
		expect(parseDateOnly('何か')).toBeNull();
	});
});

describe('parseYearPage', () => {
	const page = [
		'導入文',
		'== できごと ==',
		'{{main|1964年の日本}}',
		'=== 1月 ===',
		'* [[1月27日]] - [[中華人民共和国]]と[[フランス]]が国交樹立。',
		'* [[2月]] - 月のみのできごと。',
		'* {{main|テンプレートのみの行}}',
		'** 本文つき親の下のネストは補足なので無視される',
		'補足の地の文も無視される',
		'=== 10月 ===',
		'* [[10月1日]]',
		'** [[東海道新幹線]]開業。',
		'** [[富士山レーダー]]完成。',
		'** {{see also|テンプレートのみのネスト行}}',
		'* [[10月3日]] - [[日本武道館]]開館。',
		'<!--',
		'* [[10月4日]] - コメントアウトされたできごと。',
		'-->',
		'=== 日付不明 ===',
		'* [[国際連合]]関連のできごと。',
		'== 誕生 ==',
		'* [[1月1日]] - 誰かが生まれた。',
	].join('\n');

	it('handles month headings, nesting, comments and other sections', () => {
		const events = parseYearPage(page, 1964);
		expect(events.map((e) => e.text)).toEqual([
			'中華人民共和国とフランスが国交樹立。',
			'月のみのできごと。',
			'東海道新幹線開業。',
			'富士山レーダー完成。',
			'日本武道館開館。',
			'国際連合関連のできごと。',
		]);
		expect(events[2]).toMatchObject({ month: 10, day: 1, precision: 'day' });
		expect(events[3]).toMatchObject({ month: 10, day: 1, precision: 'day' });
		expect(events[5].precision).toBe('year');
	});

	it('clears pending when a regular bullet follows a date-only line', () => {
		const p = [
			'== できごと ==',
			'=== 10月 ===',
			'* [[10月1日]]',
			'* [[10月3日]] - 通常のできごと。',
			'** これは補足なので無視。',
		].join('\n');
		const events = parseYearPage(p, 1964);
		expect(events).toHaveLength(1);
		expect(events[0].text).toBe('通常のできごと。');
	});

	it('takes nested lines as that day events under a colon-separated date-only parent', () => {
		const p = [
			'== できごと ==',
			'=== 1月 ===',
			'* [[1月13日]]：',
			'** [[エルサルバドル大地震]]発生。',
		].join('\n');
		const events = parseYearPage(p, 2001);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ month: 1, day: 13, precision: 'day' });
		expect(events[0].text).toBe('エルサルバドル大地震発生。');
	});

	it('empty array for a page without an events section', () => {
		expect(parseYearPage('== 誕生 ==\n* [[1月1日]] - 誰か', 1900)).toEqual([]);
	});
});

describe('fnv1a', () => {
	it('matches a known value (stable ID)', () => {
		expect(fnv1a('')).toBe('811c9dc5');
		expect(fnv1a('a')).toBe('e40c292c');
	});

	it('different input gives a different hash', () => {
		expect(fnv1a('東京オリンピック')).not.toBe(fnv1a('大阪万博'));
	});
});

describe('eventDateAndId', () => {
	it('day precision keeps the date as is', () => {
		const { date, id } = eventDateAndId({
			year: 1964,
			month: 10,
			day: 10,
			precision: 'day',
			text: '東京オリンピック開幕。',
			links: [],
		});
		expect(date).toBe('1964-10-10');
		expect(id).toBe(`1964-10-10-${fnv1a('東京オリンピック開幕。')}`);
	});

	it('month/year precision pads with 01', () => {
		expect(
			eventDateAndId({ year: 1900, month: null, day: null, precision: 'year', text: 'x', links: [] })
				.date,
		).toBe('1900-01-01');
	});
});

describe('date formats that used to be missed', () => {
	it('takes the date from a line separated by a full-width colon (whole pages use it, e.g. 1953 Japan)', () => {
		const ev = parseBulletLine('1月13日：[[エルサルバドル大地震]]発生。M7.8。', 2001, 1);
		expect(ev).toMatchObject({ month: 1, day: 13, precision: 'day' });
		expect(ev?.text).toBe('エルサルバドル大地震発生。M7.8。');
	});

	it('collapses a date range to its start (～, 〜, から)', () => {
		expect(
			parseBulletLine('[[8月25日]]～[[8月26日|26日]]: [[明治17年の台風]]による被害', 1884, 8),
		).toMatchObject({ month: 8, day: 25, precision: 'day' });
		expect(
			parseBulletLine('[[3月6日]]〜[[3月15日]] - ドイツ軍が攻勢をかける', 1945, 3),
		).toMatchObject({ month: 3, day: 6, precision: 'day' });
		expect(
			parseBulletLine('4月12日から[[4月14日|14日]] - ダブリンで会談', 1943, 4),
		).toMatchObject({ month: 4, day: 12, precision: 'day' });
	});

	it('leaves no second date in the text after collapsing a range', () => {
		expect(parseBulletLine('[[3月6日]]〜[[3月15日]] - ドイツ軍が攻勢', 1945, 3)?.text).toBe(
			'ドイツ軍が攻勢',
		);
	});

	it('drops the 日付不明 marker from the text (keeps month precision)', () => {
		const ev = parseBulletLine('日付不明 - コンドーム自販機の登場。大阪市に設置。', 1969, 6);
		expect(ev).toMatchObject({ month: 6, day: null, precision: 'month' });
		expect(ev?.text).toBe('コンドーム自販機の登場。大阪市に設置。');
	});

	it('does not mistake a non-date full-width colon for a separator', () => {
		const ev = parseBulletLine('[[瀬戸内海]]サメ騒動：漁師がサメに襲われる', 1992, 3);
		expect(ev?.text).toBe('瀬戸内海サメ騒動：漁師がサメに襲われる');
		expect(ev?.day).toBe(null);
	});
});
