// Diff-sync build-e/*.html (moved from build/e by scripts/split-pages.mjs) to the R2 bucket (S3-compatible API).
// Usage: node --env-file=.env.r2 scripts/r2-sync.mjs [--dry-run] [--allow-mass-delete]
// Env vars: R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY (required), R2_BUCKET / R2_ACCOUNT_ID (optional)
// Compare against manifest.json in R2 (key → sha256): PUT only what changed, DELETE what disappeared.
// If a DELETE fails, the old hash stays in the manifest and it is retried on the next run.
// --allow-mass-delete: disables the safety valve that trips on "mass deletion" (local is empty, or del exceeds 10% of remote).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	DeleteObjectsCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { isMassDelete, parseManifest, planSync, sha256 } from './lib/r2-plan.mjs';

// Preview builds on Workers Builds (anything but main) must not touch the production bucket.
// WORKERS_CI and WORKERS_CI_BRANCH are injected by Workers Builds by default.
if (process.env.WORKERS_CI && process.env.WORKERS_CI_BRANCH && process.env.WORKERS_CI_BRANCH !== 'main') {
	console.log(`非 production ブランチ（${process.env.WORKERS_CI_BRANCH}）: R2 同期をスキップ`);
	process.exit(0);
}

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '17fd86bd10e0418c9c8e62644699c879';
const BUCKET = process.env.R2_BUCKET ?? 'chronoscroll-pages';
const MANIFEST_KEY = 'manifest.json';
const DIR = 'build-e';
const CONCURRENCY = 32;
const dryRun = process.argv.includes('--dry-run');

for (const name of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
	if (!process.env[name]) {
		console.error(`${name} が未設定（.env.r2 を node --env-file で読むか、環境変数で渡す）`);
		process.exit(1);
	}
}

const s3 = new S3Client({
	region: 'auto',
	endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
	credentials: {
		accessKeyId: process.env.R2_ACCESS_KEY_ID,
		secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
	},
});

const local = {};
for (const f of readdirSync(DIR)) {
	if (f.endsWith('.html')) local[`e/${f}`] = sha256(readFileSync(join(DIR, f)));
}

let remote = {};
try {
	const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: MANIFEST_KEY }));
	remote = parseManifest(await res.Body.transformToString());
} catch (e) {
	if (e?.name !== 'NoSuchKey') throw e;
}

const plan = planSync(local, remote);
console.log(
	`local ${Object.keys(local).length} / remote ${Object.keys(remote).length} → ` +
		`put ${plan.put.length} / del ${plan.del.length} / skip ${plan.skip.length}${dryRun ? '（dry-run）' : ''}`,
);
if (isMassDelete(plan, Object.keys(local).length, Object.keys(remote).length) && !process.argv.includes('--allow-mass-delete')) {
	console.error(`大量削除の疑い（local ${Object.keys(local).length} / del ${plan.del.length} / remote ${Object.keys(remote).length}）。意図した削除なら --allow-mass-delete を付けて再実行`);
	process.exit(1);
}
if (dryRun) process.exit(0);

let next = 0;
let done = 0;
const failed = new Set();
async function uploader() {
	while (next < plan.put.length) {
		const key = plan.put[next++];
		try {
			await s3.send(
				new PutObjectCommand({
					Bucket: BUCKET,
					Key: key,
					Body: readFileSync(join(DIR, key.slice('e/'.length))),
					ContentType: 'text/html; charset=utf-8',
				}),
			);
		} catch (e) {
			failed.add(key);
			console.error(`PUT 失敗: ${key}: ${e.message}`);
		}
		if (++done % 1000 === 0) console.log(`put ${done}/${plan.put.length}`);
	}
}
await Promise.all(Array.from({ length: CONCURRENCY }, uploader));

const failedDel = new Set();
for (let i = 0; i < plan.del.length; i += 1000) {
	const res = await s3.send(
		new DeleteObjectsCommand({
			Bucket: BUCKET,
			Delete: { Objects: plan.del.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
		}),
	);
	for (const { Key, Code, Message } of res.Errors ?? []) {
		failedDel.add(Key);
		console.error(`DELETE 失敗: ${Key}: ${Code} ${Message}`);
	}
}

// Reflect only the successful ones in the manifest (failed PUTs become put targets again next time,
// failed DELETEs keep the old hash from remote and become del targets again next time)
const manifest = Object.fromEntries(Object.entries(local).filter(([key]) => !failed.has(key)));
for (const key of failedDel) manifest[key] = remote[key];
await s3.send(
	new PutObjectCommand({
		Bucket: BUCKET,
		Key: MANIFEST_KEY,
		Body: JSON.stringify(manifest),
		ContentType: 'application/json',
	}),
);
console.log(`manifest 更新（${Object.keys(manifest).length} 件）`);
if (failed.size || failedDel.size) {
	console.error(`PUT失敗 ${failed.size} 件・DELETE失敗 ${failedDel.size} 件。再実行で再送・再削除される`);
	process.exit(1);
}
