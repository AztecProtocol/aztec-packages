<div align="center">
  <a href="https://aztec.network">
    <img src="https://github.com/AztecProtocol/aztec-packages/blob/master/docs/static/img/aztec-logo.9cde8ae1.svg" alt="Aztec Protocol Logo" width="300">
  </a>
</div>

<h2>
  🔐 Aztec Monorepo – Privacy-first Smart Contracts on Ethereum
</h2>

<div>

[![GitHub Repo stars](https://img.shields.io/github/stars/AztecProtocol/aztec-packages?logo=github&color=yellow)](https://github.com/AztecProtocol/aztec-packages/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/AztecProtocol/aztec-packages?logo=github&color=blue)](https://github.com/AztecProtocol/aztec-packages/network/members)
[![GitHub last commit](https://img.shields.io/github/last-commit/AztecProtocol/aztec-packages?logo=git)](https://github.com/AztecProtocol/aztec-packages/commits/main)
[![License](https://img.shields.io/github/license/AztecProtocol/aztec-packages?logo=open-source-initiative)](https://github.com/AztecProtocol/aztec-packages/blob/main/LICENSE)
[![Discord](https://img.shields.io/discord/924442927399313448?logo=discord&color=5865F2)](https://discord.gg/aztec)
[![Twitter Follow](https://img.shields.io/twitter/follow/aztecnetwork?style=flat&logo=twitter)](https://x.com/aztecnetwork)

</div>

---

## 🔹 **What is Aztec Monorepo?**
This repository contains all the packages that power the [Aztec Protocol](https://docs.aztec.network), a **privacy-first** smart contract platform for Ethereum.

### 📦 **Package Overview**
- **[`l1-contracts`](./l1-contracts/)** – Ethereum contracts for rollup processing.
- **[`yarn-project`](./yarn-project/)** – TypeScript code for client and backend.
- **[`docs`](./docs/)** – Source code for the documentation website.

---

## 🚀 **Popular Packages**
| Package | Description |
|---------|------------|
| [**Aztec.nr**](./noir-projects/aztec-nr/) | A [Noir](https://noir-lang.org) framework for smart contracts on Aztec. |
| [**Aztec**](./yarn-project/aztec/) | Devnet modules, rollup contracts, and Aztec execution environment. |
| [**Aztec.js**](./yarn-project/aztec.js/) | A tool for interacting with the Aztec network via [PXE](./yarn-project/pxe/). |
| [**Example Contracts**](./noir-projects/noir-contracts/) | Sample Noir contracts for Aztec. |
| [**End-to-End Tests**](./yarn-project/end-to-end/) | Integration tests in TypeScript, useful for development. |
| [**Aztec Boxes**](./boxes/) | Starter projects for Aztec development. |

---

## 🛠 **Issues Board**
All issues being worked on are tracked in the [Aztec GitHub Project](https://github.com/orgs/AztecProtocol/projects/22).  

For a higher-level roadmap, check the **[Milestones Overview](https://aztec.network/roadmap)** section of our website.

---

## 🛠 **Development Setup**
Run the following command in the project root to set up your development environment:
```sh
./bootstrap.sh full
```
This will:
- Update Git submodules  
- Download Ignition transcripts  
- Install Foundry  
- Compile Solidity contracts  
- Install the required Node.js version using `nvm`  
- Build all TypeScript packages  

Alternatively, if you only need **Noir contracts** and **TypeScript**, run:
```sh
./bootstrap.sh fast
```
⚠️ **Note:** This requires AWS ECR credentials and works only on Ubuntu.

To build TypeScript code, ensure that [`nvm`](https://github.com/nvm-sh/nvm) (Node Version Manager) is installed.

## 🔄 **Continuous Integration**

This repository uses **CircleCI** for continuous integration. Build steps are managed using [`build-system`](https://github.com/AztecProtocol/build-system).  
- **Small packages** are built and tested** inside a Docker build operation.  
- **Larger packages and end-to-end tests** spin up a large AWS spot instance.  
- Each successful build step creates a **new Docker image** tagged with the package name and commit.

All packages must be included in the [build manifest](build_manifest.yml), which defines **paths** and **dependencies**.  
If no rebuild patterns or dependencies change, **the build step is skipped**, and the last successful image is **re-tagged with the current commit**.  
For more details, check the [`build-system`](https://github.com/AztecProtocol/build-system) repository.

It is **faster to debug CI failures** within a **persistent SSH session** than by pushing and waiting.  
To debug, use **"Rerun step with SSH"** on CircleCI, then run the generated SSH command locally:

```sh
cd project  
./build-system/scripts/setup_env "$(git rev-parse HEAD)" "" https://github.com/AztecProtocol/aztec-packages  
source /tmp/.bash_env*  
set +euo  
{start testing your CI commands here}  
```
This provides an interactive environment for debugging CI tests.

---

## 🛠 **Debugging**

Logging is handled by the [Logger](yarn-project/foundation/src/log/) module in TypeScript.  
To control logging levels, set the `LOG_LEVEL` environment variable:  

```sh 
export LOG_LEVEL=debug  
```
For specific modules:  

```sh  
export LOG_LEVEL="warn:module1,module2; error:module3"  
```
---

## 🚀 **Releases**

Releases are managed by [release-please](https://github.com/googleapis/release-please), which maintains a **"Release PR"** with an updated `CHANGELOG.md`.  
To trigger a new release, simply **merge this PR into `master`**.  

A [GitHub Workflow](./.github/workflows/release_please.yml) will then:
- Create the **tagged release**  
- Trigger **CircleCI** to build and deploy the tagged version  

---

## 🤝 **Contribute**

There are many ways to help improve this project!  
Check out the [**Contribution Guide**](CONTRIBUTING.md) for details.

---

## 🔄 **Syncing Noir**

Aztec uses [`git-subrepo`](https://github.com/ingydotnet/git-subrepo) to **mirror Noir repositories**.  
This simplifies code checkout and development **compared to submodules or subtrees**, but adds some complexity to syncing.

If the **automatic mirror is not working**, run:  

```sh 
git subrepo pull noir  
```

### 🔧 **Recovering from sync issues**

If sync does not happen correctly, try these steps manually:

- **Edit the commit variable** in `noir/noir-repo/.gitrepo` to match the commit in `master` after merges.  
- **Edit the parent variable** in `noir/noir-repo/.gitrepo` to match the last sync commit on the Aztec side.  
- **Use `pull --force` ONLY** where you would use `git reset`. This ensures that the correct upstream state is restored but will discard local changes.

---

## ⚙️ **Earthly**

[Earthly](https://docs.earthly.dev/) is a **reproducible build tool** that combines **Docker, Makefiles, and Bash**.  
It defines builds **using a Docker-like syntax** and provides **modularization and caching**.

### 🔹 **Best Practices**
- **Non-build targets** should start with `test-`, `run-`, or `bench-`.  
- **Build targets** can be **nouns** or start with `build-`.  
- **CI-related bundles** should be named `build-ci`, `test-ci`, etc.  
- See `barretenberg/cpp/Earthfile` for an example.  

### 🔹 **How Earthly Works**
- **Docker-based builds** ensure caching and reproducibility.  
- **Supports modular build manifests** with imports, functions, and conditional logic.  
- **Provides separate modes** for **CI (`--ci`)** and **local incremental builds**.  
- Currently, **only Linux and WASM are supported** (no native execution for other platforms).

💬 **Join the Community** :  
<p align="left">
  <a href="https://t.me/aztec_network">
    <img src="https://img.shields.io/badge/Telegram-26A5E4?logo=telegram&logoColor=white&style=for-the-badge" alt="Telegram">
  </a>
  <a href="https://discord.gg/aztec">
    <img src="https://img.shields.io/badge/Discord-5865F2?logo=discord&logoColor=white&style=for-the-badge" alt="Discord">
  </a>
  <a href="https://x.com/aztecnetwork">
    <img src="https://img.shields.io/badge/Twitter-000000?logo=x&logoColor=white&style=for-the-badge" alt="Twitter (X)">
  </a>
</p>

