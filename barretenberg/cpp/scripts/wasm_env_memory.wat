;; The linear memory a single-threaded bb wasm imports as env.memory (bb links with --import-memory, so its host
;; sizes the memory). The wasmtime CLI fills only the imports WASI defines, so wasmtime.sh preloads this as `env`.
(module (memory (export "memory") 512 65536))
