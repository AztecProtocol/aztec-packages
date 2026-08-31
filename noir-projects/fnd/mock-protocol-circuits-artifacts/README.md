# @aztec-foundation/mock-protocol-circuits-artifacts

Compiled artifacts for the mock protocol circuits, published so consumers can generate TypeScript
bindings without a Noir toolchain.

`artifacts/` holds the compiled circuits, one JSON file per circuit. It is build output, assembled by
the release, and is not edited by hand.

These circuits stand in for the real protocol circuits in proving system integration tests. They are
cheap to prove and carry no protocol meaning, so nothing outside a test should depend on them.
