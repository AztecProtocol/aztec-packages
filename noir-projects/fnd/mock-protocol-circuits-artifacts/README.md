# @aztec/mock-protocol-circuits-artifacts

Compiled artifacts for the mock protocol circuits, published so consumers can generate TypeScript
bindings without a Noir toolchain.

`artifacts/` is a build output copied during release from `noir-projects/fnd/mock-protocol-circuits/target`,
so it is absent from a checkout. Nothing here is written by hand.

These circuits stand in for the real protocol circuits in proving system integration tests. They are
cheap to prove and carry no protocol meaning, so nothing outside a test should depend on them.
