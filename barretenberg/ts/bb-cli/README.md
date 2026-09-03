# @aztec-foundation/bb

The `bb` binary from [AztecProtocol/aztec-packages](https://github.com/AztecProtocol/aztec-packages), one npm package per platform (linux-x64, linux-arm64, darwin-x64, darwin-arm64, win32-x64) behind this meta package, which installs the one for your platform as an optional dependency and exposes it as the `bb` command. The bytes are identical to the binary in the GitHub release tarball of the same version, and `bb --version` reports that version. Set `BB_BINARY_PATH` to use a local build instead.
