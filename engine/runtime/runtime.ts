import { Context } from "./context.ts";
import { Postgres, PostgresWrapped } from './postgres.ts';
import { serverHandler } from './server.ts';
import { Trace, appendTraceEntry, newTrace } from './trace.ts';
import Ajv from "ajv";
import addFormats from 'ajv-formats';

export interface Config {
    modules: Record<string, Module>;
}

export interface Module {
    scripts: Record<string, Script>;
}

export interface Script {
    handler: ScriptHandler<any, any>;
    requestSchema: any;
    responseSchema: any;
}

export type ScriptHandler<Req, Res> = (ctx: Context, req: Req) => Promise<Res>;

export class Runtime {
    public postgres: Postgres;

    private ajv: Ajv.default;

    public constructor(public config: Config) {
        this.postgres = new Postgres();

        this.ajv =  new Ajv.default();
        addFormats.default(this.ajv);
    }

    async shutdown() {
        await this.postgres.shutdown();
    }

    public async call(parentTrace: Trace, moduleName: string, scriptName: string, req: unknown): Promise<unknown> {
        console.log(`Request ${moduleName}.${scriptName}:\n${JSON.stringify(req, null, 2)}`)

        // Build trace
        let trace = appendTraceEntry(parentTrace, {
            script: { module: moduleName, script: scriptName }
        });

        // Build Postgres
        let postgres = new PostgresWrapped(this.postgres, moduleName);

        // Build context
        const ctx = new Context(this, trace, postgres);

        try {
            // Lookup module
            let module = this.config.modules[moduleName];
            if (!module) throw new Error(`Module not found: ${moduleName}`);

            // Lookup script
            let script = module.scripts[scriptName];
            if (!script) throw new Error(`Script not found: ${scriptName}`);

            // Compile schemas
            let validateRequest = this.ajv.compile(script.requestSchema);
            let validateResponse = this.ajv.compile(script.responseSchema);

            // Validate request
            if (!validateRequest(req)) throw new Error(`Invalid request: ${JSON.stringify(validateRequest.errors)}`);

            // Execute script
            let res = await script.handler(ctx, req);
            console.log(`Response ${moduleName}.${scriptName}:\n${JSON.stringify(res, null, 2)}`)

            // Validate response
            if (!validateResponse(res)) throw new Error(`Invalid response: ${JSON.stringify(validateResponse.errors)}`);

            return res;
        } catch (err) {
            throw new Error(`Failed to execute script: ${err.message}`)
        }
    }

    public async serve() {
        const port = parseInt(Deno.env.get("PORT") ?? "8080");
        console.log(`Serving on port ${port}`);
        Deno.serve({ port }, serverHandler(this));
    }

    public static test(config: Config, module: string, name: string, fn: (ctx: Context) => Promise<void>) {
        Deno.test(name, async () => {
            const runtime = new Runtime(config);

            // Build context
            const trace = newTrace({
                test: { module, name }
            });
            const postgresWrapped = new PostgresWrapped(runtime.postgres, module);
            const ctx = new Context(runtime, trace, postgresWrapped);

            // Run test
            try {
                await fn(ctx);
            } catch (err) {
                throw err;
            } finally {
                await runtime.shutdown();
            }
        });
    }
}
