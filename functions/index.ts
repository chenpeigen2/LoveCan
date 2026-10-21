import { storage } from "./_qoder/storage.mjs";
import { createHandler } from "./handler.ts";

Deno.serve(createHandler(storage));
