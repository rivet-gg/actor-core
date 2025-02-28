import defaultConfig from "../../tsup.base.ts";
import { defineConfig } from "tsup";
import Macros from "unplugin-macros/esbuild";
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin";

export default defineConfig({
	...defaultConfig,
	entry: ["src/mod.ts"],
	target: "esnext",
	format: "esm",
	dts: false,
	// sourcemap: true,
	// define: {
	// 	"process.env.SENTRY_DSN": JSON.stringify(process.env.SENTRY_DSN || ""),
	// },
	esbuildPlugins: [
		// @ts-ignore
		Macros(),
		// sentryEsbuildPlugin({
		// 	authToken: process.env.SENTRY_AUTH_TOKEN,
		// 	org: "rivet-gaming",
		// 	project: "actor-core-cli",
		// }),
	],
});
