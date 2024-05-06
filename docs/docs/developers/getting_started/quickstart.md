---
title: Quickstart
---

Getting started on Aztec is easy. Here are the three recommended ways of starting developing on Aztec:

- Codespaces - For a zero-requirement, <5min starter that runs on your grandma's IBM PC, you can use Github Codespaces, which is free up to 60h per month.
- `npx create-aztec-app` - Will guide you through the "Aztec Boxes": full boilerplate projects with a built-in sandbox. Requires node, docker and some 4gb RAM at least.
- Manual install - Install the sandbox and only the sandbox.

## 1. Codespaces

Please click one of these buttons and hit "create codespace":

[![One-Click React Starter](/img/codespaces_badges/react_cta_badge.svg)](https://codespaces.new/AztecProtocol/aztec-packages?devcontainer_path=.devcontainer%2Freact%2Fdevcontainer.json) [![One-Click HTML/TS Starter](/img/codespaces_badges/vanilla_cta_badge.svg)](https://codespaces.new/AztecProtocol/aztec-packages?devcontainer_path=.devcontainer%2Fvanilla%2Fdevcontainer.json) [![One-Click Token Starter](/img/codespaces_badges/token_cta_badge.svg)](https://codespaces.new/AztecProtocol/aztec-packages?devcontainer_path=.devcontainer%2Ftoken%2Fdevcontainer.json)

That's it!

This creates a codespace with a prebuilt image containing one of the "Aztec Boxes" and a development network (sandbox). 
- You can develop directly on the codespace, push it to a repo, make yourself at home.
- You can also just use the sandbox that comes with it. The URL will be logged, you just need to use it as your `PXE_URL`.

## 2. Aztec Boxes

The above method uses Aztec boxes to install the sandbox and clone the repo. You can use it too to get started on your own machine and use your own IDE

### Prerequisites

- Node.js >= v18 (recommend installing with [nvm](https://github.com/nvm-sh/nvm))
- Docker (visit [this page of the Docker docs](https://docs.docker.com/get-docker/) on how to install it)

### Run the `npx` script

With the node installation, you now should have `npm` and be able to run `npx` scripts. You can do that running:

```bash
npx create-aztec-app
```

And follow the instructions. If all goes well, you should now have a development environment running locally on your machine.

You can run `npx create-aztec-app sandbox -h` to start, stop, update and output logs from the sandbox. 

## 3. Manual Install

If you don't want a boilerplate project, you can also install the sandbox via the underlying script used by the `npx` command.

### Prerequisites

- Node.js >= v18 (recommend installing with [nvm](https://github.com/nvm-sh/nvm))
- Docker (visit [this page of the Docker docs](https://docs.docker.com/get-docker/) on how to install it)

### Install the sandbox

To install the latest Sandbox version, run:

```bash
bash -i <(curl -s install.aztec.network)
```

This will install the following tools:

- **aztec** - launches various infrastructure subsystems (sequencer, prover, pxe, etc).
- **aztec-nargo** - aztec's build of nargo, the noir compiler toolchain.
- **aztec-sandbox** - a wrapper around docker-compose that launches services needed for sandbox testing.
- **aztec-up** - a tool to upgrade the aztec toolchain to the latest, or specific versions.
- **aztec-builder** - A useful tool for projects to generate ABIs and update their dependencies.

Once these have been installed, to start the sandbox, run:

```bash
aztec-sandbox
```

### Have fun!

**Congratulations, you have just installed and run the Aztec Sandbox!**

```bash                
     /\        | |
    /  \    ___| |_ ___  ___
   / /\ \  |_  / __/ _ \/ __|
  / ____ \  / /| ||  __/ (__
 /_/___ \_\/___|\__\___|\___|

```

In the terminal, you will see some logs:
1. Sandbox version
2. Contract addresses of rollup contracts
3. PXE (private execution environment) setup logs
4. Initial accounts that are shipped with the sandbox and can be used in tests

## What's next?

To deploy a smart contract to your sandbox and interact with it using Aztec.js, go to the [next page](aztecjs-getting-started.md).

To skip this and write your first smart contract, go to the [Aztec.nr getting started page](aztecnr-getting-started.md).


