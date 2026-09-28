// config/security-headers.json → static/_headers. Runs at the start of npm run build.
import { readFileSync, writeFileSync } from 'node:fs';
import { renderHeadersFile } from './lib/headers.mjs';

const security = JSON.parse(readFileSync('config/security-headers.json', 'utf8'));
writeFileSync('static/_headers', renderHeadersFile(security));
console.log('static/_headers を生成');
