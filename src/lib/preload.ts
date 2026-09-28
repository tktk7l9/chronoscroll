/**
 * Image prefetch for the detail modal.
 *
 * Images are fetched only after the modal opens, so right after opening the frame sits empty
 * (measured at about 1.2s on 1.6 Mbps). Fetching when the pointer lands on a card means
 * the image is already in the cache when it opens.
 *
 * But fetching for cards the pointer merely crosses on the timeline wastes traffic, so it only starts
 * after dwelling for a while. The same URL is fetched only once.
 */

/** Only the part of navigator.connection used to decide on prefetching */
export interface ConnectionLike {
	saveData?: boolean;
	effectiveType?: string;
}

export interface ImagePreloader {
	/** Hover start. Fetch after dwelling dwellMs */
	schedule(url: string | null | undefined): void;
	/** Fetch without waiting, e.g. right before a click */
	preloadNow(url: string | null | undefined): void;
	/** Hover end. Cancel the pending prefetch */
	cancel(): void;
}

export interface PreloaderOptions {
	/** How long the hover must last before fetching (default 120ms) */
	dwellMs?: number;
	/** No prefetching while this returns true */
	skip?: () => boolean;
}

/**
 * Do not prefetch with Data Saver on or on a slow connection.
 * Browsers without connection support (Safari etc.) give undefined, so prefetch.
 */
export function prefersReducedData(connection: ConnectionLike | undefined): boolean {
	if (!connection) return false;
	if (connection.saveData === true) return true;
	const type = connection.effectiveType ?? '';
	return type === '2g' || type === 'slow-2g';
}

export function createImagePreloader(
	load: (url: string) => void,
	options: PreloaderOptions = {},
): ImagePreloader {
	const dwellMs = options.dwellMs ?? 120;
	const requested = new Set<string>();
	let timer: ReturnType<typeof setTimeout> | null = null;

	function cancel(): void {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	}

	/** Whether the URL should be fetched (false if unset, already fetched, or prefetch disabled) */
	function wanted(url: string | null | undefined): url is string {
		if (!url || requested.has(url)) return false;
		return !options.skip?.();
	}

	function run(url: string): void {
		requested.add(url);
		load(url);
	}

	return {
		schedule(url) {
			cancel();
			if (!wanted(url)) return;
			timer = setTimeout(() => {
				timer = null;
				run(url);
			}, dwellMs);
		},
		preloadNow(url) {
			cancel();
			if (!wanted(url)) return;
			run(url);
		},
		cancel,
	};
}
