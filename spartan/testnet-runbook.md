# Aztec Protocol: Testnet Engineering Runbook

## Overview

This runbook outlines the engineering team's responsibilities for managing Aztec Protocol testnets. The engineering team coordinates the building, testing, and deployment of testnet(s) for each release while providing technical support for protocol and product queries from the community. This document describes the team's responsibilities during a release cycle and outlines actions for various testnet scenarios. The process spans from code-freeze to deployment completion, including both the QA phase (internal testing) and the public release phase.

## Releases

The engineering team's testnet responsibilities begin after code-freeze. Here are the primary tasks:

1. Confirm with engineering and product teams that all required PRs are merged
2. Create a release branch (eg: `<repository>-v<major>.<minor>.<patch>`, e.g., `aztec-packages-v0.62.0`)
3. Cherry-pick bug-fixes into the release branch for bugs discovered during release testing.
4. Initiate a final build by pushing an empty commit into the release branch to trigger the `release-please` CI workflow.

### Release Notes and Artifact Builds

Verify the `release-please` CI workflow completed successfully and that release notes have been published.
A successful CI run publishes the following Barretenberg artifacts with the release notes:

- Barretenberg for Mac (x86 64-bit)
- Barretenberg for Mac (Arm 64-bit)
- Barretenberg for Linux (x86 64-bit)
- Barretenberg for WASM

Additionally, the following NPM packages are published:

- BB.js
- l1-contracts
- yarn-project (see [publish_npm.sh](https://github.com/AztecProtocol/aztec-packages/blob/aztec-packages-v0.63.0/yarn-project/publish_npm.sh))

The following Docker containers are also published:

- aztecprotocol/aztec:latest
- aztecprotocol/aztec-nargo:latest
- aztecprotocol/cli-wallet:latest

Lastly, any changes made to developer documentation are published to <https://docs.aztec.network>

## Deployment

After cutting a release, deploy a testnet (typically with 48 validators) using the new Docker containers. Verbose logging on Aztec nodes should be enabled by default using the following `ENV VARS`:

- `LOG_JSON=1`
- `LOG_LEVEL=debug`
- `DEBUG=discv5*,aztec:*,-aztec:avm_simulator*,-aztec:circuits:artifact_hash,-json-rpc*,-aztec:world-state:database,-aztec:l2_block_stream*`

Deployments are initiated from CI by manually running the (_name pending_) workflow.

### Sanity Check

After testnet deployment, perform these sanity checks (these items can also be script automated):

1. Monitor for crashes and network-level health:
   - Review testnet dashboard at `https://grafana.aztec.network/` to confirm node uptime and block production
   - Verify overall TPS performance
   - Create Github issues for new crash scenarios

2. Spot check pod logs for component health:
   - Tx gossiping (Bot: `Generated IVC proof`)
   - Peer discovery (Validator (failure case): `Failed FINDNODE request`)
   - Block proposal (Validator: `Can propose block`)
   - Block processing (Validator: `l2BlockSourceHash`)
   - Block proving (Prover: `Processed 1 new L2 blocks`)
   - Epoch proving (Prover: `Submitted proof for epoch`)

3. Test external node connection and sync

### Network Connection Info

After a successful sanity check, share the following network connection information in the `#team-alpha` slack channel:

1. AZTEC_IMAGE (`aztecprotocol/aztec:latest`)
2. ETHEREUM_HOST (Kubernetes: `kubectl get services -n <namespace> | (head -1; grep ethereum)`)
   - ethereum-lb: `<EXTERNAL-IP>:8545`
3. BOOT_NODE_URL (Kubernetes: `kubectl get services -n <namespace> | (head -3; grep boot)`)
   - boot-node-lb-tcp: `<EXTERNAL-IP>:40400`
   - boot-node-lb-udp: `<EXTERNAL-IP>:40400`

This latest node connection information must also be updated in any existing node connection guides and where referenced at <https://docs.aztec.network>.

The Product/DevRel team then shares these connection details with the sequencer & prover discord channel. Starting at epoch 5, Product/DevRel will coordinate with node operators who have already connected to the network using the information above. Product/DevRel verify that node operators are seeing correct logs, then pass on validator addresses of those ready to engineering so that engineering can add them to the validator set. We do this until we add all 48 validators.

## Support

The following items are a shortlist of support items that may be required either during deployment or after a successful launch.

### Issue Resolution Matrix

| Event | Action | Criticality | Owner(s) |
|-------|---------|------------|-----------|
| Build failure | Rerun CI or revert problematic changes | Blocker |  |
| Deployment issues | Reference deployment `README` or escalate to Delta Team | Blocker | Delta Team |
| Network instability* | Create detailed issue report for Alpha team | Blocker | Alpha Team |
| Challenge completion errors | Document issue and assess challenge viability | Major | Product Team |
| Minor operational issues | Create tracking issue | Minor | Delta Team |
| Hotfix deployment | Update testnet and verify fix | Major | Delta Team |

_*Defining Network Instability:_

A testnet is considered unstable if experiencing any of the following:

1. Block production stalls
2. Proof generation failures
3. Transaction inclusion issues
4. Node synchronization problems
5. Persistent crashes affecting network operation
6. Persistent chain reorgs affecting network operation
7. Bridge contract failures

### Release Support Matrix

| Event | Action | Criticality | Owner(s) |
|-------|---------|------------|-----------|
| Challenge completion issues | Provide guidance or create issue | Minor | DevRel Team |
| Node stability issues | Collect logs and create issue | Major | Delta Team |
| Network-wide problems | Escalate to Delta team | Critical | Alpha/Delta Teams |
| Bridge/Contract issues | Investigate and escalate if needed | Critical | Alpha Team |
