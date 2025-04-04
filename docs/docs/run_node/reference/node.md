---
sidebar_position: 0
title: Node Reference
---

There are a few environment variables you can tweak to fit your specific use-case when you run a full node.

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
