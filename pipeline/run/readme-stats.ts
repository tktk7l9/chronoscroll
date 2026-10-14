/**
 * Check or rewrite the data-scale numbers quoted in README.md (IO layer, excluded from the coverage gate).
 *
 *   npx tsx pipeline/run/readme-stats.ts          lists stale numbers (exit 1 if any)
 *   npx tsx pipeline/run/readme-stats.ts --write  rewrites them; data-refresh.yml runs this before the tests
 *
 * The numbers come from the committed data (static/data/chunks, static/data/collections.json) and the content
 * files, never from the network. The hand-written per-collection list is only reported (see readme-stats.ts).
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CollectionsIndex, NewsEvent } from '../../src/lib/types.ts';
import { collectionCuratedEntries, parseCollectionYaml } from '../lib/collections.ts';
import { parseCuratedYaml } from '../lib/curate.ts';
import { computeReadmeStats, syncReadme, type ReadmeStats } from '../lib/readme-stats.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function yamlTexts(dir: string): string[] {
	return readdirSync(join(ROOT, dir))
		.filter((f) => /\.ya?ml$/.test(f))
		.sort()
		.map((f) => readFileSync(join(ROOT, dir, f), 'utf8'));
}

function loadReadmeStats(): ReadmeStats {
	const events: NewsEvent[] = [];
	const chunks = join(ROOT, 'static/data/chunks');
	for (const f of readdirSync(chunks)) events.push(...(JSON.parse(readFileSync(join(chunks, f), 'utf8')) as NewsEvent[]));
	const index = JSON.parse(readFileSync(join(ROOT, 'static/data/collections.json'), 'utf8')) as CollectionsIndex;
	const sources = yamlTexts('content/collections').map((t) => parseCollectionYaml(t));
	return computeReadmeStats({
		events,
		curated: yamlTexts('content/curated').reduce((n, t) => n + parseCuratedYaml(t).length, 0),
		collectionCounts: index.collections.map((c) => c.count),
		newlyWritten: collectionCuratedEntries(sources).filter((e) => e.date && e.title && e.summary).length,
	});
}

const path = join(ROOT, 'README.md');
const result = syncReadme(readFileSync(path, 'utf8'), loadReadmeStats());
for (const m of result.mismatches) console.log(`${m.field}: ${m.found} → ${m.expected}`);
for (const name of result.missing) console.error(`❌ ${name}: its line was not found exactly once in README.md`);
for (const p of result.listProblems) console.error(`❌ ${p} (edit the list in README.md by hand)`);
if (process.argv.includes('--write')) {
	if (result.mismatches.length > 0) writeFileSync(path, result.text);
	console.log(result.mismatches.length > 0 ? 'README.md updated' : 'README.md already up to date');
	if (result.missing.length > 0 || result.listProblems.length > 0) process.exit(1);
} else if (result.mismatches.length > 0 || result.missing.length > 0 || result.listProblems.length > 0) {
	process.exit(1);
} else {
	console.log('README.md numbers match the data');
}
