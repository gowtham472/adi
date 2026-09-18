import { build } from 'esbuild';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const handlersDir = join(engineRoot, 'src', 'api', 'handlers');
const outDir = join(engineRoot, 'dist', 'handlers');

const handlers = existsSync(handlersDir)
  ? readdirSync(handlersDir).filter((file) => file.endsWith('.ts'))
  : [];

rmSync(outDir, { recursive: true, force: true });

// Each handler is bundled into its own directory so the SAM template can point one
// function at one CodeUri. The AWS SDK v3 is provided by the nodejs22.x runtime, so it is
// left external to keep the bundles small.
await Promise.all(
  handlers.map((file) =>
    build({
      entryPoints: [join(handlersDir, file)],
      outfile: join(outDir, basename(file, '.ts'), 'index.mjs'),
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      sourcemap: true,
      external: ['@aws-sdk/*'],
      banner: {
        js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
      },
      logLevel: 'warning',
    }),
  ),
);

console.log(`Bundled ${handlers.length} handler(s) into ${outDir}`);
