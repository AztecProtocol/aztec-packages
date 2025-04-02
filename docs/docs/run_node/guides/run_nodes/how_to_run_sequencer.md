---
sidebar_position: 1
title: How to run a Sequencer Node
---

Starting a Sequencer node is not too different from starting a [sandbox](../../../developers/getting_started.md). While the sandbox starts all the components needed for local development, the Sequencer workflow is more focused on testnet and mainnet features and provides more flexibility to suit your own environment.

## Prerequisites

Before following this guide, make sure you:

- Have the `aztec` tool [installed](../../../run_node/index.md) and updated to the latest version
- Understand how [Provers and Sequencers](../../concepts/provers-and-sequencers/) work
- Are running a Linux or MacOS machine and you know how to use a terminal

## Getting started

The `aztec` CLI tool really is a one-stop-shop for pretty much everything, from a local dev environment to a prover node with multiple agents.

Running a sequencer is not more than "assembling" a basic command that will boot a docker container with the right services: node, sequencer, and optionally archiver.

### Grab your RPC URLs

Sequencing involves grabbing values from both L2 and L1. It is intended that you bring your own infrastructure, or subscribe to any service that will provide it for you. You will need:

- An Ethereum _execution_ node RPC. For example from [DRPC](https://drpc.org/chainlist/ethereum) or [Alchemy](https://www.alchemy.com/ethereum). This is where the new state will be sent and verified when you produce a block.
- An Ethereum _beacon_ node RPC. For example [DRPC](https://drpc.org/chainlist/eth-beacon-chain#eth-beacon-chain-sepolia) provides one. The beacon node is required in order to grab data from the blob space.

:::warn

The `free` route will likely get you rate-limited and you won't be able to sync. You will need to set up a paid plan or `pay-as-you-go`.

:::

### Run your node

The command to start the different modules is `aztec start`, and the different components are selected by passing different flags. For a basic sequencer, we need the following ones:

- `--network` \<network\> - Selects the docker image for the expected network (ex. `alpha-testnet`). This will setvalues such as contract addresses, bootnodes, L1 ChainID, and others.
- `--l1-rpc-urls` \<execution-node\> - The URL to use as the L1 execution node you've set up
- `--l1-consensus-host-url` \<beacon-node\> - The URL of the L1 beacon node you've set up
- `--l1-consensus-host-api-key-header` \<header-key\> - If your beacon RPC requires the API key to be set on a header, provide its key here (ex. "API-KEY: \<api-key\>"). Leave empty if your beacon RPC expects the key to be in the query parameters (ex. \<the-url\>/?key=\<api-key\>)
- `--l1-consensus-host-api-key` \<api-key\> - The beacon node API key. You can leave this empty if the URL already contains the key (ex. \<the-url\>/rest/\<api-key>/eth-beacon-chain-sepolia)
- `--archiver` - Starts the archiver service, which will store the synced blocks.
- `--node` - Starts the node service, which will grab the data from the L1 RPCs

An example command would be:

```bash
aztec start --network alpha-testnet --l1-rpc-urls https://eth-sepolia.g.alchemy.com/v2/your-key --l1-consensus-host-url https://lb.drpc.org/rest/your-key/eth-beacon-chain-sepolia --archiver --node
```

This will get you to connect to a bootnode, find other peers, get the contract addresses, and download previous blocks:

```bash
INFO: archiver Starting archiver sync to rollup contract... etc
INFO: archiver Downloaded L2 block 1... etc
```

## Run your sequencer

As of the alpha testnet, there's no fast sync, so your node will actually sync everything from the beginning of (Aztec) times, which _will_ take a few hours.

Feel free to leave it syncing as you get ready to restart it using the sequencer configuration.

:::info

This is a good time to try the `sparta` discord bot. On the `this-is-spartaa` channel, type /get-info. The mighty spartan will hopefully print out the latest stats, for example:

```md
Pending block: 11067
Proven block: 11043
Current epoch: 375
Current slot: 12023
Proposer now: 0x00000
```

You can look at your own logs and have a sense of how far away from the tip you are.

:::

### Flags and coffee

To boot up a sequencer, there are a few more flags needed:

- `--sequencer` - Self-explanatory, this starts the sequencer module.
- `--sequencer.validatorPrivateKey` - This is your sequencer's private key, the one signing attestations and blocks.
- `--p2p.p2pIp` - Your node's IP, so other nodes can connect. If your IP changes frequently, you can assign a fixed hostname (i.e. with [NoIp](https://www.noip.com/) or similar services)

You also need to __fund__ your sequencer. In short, it needs two types of funds:

- Sepolia ETH, in order to register and publish L1 blocks
- TST, known as the fee-paying asset, in order to stake.

You're expected to bring your own Sepolia ETH. Use services like [https://sepolia-faucet.pk910.de/](this PoW faucet) to get it. You can also drop a message on Discord and our kind community will hopefully drip you some (just make sure you do the same for others!).

As for the TST asset, you will mint it once you're synced and ready to register. For now, just grab a coffee. Or several.

## Registering

Being a decentralized testnet means anyone can deposit TST and become a validator. To make our tester's life easier, the Aztec Labs team will help you mint those, as long as you pass a simple challenge: provide a proof that your node is synced with a recent block.

Fire up a terminal and call your own node, like:

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"node_getL2Tips","params":[],"id":67}' "http://<your-node-ip>:<your-node-port>" | jq ".result.proven.number"
```

This will give you a block number. Now, get a proof you have that block number:

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"node_getArchiveSiblingPath","params":[11262,11262],"id":67}' "http://<your-node-ip>:<your-node-port>" | jq ".result"
```

It will return a long base64-encoded string

# Running a Sequencer using Aztec Spartan

This tool helps to boot an Aztec Sequencer and Prover (S&P) Testnet.

This script does the following:

- Checks for the presence of Docker in your machine
- Prompts you for some environment variables
- Outputs a templated docker-compose file with your variables
- Runs the docker compose file

It should work in most UNIX-based machines.

## Installation

To configure a new node, create a new directory and run the install script:

```bash
mkdir val1 && cd val1
curl -L sp-testnet.aztec.network | bash
```

This will install `aztec-spartan.sh` in the current directory. You can now run it:

```bash
./aztec-spartan.sh config
```

If you don't have Docker installed, the script will do it for you. It will then prompt for any required environment variables and output both a `docker-compose.yml` and an `.env` file. You will also be prompted to choose whether to use a [named volume](https://docs.docker.com/engine/storage/volumes/) (default) or if you want to use a local directory to store the node's data.

Run `./aztec-spartan.sh` without any command to see all available options, and pass them as flags, i.e. `npx aztec-spartan config -p 8080 -p2p 40400`. If you want to use a different key for p2p peer id, pass it with `-pk <your_key>`.

For more options, see the [Node Configuration](#node-configuration) section.

:::tip
Ensure that each validator instance uses unique ports to avoid conflicts.
:::

## Running

You can use `npx aztec-spartan [start/stop/logs/update]` to start, stop, output logs or pull the latest docker images.

:::note
The above deploy script will connect your node to the p2p network where it will register peers and start receiving messages from other nodes on the network. You will not be in the validator set just yet.

Once you connect and begin to see gossiped messages such as attestations, proposals etc notify notify a team member and they will add you to the validator set.
:::

## Node Configuration

The `aztec-spartan.sh` script will set the following required variables on your behalf. You can ofcourse override the variables set by the script by simply changing the `.env` file directly and re-running `./aztec-spartan.sh`

| Variable       | Description                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ETHEREUM_HOSTS | List of URLs of Ethereum nodes (comma separated). For as long as we're on private networks, please use the value in `aztec-spartan.sh` |
| BOOTNODE_URL   | URL to a bootnode that supplies L1 contract addresses and the ENR of the bootstrap nodes.                                              |
| IMAGE          | The docker image to run                                                                                                                |

In addition, the user is prompted to enter 1) an IP Address and a P2P port to be used for the TCP and UDP addresses (defaults to 40400) 2) A port for your node (8080) 3) an Ethereum private key 4) `COINBASE` which is the Ethereum address associated with the private key and 5) a path to a local directory to store node data if you don't opt for a named volume.

On a first run, the script will generate a p2p private key and store it in `$DATA_DIR/var/lib/aztec/p2p-private-key`. If you wish to change your p2p private key, you can pass it on as a CLI arg using the flag `-pk` or update the `PEER_ID_PRIVATE_KEY` in the env file.

### Publisher and Archiver

The Publisher is the main node component that interacts with the Ethereum L1, for read and write operations. It is mainly responsible for block publishing, proof submission and tx management.

The Archiver's primary functions are data storage and retrieval (i.e. L1->L2 messages), state synchronization and re-org handling.

| Variable                       | Description                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ETHEREUM_HOSTS                 | List of L1 node URLs (comma separated) your validator will connect to. For as long as we're on private networks, please use the value in `aztec-spartan.sh` |
| L1_CHAIN_ID                    | Chain ID of the L1                                                                                                                                          |
| DATA_DIRECTORY                 | Optional dir to store archiver and world state data. If omitted will store in memory                                                                        |
| ARCHIVER_POLLING_INTERVAL_MS   | The polling interval in ms for retrieving new L2 blocks and encrypted logs                                                                                  |
| SEQ_PUBLISHER_PRIVATE_KEY      | This should be the same as your validator private key                                                                                                       |
| SEQ_PUBLISH_RETRY_INTERVAL_MS  | The interval to wait between publish retries                                                                                                                |
| SEQ_VIEM_POLLING_INTERVAL_TIME | The polling interval viem uses in ms                                                                                                                        |

### Sequencer Config

The Sequencer Client is a criticial component that coordinates tx validation, L2 block creation, collecting attestations and block submission (through the Publisher).

| Variable                                   | Description                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VALIDATOR_DISABLED                         | If this is True, the client won't perform any validator duties.                                                                                                     |
| VALIDATOR_ATTESTATIONS_WAIT_TIMEOUT_MS     | Wait for attestations timeout. After this, client throws an error and does not propose a block for that slot.                                                       |
| VALIDATOR_ATTESTATIONS_POLLING_INTERVAL_MS | If not enough attestations, sleep for this long and check again                                                                                                     |
| GOVERNANCE_PROPOSER_PAYLOAD_ADDRESS        | To nominate proposals for voting, you must set this variable to the Ethereum address of the `proposal` payload. You must edit this to vote on a governance upgrade. |
| SEQ_ENFORCE_TIME_TABLE                     | Whether to enforce strict timeliness requirement when building blocks. Refer [here](#sequencer-timeliness-requirements) for more on the timetable                   |
| SEQ_MAX_TX_PER_BLOCK                       | Increase this to make larger blocks                                                                                                                                 |
| SEQ_MIN_TX_PER_BLOCK                       | Increase this to require making larger blocks                                                                                                                       |
| COINBASE                                   | This is the Ethereum address that will receive the validator's share of block rewards. It defaults to your validator address.                                       |
| FEE_RECIPIENT                              | This is the Aztec address that will receive the validator's share of transaction fees. Also defaults to your validator's address (but on Aztec L2).                 |

#### Sequencer Timeliness Requirements

During testing, it was helpful to constrain some actions of the sequencer based on the time passed into the slot. The time-aware sequencer can be told to do action A only if there's a certain amount of time left in the slot.

For example, at the beginning of a slot, the sequencer will first sync state, then request txs from peers then attempt to build a block, then collect attestations then publish to L1. You can create constraints of the form "Only attempt to build a block if under 5 seconds have passed in the slot".

If this is helpful in your testing as well, you can turn it on using the environment variable `SEQ_ENFORCE_TIME_TABLE`.

Currently the default timetable values are hardcoded in [sequencer.ts](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/sequencer-client/src/sequencer/sequencer.ts#L72). Time checks are enforced in `this.setState()`.

### P2P Config

The P2P client coordinates peer-to-peer communication between Nodes.

| Variable                    | Description                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| BOOTSTRAP_NODES             | A list of bootstrap peer ENRs to connect to. Separated by commas.                                                              |
| P2P_IP                      | The client's public IP address. Defaults to working it out using disv5, otherwise set P2P_QUERY_FOR_IP if you are behind a NAT |
| P2P_PORT                    | The port that will be used for sending / receiving p2p messages. Defaults to 40400.                                            |
| P2P_LISTEN_ARR              | Address to listen on for p2p messages. Defaults to 0.0.0.0                                                                     |
| P2P_UDP_LISTEN_ADDR         | Format: `<IP_ADDRESS>:<TCP_PORT>` or can use `0.0.0.0:<UDP_PORT>` to listen on all interfaces                                  |
| P2P_QUERY_FOR_IP            | Useful in dynamic environments where your IP is not known in advance.                                                          |
| P2P_ENABLED                 | Whether to run the P2P module. Defaults to False, so make sure to set to True                                                  |
| P2P_MAX_PEERS               | The max number of peers to connect to.                                                                                         |
| P2P_BLOCK_CHECK_INTERVAL_MS | How milliseconds to wait between each check for new L2 blocks.                                                                 |

### Prover Config

Please refer to the [Prover Guide](./how_to_run_prover.md) for info on how to setup your prover node.

## Governance Upgrades

During a governance upgrade, we'll announce details on the discord. At some point we'll also write AZIPs (Aztec Improvement Proposals) and post them to either the github or forum to collect feedback.

We'll deploy the payload to the L1 and share the address of the payload with the sequencers on discord.

To participate in the governance vote, sequencers must change the variable `GOVERNANCE_PROPOSER_PAYLOAD_ADDRESS` in the Sequencer Client to vote during the L2 slot they've been assigned sequencer duties.

## Troubleshooting

:::tip
Please make sure you are in the Discord server and that you have been assigned the role `S&P Participant`. Say gm in the `sequencer-and-prover` channel and turn on notifications for the announcements channel.
:::

If you encounter any errors or bugs, please try basic troubleshooting steps like restarting your node, checking ports and configs.

If issue persists, please share on the sequencer-and-prover channel and tag [Amin](discordapp.com/users/65773032211231539).

Some issues are fairly light, the group and ourselves can help you within 60 minutes. If the issue isn't resolved, please send more information:

**Error Logs**: Attach any relevant error logs. If possible, note the timestamp when the issue began.
**Error Description**: Briefly describe the issue. Include details like what you were doing when it started, and any unusual behaviors observed.
**Steps to Reproduce (if known)**: If there’s a clear way to reproduce the error, please describe it.
**System Information**: Share details like your system’s operating system, hardware specs, and any other relevant environment information.

That way we can dedicate more time to troubleshoot and open Github issues if no known fix.
