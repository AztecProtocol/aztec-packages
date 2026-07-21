# avm-transpiler

## Build

```bash
./bootstrap.sh            # full build
./bootstrap.sh build_native
./bootstrap.sh build_cross <target>   # e.g. arm64-linux, amd64-macos
```

Do not override the toolchain (`cargo +nightly`, `rustup override`); `rust-toolchain.toml` pins it and CI will reject anything else.

## Downstream rebuilds

Outputs are consumed by `barretenberg/cpp/` (via the `avm_transpiler.h` header) and `yarn-project/` (via the built static library). After non-trivial changes, rebuild both or cross-component breakage will surface only in unrelated CI steps:

```bash
(cd ../barretenberg/cpp && cmake --preset default && cd build && ninja)
(cd ../yarn-project && yarn build)
```
