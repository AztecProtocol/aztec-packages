# Aztec Monorepo

All the packages that make up [Aztec](https://docs.aztec.network).

- [**`barretenberg`**](/noir-projects): The ZK prover backend that provides succinct verifiability for Aztec. Also houses the Aztec VM.
- [**`l1-contracts`**](/l1-contracts): Solidity code for the Ethereum contracts that process rollups
- [**`noir-projects`**](/noir-projects): Noir code for Aztec contracts and protocol circuits.
- [**`yarn-project`**](/yarn-project): Typescript code for client and backend
- [**`docs`**](/docs): Documentation source for the docs site

## Popular packages

- [Aztec.nr](./noir-projects/aztec-nr/): A [Noir](https://noir-lang.org) framework for smart contracts on Aztec.
- [Aztec](./yarn-project/aztec/): A package for starting up local dev net modules, including a local 'sandbox' devnet, an Ethereum network, deployed rollup contracts and Aztec execution environment.
- [Aztec.js](./yarn-project/aztec.js/): A tool for interacting with the Aztec network. It communicates via the [Private Execution Environment (PXE)](./yarn-project/pxe/).
- [Example contracts](./noir-projects/noir-contracts/): Example contracts for the Aztec network, written in Noir.
- [End to end tests](./yarn-project/end-to-end/): Integration tests written in Typescript--a good reference for how to use the packages for specific tasks.
- [Aztec Boxes](./boxes/): Example starter projects.

## DeepWiki

In addition to the docs website, you can "talk" with this repo using [DeepWiki](https://deepwiki.com):

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/AztecProtocol/aztec-packages)

## Issues Board

All issues being worked on are tracked on the [Aztec Github Project](https://github.com/orgs/AztecProtocol/projects/22). For a higher-level roadmap, check the [milestones overview](https://aztec.network/roadmap) section of our website.

## Debugging

Logging goes through the [Logger](yarn-project/foundation/src/log/) module in Typescript. `LOG_LEVEL` controls the default log level, and one can set alternate levels for specific modules, such as `debug; warn: module1, module2; error: module3`.

## Releases

Releases are driven by [release-please](https://github.com/googleapis/release-please), which maintains a 'Release PR' containing an updated CHANGELOG.md since the last release. Triggering a new release is simply a case of merging this PR to master. A [github workflow](./.github/workflows/release-please.yml) will create the tagged release triggering ./bootstrap.sh release to build and deploy the version at that tag.

## Contribute

There are many ways you can participate and help build high quality software. Check out the [contribution guide](CONTRIBUTING.md)!

## Syncing noir

We use marker commits and [git-subrepo](https://github.com/ingydotnet/git-subrepo) (for a subset of its intended use) to manage a mirror of noir. This tool was chosen because it makes code checkout and development as simple as possible (compared to submodules or subtrees), with the tradeoff of complexity around sync's.

## Development and CI

For a broad overview of the CI system take a look at [CI.md](CI.md).

For some deeper information on individual scripts etc (for developing CI itself), take a look at [ci3/README.md](ci3/README.md).
