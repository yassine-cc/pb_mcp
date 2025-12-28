import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		"pb-mcp": "src/index.ts",
		"pb-mcp-http": "src/server/http-server.ts",
	},
	outDir: "dist",
	format: ["esm"],
	platform: "node",
	target: "node18",
	bundle: true,
	splitting: false,
	banner: {
		js: "#!/usr/bin/env node",
	},
	clean: true,
});
