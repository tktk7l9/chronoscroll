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
	it('できごとセクションを次の見出しまで取り出す', () => {
		const wt = '導入\n== できごと ==\n本文A\n== 誕生 ==\n本文B';
		expect(extractEventsSection(wt)).toBe('\n本文A\n');
	});

	it('「出来事」表記とスペースなし見出しにも対応する', () => {
		expect(extractEventsSection('==出来事==\nX\n== 死去 ==\nY')).toBe('\nX\n');
	});

	it('「出来事・事柄」のような変種見出しにも対応する（1995年ページ）', () => {
		expect(extractEventsSection('== 出来事・事柄 ==\nX\n== 周年 ==\nY')).toBe('\nX\n');
	});

	it('次のレベル2見出しがなければ末尾まで', () => {
		expect(extractEventsSection('== できごと ==\nA\n=== 1月 ===\nB')).toBe('\nA\n=== 1月 ===\nB');
	});

	it('セクションがなければ null', () => {
		expect(extractEventsSection('== 誕生 ==\nX')).toBeNull();
	});
});

describe('isDateLikeTarget', () => {
	it('日付・年・元号・年代リンクを除外対象と判定する', () => {
		expect(isDateLikeTarget('1月2日')).toBe(true);
		expect(isDateLikeTarget('11月22日 (旧暦)')).toBe(true);
		expect(isDateLikeTarget('3月')).toBe(true);
		expect(isDateLikeTarget('1964年')).toBe(true);
		expect(isDateLikeTarget('明治')).toBe(true);
		expect(isDateLikeTarget('昭和39年')).toBe(true);
		expect(isDateLikeTarget('1960年代')).toBe(true);
	});

	it('通常の記事リンクは除外しない', () => {
		expect(isDateLikeTarget('東京オリンピック')).toBe(false);
		expect(isDateLikeTarget('国際連合')).toBe(false);
	});
});

describe('stripMarkup', () => {
	it('コメント・refを除去する', () => {
		expect(stripMarkup('A<!-- コメント -->B<ref name="x"/>C<ref>出典</ref>D')).toBe('ABCD');
	});

	it('仮リンクはラベルに置換する', () => {
		expect(stripMarkup('{{仮リンク|パスタ戦争|en|Pasta War}}が起きた')).toBe('パスタ戦争が起きた');
	});

	it('ネストしたテンプレートを除去する', () => {
		expect(stripMarkup('A{{main|{{lang|en|X}}}}B')).toBe('AB');
	});

	it('強調記法を除去する', () => {
		expect(stripMarkup("'''太字'''と''斜体''")).toBe('太字と斜体');
	});

	it('HTMLタグはタグのみ除去して中身を残す', () => {
		expect(stripMarkup('プルトニウム (<sup>238</sup>Pu) を合成')).toBe(
			'プルトニウム (238Pu) を合成',
		);
	});
});

describe('replaceLinks', () => {
	it('リンクをラベルに置換して収集する', () => {
		const r = replaceLinks('[[中華人民共和国]]と[[フランス第五共和政|フランス]]が国交樹立。');
		expect(r.text).toBe('中華人民共和国とフランスが国交樹立。');
		expect(r.links).toEqual([
			{ target: '中華人民共和国', label: '中華人民共和国' },
			{ target: 'フランス第五共和政', label: 'フランス' },
		]);
	});

	it('日付リンクはテキストに残すが収集しない', () => {
		const r = replaceLinks('[[1964年]]の[[東京オリンピック]]');
		expect(r.text).toBe('1964年の東京オリンピック');
		expect(r.links).toEqual([{ target: '東京オリンピック', label: '東京オリンピック' }]);
	});

	it('ファイル・カテゴリリンクは本文ごと除去する', () => {
		const r = replaceLinks('[[ファイル:foo.jpg|thumb]]本文[[Category:何か]]');
		expect(r.text).toBe('本文');
		expect(r.links).toEqual([]);
	});
});

describe('parseBulletLine', () => {
	it('日付リンク付きの行を day precision で解析する', () => {
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

	it('旧暦注記（全角括弧内のリンク含む）をスキップする', () => {
		const ev = parseBulletLine(
			'[[1月2日]]（明治4年[[11月22日 (旧暦)|11月22日]]） - 府県廃合を完了（3府72県）。',
			1872,
			1,
		);
		expect(ev?.day).toBe(2);
		expect(ev?.precision).toBe('day');
		expect(ev?.text).toBe('府県廃合を完了（3府72県）。');
	});

	it('日付リンク自体が旧暦なら日単位の精度を主張しない', () => {
		const ev = parseBulletLine('[[1月2日 (旧暦)]] - 何かが起きた。', 1870, 1);
		expect(ev).toMatchObject({ month: 1, day: 2, precision: 'month' });
		expect(parseDateOnly('[[1月2日 (旧暦)]]')).toEqual({ month: 1, day: 2, precision: 'month' });
	});

	it('月のみリンクは month precision', () => {
		const ev = parseBulletLine('[[3月]] - 何かが起きた。', 1900, 1);
		expect(ev?.month).toBe(3);
		expect(ev?.day).toBeNull();
		expect(ev?.precision).toBe('month');
	});

	it('日付リンクなし・月セクション内は month precision', () => {
		const ev = parseBulletLine('[[国際連合]]で何かが決まった。', 1950, 6);
		expect(ev?.month).toBe(6);
		expect(ev?.precision).toBe('month');
	});

	it('日付リンクなし・セクション外は year precision', () => {
		const ev = parseBulletLine('この年の出来事。', 1900, null);
		expect(ev?.month).toBeNull();
		expect(ev?.precision).toBe('year');
	});

	it('空行やマークアップのみの行は null', () => {
		expect(parseBulletLine('', 1900, null)).toBeNull();
		expect(parseBulletLine('{{main|1964年の日本}}', 1964, null)).toBeNull();
		expect(parseBulletLine('[[ファイル:foo.jpg|thumb]]', 1964, 1)).toBeNull();
	});

	it('不正な月日は null', () => {
		expect(parseBulletLine('何か', 1900, 13)).toBeNull();
		expect(parseBulletLine('何か', 1900, 0)).toBeNull();
		expect(parseBulletLine('[[2月32日]] - 何か', 1900, null)).toBeNull();
		expect(parseBulletLine('[[2月0日]] - 何か', 1900, null)).toBeNull();
	});

	it('forced date（ネスト箇条書きの親日付）を使う', () => {
		const ev = parseBulletLine('[[東海道新幹線]]開業。', 1964, 10, {
			month: 10,
			day: 1,
			precision: 'day',
		});
		expect(ev).toMatchObject({ month: 10, day: 1, precision: 'day', text: '東海道新幹線開業。' });
	});

	it('テンプレート除去後の空括弧を掃除する', () => {
		const ev = parseBulletLine('[[10月10日]] - [[東京]]（{{JPN}}）で開会。', 1964, 10);
		expect(ev?.text).toBe('東京で開会。');
	});

	it('リンクなしの日付表記も解釈する', () => {
		const ev = parseBulletLine('4月15日 - そごう主要店舗が閉店。', 2008, 4);
		expect(ev).toMatchObject({ month: 4, day: 15, precision: 'day', text: 'そごう主要店舗が閉店。' });
	});

	it('日付レンジの2つ目の日付は本文から除去する', () => {
		const ev = parseBulletLine('[[10月22日]] - [[10月24日]] - 首脳会議が開催。', 2024, 10);
		expect(ev).toMatchObject({ day: 22, text: '首脳会議が開催。' });
	});

	it('季節プレフィックスは本文から除去する', () => {
		expect(parseBulletLine('夏 - 何かが流行した。', 1932, null)?.text).toBe('何かが流行した。');
	});

	it('【地域】タグを地域ヒントとして回収し本文から除く', () => {
		expect(parseBulletLine('[[8月8日]] - 【日本】閉会式が行われた。', 2021, 8)).toMatchObject({
			text: '閉会式が行われた。',
			regionHint: 'japan',
		});
		expect(parseBulletLine('【アメリカ合衆国】大統領選挙。', 2021, 11)?.regionHint).toBe('world');
		expect(parseBulletLine('【世界・日本】共同声明。', 2021, 1)?.regionHint).toBe('both');
		expect(parseBulletLine('【日本・アメリカ合衆国】首脳会談。', 2021, 1)?.regionHint).toBe('both');
	});
});

describe('parseDateOnly', () => {
	it('日付のみの行を検出する', () => {
		expect(parseDateOnly('[[10月1日]]')).toEqual({ month: 10, day: 1, precision: 'day' });
		expect(parseDateOnly('[[3月]] -')).toEqual({ month: 3, day: null, precision: 'month' });
		expect(parseDateOnly('10月1日')).toEqual({ month: 10, day: 1, precision: 'day' });
	});

	it('本文がある行や不正な日付は null', () => {
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

	it('月見出し・ネスト・コメント・他セクションを正しく扱う', () => {
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

	it('日付のみの行の後、通常の箇条書きが来たらpendingは解除される', () => {
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

	it('できごとセクションがないページは空配列', () => {
		expect(parseYearPage('== 誕生 ==\n* [[1月1日]] - 誰か', 1900)).toEqual([]);
	});
});

describe('fnv1a', () => {
	it('既知の値と一致する（安定ID）', () => {
		expect(fnv1a('')).toBe('811c9dc5');
		expect(fnv1a('a')).toBe('e40c292c');
	});

	it('異なる入力で異なるハッシュ', () => {
		expect(fnv1a('東京オリンピック')).not.toBe(fnv1a('大阪万博'));
	});
});

describe('eventDateAndId', () => {
	it('day precision はそのままの日付', () => {
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

	it('month/year precision は01埋め', () => {
		expect(
			eventDateAndId({ year: 1900, month: null, day: null, precision: 'year', text: 'x', links: [] })
				.date,
		).toBe('1900-01-01');
	});
});
