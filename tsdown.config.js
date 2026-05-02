import { defineConfig } from "tsdown";

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig({
	entry: ["./src/main.mjs"],
	outDir: "dist",
	outputOptions: {
		entryFileNames: "module.js",
	},
	format: "iife",
	platform: "browser",
	minify: isProduction,
	sourcemap: true,
	deps: {
		onlyBundle: false,
		alwaysBundle: () => true
	},
	css: {
		fileName: "module.css",
		minify: isProduction
	},
	copy: [
		{ from: "src/shared/assets/**", to: "dist/assets" }
	],
	checks: {
		circularDependency: true,
	}
});
