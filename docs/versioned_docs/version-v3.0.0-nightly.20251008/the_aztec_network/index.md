---
id: index
sidebar_position: 0
title: Running a Full Node
description: A guide about how to run a full node on the Aztec network.
---

## Background

This guide will go over the steps required to run a full node on Aztec with a basic setup.

A full node allows users to connect and interact with the network. It provides users an interface to send and receive transactions and state updates without relying on a third party.

A user should run their own full node if they want to interact with the network in the most privacy preserving way. Furthermore, it is a great way to support the Aztec network and get involved with the community.

Please note that there are two other types of nodes available that we are not covering in this guide. One is a sequencer node, and the other is a prover node. You can find more information on the other types of nodes and how they act in the protocol, as well as advanced guides that go into more feature-complete setups in Guides section of the sidebar.

## Prerequisites

Minimum hardware requirements:

- 2 core / 4 vCPU (released in 2015 or later)
- 16 GB RAM
- 1 TB NVMe SDD
- 25 Mbps network connection

Please note that these requirements are subject to change as the network throughput increases.

Along with the above minimum hardware requirements, it is assumed that the user has access to a performant Ethereum RPC endpoint. Furthermore, this guide expects the user to be using a "standard" Linux distribution like Debian / Ubuntu when following along with the steps.

## Overview

1. Install Docker
2. Install Aztec
3. Configure the node
4. Start the node!

## Install and set up Docker

Ensure Docker is installed. If not, here is a convenient way to install it.
This uses the script at
[https://get.docker.com/](https://get.docker.com/) to install the
latest stable release of Docker on Linux:

```console
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

Afterwards, the currently logged in user must be added to the docker group, so `sudo` is not needed to invoke docker.

```console
sudo groupadd docker
sudo usermod -aG docker $USER
newgrp docker
# Invoke docker without sudo to test if the above changes have been applied successfully
docker run hello-world
```

## Install Aztec

Run these commands to grab the Aztec stack and add them to path.

```console
bash -i <(curl -s https://install.aztec.network)
# Users should check that it is installed by using
ls ~/.aztec/bin
# aztec, aztec-up, aztec-nargo and aztec-wallet should show up here
echo 'export PATH="$HOME/.aztec/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

The next step is to install the correct version of aztec that is running on testnet. The correct version of the aztec network currently is 2.0.2. If that is not the version that was installed in the previous step, please run this to ensure the correct version is installed.

```console
aztec-up 2.0.2
```

The user can confirm that they are running on the correct version with:

```console
aztec --version
```

## Configure the node

Now that the correct version of the node is installed, it needs to be configured correctly. Let's start by making a new directory where the node data can be stored.

```console
mkdir aztec-node && cd ./aztec-node
```

Next, set some required configuration options. This guide will use `custom_named` environment variables (e.g. `AZTEC_NODE_P2P_IP`) but this is not necessary; you can pass values directly into the command without specifying them as environment variables. The external IP address of the node, and the L1 RPC endpoints must be defined when starting a node. Also, configuration defining the network version should be set, as this will let the node define the other required protocol variables, like rollup address, registry address etc. Note that the specified RPC endpoints must support high throughput, otherwise the node will suffer degraded performance.

```console
export AZTEC_NODE_NETWORK=testnet
export AZTEC_NODE_P2P_IP=IP
export AZTEC_NODE_ETH_HOSTS=<execution endpoint>
export AZTEC_NODE_CONSENSUS_HOSTS=<consensus endpoint>
```

:::tip

The ports used by the node must be accessible to other Aztec nodes on the internet. This will require disabling the firewall for and / or forwarding these ports. The router must be able to send UDP and TCP traffic on port 40400 (unless the defaults were changed) to the node IP address on its local network. Failure to do so may result in the node not participating in p2p duties.

Running the command `curl ipv4.icanhazip.com` can retrieve your public IP address for you.
:::

## Run the node

```console
aztec supervised-start --node --archiver --p2p.p2pIp $AZTEC_NODE_P2P_IP --network $AZTEC_NODE_NETWORK --l1-rpc-urls $AZTEC_NODE_ETH_HOSTS --l1-consensus-host-urls $AZTEC_NODE_CONSENSUS_HOSTS
```

To verify the node is working, run these commands in another terminal window:

```console
# Rule 1: For HTTP traffic on port 8080
curl -X POST http://localhost:8080 --data '{"method": "node_getL2Tips"}'
# should return JSON data in the format of "{"result":{"latest":{"number":"...}}}"

# Rule 2: For TCP traffic on port 40400 (set by default)
nc -vz [YOUR_EXTERNAL_IP] 40400
# should return "Connection to [YOUR_EXTERNAL_IP] 40400 port [tcp/*] succeeded!" if port open

# Rule 3: For UDP traffic on port 40400 (set by default)
nc -vu [YOUR_EXTERNAL_IP] 40400
# should return "Connection to [YOUR_EXTERNAL_IP] 40400 port [udp/*] succeeded!" if port open
```

Congrats, the node should be up, running, and connected to the network!
