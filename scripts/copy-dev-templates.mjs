#!/usr/bin/env node
// Copies dev server HTML templates from src to dist after tsc runs.
// tsc only emits .ts/.js files, so anything the dev server needs to read
// from disk at runtime must be copied manually.
import { cp } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const srcDir = resolve(projectRoot, 'src/dev/templates');
const destDir = resolve(projectRoot, 'dist/dev/templates');

await cp(srcDir, destDir, { recursive: true });
console.log(`Copied dev templates to ${destDir}`);
