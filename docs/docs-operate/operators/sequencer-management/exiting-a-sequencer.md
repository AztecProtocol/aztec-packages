---
displayed_sidebar: operatorsSidebar
title: Exiting a sequencer
description: Exit a sequencer position and withdraw its stake, either from the withdrawer or from the attester, including batched exits for many positions.
references: ["labs/yarn-project/ethereum/src/contracts/rollup.ts", "labs/yarn-project/cli/src/cmds/l1/index.ts", "labs/yarn-project/cli/src/cmds/l1/update_l1_validators.ts"]
---

## Overview

Exiting removes a sequencer position from the active set and returns its stake to the position's withdrawer after a delay. There are two ways to start an exit:

| | Withdrawer-initiated | Attester-initiated (new in v6) |
| --- | --- | --- |
| Who starts it | The withdrawer | The attester, or a relayer carrying the attester's signature |
| Batching | One transaction per position | Many positions in one relayed transaction |
| Rate limit | None | About 5% of the sequencer set per rolling window |
| Recipient | Named when the exit starts | Named by the withdrawer afterwards |
| Where the stake goes | The recipient the withdrawer names | The recipient the withdrawer names |

Attester-initiated exits let whoever runs the node exit positions without the withdrawer's keys. This matters most for staking providers, who hold the attester keys for many delegations but not the withdrawer keys. The stake never goes to the attester: the withdrawer still decides where it goes.

## Prerequisites

- The aztec CLI at v6.0.0 or later (see [installation](/operate/operators/setup/running_a_node)), or Foundry's `cast`.
- The Rollup contract address for your network (see [Useful Commands](./useful-commands.md#get-the-rollup-contract-address)) and its L1 chain ID.
- An L1 RPC endpoint.
- For an attester-initiated exit: the attester's ETH private key (the ECDSA key in your keystore, not the BLS key).
- To receive the stake: access to the position's withdrawer.

The examples use these variables:

```bash
export ROLLUP=[ROLLUP_ADDRESS]
export L1_RPC=[L1_RPC_URL]
export L1_CHAIN_ID=[L1_CHAIN_ID]   # 1 for Mainnet, 11155111 for Sepolia
export ATTESTER=[ATTESTER_ADDRESS]
```

## How an exit works

Every exit goes through the same stages:

1. **Initiate.** The position leaves the active set immediately and its stake moves into an exit record. The node can stop attesting for that key.
2. **Name the recipient.** A withdrawer-initiated exit names it in step 1. After an attester-initiated exit, the withdrawer must call `initiateWithdraw(attester, recipient)`. This does not restart any delay, and the recipient cannot be changed once set.
3. **Wait.** The stake unlocks once two delays have both passed, counted from step 1: the rollup's exit delay and the governance withdrawal delay. On Mainnet these are 4 days and about 9.6 days, so the stake is claimable about 9.6 days after the exit starts. The position can still be slashed until the rollup's exit delay ends; for the rest of the wait the stake is locked but no longer slashable.
4. **Finalize.** Anyone can call `finalizeWithdraw(attester)`. The stake is sent to the recipient.

Read the current delays for your network:

```bash
# Rollup exit delay, in seconds
cast call $ROLLUP "getExitDelay()(uint256)" --rpc-url $L1_RPC

# Attester exit window, in seconds (the same value as the governance withdrawal delay)
cast call $ROLLUP "getAttesterExitWindow()(uint256)" --rpc-url $L1_RPC
```

## Withdrawer-initiated exit

The withdrawer starts the exit and names the recipient in one call, sent from the withdrawer key:

```bash
aztec remove-l1-validator --validator $ATTESTER --recipient [RECIPIENT_ADDRESS] \
    --rollup $ROLLUP --l1-rpc-urls $L1_RPC --l1-chain-id $L1_CHAIN_ID \
    --private-key [WITHDRAWER_PRIVATE_KEY]
```

Or with `cast`:

```bash
cast send $ROLLUP "initiateWithdraw(address,address)" $ATTESTER [RECIPIENT_ADDRESS] \
    --private-key [WITHDRAWER_PRIVATE_KEY] --rpc-url $L1_RPC
```

Choose the recipient carefully: it cannot be changed once set. Then [finalize](#finalize-the-withdrawal) once the delays have passed.

:::note Older CLI versions
Before v6.0.0, `aztec remove-l1-validator` and `aztec sequencers remove` had no `--recipient` flag and always named the attester's own address as the recipient. Do not use an older CLI to exit.
:::

## Attester-initiated exit

### Check the rate limit

Attester-initiated exits are limited so that the sequencer set cannot shrink too fast:

- Within any rolling window (`getAttesterExitWindow`, about 9.6 days on Mainnet), at most `floor((N - 1) / 20)` attester-initiated exits can happen, where `N` is the current number of sequencers. That is about 5% of the set.
- No exit may leave fewer sequencers than the target committee size (48 on Mainnet).
- Exits only work on the rollup that is both canonical and the latest in the GSE. On Mainnet, that means the v6 rollup after the v6 upgrade executes. They are not available on v5.

Withdrawer-initiated exits do not count against the limit, but they lower `N`, so they shrink the allowance.

Check the current state before you exit:

```bash
cast call $ROLLUP \
    "getAttesterExitLimitState()((uint256,uint256,uint256,uint256,uint256,bool))" \
    --rpc-url $L1_RPC
```

The fields are `(window, validatorCount, committeeSize, used, allowance, canExit)`. `canExit` is `true` when at least one attester-initiated exit fits right now. `allowance - used` is only an upper bound on how many: each exit lowers `validatorCount`, which can lower `allowance`, and no exit may take `validatorCount` below `committeeSize`. A batch `--dry-run` reports the exact number.

### Exit one position

Send the exit from the attester key itself. The attester address needs a little ETH for gas.

```bash
aztec initiate-withdraw-by-attester \
    --attester $ATTESTER --rollup $ROLLUP \
    --l1-rpc-urls $L1_RPC --l1-chain-id $L1_CHAIN_ID \
    --private-key [ATTESTER_PRIVATE_KEY]
```

`--mnemonic` with `--account-index` and `--address-index` works in place of `--private-key`.

### Exit many positions in one transaction

Each attester signs an exit authorization offline. One relayer then submits them all and pays the gas, so the attester addresses do not need ETH.

1. **Pick a deadline.** Authorizations expire at a Unix timestamp you choose. Leave enough time to collect every signature and submit:

   ```bash
   export DEADLINE=$(( $(date +%s) + 86400 ))   # 24 hours from now
   ```

2. **Sign one authorization per attester.** Run these one after another, not in parallel, so `--append` does not lose entries:

   ```bash
   aztec sign-attester-exit --private-key [ATTESTER_0_KEY] --attester [ATTESTER_0] \
       --rollup $ROLLUP --l1-chain-id $L1_CHAIN_ID --deadline $DEADLINE \
       --output exits.json --append

   aztec sign-attester-exit --mnemonic "[VALIDATOR_MNEMONIC]" --account-index 0 --address-index 1 \
       --attester [ATTESTER_1] \
       --rollup $ROLLUP --l1-chain-id $L1_CHAIN_ID --deadline $DEADLINE \
       --output exits.json --append
   ```

   Signing needs no network access. Pass `--l1-rpc-urls` to have the CLI check the chain ID against the endpoint. With `--network mainnet` (or `testnet`) and `--l1-rpc-urls`, the CLI uses the network's current canonical rollup when you omit `--rollup`. On Mainnet, before the v6 upgrade executes, that is still the v5 rollup, so pass the v6 rollup with `--rollup` explicitly.

3. **Simulate the batch.** A dry run needs no relayer key and reports how many authorizations would be processed:

   ```bash
   aztec initiate-withdraw-by-attester-batch --dry-run --authorizations exits.json \
       --rollup $ROLLUP --l1-chain-id $L1_CHAIN_ID --l1-rpc-urls $L1_RPC
   ```

4. **Submit it** from any funded key:

   ```bash
   aztec initiate-withdraw-by-attester-batch --authorizations exits.json \
       --rollup $ROLLUP --l1-chain-id $L1_CHAIN_ID --l1-rpc-urls $L1_RPC \
       --private-key [RELAYER_PRIVATE_KEY]
   ```

   The command prints how many authorizations were processed and how many remain.

#### Batches larger than the rate limit

By default the batch is all or nothing: if the rate limit cannot fit every authorization, the transaction reverts. Add `--up-to-limit` to process as many authorizations as the limit allows, starting from the top of the file, and leave the rest. The command prints the zero-based indices of the entries it did not process, but it does not edit `exits.json`. Before you resubmit, remove the processed entries from the file (or write the unprocessed ones to a new file): an entry whose attester is already exiting reverts the whole batch. Submit the remainder once the window has room again and before the deadline.

Both modes revert the whole transaction if any authorization they process is invalid: an expired deadline, a bad signature, a duplicate attester, or an attester that is already exiting or has no stake. With `--up-to-limit`, the entries left for later are not checked until you submit them. Always run `--dry-run` first.

### Name the recipient

After an attester-initiated exit, the stake waits for the withdrawer. The withdrawer names the recipient with the same command as a withdrawer-initiated exit:

```bash
aztec remove-l1-validator --validator $ATTESTER --recipient [RECIPIENT_ADDRESS] \
    --rollup $ROLLUP --l1-rpc-urls $L1_RPC --l1-chain-id $L1_CHAIN_ID \
    --private-key [WITHDRAWER_PRIVATE_KEY]
```

Or with `cast`:

```bash
cast send $ROLLUP "initiateWithdraw(address,address)" $ATTESTER [RECIPIENT_ADDRESS] \
    --private-key [WITHDRAWER_PRIVATE_KEY] --rpc-url $L1_RPC
```

Do this for each exited position. It can happen any time before you finalize, it does not restart the delay, and the recipient cannot be changed once set.

If you are a staking provider exiting delegated positions, tell your delegators: they control the withdrawer, so they must complete this step.

## Finalize the withdrawal

Once both delays have passed, anyone can send the stake to its recipient:

```bash
cast send $ROLLUP "finalizeWithdraw(address)" $ATTESTER \
    --private-key [ANY_FUNDED_KEY] --rpc-url $L1_RPC
```

## Check an exit's status

```bash
cast call $ROLLUP \
    "getExit(address)((uint256,uint256,uint256,address,bool,bool))" $ATTESTER \
    --rpc-url $L1_RPC
```

The fields are `(withdrawalId, amount, exitableAt, recipientOrWithdrawer, isRecipient, exists)`:

- `exists` is `false`: no exit is in progress (never started, or already finalized).
- `isRecipient` is `false`: the exit was attester-initiated and `recipientOrWithdrawer` is the withdrawer, who still has to name the recipient.
- `isRecipient` is `true`: `recipientOrWithdrawer` is the recipient. Finalize after `exitableAt` (a Unix timestamp) and the governance withdrawal delay have both passed.

## Using `cast` instead of the CLI

The CLI commands wrap these rollup functions:

| Function | What it does |
| --- | --- |
| `initiateWithdrawByAttester(address)` | Exit one position. Caller must be the attester. |
| `initiateWithdrawByAttesterBatch(...)` | Relay many attester-signed exits. Reverts if the rate limit cannot fit the whole batch. |
| `initiateWithdrawByAttesterBatchUpToLimit(...)` | Relay many attester-signed exits, processing only as many from the start of the list as the rate limit allows. |

Exit a single position, signed and submitted by the attester:

```bash
cast send $ROLLUP "initiateWithdrawByAttester(address)" $ATTESTER \
    --private-key [ATTESTER_PRIVATE_KEY] --rpc-url $L1_RPC
```

For a batch, sign one EIP-712 message per attester. The domain is `{ name: "Aztec Rollup", version: "1", chainId: <L1 chain id>, verifyingContract: <rollup> }` and the type is `AttesterExit(address attester,uint256 deadline)`:

```bash
cast wallet sign --private-key [ATTESTER_PRIVATE_KEY] --data '{
  "domain":{"name":"Aztec Rollup","version":"1","chainId":'$L1_CHAIN_ID',"verifyingContract":"'$ROLLUP'"},
  "types":{"AttesterExit":[{"name":"attester","type":"address"},{"name":"deadline","type":"uint256"}]},
  "primaryType":"AttesterExit",
  "message":{"attester":"'$ATTESTER'","deadline":"'$DEADLINE'"}
}'
```

Split each signature into `v`, `r` and `s`, then relay the batch. Each entry is `(attester, deadline, (v, r, s))`:

```bash
cast send $ROLLUP \
    "initiateWithdrawByAttesterBatchUpToLimit((address,uint256,(uint8,bytes32,bytes32))[])" \
    "[($ATTESTER_0,$DEADLINE,($V0,$R0,$S0)),($ATTESTER_1,$DEADLINE,($V1,$R1,$S1))]" \
    --private-key [RELAYER_PRIVATE_KEY] --rpc-url $L1_RPC
```

## Troubleshooting

| Error | Cause | Fix |
| --- | --- | --- |
| `Staking__AttesterExitLimitExceeded` | The rolling window has no room for this many attester-initiated exits. | Check `getAttesterExitLimitState`, then exit fewer positions, use `--up-to-limit`, or wait. |
| `Staking__AttesterExitPoolTooSmall` | The exit would leave fewer sequencers than the committee size. | Exit fewer positions, or use a withdrawer-initiated exit. |
| `Staking__NotCanonical` or `Staking__NotLatestRollup` | You are targeting a rollup that is not the canonical, latest one. | Check `--rollup`. On Mainnet, attester exits work only on the v6 rollup after the upgrade executes. |
| `Staking__AttesterExitAuthorizationExpired` | An authorization's deadline has passed. | Sign that attester again with a later deadline. |
| `Staking__AlreadyExiting` | The position already has an exit in progress. | Remove it from the batch. Check it with `getExit`. |
| `Staking__NothingToExit` | The position has no stake on this rollup. | Remove it from the batch, and check the attester address and rollup. |
| `Staking__NotAttester` | `initiate-withdraw-by-attester` was sent from a key that is not the attester. | Sign with the attester's ETH key, or use the batch flow with a relayer. |
| `Staking__InitiateWithdrawNeeded` | `finalizeWithdraw` was called before the withdrawer named a recipient. | Have the withdrawer [name the recipient](#name-the-recipient). |
| `Staking__WithdrawalNotUnlockedYet` or `Governance__WithdrawalNotUnlockedYet` | One of the two delays has not passed yet. | Wait, then finalize again. |

## Next steps

- [Useful Commands](./useful-commands.md) for querying your sequencer's status
- [Provider operations](../provider/provider-operations.mdx) for staking provider workflows
- [v6.0.0 changelog](../reference/changelog/v6.md) for the other changes in this release
