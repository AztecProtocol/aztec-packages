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

## Issues Board

All issues being worked on are tracked on the [Aztec Github Project](https://github.com/orgs/AztecProtocol/projects/22). For a higher-level roadmap, check the [milestones overview](https://aztec.network/roadmap) section of our website.

## Debugging

Logging goes through the [Logger](yarn-project/foundation/src/log/) module in Typescript. `LOG_LEVEL` controls the default log level, and one can set alternate levels for specific modules, such as `debug; warn: module1, module2; error: module3`.

## Releases

Releases are driven by [release-please](https://github.com/googleapis/release-please), which maintains a 'Release PR' containing an updated CHANGELOG.md since the last release. Triggering a new release is simply a case of merging this PR to master. A [github workflow](./.github/workflows/release_please.yml) will create the tagged release triggering ./bootstrap.sh release to build and deploy the version at that tag.

## Contribute

There are many ways you can participate and help build high quality software. Check out the [contribution guide](CONTRIBUTING.md)!

## Syncing noir

We use marker commits and [git-subrepo](https://github.com/ingydotnet/git-subrepo) (for a subset of its intended use) to manage a mirror of noir. This tool was chosen because it makes code checkout and development as simple as possible (compared to submodules or subtrees), with the tradeoff of complexity around sync's.

## Development and CI

Run `bootstrap.sh` in the project root to set up your environment. This will update git submodules, download needed artifacts (namely, SRS for barretenberg), check all tool versions and build all packages. Rarely, you can run `bootstrap.sh full` to build from scratch without attempting to download from cache.
The root-level bootstrap.sh will inform you about missing tool versions.

The bootstrap.sh scripts have several functions and, in addition to actually bootstrapping (setup and building) of the code also provide testing and release functionality for CI.
See CI3/README.md for more details. AWS credentials are required for S3 uploads. For testing the scripts themselves, one can set `S3_BUILD_CACHE_AWS_PARAMS` to point to a MinIO endpoint.

There is a top-level bootstrap and one in every submodule (use `find . -name bootstrap.sh` to discover these).

1. **Build everything**:
   ```bash
   ./bootstrap.sh
   ```
   (Same as `./bootstrap.sh fast`.) This fetches cached artifacts where possible, then rebuilds only what's changed.

2. **Run all tests**:
   ```bash
   ./bootstrap.sh test
   ```
   This enumerates tests from each subproject and runs them in parallel, skipping any already passed (based on content hash).

3. **Release** (when tagged, e.g. `v1.2.3`):
   ```bash
   ./bootstrap.sh release
   ```
   Each subproject’s release flow (pushing Docker images, NPM packages, GH releases, etc.) is invoked.

4. **Clean** local outputs:
   ```bash
   ./bootstrap.sh clean
   ```
   This erases untracked files, submodules, etc. (Use with caution locally.)

Key ideas:
- **Monorepo**: Multiple projects share a single repo. Each subdirectory (e.g. `barretenberg`, `noir`, `yarn-project`) has its own `bootstrap.sh` for building/testing.
- **Content Hashing**: For each project, files are matched by `.rebuild_patterns`. If those files haven’t changed (hash is identical), a cached build artifact is reused.
- **Caching**: Artifacts are stored in S3 or any S3-compatible store (e.g. MinIO). If AWS creds aren’t configured, caching is a no-op.
- **Test Enumeration**: `bootstrap.sh test-cmds` in each subproject lists test lines, which run in parallel. Passing tests get cached so repeated runs skip them.
