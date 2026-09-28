import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: [
			"src/lib/**/*.test.ts",
			"pipeline/**/*.test.ts",
			"worker/**/*.test.ts",
			"scripts/lib/**/*.test.mjs",
		],
		coverage: {
			provider: "v8",
			include: ["src/lib/*.ts", "pipeline/lib/**/*.ts", "worker/*.ts", "scripts/lib/*.mjs"],
			exclude: ["**/*.test.ts", "**/*.test.mjs", "worker/index.ts"],
			reporter: ["text", "json-summary", "html"],
			// Keep the pure logic layer (top level of src/lib + pipeline/lib + worker + scripts/lib) at 100%
			// UI components (src/lib/components) and IO scripts (pipeline/run, top level of scripts/*.mjs) are excluded
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
