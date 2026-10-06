import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
	test: {
		globals: true,
		projects: [
			{
				// Pure logic (node env). Component, worker and route tests belong to the ui project
				extends: true,
				test: {
					name: "lib",
					environment: "node",
					include: [
						"src/lib/**/*.test.ts",
						"pipeline/**/*.test.ts",
						"worker/**/*.test.ts",
						"scripts/lib/**/*.test.mjs",
					],
					exclude: [
						"**/node_modules/**",
						"src/**/*.svelte.test.ts",
						"src/lib/workers/**",
						"src/routes/**",
					],
				},
			},
			{
				// UI layer: Svelte components and routes rendered in jsdom with Testing Library
				extends: true,
				plugins: [
					svelte({
						compilerOptions: { runes: true },
						// Styles are irrelevant to behaviour; skip CSS processing in tests
						emitCss: false,
					}),
				],
				resolve: {
					// Load Svelte's client runtime (mount) instead of the server build
					conditions: ["browser"],
					alias: {
						"#lib": r("./src/lib"),
						"$app/env": r("./src/test/stubs/app-env.ts"),
						"$app/navigation": r("./src/test/stubs/app-navigation.ts"),
					},
				},
				test: {
					name: "ui",
					environment: "jsdom",
					include: [
						"src/**/*.svelte.test.ts",
						"src/lib/workers/*.test.ts",
						"src/routes/**/*.test.ts",
					],
					setupFiles: ["src/test/setup.ts"],
				},
			},
		],
		coverage: {
			provider: "v8",
			include: [
				"src/lib/*.ts",
				"pipeline/lib/**/*.ts",
				"worker/*.ts",
				"scripts/lib/*.mjs",
				// UI layer (measured; see the "ui" thresholds below)
				"src/lib/components/*.svelte",
				"src/lib/state/*.ts",
				"src/lib/workers/*.ts",
				"src/routes/**/*.{svelte,ts}",
			],
			exclude: ["**/*.test.ts", "**/*.test.mjs", "worker/index.ts"],
			reporter: ["text", "json-summary", "html"],
			// Pure logic layer (top of src/lib + pipeline/lib + worker + scripts/lib) stays at 100%
			// IO scripts (pipeline/run, top-level scripts/*.mjs) are excluded. The UI layer is guarded by the thresholds below
			thresholds: {
				"src/lib/*.ts": {
					statements: 100,
					branches: 100,
					functions: 100,
					lines: 100,
				},
				"pipeline/lib/**/*.ts": {
					statements: 100,
					branches: 100,
					functions: 100,
					lines: 100,
				},
				"worker/*.ts": {
					statements: 100,
					branches: 100,
					functions: 100,
					lines: 100,
				},
				"scripts/lib/*.mjs": {
					statements: 100,
					branches: 100,
					functions: 100,
					lines: 100,
				},
				// UI layer (components, state store, search worker, routes): reached level minus 2 points
				// so it cannot regress. Branch counts include Svelte template branches, hence the lower bar
				"src/{lib/components,lib/state,lib/workers,routes}/**": {
					statements: 97,
					branches: 83,
					functions: 97,
					lines: 98,
				},
			},
		},
	},
});
