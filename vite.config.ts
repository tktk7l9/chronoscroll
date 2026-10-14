import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// Emit absolute paths (so import() still resolves after the inline boot script is externalized)
			paths: { relative: false },
			// One JS bundle and one stylesheet for the whole app (the timeline page loaded 14 modules and 5 stylesheets,
			// the event and collection pages 5-6 stylesheets). Lighthouse 13.5's simulation multiplexes only HTTP/2 and
			// models production's HTTP/3 as six connections per origin, so every request past six queued and pushed
			// the mobile FCP and LCP out. /c and /e render without client JS and load only the stylesheet
			output: { bundleStrategy: 'single' }
		})
	]
});
