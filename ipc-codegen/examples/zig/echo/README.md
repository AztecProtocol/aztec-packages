# Zig Echo Example

Build from this directory:

```sh
../../echo-schema/generate.sh
zig build
```

The Zig project depends on the repo-local `ipc-runtime/zig` package and the
pinned `zig_msgpack` dependency declared in its package metadata. Binaries are
written to `zig-out/bin/`.

Run locally:

```sh
zig-out/bin/echo_server --socket /tmp/echo.sock
zig-out/bin/echo_client --socket /tmp/echo.sock
```
