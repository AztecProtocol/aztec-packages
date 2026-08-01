# @aztec/protocol-circuits-artifacts

Compiled protocol circuit artifacts, published so consumers can generate TypeScript bindings without a
Noir toolchain.

`artifacts/` holds the compiled circuits, one JSON file per circuit. It is build output, assembled by
the release, and is not edited by hand.

`private_kernel_reset_config.json` and `private_kernel_reset_dimensions.json` sit alongside it because
generating the reset data and the circuit types needs both. They describe which reset variants exist and
what each one costs, which cannot be recovered from the artifacts.

The Noir source mapping is stripped: `file_map` and `debug_symbols` are blanked. They are a fifth of the
download and nothing generating bindings reads them.

Most artifacts embed a verification key, which is only valid against the barretenberg release that
produced it. Every `@aztec` package is published from one commit under one version, so keeping
versions aligned across them is what keeps the keys valid. The `*_simulated` variants are the
exception: they are never proven, so no key is generated for them and a consumer iterating the
directory has to tolerate their absence.
