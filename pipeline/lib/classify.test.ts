import { describe, expect, it } from 'vitest';
import { classify, classifyCategory, classifyRegion } from './classify.ts';

describe('classifyCategory', () => {
	it('各カテゴリの代表例を分類する', () => {
		expect(classifyCategory('関東大震災が発生。')).toBe('disaster');
		expect(classifyCategory('太平洋戦争が開戦。')).toBe('war');
		expect(classifyCategory('東京オリンピック開幕。')).toBe('sports');
		expect(classifyCategory('人工衛星の打ち上げに成功。')).toBe('science');
		expect(classifyCategory('株価が大暴落し金融危機に。')).toBe('economy');
		expect(classifyCategory('テレビ放送開始。')).toBe('culture');
		expect(classifyCategory('新内閣が発足。')).toBe('politics');
	});

	it('優先順位: 災害は戦争より先に判定される', () => {
		expect(classifyCategory('空襲による大火災が発生。')).toBe('disaster');
	});

	it('どれにも該当しなければ society', () => {
		expect(classifyCategory('三億円事件が起きる。')).toBe('society');
	});
});

describe('classifyRegion', () => {
	it('日本の地名・制度で japan', () => {
		expect(classifyRegion('東京で市電が開業。')).toBe('japan');
		expect(classifyRegion('神奈川県で何かが起きた。')).toBe('japan');
	});

	it('外国名・国際機関で world', () => {
		expect(classifyRegion('アメリカで大統領選挙。')).toBe('world');
		expect(classifyRegion('国際連合が発足。')).toBe('world');
	});

	it('両方含めば both', () => {
		expect(classifyRegion('日本とアメリカが条約に調印。')).toBe('both');
	});

	it('手がかりなし: カタカナ4連続以上は world、なければ japan', () => {
		expect(classifyRegion('レントゲンがエックス線を発見。')).toBe('world');
		expect(classifyRegion('電話交換業務が始まる。')).toBe('japan');
	});
});

describe('classify (サイドカー上書き)', () => {
	it('サイドカーがなければルールベースの結果', () => {
		expect(classify('id1', '新内閣が発足。')).toEqual({ category: 'politics', region: 'japan' });
	});

	it('regionHintはルールベースより優先、サイドカーはさらに優先', () => {
		expect(classify('id1', '新内閣が発足。', {}, 'world').region).toBe('world');
		expect(classify('id1', '新内閣が発足。', { id1: { region: 'both' } }, 'world').region).toBe(
			'both',
		);
	});

	it('サイドカーが部分上書きする', () => {
		const sidecar = { id1: { category: 'society' as const } };
		expect(classify('id1', '新内閣が発足。', sidecar)).toEqual({
			category: 'society',
			region: 'japan',
		});
	});

	it('サイドカーが region のみ上書き（category はルールベース）', () => {
		const sidecar = { id1: { region: 'both' as const } };
		expect(classify('id1', '新内閣が発足。', sidecar)).toEqual({
			category: 'politics',
			region: 'both',
		});
	});

	it('サイドカーで両方上書きもできる', () => {
		const sidecar = { id1: { category: 'war' as const, region: 'world' as const } };
		expect(classify('id1', '何かが起きた。', sidecar)).toEqual({
			category: 'war',
			region: 'world',
		});
	});
});
