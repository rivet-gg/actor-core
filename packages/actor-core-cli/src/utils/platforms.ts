import path from "node:path";
import dedent from "dedent";
import type { PackageJson } from "pkg-types";
import { removeExt, stringifyJson } from "./fs";
import { pkgFromUserAgent } from "./pkg";

interface ResolvedPlatform
	extends Omit<PlatformConfig, "modify">,
		Omit<PackageManagerConfig, "modify"> {
	files: Record<string, string>;
}

interface PlatformOutput {
	files: Record<string, string>;
}

interface PlatformOptions extends ExampleMetadata {
	version: string;
	files: Record<string, string>;
	pkgJson: PackageJson;
}

type PlatformConfigFn = (platformOpts: PlatformOptions) => PlatformOutput;
interface PlatformConfig {
	/**
	 * Whether the platform is deployable, and CLI should suggest to deploy it
	 */
	deployable?: boolean;
	modify: PlatformConfigFn;
}

interface PackageManagerConfig {
	cmds: {
		install: [string, string[]];
		run: [string, string[]];
		exec: [string, string[]];
	};
	modify: PlatformConfigFn;
}

const PLATFORMS = {
	// supabase: ({ files, version, pkgJson, actorImports, actorMap }) => {
	// 	files["package.json"] = stringifyJson({
	// 		...pkgJson,
	// 		devDependencies: {
	// 			"@actor-core/supabase": version,
	// 			...pkgJson.devDependencies,
	// 		},
	// 	});

	// 	files["src/index.ts"] = dedent`
	//         import { createHandler } from "@actor-core/supabase"
	//         ${actorImports("src/index.ts")}

	//         export default createHandler({
	//             actors: { ${actorMap} }
	//         });
	//     `;

	// 	return { files };
	// },
	 vercel: ({ files, version, pkgJson, actorImports, actorMap }) => {
		deployable: true,
	 	files["package.json"] = stringifyJson({
	 		...pkgJson,
	 		scripts: {
	 			...pkgJson.scripts,
	 			dev: "next dev",
	 			build: "next build",
	 			start: "next start",
				deploy: "vercel deploy",
	 		},
	 		devDependencies: {
	 			"@actor-core/vercel": version,
	 			next: "^14.0.0",
				"vercel": "^41.3.2",
	 			...pkgJson.devDependencies,
	 		},
	 	});

	 	files["src/api/actor/route.ts"] = dedent`
	         import { createHandler } from "@actor-core/vercel"
	         ${actorImports("./src/api/actor/route.ts")}

	         const handler = createHandler({
	             actors: { ${actorMap} }
	         });

	         export const GET = handler.GET;
	         export const POST = handler.POST;
	         export const PUT = handler.PUT;
	         export const DELETE = handler.DELETE;
	         export const PATCH = handler.PATCH;
	         export const HEAD = handler.HEAD;
	         export const OPTIONS = handler.OPTIONS;
	     `;

	 	return { files };
	 },
	rivet: {
		deployable: true,
		modify: ({ files, pkgJson, actorMap, actorImports, version }) => {
			files["package.json"] = stringifyJson({
				...pkgJson,
				scripts: {
					...pkgJson.scripts,
					deploy: "actor-core deploy rivet",
				},
				devDependencies: {
					"@actor-core/cli": version,
					"@actor-core/rivet": version,
					"@types/deno": "^2.2.0",
					...pkgJson.devDependencies,
				},
			});

			files["actor-core.config.ts"] = dedent`
				import type { Config } from "@actor-core/rivet";
				${actorImports("./actor-core.config.ts")}

				export default {
					actors: {
						${actorMap}
					},
				} satisfies Config;
			`;

			return {
				files,
			};
		},
	},
	"cloudflare-workers": {
		deployable: true,
		modify: ({ files, pkgJson, version, actorImports, actorMap }) => {
			files["package.json"] = stringifyJson({
				...pkgJson,
				devDependencies: {
					"@actor-core/cloudflare-workers": version,
					wrangler: "^3.101.0",
					"@cloudflare/workers-types": "^4.20250129.0",
					...pkgJson.devDependencies,
				},
				scripts: {
					deploy: "wrangler deploy",
					dev: "wrangler dev",
					start: "wrangler dev",
					"cf-typegen": "wrangler types",
					...pkgJson.scripts,
				},
			});

			files["wrangler.json"] = stringifyJson({
				name: "actor-core",
				main: "src/index.ts",
				compatibility_date: "2025-01-29",
				migrations: [
					{
						new_classes: ["ActorHandler"],
						tag: "v1",
					},
				],
				durable_objects: {
					bindings: [
						{
							class_name: "ActorHandler",
							name: "ACTOR_DO",
						},
					],
				},
				kv_namespaces: [
					{
						binding: "ACTOR_KV",
						id: "TODO",
					},
				],
				observability: {
					enabled: true,
				},
			});
			files["src/index.ts"] = dedent`
				import { createHandler } from "@actor-core/cloudflare-workers";
				${actorImports("./src/index.ts")}

				const { handler, ActorHandler } = createHandler({
					actors: { ${actorMap} }
				});

				export { handler as default, ActorHandler };
                `;

			return {
				files,
			};
		},
	},
	// deno: ({ files, pkgJson, version, actorImports, actorMap }) => {
	// 	files["package.json"] = stringifyJson({
	// 		...pkgJson,
	// 		devDependencies: {
	// 			"@actor-core/deno": version,
	// 			...pkgJson.devDependencies,
	// 		},
	// 		scripts: {
	// 			start: "deno run --allow-net src/index.ts",
	// 			dev: "deno run --allow-net --watch src/index.ts",
	// 			...pkgJson.scripts,
	// 		},
	// 	});

	// 	files["src/index.ts"] = dedent`
	//         import { serve } from "@actor-core/deno"
	//         ${actorImports("./src/index.ts")}

	//         serve({
	//             actors: { ${actorMap} }
	//         });
	//     `;

	// 	return { files };
	// },
	bun: {
		modify: ({ files, pkgJson, version, actorImports, actorMap }) => {
			files["package.json"] = stringifyJson({
				...pkgJson,
				devDependencies: {
					"@actor-core/bun": version,
					"@types/bun": "^1.2.4",
					...pkgJson.devDependencies,
				},
				scripts: {
					dev: "bun run --hot src/index.ts",
					start: "bun run src/index.ts",
					...pkgJson.scripts,
				},
			});

			files["src/index.ts"] = dedent`
            import { createHandler } from "@actor-core/bun"
            ${actorImports("./src/index.ts")}

            export default createHandler({
                actors: { ${actorMap} }
            });
        `;

			return { files };
		},
	},
	nodejs: {
		modify: ({ files, pkgJson, version, actorImports, actorMap }) => {
			files["package.json"] = stringifyJson({
				...pkgJson,
				devDependencies: {
					"@actor-core/nodejs": version,
					"@types/node": "^22.13.9",
					...pkgJson.devDependencies,
				},
				scripts: {
					start: "npx tsx src/index.ts",
					dev: "npx tsx watch src/index.ts",
					...pkgJson.scripts,
				},
			});

			files["src/index.ts"] = dedent`
            import { serve } from "@actor-core/nodejs"
            ${actorImports("./src/index.ts")}

            serve({
                actors: { ${actorMap} }
            });
        `;
			return { files };
		},
	},
} satisfies Record<string, PlatformConfig>;

const PACKAGE_MANAGERS = {
	npm: {
		cmds: {
			install: ["npm", ["install"]],
			run: ["npm", ["run"]],
			exec: ["npx", []],
		},
		modify: ({ files }) => {
			return { files };
		},
	},
	pnpm: {
		cmds: {
			install: ["pnpm", []],
			run: ["pnpm", []],
			exec: ["pnpx", []],
		},
		modify: ({ files }) => {
			return { files };
		},
	},
	yarn: {
		cmds: {
			install: ["yarn", []],
			run: ["yarn", []],
			exec: ["yarn", ["dlx"]],
		},
		modify: ({ files }) => {
			files["yarn.lock"] = "";

			return { files };
		},
	},
} satisfies Record<string, PackageManagerConfig>;

export const PLATFORM_SLUGS = Object.keys(PLATFORMS);
export type Platform = keyof typeof PLATFORMS;
export type PackageManager = keyof typeof PACKAGE_MANAGERS;
export const PLATFORM_NAMES = {
	rivet: "Rivet",
	"cloudflare-workers": "Cloudflare Workers",
	bun: "Bun",
	nodejs: "Node.js",
	vercel: "Vercel",
	// supabase: "Supabase",
	// deno: "Deno",
} satisfies Record<Platform, string>;

export function cmd(input: [string, string[]]) {
	return [input[0], input[1].join(" ")].filter((i) => !!i).join(" ");
}

export function resolvePlatformSpecificOptions(
	platform: keyof typeof PLATFORMS,
	opts: Pick<PlatformOptions, "files" | "version">,
): ResolvedPlatform {
	const platformConfig = PLATFORMS[platform];
	if (!platformConfig) {
		throw new Error(`Platform ${platform} not supported`);
	}

	const pkgManager = getPackageManager().manager;
	const packageManagerConfig = PACKAGE_MANAGERS[pkgManager];
	if (!packageManagerConfig) {
		throw new Error(`Package manager ${pkgManager} not supported`);
	}

	const pkgJson = JSON.parse(opts.files["package.json"] || "{}");

	if (pkgJson.devDependencies) {
		pkgJson.devDependencies["actor-core"] = opts.version;
	}

	const configOpts = {
		...opts,
		pkgJson,
		...buildExampleMetadata(pkgJson),
	};

	const { modify, ...platformConfigWithoutModify } = platformConfig;

	const newOpts = {
		...platformConfigWithoutModify,
		...opts,
		...modify(configOpts),
	};

	const { modify: packageManagerModify, ...packageManagerOpts } =
		packageManagerConfig;
	const newPkgManagerOpts = {
		...packageManagerOpts,
		...newOpts,
		...packageManagerModify({ ...configOpts, ...newOpts }),
	};

	// remove example
	const newPkg = JSON.parse(newPkgManagerOpts.files["package.json"] || "{}");
	newPkg.version = "0.0.0";
	newPkg.example = undefined;

	newPkgManagerOpts.files["package.json"] = stringifyJson(newPkg);
	const tsConfig = JSON.parse(newPkgManagerOpts.files["tsconfig.json"] || "{}");
	tsConfig.extends = `@actor-core/${platform}/tsconfig`;
	newPkgManagerOpts.files["tsconfig.json"] = stringifyJson(tsConfig);
	return newPkgManagerOpts;
}

interface ExampleMetadata {
	actorImports: (path?: string) => string;
	actorMap: string;
	actors: {
		name: string;
		path: string;
		relativeImport: (base: string, includeExt?: boolean) => string;
	}[];
}

function buildExampleMetadata(pkgJson: PackageJson): ExampleMetadata {
	const actorImports = (base = ".") =>
		Object.entries<string>(pkgJson.example?.actors || {})
			.map(([k, actorPath]) => {
				const importPath = path.relative(path.dirname(base), actorPath);
				return `import ${k.replace("-", "_")} from "./${removeExt(importPath)}";`;
			})
			.join("\n");
	const actorMap = Object.entries(pkgJson.example?.actors || {})
		.map(([k, _v]) => `"${k}": ${k.replace("-", "_")}`)
		.join("\n");

	const actors = Object.entries<string>(pkgJson.example?.actors || {}).map(
		([name, actorPath]) => {
			return {
				name,
				path: actorPath,
				relativeImport: (base: string, includeExt = false) => {
					const importPath = path.relative(path.dirname(base), actorPath);
					return `./${includeExt ? importPath : removeExt(importPath)}`;
				},
			};
		},
	);
	return { actorImports, actorMap, actors };
}

export function getPackageManager(): { manager: PackageManager } {
	const pkg = pkgFromUserAgent(process.env.npm_config_user_agent);
	if (pkg?.name === "yarn") {
		return { manager: "yarn" };
	}
	if (pkg?.name === "pnpm") {
		return { manager: "pnpm" };
	}
	return {
		manager: "npm",
	};
}
