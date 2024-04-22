---
title: Quickstart
---

In this guide, you will

1. Set up the Aztec sandbox (local development environment) locally
2. Install the Aztec development kit
3. Use Aztec.js to deploy an example contract that comes with the sandbox
4. Use Aztec.js to interact with the contract you just deployed

... in less than 10 minutes.

## Prerequisites

- Node.js >= v18 (recommend installing with [nvm](https://github.com/nvm-sh/nvm))

## Install Docker

Aztec tooling requires the Docker daemon to be running, and this is easily achieved via Docker Desktop. See [this page of the Docker docs](https://docs.docker.com/get-docker/) for instructions on how to install Docker Desktop for your operating system.
Note: if installing via Docker Desktop, you do NOT need to keep the application open at all times (just Docker daemon).

Installing and running the Docker daemon can also be achieved by installing Docker Engine, see [these instructions](https://docs.docker.com/engine/install/).

However installed, ensure Docker daemon is running. See [start Docker daemon](https://docs.docker.com/config/daemon/start/).

### Note on Linux

If you are running Linux, you will need to set the context (because Docker Desktop runs in a VM by default). See [this page](https://docs.docker.com/desktop/faqs/linuxfaqs/#what-is-the-difference-between-docker-desktop-for-linux-and-docker-engine) for more information. You can do this by running:

```bash
docker context use default
```

## Install the Sandbox

You can run the Sandbox using Docker.

To install the latest Sandbox version, run:

```bash
bash -i <(curl -s install.aztec.network)
```

> If Docker has been installed on your linux server but you encounter the error "Docker is not running. Please start Docker and try again". If you're encountering this issue, it's likely because Docker is running with root user privileges. In such cases, consider [managing Docker as a non-root user](https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user) to resolve the problem.


This will install the following:

- **aztec** - launches various infrastructure subsystems (sequencer, prover, pxe, etc).
- **aztec-nargo** - a command line tool for interfacing and experimenting with infrastructure.
- **aztec-nargo** - aztec's build of nargo, the noir compiler toolchain.
- **aztec-sandbox** - a wrapper around docker-compose that launches services needed for sandbox testing.
- **aztec-up** - a tool to upgrade the aztec toolchain to the latest, or specific versions.

Once these have been installed, to start the sandbox, run:

```bash
aztec-sandbox
```

This will attempt to run the Sandbox on ` localhost:8080`, so you will have to make sure nothing else is running on that port or change the port defined in `./.aztec/docker-compose.yml`. Running the installation again will overwrite any changes made to the `docker-compose.yml`.

## Connect to your sandbox using Aztec.jS

Create a node project like this:

```bash
mkdir example_aztec_js && cd example_aztec_js && npm init
```
Keep pressing enter to create a project with default setup. Inside the project, create a new file where our JavaScript will go:

```bash
mkdir deploy_and_interact.js
```

Then paste these imports:

and this:

This connects to your private execution environment (PXE) in your sandbox, which is responsible for simulating transactions and storing keys. It then prints the node info, which is the node version, compatible Noir version, L1 chain identifier, protocol version, and L1 address of the rollup contract.

Run this with

```bash
node example_aztec_js
```

You should see something like this:

```bash

```

## Deploy a contract with Aztec.js

The sandbox is preloaded with multiple contract artifacts and accounts that we can use for deploying. Let's deploy a token contract.

Paste this into your script after the PXE connection part:

This deploys a contract with the parameters accepted by its initializer.

Save and rerun the script 

```bash
node example_aztec_js
```

and you should now see the contract address:

```bash
```

If you open the terminal where your sandbox is running, you'll see some TODO


## Call a contract with Aztec.js

We will now mint tokens to Alice. 

In your script, paste this:

#include_code

This gets the contract instance and sends a transaction.  

Now paste this to print the new balance of Alice:

This simulates a read-only function.

## What's next?

To dive deeper into Aztec.js, go to the [next page](aztecjs-getting-started.md).

To skip this and write your first smart contract, go to the [Aztec.nr getting started page](aztecnr-getting-started.md).

