# @aztec/mock-protocol-circuits-artifacts

Compiled artifacts for the mock protocol circuits, published so consumers can generate TypeScript
bindings without a Noir toolchain.

The release assembles this package in a `dist/` staging directory: `artifacts/` is copied from
`noir-projects/fnd/mock-protocol-circuits/target`, so it is absent from a checkout. Nothing here is
written by hand.

These circuits stand in for the real protocol circuits in proving system integration tests. They are
cheap to prove and carry no protocol meaning, so nothing outside a test should depend on them.
