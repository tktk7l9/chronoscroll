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
						$lib: r("./src/lib"),
						"$app/environment": r("./src/test/stubs/app-environment.ts"),
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
			// 純ロジック層（src/lib 直下 + pipeline/lib + worker + scripts/lib）は 100% を維持する
			// IOスクリプト(pipeline/run, scripts/*.mjs 直下)は対象外。UI層は下の閾値で別に守る
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
			},
		},
	},
});
