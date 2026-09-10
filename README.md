# Aztec Foundation repo

All the packages that make up the [Aztec](https://docs.aztec.network) protocol.

- [**`barretenberg`**](/barretenberg): The ZK prover backend that provides succinct verifiability for Aztec. Also houses the Aztec VM.
- [**`l1-contracts`**](/l1-contracts): Solidity code for the Ethereum contracts that process rollups
- [**`noir-projects`**](/noir-projects): Noir code for Aztec contracts and protocol circuits.

Additionally, the [**`labs`**](https://github.com/aztec-labs-eng/aztec-node) repository is linked as a submodule. Go there for the aztec node, client, Aztec.nr, docs, and deployment infrastructure.

## Releases

The projects in this repo are released via npm ([@aztec-foundation](https://www.npmjs.com/org/aztec-foundation)) and Github releases.

## Contribute

There are many ways you can participate and help build high quality software. Check out the [contribution guide](CONTRIBUTING.md)!

## Development and CI

For a broad overview of the CI system take a look at [CI.md](CI.md).

For some deeper information on individual scripts etc (for developing CI itself), take a look at [ci3/README.md](ci3/README.md).
