// Diff calculation for the R2 sync (pure function). I/O lives in scripts/r2-sync.mjs.
import { createHash } from 'node:crypto';

/** @param {Buffer | string} data */
export function sha256(data) {
	return createHash('sha256').update(data).digest('hex');
}

/**
 * @param {Record<string, string>} local  key → sha256 (build output)
 * @param {Record<string, string>} remote key → sha256 (manifest.json in R2)
 */
export function planSync(local, remote) {
	const put = [];
	const skip = [];
	for (const [key, hash] of Object.entries(local)) (remote[key] === hash ? skip : put).push(key);
	const del = Object.keys(remote).filter((key) => !(key in local));
	return { put: put.sort(), del: del.sort(), skip: skip.sort() };
}

/** Safety valve against mass deletion. Stop if local is empty or del exceeds 10% of remote (override with --allow-mass-delete) */
export function isMassDelete(plan, localCount, remoteCount) {
	if (remoteCount === 0) return false;
	return localCount === 0 || plan.del.length > remoteCount * 0.1;
}

/** If the manifest is missing, broken, or an array, treat it as empty = PUT everything (never delete) */
export function parseManifest(text) {
	try {
		const v = JSON.parse(text);
		return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {};
	} catch {
		return {};
	}
}
