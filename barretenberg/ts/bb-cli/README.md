# @aztec-foundation/bb

Installs the `bb` binary from [AztecProtocol/aztec-packages](https://github.com/AztecProtocol/aztec-packages) for your platform (linux-x64, linux-arm64, darwin-x64, darwin-arm64, win32-x64) and exposes it as the `bb` command. Each platform has its own npm package; this meta package installs the one for your platform as an optional dependency.

The bytes are identical to the binary in the GitHub release tarball of the same version, and `bb --version` reports that version. Set `BB_BINARY_PATH` to use a local build instead.
