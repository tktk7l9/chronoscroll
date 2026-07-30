import { describe, expect, it } from 'vitest';
import { isSelfHostedPath, validateSponsor, type SponsorConfig } from './sponsor.ts';

describe('isSelfHostedPath', () => {
	it('絶対パスはtrue', () => {
		expect(isSelfHostedPath('/sponsor/x.png')).toBe(true);
	});

	it('プロトコル相対URL(//)はfalse', () => {
		expect(isSelfHostedPath('//evil.com/x.png')).toBe(false);
	});

	it('絶対URLはfalse', () => {
		expect(isSelfHostedPath('https://evil.com/x.png')).toBe(false);
	});

	it('data URIはfalse', () => {
		expect(isSelfHostedPath('data:image/png;base64,AAAA')).toBe(false);
	});
});

describe('validateSponsor', () => {
	const valid: SponsorConfig = {
		name: 'Acme',
		imageSrc: '/sponsor/acme.png',
		imageWidth: 300,
		imageHeight: 100,
		href: 'https://acme.example.com',
		alt: 'Acme',
	};

	it('妥当な設定はエラーなし', () => {
		expect(validateSponsor(valid)).toEqual([]);
	});

	it('imageSrcが外部URLならエラー', () => {
		expect(validateSponsor({ ...valid, imageSrc: 'https://evil.com/x.png' })).toEqual([
			'imageSrcは自己ホストの絶対パスである必要があります',
		]);
	});

	it('imageWidth/imageHeightが0以下ならエラー', () => {
		expect(validateSponsor({ ...valid, imageWidth: 0 })).toEqual([
			'imageWidth/imageHeightは正の数である必要があります',
		]);
		expect(validateSponsor({ ...valid, imageHeight: -1 })).toEqual([
			'imageWidth/imageHeightは正の数である必要があります',
		]);
	});

	it('hrefが絶対URLでなければエラー', () => {
		expect(validateSponsor({ ...valid, href: '/local-path' })).toEqual([
			'hrefは絶対URLである必要があります',
		]);
	});

	it('複数エラーは全て返す', () => {
		expect(
			validateSponsor({ ...valid, imageSrc: 'https://evil.com/x.png', imageWidth: 0, href: 'bad' }),
		).toEqual([
			'imageSrcは自己ホストの絶対パスである必要があります',
			'imageWidth/imageHeightは正の数である必要があります',
			'hrefは絶対URLである必要があります',
		]);
	});
});
