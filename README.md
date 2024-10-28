# 🌐 Aztec Monorepo

**All packages that power the Aztec Network in one place.**

---

## 📂 Repository Structure

| Directory       | Description                                                                                     |
|-----------------|-------------------------------------------------------------------------------------------------|
| [**l1-contracts**](https://github.com/AztecProtocol/aztec-packages/tree/master/l1-contracts) | Solidity contracts for Ethereum rollups.                  |
| [**yarn-project**](https://github.com/AztecProtocol/aztec-packages/tree/master/yarn-project) | TypeScript code for client and backend.                   |
| [**docs**](https://github.com/AztecProtocol/aztec-packages/tree/master/docs) | Source files for the Aztec Documentation.                |

---

## 🔥 Popular Packages

### 📦 Core Packages
- [**Aztec.nr**](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/aztec-nr) - Framework for Aztec smart contracts in [Noir](https://noir-lang.org/).
- [**Aztec**](https://github.com/AztecProtocol/aztec-packages/tree/master/yarn-project/aztec) - Tools for starting local devnets with deployed rollup contracts.
- [**Aztec.js**](https://github.com/AztecProtocol/aztec-packages/tree/master/yarn-project/aztec.js) - API for interacting with Aztec's PXE ([Private Execution Environment](https://github.com/AztecProtocol/aztec-packages/tree/master/yarn-project/pxe)).

### 📝 Example Contracts
- [**Example Contracts**](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts) - Sample contracts written in Noir.
- [**End-to-End Tests**](https://github.com/AztecProtocol/aztec-packages/tree/master/yarn-project/end-to-end) - TypeScript tests, a great reference for various use cases.
- [**Aztec Boxes**](https://github.com/AztecProtocol/aztec-packages/tree/master/boxes) - Starter projects for Aztec development.

---

## 🗂 Issues Board

- Track all issues on the [Aztec Github Project](https://github.com/orgs/AztecProtocol/projects/22).
- For a high-level roadmap, check the [milestones overview](https://aztec.network/roadmap) section of our website.

---

## ⚙️ Development Setup

1. **Full Setup:** Run `bootstrap.sh full` in the project root to initialize your environment.
   - Updates git submodules, downloads ignition transcripts, installs Foundry, compiles Solidity contracts, installs the current node version via `nvm`, and builds all TypeScript packages.
   - Requires [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions.

2. **Fast Setup:** Run `./bootstrap.sh fast` for a quicker setup focused on Noir contracts and TypeScript. This downloads builds for Barretenberg and Nargo from the CI cache. _Note: Requires AWS ECR credentials and works only on Ubuntu._

---

## 🚀 Continuous Integration

- **CI System:** This repository uses CircleCI for continuous integration. Build steps are managed using the [build-system](https://github.com/AztecProtocol/build-system) repository.
- **Docker Builds:** Packages are built in Docker; small packages are tested in Docker, while larger packages and end-to-end tests are run on AWS spot instances.
- **Debugging CI:** You can create a persistent SSH session on CircleCI by selecting "Rerun step with SSH" for debugging.

For more details on CI configurations, refer to the [build-system README](https://github.com/AztecProtocol/build-system).

---

## 🛠 Debugging

All logging goes through the [DebugLogger module](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/foundation/src/log/debug.ts). Set a `DEBUG` environment variable to the module name (e.g., `aztec:*`) to enable detailed logs.

---

## 📦 Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please), which creates a 'Release PR' with an updated `CHANGELOG.md`. Merging this PR triggers a GitHub workflow to create a tagged release and deploy it through CircleCI.

---

## 🤝 Contribute

Check out the [contribution guide](https://github.com/AztecProtocol/aztec-packages/blob/master/CONTRIBUTING.md) to learn how you can participate and help build high-quality software!

---

## 🔄 Syncing Noir

Aztec uses [git-subrepo](https://github.com/ingydotnet/git-subrepo) to manage a mirror of Noir. If syncing issues arise, follow these steps to recover:
- Manually edit `.gitrepo` file to match the commit in the master branch after merges.
- For further issues, refer to the [git-subrepo documentation](https://github.com/ingydotnet/git-subrepo).

---

## 🌍 Earthly

[Earthly](https://docs.earthly.dev/) is a reproducible build tool used in this project. It combines Docker, Makefiles, and Bash functionalities to create modular and reusable build scripts.

- **Docker-Based:** Leverages Docker for caching and reproducibility.
- **CI-Compatible:** Supports both CI and local incremental builds.
- **Cross-Platform:** Currently, only Linux and WASM are supported.

For more examples, see the `Earthfile` in `barretenberg/cpp`.
