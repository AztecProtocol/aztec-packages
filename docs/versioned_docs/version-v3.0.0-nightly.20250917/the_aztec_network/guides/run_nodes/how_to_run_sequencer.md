---
sidebar_position: 2
title: How to Run a Sequencer Node
description: A comprehensive guide to setting up and running an Aztec Sequencer node on testnet, including infrastructure requirements, configuration options, and troubleshooting tips.
keywords:
  [
    aztec,
    sequencer,
    node,
    blockchain,
    L2,
    scaling,
    ethereum,
    validator,
    setup,
    tutorial,
  ]
tags:
  - sequencer
  - node
  - tutorial
  - infrastructure
---

## Background

This guide covers the steps required to run a sequencer node on Aztec. It will also provide context to ensure users are comfortable with the steps they are taking.

The Aztec sequencer node is critical infrastructure responsible for ordering transactions and producing blocks.

The sequencer node takes part in three key actions:

1. Assemble unprocessed transactions and propose the next block
2. Attest to correct execution of txs in the proposed block (if part of the sequencer committee)
3. Submit the successfully attested block to L1

When transactions are sent to the Aztec network, sequencer nodes bundle them into blocks, checking various constraints such as gas limits, block size, and transaction validity. Before a block can be published, it must be validated by a committee of other sequencer nodes who re-execute public transactions and verify private function proofs so they can attest to correct execution. These sequencers attest to the block's validity by signing the block header, and once enough attestations are collected (two-thirds of the committee plus one), the sequencer can submit the block to L1.

The archiver component complements this process by maintaining historical chain data. It continuously monitors L1 for new blocks, processes them, and maintains a synchronized view of the chain state. This includes managing contract data, transaction logs, and L1-to-L2 messages, making it essential for network synchronization and data availability.

## Prerequisites

Minimum hardware requirements:

- 2 core / 4 vCPU
- 16 GB RAM
- 1TB NVMe SSD
- 25 Mbps network connection

Please note that these requirements are subject to change as the network throughput increases.

This guide expects you to be using a "standard" Linux distribution like Debian / Ubuntu when following along with the steps.

It also is assumed that you have installed Docker and the aztec toolchain via aztec-up as described in the [getting started section](../../index.md).

Furthermore, as this guide uses Docker compose, you will need to install it. Please follow [this](https://docs.docker.com/compose/install/) guide to do so.

Finally, this guide requires you to have endpoints of an L1 node stack of an execution and consensus client. If you do not have one set up, you can see a good guide on how to do that [here at Eth Docker](https://ethdocker.com/Usage/QuickStart).


## Configure the sequencer

There are a few important things to note when setting up a sequencer. This guide will guide you in setting up and running a sequencer with a standard setup using Docker compose with a .env file.

The setup of the sequencer has four important steps.

1. Define private keys / accounts used for sequencer duties
2. Set required node configuration
3. Ensure auto-update / auto-restart is enabled
4. Apply your Docker compose file

Let's start by creating a new directory called `aztec-sequencer`, with two subdirectories, `keys`, and `data`. This is where all the information used by the sequencer will be stored. Please also create an empty `.env` file in `aztec-sequencer` to define your settings before moving on to the next step.

### Define private keys / accounts

A sequencer must hold and use private keys identifying it as a valid proposer or attester. This is done by defining a keystore file.

An example keystore file is below. Copy this file and save it as `keystore.json` into your `aztec-sequencer/keys` folder.

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": ["ETH_PRIVATE_KEY_0"],
      "publisher": ["ETH_PRIVATE_KEY_1"],
      "coinbase": "ETH_ADDRESS_2",
      "feeRecipient": "AZTEC_ADDRESS_0"
    }
  ]
}
```

The keystore defines a few important keys and addresses for sequencer operation. They include but are not limited to:

- `attester`: the private key of the sequencer, used for signing block proposals and attestations on block proposals produced by other sequencers. The corresponding Ethereum address of the private key is the identity of the sequencer.
- `publisher`: the private key of the Ethereum EOA used for sending the block proposal to L1. This defaults to the attester private key if not set.
- `coinbase`: the Ethereum address set in a block proposal. L1 rewards and fees are sent to this address. This falls back to the address derived by the attester private key if not set.
- `feeRecipient`: the Aztec Address of the fee recipient address when proposing blocks. The unburnt portion of the tx fees in a given block are sent to this address.

Please set these values with the ones you want and save `keystore.json`.

### Node configuration

Next you will need to define some environment variables that set important configuration for your node.

These include:

- `DATA_DIRECTORY`: the folder where the data of the sequencer is stored
- `KEY_STORE_DIRECTORY`: can be a path to the file or directory where keystores are located. In our case it is the path to the folder containing the `keystore.json` file created above
- `LOG_LEVEL`: the desired level of logging for the sequencer. It defaults to `INFO`.
- `ETHEREUM_HOSTS`: The execution RPC endpoints
- `L1_CONSENSUS_HOST_URLS`: The consensus RPC endpoints
- `P2P_IP`: The IP address of this sequencer
- `P2P_PORT`: The port that P2P communication happens on
- `AZTEC_PORT`: The port that the sequencer node API is exposed on

Please paste this sample `.env` file into the empty one currently residing in your `aztec-sequencer` folder. Please note that we are assuming you are using the default ports of 8080 for the sequencer itself, and 40400 for p2p connectivity. If this is not the case, please overwrite the defaults below.

```sh
DATA_DIRECTORY=./data
KEY_STORE_DIRECTORY=./keys
LOG_LEVEL=info
ETHEREUM_HOSTS=<your L1 execution endpoint, or a comma separated list if you have multiple>
L1_CONSENSUS_HOST_URLS=<your L1 consensus endpoint, or a comma separated list if you have multiple>
P2P_IP=<your external IP address>
P2P_PORT=40400
AZTEC_PORT=8080
```

:::tip
Forward your ports. Your router must send UDP and TCP traffic on the port specified by `P2P_PORT` to your IP address on your local network.

Running the command `curl ipv4.icanhazip.com` can retrieve your public IP address for you.
:::

### Enable auto-update / auto-restart

It is imperative that the built in auto-updating functionality of the sequencer is not disabled. The update-checker is a background module in the Aztec node that enables global coordination of updates. It allows the protocol team to:

- Push configuration changes to all nodes
- Trigger shutdowns so that nodes can pull the latest image version
- Apply hot-fixes quickly
- Coordinate node resets after a governance upgrade, especially when a new canonical rollup is published to the Registry

This module ensures that upgrades and fixes propagate smoothly without requiring manual intervention from every node operator.

Please ensure environment variables:

`AUTO_UPDATE_URL` and `AUTO_UPDATE` remain unset, as to take their default values (which are the s3 bucket being used to host the update information, and `config-and-version` respectively).

Because docker-compose does not respect pull policies on container restarts, to handle updates properly, add Watchtower to your stack by running:

```sh
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower
```

### Applying your Docker compose file

Now that you have done all the setup, create a Docker compose file named `compose.yml` in your `aztec-sequencer` directory and paste the below code into it.

```yaml
services:
  aztec-sequencer:
    image: "aztecprotocol/aztec:latest"
    container_name: "aztec-sequencer"
    ports:
      - ${AZTEC_PORT}:${AZTEC_PORT}
      - ${P2P_PORT}:${P2P_PORT}
      - ${P2P_PORT}:${P2P_PORT}/udp
    volumes:
      - ${DATA_DIRECTORY}:/var/lib/data
      - ${KEY_STORE_DIRECTORY}:/var/lib/keystore
    environment:
      KEY_STORE_DIRECTORY: /var/lib/keystore
      DATA_DIRECTORY: /var/lib/data
      LOG_LEVEL: ${LOG_LEVEL}
      ETHEREUM_HOSTS: ${ETHEREUM_HOSTS}
      L1_CONSENSUS_HOST_URLS: ${L1_CONSENSUS_HOST_URLS}
      P2P_IP: ${P2P_IP}
      P2P_PORT: ${P2P_PORT}
      AZTEC_PORT: ${AZTEC_PORT}
    entrypoint: node /usr/src/yarn-project/aztec/dest/bin/index.js
    command: >-
      start
      --network testnet
      --node
      --archiver
      --sequencer
    networks:
      - aztec
    restart: always

networks:
  aztec:
    name: aztec
```

Please note that we are setting only the necessary configuration for running this sequencer. The full list of settings and flags can be explored here at the [cli reference](../../reference/cli_reference.md). A lot of these options are preset to defaults by the `--network` flag above. This downloads defaults for the specified network and applies them to the node.

Now, you can run `docker compose up` inside your `aztec-sequencer` folder to start the sequencer!

To check if your sequencer is currently synced, which may take a few minutes, run this command and compare its output to any of the Aztec block explorers. (See [Aztec Scan](https://aztecscan.xyz/) or [Aztec Explorer](https://aztecexplorer.xyz/))

```sh
curl -s -X POST -H 'Content-Type: application/json' \
-d '{"jsonrpc":"2.0","method":"node_getL2Tips","params":[],"id":67}' \
http://localhost:8080 | jq -r ".result.proven.number"
```

## Add yourself to the testnet sequencer set

After setting up your node you must explicitly request to be added to the sequencer set.

To complete this final step you can now head to [testnet.aztec.network](https://testnet.aztec.network) and complete the onboarding flow there utilizing zkPassport!
