# @aztec-foundation/protocol-contracts-artifacts

Compiled artifacts for the protocol contracts, published so consumers can generate TypeScript bindings
without a Noir toolchain.

`artifacts/` holds the compiled contracts, one JSON file per contract, and the contracts included are
the ones named in `protocol_contracts.json`. It is build output, assembled by the release, and is not
edited by hand.

That manifest is published too, since a consumer derives both each artifact's filename and its
TypeScript name from the `<package>-<Contract>` entries in it.

Each contract's class id, and so its address, is derived from the compiled artifact. The version the
release stamps into each file is not an input to that derivation, so a newer package version carrying
an unchanged compilation leaves every derived address unchanged.
