# avm-transpiler

## Build

```bash
./bootstrap.sh            # native build (cross builds only with CI_FULL=1)
./bootstrap.sh build_native
./bootstrap.sh build_cross <target>   # arm64-linux, amd64-macos, arm64-macos, amd64-windows
```

The native build also runs `cargo fmt --check` and `cargo clippy` with `RUSTFLAGS=-Dwarnings`. A warning fails the build, in CI as well as locally.

Do not override the toolchain (`cargo +nightly`, `rustup override`); `rust-toolchain.toml` pins it and CI will reject anything else.

## Downstream rebuilds

The static library `libavm_transpiler.a` and the `avm_transpiler.h` header are linked into `bb` (`barretenberg/cpp/cmake/avm-transpiler.cmake`). The labs tree consumes `bb`. After non-trivial changes, rebuild both, or cross-component breakage will surface only in unrelated CI steps. From the repo root:

```bash
make bb-cpp-native
make fast-labs      # if labs behaviour may change
```
