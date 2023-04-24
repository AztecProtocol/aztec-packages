# Aztec 3 Monorepo

All the packages that make up [Aztec 3](https://docs.aztec.network/aztec3/overview).

- [**`circuits`**](/circuits): C++ code for circuits and cryptographic functions
- [**`l1-contracts`**](/l1-contracts): Solidity code for the Ethereum contracts that process rollups
- [**`yarn-project`**](/yarn-project): Typescript code for client and backend

## Issues Board

All issues being worked on are tracked on the [A3 Github Project](https://github.com/orgs/AztecProtocol/projects/22). For a higher-level roadmap, check the [milestones overview](https://docs.aztec.network/aztec3/milestones) section of our docs.

## Development Setup

Run `bootstrap.sh` in the project root to set up your environment. This will update git submodules, download ignition transcripts, build all C++ circuits code, install Foundry, compile Solidity contracts, install the current node version via nvm, and build all typescript packages.

To build C++ code, make sure to fullfil the [requirements from barretenberg](https://github.com/AztecProtocol/barretenberg/#dependencies), the underlying cryptographic library we maintain. To build Typescript code, make sure to have [`nvm`](https://github.com/nvm-sh/nvm) (node version manager) installed.

## Continuous Integration

This repository uses CircleCI for continuous integration. Build steps are managed using [`build-system`](https://github.com/AztecProtocol/build-system). Small packages are built and tested as part of a docker build operation, while larger ones and end-to-end tests spin up a large AWS spot instance. Each successful build step creates a new docker image that gets tagged with the package name and commit.

All packages need to be included in the [build manifest](`build_manifest.json`), which declares what paths belong to each package, as well as dependencies between packages. When the CI runs, if none of the rebuild patterns or dependencies were changed, then the build step is skipped and the last successful image is re-tagged with the current commit. Read more on the [`build-system`](https://github.com/AztecProtocol/build-system) repository README.

## Debugging

Logging goes through the [`info` and `debug`](circuits/cpp/barretenberg/cpp/src/barretenberg/common/log.hpp) functions in C++, and through the [DebugLogger](yarn-project/foundation/src/log/debug.ts) module in Typescript. To see the log output, set a `DEBUG` environment variable to the name of the module you want to debug, to `aztec:*`, or to `*` to see all logs.

## Contributing

To contribute, make sure to pick an existing issue and assign yourself to it, or notify that you'll be working on it. If you're new to the repository, look for those tagged as [`good-first-issue`](https://github.com/AztecProtocol/aztec3-packages/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22). Then send a pull request with your contribution, linking back to the issue it fixes.
