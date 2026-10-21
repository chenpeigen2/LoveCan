import { localHandler } from "./storage-fake.ts";

Deno.serve({ hostname: "127.0.0.1", port: 8000 }, localHandler);
