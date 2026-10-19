# @aztec-foundation/bb-avm

Installs the `bb-avm` binary from [AztecProtocol/aztec-packages](https://github.com/AztecProtocol/aztec-packages) for your platform (linux-x64, linux-arm64) and exposes it as the `bb-avm` command. Each platform has its own npm package; this meta package installs the one for your platform as an optional dependency.

The bytes are identical to the binary in the GitHub release tarball of the same version, and `bb-avm --version` reports that version. Set `BB_AVM_BINARY_PATH` to use a local build instead.
