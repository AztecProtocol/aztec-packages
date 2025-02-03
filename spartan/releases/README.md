# Aztec Spartan

Sparta is Aztec's Sequencer and Prover Testnet project. The goal is to bootstrap a long-standing network that does no more than sequence dummy transactions made by a centralized bot, test the sequencer-prover communication, boostrap theoretical proving speeds and network TPS, etc.

![Aztec Sparta Meme](./assets/banner.jpeg)

- [Getting started](#getting-started)
  - [Installation](#installation)
  - [Running](#running)
  - [Pick your role](#pick-your-role)
- [Common configuration](#common-configuration)
  - [Minimal node configuration](#minimal-node-configuration)
  - [Publisher and Archiver](#publisher-and-archiver)
  - [P2P](#p2p)
- [Sequencer Config](#sequencer-config)
  - [Sequencer Timeliness Requirements](#sequencer-timeliness-requirements)
- [Prover Config](#prover-config)
  - [Prover Node configuration](#prover-node-configuration)
  - [Prover Agent configuration](#prover-agent-configuration)
  - [Governance Upgrades](#governance-upgrades)
- [Troubleshooting](#troubleshooting)

## Getting started

For once, there's no rocket science here. The `aztec-spartan` script does the following:

- Checks for the presence of Docker in your machine
- Prompts you for some environment variables
- Outputs a templated docker-compose file with your variables
- Runs the docker compose file

It should work in most UNIX-based machines.

### Installation

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

> [!TIP]
> Ensure that each validator instance uses unique ports to avoid conflicts.

### Running

To spare you a few keystrokes, you can use `npx aztec-spartan [start/stop/logs/update]` to start, stop, output logs or pull the latest docker images.

> [!NOTE]
> The above deploy script will connect your node to the p2p network where it will register peers and start receiving messages from other nodes on the network. You will not be in the validator set just yet.
>
> Once you connect and begin to see gossiped messages such as attestations, proposals etc notify notify a team member and they will add you to the validator set.

### Pick your role

From here you should have a network that is correctly synced. On Spartan, there are two main roles:

1. Sequencer (AKA validator)
2. Prover

You can even do both. It all depends on your node configuration and the params that are set to run the Aztec image. For example running it with entrypoint `--node --archiver --sequencer` starts a full node, archiver and sequencer, which are necessary for sequencing.

## Common configuration

The default `aztec-spartan.sh` script is currently set to onboard sequencers, and will set the following required variables on your behalf. You can of course override the variables set by the script by simply changing the `.env` file directly and re-running `./aztec-spartan.sh`

You're prompted to enter:

- An IP (can be fetched automatically with [ipify](https://api.ipify.org))
- A P2P port to be used for the TCP and UDP addresses (defaults to 40400)
- A port for your node (defaults to 8080)
- An Ethereum private key (mandatory)
- A path to a local directory to store node data if you don't opt for a named volume.

### Minimal node configuration

To sequence, you need to sync with the network. This means connecting it to an ethereum network, and getting the node info (such as contract addresses) from a bootnode. This sets the following variables:

| Variable      | Description                                                                                                                                   |
|---------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| ETHEREUM_HOST | URL to the Ethereum node your validator will connect to. For as long as we're on private networks, please use the value in `aztec-spartan.sh` |
| BOOTNODE_URL  | URL to a bootnode that supplies L1 contract addresses and the ENR of the bootstrap nodes.                                                     |
| IMAGE         | The docker image to run                                                                                                                       |
| AZTEC_PORT    | The RPC port for external communication. Defaults to 8080.                                                                                    |

### Publisher and Archiver

The Publisher is the main node component that interacts with the Ethereum L1, for read and write operations. It is mainly responsible for block publishing, proof submission and tx management.

The Archiver's primary functions are data storage and retrieval (i.e. L1->L2 messages), state synchronization and re-org handling. These environment variables are set automatically when you run `aztec-spartan`, according to the prompts:

| Variable                     | Description                                                                          | Default |
|------------------------------|--------------------------------------------------------------------------------------|---------|
| L1_CHAIN_ID                  | Chain ID of the L1                                                                   | 31337   |
| DATA_DIRECTORY               | Optional dir to store archiver and world state data. If omitted will store in memory | _auto_  |
| ARCHIVER_POLLING_INTERVAL_MS | The polling interval in ms for retrieving new L2 blocks and encrypted logs           | 1000    |
| SEQ_PUBLISHER_PRIVATE_KEY    | This should be the same as your validator private key                                | _auto_  |

### P2P

In any blockchain, the validator must be reachable by other nodes in order to attest blocks, become part of the sync committee, and broadcast transaction. This is the role of the P2P client. For this, a P2P key is needed for encryption.

> [!TIP]
> You can pass a specific P2P private key when starting your node by adding `-pk <privatekey>` to your `aztec-spartan` command, or setting the `PEER_ID_PRIVATE_KEY` in the resulting `.env` file.

Some of the variables should be automatically set by the `aztec-spartan` for the current deployed network. But some of them can be set manually for more fine-grained control:

| Variable              | Description                                                                                    | Default                                        |
|-----------------------|------------------------------------------------------------------------------------------------|------------------------------------------------|
| BOOTSTRAP_NODES       | A list of bootstrap peer ENRs to connect to. Separated by commas.                              | _auto_                                         |
| P2P_TCP_ANNOUNCE_ADDR | The TCP address you will be using to broadcast and announce. Format: `<IP_ADDRESS>:<TCP_PORT>` | <queries [ipify](https://api.ipify.org)>:40400 |
| P2P_UDP_ANNOUNCE_ADDR | Same as above if using UDP. Format: `<IP_ADDRESS>:<UDP_PORT>`                                  | <queries [ipify](https://api.ipify.org)>:40400 |
| P2P_TCP_LISTEN_ADDR | The address you will be using for listening to the network. This allows you to listen on different interfaces or subnets. Format: `<IP_ADDRESS>:<TCP_PORT>. Use`0.0.0.0:<TCP_PORT>` to listen on all interfaces | 0.0.0.0:40400 |
| P2P_UDP_LISTEN_ADDR | Same as above if using UDP. | 0.0.0.0:40400 |
| P2P_QUERY_FOR_IP | Useful in dynamic environments where your IP is not known in advance. Set this to True, and only supply `:TCP_PORT` and `:UDP_PORT` for the `ANNOUNCE_ADDR` variables. If you know your public IP address in advance, set this to False or just provide the full announce addresses. | _not set_ |
| P2P_ENABLED | Whether to run the P2P module. | True |
| P2P_MIN_PEERS | The min number of peers to connect to.  | _not set_ |
| P2P_MAX_PEERS | The max number of peers to connect to.  | _not set_ |
| P2P_BLOCK_CHECK_INTERVAL_MS | How milliseconds to wait between each check for new L2 blocks. | 10000 |

## Sequencer Config

The Sequencer Client is a critical component that coordinates tx validation, L2 block creation, collecting attestations and block submission (through the Publisher). The Sequencer _does not prove_ by default, it instead relies on an external prover. You can read more about how the network works in the [aztec docs](https://docs.aztec.network/aztec/network/sequencer/sequencer_selection).

To become a sequencer, the following variables must be set. Currently, the `aztec-spartan` will set them automatically, but this can change in the future.

| Variable                                   | Description                                                                                                                                                         | Default                                  |
|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------|
| VALIDATOR_DISABLED                         | If this is True, the client won't perform any validator duties.                                                                                                     | false                                    |
| VALIDATOR_ATTESTATIONS_POLLING_INTERVAL_MS | If not enough attestations, sleep for amount of milliseconds and check again                                                                                        | 200                                      |
| GOVERNANCE_PROPOSER_PAYLOAD_ADDRESS        | To nominate proposals for voting, you must set this variable to the Ethereum address of the `proposal` payload. You must edit this to vote on a governance upgrade. | 0x00..00                                 |
| SEQ_ENFORCE_TIME_TABLE                     | Whether to enforce strict timeliness requirement when building blocks. Refer [here](#sequencer-timeliness-requirements) for more on the timetable                   | false                                    |
| SEQ_MAX_TX_PER_BLOCK                       | Maximum transactions before a block is created and broadcasted. Increase this to make larger blocks                                                                 | 32                                       |
| SEQ_MIN_TX_PER_BLOCK                       | Increase this to require making larger blocks                                                                                                                       | 1                                        |
| SEQ_MIN_SECONDS_BETWEEN_BLOCKS             | If greater than zero, the sequencer will not propose a block until this much time has passed since the last L2 block was published to L1                            | 0                                        |
| SEQ_MAX_SECONDS_BETWEEN_BLOCKS             | Sequencer will ignore the minTxPerBlock if this many seconds have passed since the last L2 block.                                                                   | 0                                        |
| COINBASE                                   | This is the _Ethereum_ address that will receive the validator's share of block rewards                                                                             | _auto (same as validator address)_       |
| FEE_RECIPIENT                              | This is the _Aztec_ address that will receive the validator's share of transaction fees                                                                             | _auto (same as Aztec validator address)_ |

#### Sequencer Timeliness Requirements

During testing, it was helpful to constrain some actions of the sequencer based on the time passed into the slot. The time-aware sequencer can be told to do action A only if there's a certain amount of time left in the slot.

For example, at the beginning of a slot, the sequencer will first sync state, then request txs from peers then attempt to build a block, then collect attestations then publish to L1. You can create constraints of the form "Only attempt to build a block if under 5 seconds have passed in the slot".

If this is helpful in your testing as well, you can turn it on using the environment variable `SEQ_ENFORCE_TIME_TABLE`.

Currently the default timetable values are hardcoded in [sequencer.ts](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/sequencer-client/src/sequencer/sequencer.ts#L72). Time checks are enforced in `this.setState()`.

## Prover Config

An Aztec Prover is an actor that proves the correctness of the blocks being submitted to the L1. The separation between prover and builder is critical to allow for a scalable, decentralized network. You can read more about this decision [here](https://forum.aztec.network/t/request-for-comments-aztec-sequencer-selection-and-prover-coordination-protocols/3038). On the Aztec network, provers are selected in an out-of-protocol process. This protocol is informally known as `Sidecar` and you can read more about it on the [Aztec Forum](https://forum.aztec.network/t/request-for-comments-aztecs-block-production-system/6155).

In a nutshell, proposers run Requests for Quotes (RFQs), which are binding promises from provers to prove an entire epoch. Prover nodes generate these quotes and broadcast them when an epoch ends and is ready for proving. The structure of a quote is:

```rs
struct EpochProofQuote {
  Epoch epochToProve;
  Slot validUntilSlot;
  uint256 bondAmount;
  address prover;
  uint32 basisPointFee;
}
```

While the prover-sequencer communication is not enshrined by Aztec network, Spartan nodes include two optional mechanisms that allow it:

- Gossip quotes via the P2P
- Send a quote directly via http (i.e. <http://aztec-node:8000>)

### Prover Node configuration

Prover Nodes monitor the network for new epochs and for unproven blocks. They also submit quotes and verify if the blocks have been accepted. They can generate a quote either by setting `QUOTE_PROVIDER_URL` to a quote provider, or `QUOTE_PROVIDER_BASIS_POINT_FEE` and `QUOTE_PROVIDER_BOND_AMOUNT` to use hardcoded quotes.

The prover node also runs two other critical components:

- Orchestrator - An internal component that generates an highly parallelizable tree of proofs according to a configurable set of rules before sending it to the prover broker.
- Prover Broker - An internal component that watches the different prover agents ensuring that they're resilient, idempotent and sound, and assigns proving jobs.

To become a prover, you need to _manually_ set some environment variables and edit the docker-compose file to start the Aztec node with the `--prover-node` and `--archiver` flag (example: `aztec start --prover-node --archiver`).

> [!IMPORTANT]
> For Spartan testnet, it is recommended that `PROVER_COORDINATION_NODE_URL` is turned off, which means `P2P_ENABLED` must be true.

| Variable                     | Description                                                                                                                                                | Required          | Default |
|------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------|---------|
| PROVER_PUBLISHER_PRIVATE_KEY | Private key used for publishing proofs to L1. Ensure it corresponds to an address with ETH to pay for gas.                                                 | True              |         |
| PROVER_AGENT_ENABLED         | Whether to run a prover agent process on the same host running the Prover Node. We recommend setting to false and running prover agents on separate hosts. | False             | True    |
| PROVER_COORDINATION_NODE_URL | If P2P_ENABLED is set to `false`, quotes are sent via http to this URL                                                                                     | <http://aztec-node> | False   |
| BOOT_NODE_URL                | The URL of the boot node for peer discovery.                                                                                                               | True              |         |
| AZTEC_NODE_URL               | Used to fetch the L1 contract addresses if they were not manually set via env vars.                                                                        | False             |         |

### Prover Agent configuration

The prover agent is the actual ephemeral process that runs Barretenberg and generates the proof, sending it back to the Node.

> [!INFO]
> If you set `PROVER_AGENT_ENABLED` to True in the Prover Node configuration, the Prover Node will try to run its own agent. In that case, you must also set these variables and add the `--prover` flag to the run command

Prover agents have to manually set the following environment variables:

| Variable                            | Description                                                                                             | Required | Default |
|-------------------------------------|---------------------------------------------------------------------------------------------------------|----------|---------|
| PROVER_REAL_PROOFS                  | Whether to generate actual proofs, as opposed to only simulating the circuit and outputting fake proofs | True     | True    |
| LOG_LEVEL                           | One of debug, verbose, info, warn, or error                                                             | True     | `info`  |
| OTEL_EXPORTER_OTLP_METRICS_ENDPOINT | Optional URL for pushing telemetry data to a remote OpenTelemetry data collector                        | False    |         |
| PROVER_BROKER_HOST | URL to the Prover Node that acts as a proving job source.
PROVER_AGENT_CONCURRENCY: Maximum concurrency for this given prover agent. Defaults to 1.

You can then run a prover agent by changing the docker image with the `--prover` flag, i.e. `aztec start --prover`.

### Governance Upgrades

During a governance upgrade, we'll announce details on the discord. At some point we'll also write AZIPs (Aztec Improvement Proposals) and post them to either the github or forum to collect feedback.

We'll deploy the payload to the L1 and share the address of the payload with the sequencers on discord.

To participate in the governance vote, sequencers must change the variable `GOVERNANCE_PROPOSER_PAYLOAD_ADDRESS` in the Sequencer Client to vote during the L2 slot they've been assigned sequencer duties.

## Troubleshooting

> [!TIP]
> Please make sure you are in the Discord server and that you have been assigned the role `S&P Participant`. Say gm in the `sequencer-and-prover` channel and turn on notifications for the announcements channel.

If you encounter any errors or bugs, please try basic troubleshooting steps like restarting your node, checking ports and configs.

If issue persists, please share on the sequencer-and-prover channel and tag [Amin](discordapp.com/users/65773032211231539).

Some issues are fairly light, the group and ourselves can help you within 60 minutes. If the issue isn't resolved, please send more information:

**Error Logs**: Attach any relevant error logs. If possible, note the timestamp when the issue began.
**Error Description**: Briefly describe the issue. Include details like what you were doing when it started, and any unusual behaviors observed.
**Steps to Reproduce (if known)**: If there’s a clear way to reproduce the error, please describe it.
**System Information**: Share details like your system’s operating system, hardware specs, and any other relevant environment information.

That way we can dedicate more time to troubleshoot and open Github issues if no known fix.
