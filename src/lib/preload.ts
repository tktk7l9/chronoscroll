/**
 * 詳細モーダルの画像先読み。
 *
 * 画像はモーダルを開いてから取りに行くため、開いた直後は枠が空のまま待たされる
 * （実測で1.6Mbps時 約1.2秒）。カードにポインタが乗った時点で取っておけば、
 * 開いた時にはキャッシュに載っている。
 *
 * ただし年表を横切っただけのカードまで取ると通信の無駄なので、一定時間留まって
 * から動く。同じURLは一度しか取りに行かない。
 */

/** navigator.connection のうち先読み判断に使う部分だけ */
export interface ConnectionLike {
	saveData?: boolean;
	effectiveType?: string;
}

export interface ImagePreloader {
	/** ホバー開始。dwellMs 留まったら取りに行く */
	schedule(url: string | null | undefined): void;
	/** クリック直前など、待たずに取りに行く */
	preloadNow(url: string | null | undefined): void;
	/** ホバー離脱。予約済みの先読みを取り消す */
	cancel(): void;
}

export interface PreloaderOptions {
	/** 取りに行くまでにホバーを継続する時間（既定120ms） */
	dwellMs?: number;
	/** true を返す間は先読みしない */
	skip?: () => boolean;
}

/**
 * データセーバー指定または低速回線では先読みしない。
 * connection 未対応のブラウザ（Safari等）は undefined が来るので先読みする。
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

	/** 取りに行くべきURLか（未指定・取得済み・先読み無効なら false） */
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
