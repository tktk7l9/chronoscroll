export interface SponsorConfig {
	name: string;
	imageSrc: string;
	imageWidth: number;
	imageHeight: number;
	href: string;
	alt: string;
}

/** null when there is no contract. SponsorSlot renders nothing when this is null (or invalid) */
export const CURRENT_SPONSOR: SponsorConfig | null = null;

/** Guard to keep CSP img-src 'self'. Only same-origin absolute paths are allowed */
export function isSelfHostedPath(src: string): boolean {
	return src.startsWith('/') && !src.startsWith('//');
}

export function validateSponsor(config: SponsorConfig): string[] {
	const errors: string[] = [];
	if (!isSelfHostedPath(config.imageSrc)) {
		errors.push('imageSrcは自己ホストの絶対パスである必要があります');
	}
	if (config.imageWidth <= 0 || config.imageHeight <= 0) {
		errors.push('imageWidth/imageHeightは正の数である必要があります');
	}
	if (!/^https?:\/\//.test(config.href)) {
		errors.push('hrefは絶対URLである必要があります');
	}
	return errors;
}
