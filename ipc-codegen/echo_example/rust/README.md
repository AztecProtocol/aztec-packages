# Rust Echo Example

Build from this directory:

```sh
./bootstrap.sh
```

The Cargo project depends on `ipc-runtime/rust` via a repo-relative path.
Binaries are written to `target/debug/`.

Run locally:

```sh
target/debug/echo_server --socket /tmp/echo.sock
target/debug/echo_client --socket /tmp/echo.sock
```
