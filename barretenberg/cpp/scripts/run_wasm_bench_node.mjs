#!/usr/bin/env node
// Node/V8 harness for running a WASI WASM bench binary.
//
// The gist (https://gist.github.com/AztecBot/b8e2e1d5c85d54e10fb34b48461361e0)
// measured VectorField speedups on Zen3 V8, so we run the benchmark under V8
// (Node) to get the directly-comparable numbers.
//
// Usage: node run_wasm_bench_node.mjs <wasm-file>
//
// The wasm is expected to be built with --import-memory (the default WASM
// preset). We provide a WebAssembly.Memory and a WASI context.

import { WASI } from 'node:wasi';
import { readFileSync } from 'node:fs';
import { argv } from 'node:process';

if (argv.length < 3) {
    console.error('Usage: node run_wasm_bench_node.mjs <wasm-file> [bench-args...]');
    process.exit(2);
}

const wasmPath = argv[2];
const benchArgs = argv.slice(3);

const wasm = readFileSync(wasmPath);

// Pre-allocate enough memory to let google benchmark run. The WASM build
// imports memory with a max of 4 GiB; we let it grow as needed.
const memory = new WebAssembly.Memory({ initial: 256, maximum: 65536 });

const wasi = new WASI({
    version: 'preview1',
    args: [wasmPath, ...benchArgs],
    env: { HARDWARE_CONCURRENCY: '8' },
    preopens: { '/': '.' },
});

const imports = wasi.getImportObject();
imports.env = imports.env || {};
imports.env.memory = memory;

// Instantiate and run.
const { instance } = await WebAssembly.instantiate(wasm, imports);

try {
    wasi.start(instance);
} catch (e) {
    if (e && e.name === 'WASI' && e.message === 'exit') {
        // Normal exit from WASI.
    } else {
        throw e;
    }
}
