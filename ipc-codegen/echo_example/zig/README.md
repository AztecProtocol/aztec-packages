# Zig Echo Example

Build from this directory:

```sh
./bootstrap.sh
```

The Zig project depends on the repo-local `ipc-runtime/zig` package and a
`zig_msgpack` copy vendored at `vendor/zig-msgpack`. Binaries are written to
`zig-out/bin/`.

Run locally:

```sh
zig-out/bin/echo_server --socket /tmp/echo.sock
zig-out/bin/echo_client --socket /tmp/echo.sock
```
