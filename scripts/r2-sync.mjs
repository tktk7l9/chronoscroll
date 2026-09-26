// build-e/*.html（scripts/split-pages.mjs が build/e から移したもの）を R2 バケットへ差分同期する（S3 互換 API）。
// 使い方: node --env-file=.env.r2 scripts/r2-sync.mjs [--dry-run]
// 環境変数: R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY（必須）、R2_BUCKET / R2_ACCOUNT_ID（任意）
// R2 の manifest.json（キー → sha256）と突き合わせ、変わったものだけ PUT・消えたものは DELETE。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	DeleteObjectsCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { parseManifest, planSync, sha256 } from './lib/r2-plan.mjs';

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

for (let i = 0; i < plan.del.length; i += 1000) {
	await s3.send(
		new DeleteObjectsCommand({
			Bucket: BUCKET,
			Delete: { Objects: plan.del.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
		}),
	);
}

// 成功した分だけ manifest に反映する（失敗分は次回また put の対象になる）
const manifest = Object.fromEntries(Object.entries(local).filter(([key]) => !failed.has(key)));
await s3.send(
	new PutObjectCommand({
		Bucket: BUCKET,
		Key: MANIFEST_KEY,
		Body: JSON.stringify(manifest),
		ContentType: 'application/json',
	}),
);
console.log(`manifest 更新（${Object.keys(manifest).length} 件）`);
if (failed.size) {
	console.error(`${failed.size} 件失敗。再実行で再送される`);
	process.exit(1);
}
