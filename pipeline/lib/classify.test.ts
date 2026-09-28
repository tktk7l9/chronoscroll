import { describe, expect, it } from 'vitest';
import { classify, classifyCategory, classifyRegion } from './classify.ts';

describe('classifyCategory', () => {
	it('classifies a representative example of each category', () => {
		expect(classifyCategory('関東大震災が発生。')).toBe('disaster');
		expect(classifyCategory('太平洋戦争が開戦。')).toBe('war');
		expect(classifyCategory('東京オリンピック開幕。')).toBe('sports');
		expect(classifyCategory('人工衛星の打ち上げに成功。')).toBe('science');
		expect(classifyCategory('株価が大暴落し金融危機に。')).toBe('economy');
		expect(classifyCategory('テレビ放送開始。')).toBe('culture');
		expect(classifyCategory('新内閣が発足。')).toBe('politics');
	});

	it('priority: disaster is checked before war', () => {
		expect(classifyCategory('空襲による大火災が発生。')).toBe('disaster');
	});

	it('society when nothing matches', () => {
		expect(classifyCategory('三億円事件が起きる。')).toBe('society');
	});
});

describe('classifyRegion', () => {
	it('japan for Japanese places and institutions', () => {
		expect(classifyRegion('東京で市電が開業。')).toBe('japan');
		expect(classifyRegion('神奈川県で何かが起きた。')).toBe('japan');
	});

	it('world for foreign names and international bodies', () => {
		expect(classifyRegion('アメリカで大統領選挙。')).toBe('world');
		expect(classifyRegion('国際連合が発足。')).toBe('world');
	});

	it('both when it contains both', () => {
		expect(classifyRegion('日本とアメリカが条約に調印。')).toBe('both');
	});

	it('no clue: world for 4+ consecutive katakana, otherwise japan', () => {
		expect(classifyRegion('レントゲンがエックス線を発見。')).toBe('world');
		expect(classifyRegion('電話交換業務が始まる。')).toBe('japan');
	});
});

describe('classify (sidecar override)', () => {
	it('rule-based result without a sidecar', () => {
		expect(classify('id1', '新内閣が発足。')).toEqual({ category: 'politics', region: 'japan' });
	});

	it('regionHint beats rules and the sidecar beats both', () => {
		expect(classify('id1', '新内閣が発足。', {}, 'world').region).toBe('world');
		expect(classify('id1', '新内閣が発足。', { id1: { region: 'both' } }, 'world').region).toBe(
			'both',
		);
	});

	it('the sidecar partially overrides', () => {
		const sidecar = { id1: { category: 'society' as const } };
		expect(classify('id1', '新内閣が発足。', sidecar)).toEqual({
			category: 'society',
			region: 'japan',
		});
	});

	it('the sidecar overrides only region (category stays rule-based)', () => {
		const sidecar = { id1: { region: 'both' as const } };
		expect(classify('id1', '新内閣が発足。', sidecar)).toEqual({
			category: 'politics',
			region: 'both',
		});
	});

	it('the sidecar can override both', () => {
		const sidecar = { id1: { category: 'war' as const, region: 'world' as const } };
		expect(classify('id1', '何かが起きた。', sidecar)).toEqual({
			category: 'war',
			region: 'world',
		});
	});
});
