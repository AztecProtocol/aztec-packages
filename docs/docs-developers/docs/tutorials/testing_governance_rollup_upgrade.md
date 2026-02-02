---
title: Testing Governance Rollup Upgrade on Local Network
sidebar_position: 5
tags: [local_network, governance, testing]
description: Deploy a new rollup and execute a governance upgrade on a local Aztec network for testing.
---

This guide walks through deploying a new rollup and executing a governance upgrade on a local Aztec network.

## Prerequisites

- [Aztec tooling](../../getting_started_on_local_network.md)
- Node.js and yarn

## Local Network Governance Timing

The default governance configuration for local networks:

| Parameter      | Value            | Description                                 |
| -------------- | ---------------- | ------------------------------------------- |
| votingDelay    | 60 seconds       | Time before voting starts                   |
| votingDuration | 1 hour           | Voting period length                        |
| executionDelay | 60 seconds       | Delay after voting ends before execution    |
| gracePeriod    | 7 days           | Window to execute after becoming executable |
| lockDelay      | 30 days          | Token lock period for proposers             |
| lockAmount     | 1,000,000 tokens | Tokens locked when proposing                |

---

## Step 1: Start Local Network

Ensure you are on the correct Aztec version:

```bash
aztec-up #release_version
```

```bash
aztec start --local-network
```

Wait for output showing deployed contract addresses. To get the **Registry Address** and other L1 contract addresses, query the running node:

```bash
curl -s http://localhost:8080 -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"node_getNodeInfo","params":[],"id":1}' | jq '.result.l1ContractAddresses'
```

Note the `registryAddress` from the output.

---

## Step 2: Clone and Set Up l1-contracts

Clone the l1-contracts repo and checkout the version matching your Aztec installation. Run `aztec --version` to find your version:

```bash
git clone https://github.com/AztecProtocol/l1-contracts.git
cd l1-contracts
git checkout #release_version
```

Install dependencies and set up the build environment:

```bash
# Install forge dependencies
mkdir -p lib
cd lib
git clone --depth 1 https://github.com/foundry-rs/forge-std forge-std
git clone --depth 1 https://github.com/OpenZeppelin/openzeppelin-contracts openzeppelin-contracts
cd ..

# Install solc (uses forge's built-in svm)
forge build --use 0.8.30 src/core/libraries/ConstantsGen.sol
cp ~/.svm/0.8.30/solc-0.8.30 ./solc-0.8.30

# Copy the HonkVerifier to the generated directory (required for build)
mkdir -p generated
cp src/HonkVerifier.sol generated/HonkVerifier.sol
echo '{}' > generated/default.json

# Remove zkpassport-dependent files (not needed for rollup deployment)
rm -f src/mock/StakingAssetHandler.sol
rm -rf src/mock/staking_asset_handler/
```

---

## Step 3: Set Environment Variables

```bash
# Anvil's default account 0
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export DEPLOYER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# Replace with actual address from Step 1
export REGISTRY_ADDRESS=0x...

# L1 RPC
export L1_RPC_URL=http://localhost:8545
export L1_CHAIN_ID=31337

# Rollup configuration (local network defaults)
export AZTEC_SLOT_DURATION=36
export AZTEC_EPOCH_DURATION=16
export AZTEC_TARGET_COMMITTEE_SIZE=48
export AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET=2
export AZTEC_LAG_IN_EPOCHS_FOR_RANDAO=2
export AZTEC_INBOX_LAG=2
export AZTEC_PROOF_SUBMISSION_EPOCHS=2
export AZTEC_LOCAL_EJECTION_THRESHOLD=0
export AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS=1
export AZTEC_SLASHING_LIFETIME_IN_ROUNDS=10
export AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS=1
export AZTEC_SLASHING_OFFSET_IN_ROUNDS=0
export AZTEC_SLASHER_FLAVOR=none
export AZTEC_SLASHING_VETOER=0x0000000000000000000000000000000000000000
export AZTEC_SLASHING_DISABLE_DURATION=0
export AZTEC_MANA_TARGET=100000000
export AZTEC_EXIT_DELAY_SECONDS=0
export AZTEC_PROVING_COST_PER_MANA=0
export AZTEC_SLASH_AMOUNT_SMALL=0
export AZTEC_SLASH_AMOUNT_MEDIUM=0
export AZTEC_SLASH_AMOUNT_LARGE=0
export AZTEC_INITIAL_ETH_PER_FEE_ASSET=10000000
```

---

## Step 4: Deploy New Rollup

```bash
forge script script/deploy/DeployRollupForUpgrade.s.sol:DeployRollupForUpgrade \
  --rpc-url $L1_RPC_URL \
  --broadcast \
  --private-key $PRIVATE_KEY
```

Note the **new rollup address** from the JSON output.

```bash
export NEW_ROLLUP_ADDRESS=0x...
```

---

## Step 5: Deploy Governance Payload

**Important:** Place flags before the contract path to avoid argument parsing issues.

```bash
cd l1-contracts

forge create \
  --rpc-url $L1_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  test/governance/scenario/RegisterNewRollupVersionPayload.sol:RegisterNewRollupVersionPayload \
  --constructor-args $REGISTRY_ADDRESS $NEW_ROLLUP_ADDRESS
```

Note the **payload address** from the output.

```bash
export PAYLOAD_ADDRESS=0x...
```

---

## Step 6: Deposit Governance Tokens

Mint and deposit tokens to get voting power. You need at least 1,000,000 tokens (1e24 wei) to propose:

```bash
aztec deposit-governance-tokens \
  -r $REGISTRY_ADDRESS \
  --recipient $DEPLOYER_ADDRESS \
  --amount "2000000000000000000000000" \
  --mint \
  --l1-rpc-urls $L1_RPC_URL \
  -c $L1_CHAIN_ID \
  --private-key $PRIVATE_KEY
```

---

## Step 7: Advance Time for Token Checkpoint

:::warning Critical Step
Tokens must be deposited **before** the proposal is created. The governance contract snapshots voting power at the proposal creation timestamp. If your deposit checkpoint timestamp >= proposal creation timestamp, your voting power will be **0** and the proposal will be rejected.
:::

Advance Anvil's time to ensure the checkpoint is in the past when the proposal is created:

```bash
# Get current timestamp and add 120 seconds
CURRENT_TS=$(cast block latest --rpc-url $L1_RPC_URL --json | jq -r '.timestamp')
TARGET_TS=$((CURRENT_TS + 120))
cast rpc anvil_setNextBlockTimestamp $TARGET_TS --rpc-url $L1_RPC_URL
cast rpc anvil_mine 1 --rpc-url $L1_RPC_URL
```

Verify the time has advanced:

```bash
NEW_TS=$(cast block latest --rpc-url $L1_RPC_URL --json | jq -r '.timestamp')
echo "New timestamp: $NEW_TS (should be > $CURRENT_TS)"
```

:::note
`anvil_increaseTime` may not reliably update block timestamps. For consistent results, always use `anvil_setNextBlockTimestamp` with an explicit timestamp.
:::

---

## Step 8: Create Proposal

```bash
aztec propose-with-lock \
  -r $REGISTRY_ADDRESS \
  -p $PAYLOAD_ADDRESS \
  --l1-rpc-urls $L1_RPC_URL \
  -c $L1_CHAIN_ID \
  --private-key $PRIVATE_KEY \
  --json
```

Note the **proposal ID** from output.

```bash
export PROPOSAL_ID=0
```

---

## Step 9: Advance Time Past Voting Delay

The proposal must transition from Pending to Active (votingDelay = 60 seconds):

```bash
# Get current timestamp and add 120 seconds (buffer over 60s voting delay)
CURRENT_TS=$(cast block latest --rpc-url $L1_RPC_URL --json | jq -r '.timestamp')
TARGET_TS=$((CURRENT_TS + 120))
cast rpc anvil_setNextBlockTimestamp $TARGET_TS --rpc-url $L1_RPC_URL
cast rpc anvil_mine 1 --rpc-url $L1_RPC_URL
```

Verify the proposal is now Active (state 1):

```bash
# Get governance address from node info or use the one from Step 1
cast call <GOVERNANCE_ADDRESS> "getProposalState(uint256)(uint8)" $PROPOSAL_ID --rpc-url $L1_RPC_URL
# Expected output: 1 (Active)
```

---

## Step 10: Vote on Proposal

```bash
aztec vote-on-governance-proposal \
  -p $PROPOSAL_ID \
  --in-favor yea \
  --wait false \
  -r $REGISTRY_ADDRESS \
  --l1-rpc-urls $L1_RPC_URL \
  -c $L1_CHAIN_ID \
  --private-key $PRIVATE_KEY
```

Verify the vote was recorded with your voting power. The CLI output should show non-zero `summedBallot yea` values. If it shows `[0]`, your checkpoint timing was incorrect (see Troubleshooting).

---

## Step 11: Advance Time Past Voting Duration + Execution Delay

Voting duration is 1 hour (3600s) and execution delay is 60 seconds:

```bash
# Get current timestamp and add 3700 seconds (voting duration + execution delay + buffer)
CURRENT_TS=$(cast block latest --rpc-url $L1_RPC_URL --json | jq -r '.timestamp')
TARGET_TS=$((CURRENT_TS + 3700))
cast rpc anvil_setNextBlockTimestamp $TARGET_TS --rpc-url $L1_RPC_URL
cast rpc anvil_mine 1 --rpc-url $L1_RPC_URL
```

Verify the proposal is now Executable (state 3):

```bash
cast call <GOVERNANCE_ADDRESS> "getProposalState(uint256)(uint8)" $PROPOSAL_ID --rpc-url $L1_RPC_URL
# Expected output: 3 (Executable)
```

---

## Step 12: Execute Proposal

```bash
aztec execute-governance-proposal \
  -p $PROPOSAL_ID \
  -r $REGISTRY_ADDRESS \
  --wait false \
  --l1-rpc-urls $L1_RPC_URL \
  -c $L1_CHAIN_ID \
  --private-key $PRIVATE_KEY
```

## Step 13: Verify the Upgrade

Confirm the new rollup is now the canonical rollup:

```bash
# Check the canonical rollup address (should match NEW_ROLLUP_ADDRESS)
cast call $REGISTRY_ADDRESS "getCanonicalRollup()(address)" --rpc-url $L1_RPC_URL

# Check the number of rollup versions (should be 2)
cast call $REGISTRY_ADDRESS "numberOfVersions()(uint256)" --rpc-url $L1_RPC_URL
```

---

## Helper Commands

### Set Anvil timestamp directly

If time advancement isn't working as expected, set the timestamp explicitly:

```bash
# Get the target timestamp (current + desired seconds)
cast rpc anvil_setNextBlockTimestamp <UNIX_TIMESTAMP> --rpc-url $L1_RPC_URL
cast rpc anvil_mine 1 --rpc-url $L1_RPC_URL
```

### Check proposal state

```bash
# States: 0=Pending, 1=Active, 2=Queued, 3=Executable, 4=Rejected, 5=Executed, 6=Dropped, 7=Expired
cast call <GOVERNANCE_ADDRESS> "getProposalState(uint256)(uint8)" $PROPOSAL_ID --rpc-url $L1_RPC_URL
```

### Check current block timestamp

```bash
cast block latest --rpc-url $L1_RPC_URL | grep timestamp
```

### Check L1 addresses

```bash
aztec get-l1-addresses \
  -r $REGISTRY_ADDRESS \
  -v canonical \
  --l1-rpc-urls $L1_RPC_URL \
  -c $L1_CHAIN_ID \
  --json
```

### Debug rollup state

```bash
aztec debug-rollup \
  --l1-rpc-urls $L1_RPC_URL \
  -c $L1_CHAIN_ID
```

---

## Quick Test (Empty Payload)

If you just want to test the governance flow without deploying a real rollup:

```bash
cd l1-contracts

# Deploy empty payload (no constructor args needed)
forge create \
  --rpc-url $L1_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  test/governance/governance/TestPayloads.sol:EmptyPayload

# Use the deployed address as PAYLOAD_ADDRESS and continue from Step 6
```

---

## Troubleshooting

### "Governance**CheckpointedUintLib**InsufficientValue"

- You need more tokens. The minimum to propose is 1,000,000 tokens (1e24 wei).
- Deposit more tokens in Step 6.

### "Governance**CheckpointedUintLib**NotInPast"

- Tokens were deposited at or after the proposal creation time.
- Advance Anvil's time and mine a block before creating the proposal (Step 7).

### "Proposal is not active"

- The voting delay hasn't passed yet.
- Advance time past the votingDelay (60 seconds for local networks).

### "Proposal is not executable"

- Either voting period is not complete, or execution delay hasn't passed.
- Advance time past votingDuration (1 hour) + executionDelay (60 seconds).

### Forge create fails with "Error accessing local wallet"

- Constructor args may be parsing incorrectly. Place `--constructor-args` at the end of the command, after the contract path.

### Time advancement not working

- Anvil may have auto-mined blocks that reset the accumulated time.
- Use `anvil_setNextBlockTimestamp` to set an explicit timestamp instead of `anvil_increaseTime`.

### Vote fails without explicit amount

- If you see `NotInPast` errors during voting, the CLI may have a bug determining voting power.
- Workaround: specify `--vote-amount` explicitly with your deposited token amount.
