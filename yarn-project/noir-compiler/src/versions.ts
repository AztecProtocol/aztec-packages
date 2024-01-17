import { readFile } from 'node:fs/promises';

// read package.json at runtime instead of compile time so that we keep rootDir as-is in tsconfig
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf-8'));
export const NoirWasmVersion = pkg.dependencies['@noir-lang/noir_wasm'];
