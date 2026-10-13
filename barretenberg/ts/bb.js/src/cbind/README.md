Derives bindings from the reported msgpack schema from bb.

Run `BB_BINARY_PATH=<bb> yarn generate` in `barretenberg/ts/bb.js`. It writes the TypeScript bindings to `src/cbind/generated/` and the Rust bindings to `barretenberg/rust/barretenberg-rs/src/{api.rs,generated_types.rs}`. The outputs are not committed.
