// R2 同期の差分計算（純関数）。I/O は scripts/r2-sync.mjs が持つ。
import { createHash } from 'node:crypto';

/** @param {Buffer | string} data */
export function sha256(data) {
	return createHash('sha256').update(data).digest('hex');
}

/**
 * @param {Record<string, string>} local  キー → sha256（ビルド成果物）
 * @param {Record<string, string>} remote キー → sha256（R2 の manifest.json）
 */
export function planSync(local, remote) {
	const put = [];
	const skip = [];
	for (const [key, hash] of Object.entries(local)) (remote[key] === hash ? skip : put).push(key);
	const del = Object.keys(remote).filter((key) => !(key in local));
	return { put: put.sort(), del: del.sort(), skip: skip.sort() };
}

/** manifest が無い・壊れている・配列のときは空＝全件 PUT に倒す（削除はしない） */
export function parseManifest(text) {
	try {
		const v = JSON.parse(text);
		return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {};
	} catch {
		return {};
	}
}
