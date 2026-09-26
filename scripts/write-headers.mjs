// config/security-headers.json → static/_headers。npm run build の先頭で実行する。
import { readFileSync, writeFileSync } from 'node:fs';
import { renderHeadersFile } from './lib/headers.mjs';

const security = JSON.parse(readFileSync('config/security-headers.json', 'utf8'));
writeFileSync('static/_headers', renderHeadersFile(security));
console.log('static/_headers を生成');
