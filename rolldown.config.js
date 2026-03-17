const production = !process.env.ROLLUP_WATCH;

export default {
	input: "src/main.mjs",
	output: {
		file: "dist/module.js",
		format: "es",
		sourcemap: !production,
		codeSplitting: false,
		format: "iife",
		minify: true
	},
	checks: {
		circularDependency: true
	}
};
