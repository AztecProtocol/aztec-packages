# @aztec/protocol-contracts-artifacts

Compiled artifacts for the protocol contracts, published so consumers can generate TypeScript bindings
without a Noir toolchain.

`artifacts/` is a build output copied during release from `noir-projects/fnd/noir-contracts/target`, so it
is absent from a checkout. Nothing here is written by hand. Only the contracts named in
`protocol_contracts.json` are included; the rest of that subproject's output is not protocol code.

That manifest is published too, since a consumer derives both each artifact's filename and its
TypeScript name from the `<package>-<Contract>` entries in it.

Each contract's class id, and so its address, is derived from these bytes. The package version is not
an input, so taking a newer version that carries the same artifacts leaves every derived address
unchanged.
