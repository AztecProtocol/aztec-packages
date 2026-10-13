# C++ Echo Example

Build from this directory:

```sh
./bootstrap.sh
```

The bootstrap generates bindings and C++ codegen support headers into
`src/generated/`, fetches upstream `msgpack-c`, and builds `ipc-runtime/cpp`
as a subproject. Fetching `msgpack-c` from GitHub needs network access.
Binaries, including the `golden_test` binary, are written to `build/bin/`.

Run locally:

```sh
build/bin/echo_server --socket /tmp/echo.sock
build/bin/echo_client --socket /tmp/echo.sock
```

Run this language's golden test from this directory:

```sh
../scripts/run_cross_language_test.sh golden cpp
```
