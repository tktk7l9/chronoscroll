// build/e（27,000 本超のイベント個別ページ）を build-e/ へ移す。
// wrangler deploy は build/ を丸ごと静的アセットにするため、無料枠（20,000 ファイル）を
// 超えないよう R2 で配信する分をアセットから外す。R2 への同期は scripts/r2-sync.mjs。
import { existsSync, renameSync, rmSync } from 'node:fs';

if (existsSync('build/e')) {
	rmSync('build-e', { recursive: true, force: true });
	renameSync('build/e', 'build-e');
	console.log('build/e → build-e/（R2 配信分をアセットから分離）');
}
