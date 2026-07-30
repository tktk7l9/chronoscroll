export interface SponsorConfig {
	name: string;
	imageSrc: string;
	imageWidth: number;
	imageHeight: number;
	href: string;
	alt: string;
}

/** 未契約時は null。SponsorSlot はこの値がnull（または不正）なら何も描画しない */
export const CURRENT_SPONSOR: SponsorConfig | null = null;

/** CSPのimg-src 'self'を保つためのガード。同一オリジンの絶対パスのみ許可する */
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
