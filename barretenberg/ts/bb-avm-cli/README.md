# @aztec-foundation/bb-avm

The `bb-avm` binary from [AztecProtocol/aztec-packages](https://github.com/AztecProtocol/aztec-packages), one npm package per platform (linux-x64, linux-arm64) behind this meta package, which installs the one for your platform as an optional dependency and exposes it as the `bb-avm` command. The bytes are identical to the binary in the GitHub release tarball of the same version, and `bb-avm --version` reports that version. Set `BB_AVM_BINARY_PATH` to use a local build instead.
