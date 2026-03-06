import js from "@eslint/js";
import stylisticJs from "@stylistic/eslint-plugin-js";
import { defineConfig } from "eslint/config";
import globals from "globals";

export default defineConfig([
	{
		files: ["./src/**/*.{js,mjs,cjs}"],
		plugins: {
			js,
			"@stylistic/js": stylisticJs
		},
		extends: ["js/recommended"],
		languageOptions: {
			globals: globals.browser
		},
		rules: {
			"@stylistic/js/array-bracket-newline": ["error", "consistent"],
			"@stylistic/js/array-bracket-spacing": ["error", "never"],
			"@stylistic/js/array-element-newline": ["error", "consistent"],
			"@stylistic/js/arrow-parens": ["error", "as-needed"],
			"@stylistic/js/arrow-spacing": "error",
			"@stylistic/js/comma-dangle": ["error", "never"],
			"@stylistic/js/comma-spacing": ["error", { "before": false, "after": true }],
			"@stylistic/js/comma-style": ["error", "last"],
			"@stylistic/js/computed-property-spacing": ["error", "never"],
			"@stylistic/js/function-call-spacing": ["error", "never"],
			"@stylistic/js/function-paren-newline": ["error", "consistent"],
			"@stylistic/js/indent": ["error", "tab", { "SwitchCase": 1 }],
			"@stylistic/js/key-spacing": "error",
			"@stylistic/js/keyword-spacing": "error",
			"@stylistic/js/line-comment-position": "off",
			"@stylistic/js/lines-around-comment": "off",
			"@stylistic/js/lines-between-class-members": ["error", "always"],
			"@stylistic/js/no-extra-parens": ["error", "all", { "nestedBinaryExpressions": false }],
			"@stylistic/js/no-extra-semi": "error",
			"@stylistic/js/no-floating-decimal": "error",
			"@stylistic/js/no-mixed-operators": "error",
			"@stylistic/js/no-multi-spaces": "error",
			"@stylistic/js/no-trailing-spaces": "error",
			"@stylistic/js/no-whitespace-before-property": "error",
			"@stylistic/js/object-curly-spacing": ["error", "always"],
			"@stylistic/js/quote-props": ["error", "consistent"],
			"@stylistic/js/quotes": ["error", "double", { "avoidEscape": true, "allowTemplateLiterals": "avoidEscape" }],
			"@stylistic/js/rest-spread-spacing": ["error", "never"],
			"@stylistic/js/semi-spacing": "error",
			"@stylistic/js/semi-style": ["error", "last"],
			"@stylistic/js/semi": ["error", "always"],
			"@stylistic/js/space-before-blocks": "error",
			"@stylistic/js/space-before-function-paren": ["error", { "anonymous": "never", "named": "never", "asyncArrow": "always" }],
			"@stylistic/js/space-in-parens": ["error", "never"],
			"@stylistic/js/space-infix-ops": "error",
			"@stylistic/js/space-unary-ops": "error",
			"@stylistic/js/spaced-comment": ["error", "always"],
			"@stylistic/js/switch-colon-spacing": "error",
			"@stylistic/js/template-curly-spacing": "error",
			"@stylistic/js/template-tag-spacing": "error",
			"no-undef": "off",
			"no-unused-vars": ["warn", { "ignoreRestSiblings": true }],
			"prefer-const": "warn"
		}
	}
]);
