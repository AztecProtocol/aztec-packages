# Rust Echo Example

Build from this directory:

```sh
./bootstrap.sh
```

The Cargo project depends on `ipc-runtime/rust` via a repo-relative path.
The bootstrap also runs `cargo check --features ffi` to compile-check the
generated FFI backend. Binaries are written to `target/debug/`.
`src/bin/generate_golden.rs` writes the golden fixtures (`./bootstrap.sh update_goldens`
in `ipc-codegen`).

Run locally:

```sh
target/debug/echo_server --socket /tmp/echo.sock
target/debug/echo_client --socket /tmp/echo.sock
```
