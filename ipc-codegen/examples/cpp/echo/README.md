# C++ Echo Example

Build from this directory:

```sh
../../echo-schema/generate.sh
cmake -S . -B build
cmake --build build --target echo_server echo_client
```

The CMake project fetches upstream `msgpack-c` and builds `ipc-runtime/cpp` as
a subproject. Binaries are written to `build/bin/`.

Run locally:

```sh
build/bin/echo_server --socket /tmp/echo.sock
build/bin/echo_client --socket /tmp/echo.sock
```
