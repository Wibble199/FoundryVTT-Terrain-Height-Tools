const isProduction = !process.env.ROLLUP_WATCH;

export default {
	input: "src/main.mjs",
	output: {
		file: "dist/module.js",
		format: "es",
		sourcemap: !isProduction,
		codeSplitting: false,
		format: "iife",
		minify: isProduction
	},
	checks: {
		circularDependency: true
	}
};
