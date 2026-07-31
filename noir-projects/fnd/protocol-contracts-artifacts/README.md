# @aztec/protocol-contracts-artifacts

Compiled artifacts for the protocol contracts, published so consumers can generate TypeScript bindings
without a Noir toolchain.

The release assembles this package in a `dist/` staging directory: `artifacts/` is copied from
`noir-projects/fnd/noir-contracts/target`, so it is absent from a checkout. Nothing here is written by
hand. The contracts included are the ones named in `protocol_contracts.json`, which today is everything
that subproject builds.

That manifest is published too, since a consumer derives both each artifact's filename and its
TypeScript name from the `<package>-<Contract>` entries in it.

Each contract's class id, and so its address, is derived from the compiled artifact. The version the
release stamps into each file is not an input to that derivation, so a newer package version carrying
an unchanged compilation leaves every derived address unchanged.
