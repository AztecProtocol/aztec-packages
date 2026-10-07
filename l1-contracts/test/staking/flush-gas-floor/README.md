# Flush gas floor measurements

`StakingLib.flushEntryQueue` calls `GSE.deposit` once per queued entry. `GSE.deposit` writes the new
attester's storage and then verifies the BLS proof of possession through `Bn254LibWrapper`, with the
call capped at `proofOfPossessionGasLimit`. If the deposit fails with revert data, the Rollup refunds
the stake to the withdrawer and drops the entry.

Under the Glamsterdam gas schedule (EIP-8037 state gas, EIP-8038 repricing; Foundry's `amsterdam`
EVM version), a flush gas limit can starve the verifier while leaving the Rollup enough gas to refund
and drop a valid entry. To stop this, `flushEntryQueue` requires a per-entry
gas floor (`StakingLib.getFlushDepositGasFloor`) before each `GSE.deposit` call, so the verifier
always gets its full cap.

The files in this folder measure the inputs to that floor. They print numbers as logs and assert
little. `RESULTS.md` holds every number, the derivation of the floor and the constants it uses
(`FLUSH_GSE_PRE_CHECK_GAS`, `FLUSH_POP_CALL_GAS_RESERVE`, `FLUSH_GSE_CALL_GAS_RESERVE`,
`FLUSH_REFUND_GAS_RESERVE` in `StakingLib.sol`).

## Files

| File | Component | What it measures |
|---|---|---|
| `gasFloorInputs.t.sol` | `Bn254LibWrapper` (BN254 proof of possession), Rollup flush | (a) full proof-of-possession verification gas per key; (b) the smallest stipend for which verification succeeds, per key; (d) a traced successful flush (GSE and wrapper frames); (e) a traced flush of an invalid deposit, to read the refund-branch cost. The wrapper is a fresh `Bn254LibWrapper`; the test asserts its codehash equals the GSE's own wrapper at `CREATE(GSE, nonce 1)`. |
| `gsePreVerificationGas.t.sol` | `GSE.deposit` | (c) gas the GSE spends from `deposit` entry to the instant before the verifier call, given a known stipend. Run under several EVM versions to show how much of it is EIP-8037 state gas. |
| `GSEMeasureProbe.sol` | `GSE` | Helper for the test above: a GSE whose `_checkProofOfPossession` is the production body plus two `gasleft()` logs around the wrapper call. Not used anywhere else. |
| `RESULTS.md` | | All measured numbers, the derived floor, the constants and the follow-ups. |

The floor itself is covered by `test/staking/flushGasFloor.t.sol`, which runs in the default suite: revert
below the floor, exact boundaries, gas sweeps that allow no refund of a valid entry, later entries in a batch,
cap changes, and invalid deposits still being refunded.

## Requirements

- Foundry **v1.8.4** (commit `50af4efe`) or later. Older releases such as v1.4.1 reject the `amsterdam` EVM
  version. Install it with `foundryup --install v1.8.4`, or into a separate directory whose `bin`
  you put first on `PATH`.
- Pass `--evm-version` explicitly. The repo default is `prague`, which does not model EIP-8037:
  - `amsterdam`: the Glamsterdam schedule, which the floor is sized for;
  - `osaka`: the current mainnet schedule, used as the control;
  - `prague`: the repo default.
- Pass `--isolate --gas-limit 60000000000`. `--isolate` runs each call as its own transaction, so
  sub-call gas accounting matches a real transaction; the large gas limit funds the sweeps.

## Commands

From `l1-contracts/`:

```bash
# Measurements. They skip unless FLUSH_GAS_FLOOR_MEASURE is set. -vv prints the logs; -vvvv adds the GSE,
# wrapper and refund frame traces.
FLUSH_GAS_FLOOR_MEASURE=1 forge test --isolate --gas-limit 60000000000 --evm-version amsterdam \
  --match-path test/staking/flush-gas-floor/gasFloorInputs.t.sol -vv
FLUSH_GAS_FLOOR_MEASURE=1 forge test --isolate --gas-limit 60000000000 --evm-version amsterdam \
  --match-path test/staking/flush-gas-floor/gsePreVerificationGas.t.sol -vv

# How much of the GSE pre-verification path is EIP-8037 state gas.
for v in amsterdam osaka prague; do
  FLUSH_GAS_FLOOR_MEASURE=1 forge test --isolate --gas-limit 60000000000 --evm-version $v \
    --match-path test/staking/flush-gas-floor/gsePreVerificationGas.t.sol -vv \
    | grep "GSE gasleft"
done

# Floor behaviour under the schedule it is sized for (no gas limit refunds a valid entry).
forge test --isolate --gas-limit 60000000000 --evm-version amsterdam \
  --match-path test/staking/flushGasFloor.t.sol -vv
forge test --isolate --gas-limit 60000000000 --evm-version osaka \
  --match-path test/staking/flushGasFloor.t.sol -vv

# The floor against the live dependencies: a Rollup from this source on a mainnet fork, registered on the deployed
# GSE, flushing through the deployed wrapper, AZTEC token and Governance. Needs an archive RPC; amsterdam and
# osaka must both pass. --disable-block-gas-limit lifts the forked block's 60M limit for the deployment.
MAINNET_FORK_RPC=<archive rpc> forge test --isolate --gas-limit 60000000000 --disable-block-gas-limit \
  --evm-version amsterdam --match-path test/fork/FlushGasFloorMainnetFork.t.sol -vv
MAINNET_FORK_RPC=<archive rpc> forge test --isolate --gas-limit 60000000000 --disable-block-gas-limit \
  --evm-version osaka --match-path test/fork/FlushGasFloorMainnetFork.t.sol -vv
```
