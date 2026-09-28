import { describe, expect, it } from 'vitest';
import { isSelfHostedPath, validateSponsor, type SponsorConfig } from './sponsor.ts';

describe('isSelfHostedPath', () => {
	it('true for an absolute path', () => {
		expect(isSelfHostedPath('/sponsor/x.png')).toBe(true);
	});

	it('false for a protocol-relative URL (//)', () => {
		expect(isSelfHostedPath('//evil.com/x.png')).toBe(false);
	});

	it('false for an absolute URL', () => {
		expect(isSelfHostedPath('https://evil.com/x.png')).toBe(false);
	});

	it('false for a data URI', () => {
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

	it('no errors for a valid config', () => {
		expect(validateSponsor(valid)).toEqual([]);
	});

	it('error when imageSrc is an external URL', () => {
		expect(validateSponsor({ ...valid, imageSrc: 'https://evil.com/x.png' })).toEqual([
			'imageSrc must be a self-hosted absolute path',
		]);
	});

	it('error when imageWidth/imageHeight is 0 or less', () => {
		expect(validateSponsor({ ...valid, imageWidth: 0 })).toEqual([
			'imageWidth/imageHeight must be positive',
		]);
		expect(validateSponsor({ ...valid, imageHeight: -1 })).toEqual([
			'imageWidth/imageHeight must be positive',
		]);
	});

	it('error when href is not an absolute URL', () => {
		expect(validateSponsor({ ...valid, href: '/local-path' })).toEqual([
			'href must be an absolute URL',
		]);
	});

	it('returns all errors', () => {
		expect(
			validateSponsor({ ...valid, imageSrc: 'https://evil.com/x.png', imageWidth: 0, href: 'bad' }),
		).toEqual([
			'imageSrc must be a self-hosted absolute path',
			'imageWidth/imageHeight must be positive',
			'href must be an absolute URL',
		]);
	});
});
