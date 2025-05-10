import { actor, UserError, type ActionContext } from "actor-core";
import fs from "fs/promises";
import path from "path";
import mime from "mime-types";
import { z } from "zod";

const FileResponseSchema = z.object({
  content: z.string(),
  contentType: z.string()
});

interface State {
  lastAccessed: number;
}

interface Events {
  fileServed: { path: string; contentType: string; size: number };
}

interface Actions {
  [key: string]: (...args: any[]) => any;
  serveFile: (ctx: ActionContext<State, {}, {}, Events>, filePath: string) => Promise<{ content: string; contentType: string }>;
  getStatus: (ctx: ActionContext<State, {}, {}, Events>) => Promise<{ lastAccessed: number }>;
}

const ALLOWED_EXTENSIONS = new Set([
  ".html", ".css", ".js", ".json", ".txt",
  ".png", ".jpg", ".jpeg", ".gif", ".svg",
  ".ico", ".woff", ".woff2", ".ttf", ".eot"
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default actor<State, {}, {}, Events, Actions>({
  state: {
    lastAccessed: Date.now()
  },

  actions: {
    async serveFile(ctx: ActionContext<State, {}, {}, Events>, filePath: string) {
      const sanitizedPath = sanitizeFilePath(filePath || "index.html");
      ctx.log.info("serving_file", { path: sanitizedPath });

      const fullPath = path.join(process.cwd(), "public", sanitizedPath);

      try {
        const stats = await fs.stat(fullPath);
        if (stats.size > MAX_FILE_SIZE) {
          throw new UserError("File too large", {
            metadata: {
              code: "file_too_large",
              path: sanitizedPath,
              size: stats.size,
              maxSize: MAX_FILE_SIZE
            }
          });
        }

        const content = await fs.readFile(fullPath, "utf-8");
        const contentType = mime.lookup(fullPath) || "text/plain";
        const response = { content, contentType };

        try {
          FileResponseSchema.parse(response);
        } catch (error) {
          throw new Error(`Invalid response format: ${error instanceof Error ? error.message : String(error)}`);
        }

        ctx.state.lastAccessed = Date.now();
        ctx.broadcast("fileServed", {
          path: sanitizedPath,
          contentType,
          size: stats.size
        });

        return response;
      } catch (error) {
        if (error instanceof UserError) {
          throw error;
        }
        ctx.log.error("file_serve_error", {
          path: sanitizedPath,
          error: error instanceof Error ? error.message : String(error)
        });
        throw new UserError("File not found or access denied", {
          metadata: {
            code: "file_not_found",
            path: sanitizedPath
          }
        });
      }
    },

    async getStatus(ctx: ActionContext<State, {}, {}, Events>) {
      return {
        lastAccessed: ctx.state.lastAccessed || 0
      };
    }
  }
});

function sanitizeFilePath(filePath: string): string {
  const normalized = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, "");
  const ext = path.extname(normalized).toLowerCase();
  
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new UserError("File type not allowed", {
      metadata: {
        code: "invalid_file_type",
        extension: ext
      }
    });
  }
  
  return normalized;
} 