// Runs while the pages are prerendered (adapter-static): see src/lib/preload-priority.ts
import type { Handle } from '@sveltejs/kit/hooks';
import { lowerModulePreloadPriority } from '#lib/preload-priority.js';

export const handle: Handle = ({ event, resolve }) =>
	resolve(event, { transformPageChunk: ({ html }) => lowerModulePreloadPriority(html) });
