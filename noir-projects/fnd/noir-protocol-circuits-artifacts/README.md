# @aztec/noir-protocol-circuits-artifacts

Compiled protocol circuit artifacts, published so consumers can generate TypeScript bindings without a
Noir toolchain.

`artifacts/` is a build output copied from `noir-projects/fnd/noir-protocol-circuits/target` during
release, so it is absent from a checkout. Nothing here is written by hand.

`private_kernel_reset_config.json` and `private_kernel_reset_dimensions.json` sit alongside it because
generating the reset data and the circuit types needs both. They describe which reset variants exist and
what each one costs, which cannot be recovered from the artifacts.

The Noir source mapping is stripped: `file_map` and `debug_symbols` are blanked, matching what a
consumer publishes anyway, and they are most of the download.

The artifacts embed verification keys, which are only valid against the barretenberg release that
produced them. Every `@aztec` package is published from one commit under one version, so keeping
versions aligned across them is what keeps the keys valid.
