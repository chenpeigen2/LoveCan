import { createHandler } from "../functions/handler.ts";

const root = new URL("../.local-storage/", import.meta.url);
const OBJECT_RE = /^cans\/[A-Za-z0-9_-]{12}\.json$/;

function resolveObject(objectPath: string): URL {
  if (!OBJECT_RE.test(objectPath)) throw new Error("invalid_path");
  const target = new URL(objectPath, root);
  if (!target.pathname.startsWith(root.pathname)) {
    throw new Error("invalid_path");
  }
  return target;
}

function existsError(): Error {
  return Object.assign(new Error("object_exists"), { status: 409 });
}

export const fakeStorage = {
  async download(objectPath: string): Promise<Response> {
    const target = resolveObject(objectPath);
    try {
      const bytes = await Deno.readFile(target);
      return new Response(bytes, {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return new Response("not found", { status: 404 });
      }
      throw error;
    }
  },

  async upload(
    objectPath: string,
    bytes: Uint8Array,
    options: { contentType?: string; upsert?: boolean } = {},
  ): Promise<unknown> {
    const target = resolveObject(objectPath);
    if (!options.upsert) {
      try {
        await Deno.stat(target);
        throw existsError();
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
    }
    await Deno.mkdir(new URL("./", target), { recursive: true });
    await Deno.writeFile(target, bytes);
    return { ok: true, path: objectPath, size: bytes.byteLength };
  },

  async remove(objectPaths: string[]): Promise<unknown> {
    for (const objectPath of objectPaths) {
      const target = resolveObject(objectPath);
      try {
        await Deno.remove(target);
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
    }
    return { ok: true };
  },
};

export const localHandler = createHandler(fakeStorage);
