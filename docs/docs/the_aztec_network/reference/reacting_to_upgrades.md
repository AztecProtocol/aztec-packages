---
sidebar_position: 4
title: Reacting to Upgrades
description: Learn how to react to upgrades on the Aztec network.
---

This guide helps sequencer operators understand and respond to protocol upgrades on the Aztec network.

## Overview

Protocol upgrades on Aztec require coordination between sequencers to ensure smooth transitions. This process involves signaling support for upgrades and executing them once consensus is reached.

## Signaling for Governance Upgrades

Sequencers participate in governance by signaling support for proposed upgrades.

### How to Signal

Set the `GOVERNANCE_PROPOSER_PAYLOAD` environment variable on your sequencer node to the address of the proposed `payload` contract. This registers your support with the GovernanceProposer contract.

```sh
# Example: Set the governance payload in your environment
export GOVERNANCE_PROPOSER_PAYLOAD=<payload_contract_address>

# Restart your sequencer to apply the change
docker compose restart aztec-sequencer
```

:::info
The `payload` is an L1 contract specifying the new rollup contract address for the upgrade. Payloads for voting during alpha-testnet are communicated through official channels including the forum and Discord.
:::

### Quorum Requirements

The signaling phase completes when:

- `N` sequencers signal for the same payload
- Within a round of `M` L2 blocks

Once quorum is reached, anyone can execute the proposal by calling `executeProposal(roundNumber)` on the Governance Proposer contract.

## Monitoring Upgrades

Stay informed about upcoming upgrades:

1. **Monitor official channels:**

   - Aztec forum for formal proposals
   - Discord for discussions and announcements
   - GitHub for technical details

2. **Check upgrade status:**
   - Query the Governance Proposer contract for active proposals
   - Monitor signaling progress toward quorum
   - Track execution status

## Post-Upgrade Actions

After an upgrade executes:

1. **Verify your node updates automatically** - The auto-update module should handle this
2. **Monitor logs** for any issues during the transition
3. **Confirm your sequencer reconnects** to the network successfully
4. **Resume normal operations** once synchronized

## Troubleshooting

### Common Issues

**Node not updating after upgrade:**

- Verify auto-update is enabled (check `AUTO_UPDATE` is not set)
- Ensure Watchtower is running for automatic container updates
- Manually pull latest image if needed: `docker pull aztecprotocol/aztec:latest`

**Sequencer not reconnecting:**

- Check network configuration matches new requirements
- Review logs for connection errors
- Verify L1 endpoints are accessible

**Missing governance signals:**

- Confirm `GOVERNANCE_PROPOSER_PAYLOAD` is set correctly
- Restart sequencer after setting environment variable
- Verify transaction was sent to L1

## Next Steps

- Join the [governance forum](https://forum.aztec.network) to participate in discussions
- Review the [Sequencer Guide](../guides/run_nodes/how_to_run_sequencer.md) for setup details
- Monitor the [Aztec Discord](https://discord.gg/aztec) for real-time updates
