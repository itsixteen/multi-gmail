import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: true,
  legalComments: "external",
};

await Promise.all([
  build({
    ...common,
    entryPoints: [new URL("../src/server.ts", import.meta.url).pathname],
    outfile: new URL("../dist/server.mjs", import.meta.url).pathname,
  }),
  build({
    ...common,
    entryPoints: [new URL("../src/auth.ts", import.meta.url).pathname],
    outfile: new URL("../dist/auth.mjs", import.meta.url).pathname,
  }),
]);
