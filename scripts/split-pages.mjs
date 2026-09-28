// Move build/e (27,000+ per-event pages) to build-e/.
// wrangler deploy turns all of build/ into static assets, so to stay under the free tier (20,000 files)
// the part served from R2 is removed from the assets. Syncing to R2 is done by scripts/r2-sync.mjs.
import { existsSync, renameSync, rmSync } from 'node:fs';

if (existsSync('build/e')) {
	rmSync('build-e', { recursive: true, force: true });
	renameSync('build/e', 'build-e');
	console.log('build/e -> build-e/ (splitting R2-served pages out of the assets)');
}
