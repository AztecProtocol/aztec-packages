---
sidebar_position: 1
title: Sequencer Reference
---

There are a few environment variables you can tweak to fit your specific use-case when you're running a sequencer.

### Sequencer Config

The Sequencer Client is a critical component that coordinates tx validation, L2 block creation, collecting attestations and block submission (through the Publisher).

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
