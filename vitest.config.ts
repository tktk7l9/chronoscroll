import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/lib/**/*.test.ts", "pipeline/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/lib/*.ts", "pipeline/lib/**/*.ts"],
			exclude: ["**/*.test.ts"],
			reporter: ["text", "json-summary", "html"],
			// 純ロジック層（src/lib 直下 + pipeline/lib）は 100% を維持する
			// UIコンポーネント(src/lib/components)と IOスクリプト(pipeline/run)は対象外
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
			},
		},
	},
});
