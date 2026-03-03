import sourcemaps from "rollup-plugin-sourcemaps";

const production = !process.env.ROLLUP_WATCH;

export default {
	input: "src/main.mjs",
	output: {
		file: "dist/module.js",
		format: "es",
		sourcemap: !production
	},
	plugins: [
		sourcemaps()
	]
};
