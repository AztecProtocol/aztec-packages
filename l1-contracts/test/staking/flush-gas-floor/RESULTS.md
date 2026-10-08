# Flush gas floor: measurements and derivation

Numbers behind the per-entry gas floor in `StakingLib.flushEntryQueue`. They measure three
components under the Glamsterdam gas schedule: the GSE deposit path before the proof-of-possession
verifier, the BN254 proof-of-possession verifier (`Bn254LibWrapper`), and the Rollup's flush and
refund branch. Each number is marked **measured** (forge) or **derived**. The
`amsterdam` numbers come from Foundry's EVM preset, not from a chain that runs Glamsterdam, so they
should be measured again once a testnet activates it (see §5).

## Tooling and settings

- Foundry **v1.8.4**, commit `50af4efe189dc64bad2b75ed6990b835de66c4ae`.
- solc **0.8.30+commit.73712a01**, `optimizer = true`, `optimizer_runs = 100` (repo `foundry.toml`).
- EVM versions passed on the command line: `amsterdam` (Glamsterdam: EIP-8037 state gas and
  EIP-8038 repricing), `osaka` (current mainnet, the control), `prague` (repo default, before EIP-8037).
- Every run uses `--isolate --gas-limit 60000000000`, so sub-call gas accounting matches a real
  transaction.

## 1. Behaviour without the floor (local Rollup)

Measured on `StakingLib.flushEntryQueue` without the floor check. On the guarded code,
`../flushGasFloor.t.sol` asserts the opposite: no gas limit refunds a valid entry (§4).

Setup: V6 normal-phase queue (min 1, quotient 400, max 4), bootstrap 0, the real
proof-of-possession check (`GSEWithSkip` with the check on), six real registrations from
`script/registration_data.json`. The gas limit of `flushEntryQueue(1)` is swept.

| Unguarded flush | amsterdam | osaka |
|---|---|---|
| default cap 250k | a low enough gas limit refunds a valid entry | no gas limit refunds a valid entry |
| cap raised to 1,000,000 by the GSE owner | a low enough gas limit refunds a valid entry | no gas limit refunds a valid entry |
| flush with ample gas (control) | activates | activates |

## 2. Component measurements (amsterdam unless noted)

### (a) Full proof-of-possession verification gas in the wrapper (`gasFloorInputs.t.sol`)

The fresh `Bn254LibWrapper` has the same codehash as the deployed `CREATE(GSE, 1)` wrapper (asserted),
so these are the deployed verifier's costs. Per registration entry (measured):

| entry | call-inclusive gas | wrapper frame gas (from the `-vvvv` trace) |
|---|---|---|
| 0 | 161,652 | 136,557 |
| 1 | 191,037 | n/a |
| 2 | 165,254 | n/a |
| 3 | 162,677 | n/a |
| 4 | 166,237 | n/a |
| 5 | 175,459 | n/a |

The cost depends on the key, because `hashToPoint` uses rejection sampling and the number of
iterations varies. For these keys it is well below the 250k cap; the cap exists for keys that need
many more iterations.

### (b) Smallest stipend for which verification succeeds (binary search, measured)

| entry | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| min forwarded gas | 138,354 | 167,747 | 141,942 | 139,379 | 142,968 | 152,196 |

### (c) GSE gas spent before the verifier call (`gsePreVerificationGas.t.sol`, instrumented GSE)

Called as the registered Rollup with a known stipend of 3,000,000; `P = stipend − gasleft_before_wrapper`.
`P` is the gas consumed from `GSE.deposit` entry to the instruction before the
`wrapper.proofOfPossession{gas: cap}` call. Each deposit runs cold, in its own isolated
transaction, which is the worst case for the floor.

| path | amsterdam P | before `_checkProofOfPossession` (cheap checks + `attesters.add`) | inside `_checkProofOfPossession`, before the wrapper (`configOf` read + keccak + `ownedPKs` SSTORE) |
|---|---|---|---|
| bonus instance, first attester | **682,620** | 564,030 | 118,590 |
| bonus instance, later attester | 682,620 | 564,030 | 118,590 |
| specific instance, first attester | 682,579 | 563,989 | 118,590 |
| specific instance, later attester | 682,579 | 563,989 | 118,590 |

The path barely varies (first or later attester, bonus or specific instance, cold or warm). The
new checkpoint and `ownedPKs` slots for each attester dominate it. **Use `P ≈ 683k`.**

How much of the same path is EIP-8037 state gas (measured; this is the gas-schedule input the floor
depends on):

| EVM version | P |
|---|---|
| amsterdam (EIP-8037 state gas) | **682,620** |
| osaka | 154,300 |
| prague | 154,300 |

The ~528k jump is the repricing of the ~4 new storage slots written before the verifier
(`STATE_BYTES_PER_STORAGE_SET 64 × CPSB 1530 = 97,920` state gas each under EIP-8037, against ~20k
before it).

### (d) Full activation cost (successful flush, `-vvvv` trace, measured, amsterdam)

- `Rollup::flushEntryQueue(1)` frame: **2,870,289**
- `GSE::deposit` frame: **2,546,762** (includes `Governance::deposit` 365,842)
- successful `Bn254LibWrapper::proofOfPossession` frame: 136,557

### (e) Failure and refund cost in the Rollup (traced failing flush, measured, amsterdam)

After a starved wrapper reverts with `SqrtFail()` (its `modexp` staticcall runs out of gas; frame 3,168):

| refund-branch step | gas |
|---|---|
| `TestERC20::transfer` to a fresh zero-balance withdrawer (new balance slot under EIP-8037) | 125,223 |
| `FailedDeposit` event + loop bookkeeping | ~3,000 |
| `approve(GSE, 0)` after the loop | 2,734 |
| final `getAttesterCountAtTime` | 2,711 |

**Refund reserve ≈ 131k** (worst case: a withdrawer whose AZTEC balance slot is newly created).

`gasFloorInputs.t.sol` traces this branch with a deposit whose proof of possession is invalid; it is the
same branch a starved valid entry takes on an unguarded flush.

### EIP-8037 accounting: why a valid entry can be refunded and how the floor prevents it

Read against EIP-8037 ("Transaction-level gas accounting (reservoir model)" and "Gas accounting
for halts and reverts"):

- For a normal flush (a gas limit of a few million, far below `TX_MAX_GAS_LIMIT = 2^32−1`),
  `evm_gas = tx.gas − intrinsic` is below `execution_gas_budget`, so `state_gas_reservoir` starts
  at **0**. Every state-gas charge (the new storage slots in `GSE.deposit`) therefore draws from
  `gas_left` and increments `state_gas_from_gas_left`.
- `gasleft()` (the `GAS` opcode) returns `gas_left` only, without the reservoir, and the 63/64
  forwarding rule applies to `gas_left` only; the reservoir passes to a child in full. With an
  empty reservoir this is ordinary 63/64 accounting, so the floor's `gasleft()` read is exact and
  the forwarding arithmetic below is the standard one.
- How a valid entry can be refunded: the GSE writes ~4 new slots (~392k state gas) out of `gas_left`, then
  calls the verifier with `min(cap, 63/64 · remaining)`. If `tx.gas` leaves `remaining` too
  small, so the verifier's precompile `staticcall` fails and `BN254Lib` reverts with a 4-byte
  `SqrtFail` or `PairingFail` (non-empty). On that revert EIP-8037 restores the frame's state gas
  to its baseline and adds `state_gas_from_gas_left` back to `gas_left`. The ~392k is credited to
  the GSE frame and **returned to the Rollup**, which can then afford the refund branch for a
  valid entry. Under osaka the slots cost ~20k and are **not** credited on revert, so the Rollup
  keeps only its 1/64 reserve: the whole flush runs out of gas with empty revert data, reverts with
  `Staking__DepositOutOfGas`, and nothing is dropped.
- Why the floor closes it without relying on the credit: it guarantees that `gasleft()` before the
  GSE call is large enough for the verifier to receive the **full cap**. A valid key is then never
  starved, so it never reaches the credit-back path. An invalid key still fails and is refunded
  from the reserve.

## 3. Derived floor

The floor is a per-entry `require(gasleft() >= required)` in `StakingLib.flushEntryQueue`,
immediately before `address(store.gse).call(...)`. It works backwards through the two 63/64
boundaries (Rollup to GSE, GSE to verifier), with `cap = gse.proofOfPossessionGasLimit()` read
from the GSE:

```
need_at_verifier_call = ceil(cap * 64 / 63) + B_INNER         # the GSE must hold this before the {gas: cap} call
gse_entry_needed      = GSE_PRE_CHECK + need_at_verifier_call  # it spends GSE_PRE_CHECK first
MIN_FLUSH_GAS         = ceil(gse_entry_needed * 64 / 63) + B_OUTER + REFUND_RESERVE
```

with (amsterdam, from §2):

| constant | `StakingLib.sol` name | meaning | measured | recommended (with margin) | depends on |
|---|---|---|---|---|---|
| `GSE_PRE_CHECK` | `FLUSH_GSE_PRE_CHECK_GAS` | GSE gas before the verifier call (c) | 682,620 | **700,000** | EIP-8037 `GAS_STORAGE_SET` (`CPSB`), `attesters.add` and `ownedPKs` layout |
| `cap` | (read from the GSE) | `proofOfPossessionGasLimit` | 250,000 (deployed) | read live | GSE owner setter (governance) |
| `B_INNER` | `FLUSH_POP_CALL_GAS_RESERVE` | GSE-to-verifier call overhead | ~2,700 | **3,000** | cold account access, memory |
| `B_OUTER` | `FLUSH_GSE_CALL_GAS_RESERVE` | Rollup-to-GSE call overhead | ~700 | **2,000** | GSE already warm at flush time, calldata memory |
| `REFUND_RESERVE` | `FLUSH_REFUND_GAS_RESERVE` | refund branch after a non-empty revert (e) | ~131,000 | **150,000** | EIP-8037 new-slot cost (fresh withdrawer), ERC-20 transfer, event |

Resulting floor (derived):

| cap | minimal (measured, no margin) | **recommended (with margin)** |
|---|---|---|
| 250,000 | 1,085,899 | **≈ 1,125,000** |
| 1,000,000 | 1,859,898 | **≈ 1,900,000** |

Closed form for the `require` (recommended constants):

```solidity
uint256 cap = gse.proofOfPossessionGasLimit();
uint256 required =
  ((GSE_PRE_CHECK + (cap * 64 / 63 + 1) + B_INNER) * 64) / 63 + 1 + B_OUTER + REFUND_RESERVE;
require(gasleft() >= required, Staking__InsufficientFlushGas(required, gasleft()));
// GSE_PRE_CHECK = 700_000, B_INNER = 3_000, B_OUTER = 2_000, REFUND_RESERVE = 150_000
```

`StakingLib.getFlushDepositGasFloor` implements this with the constants above: 1,124,159 at a
250k cap, 1,175,759 at 300k and 1,898,158 at 1M (asserted in `../flushGasFloor.t.sol`).

**Why a `cap * 64 / 63 + reserve` floor is not enough.** That is ≈ `253,969 + reserve` (≈ 285k)
at the default cap. It leaves out `GSE_PRE_CHECK`, but the GSE spends ≈ **683k** of `gas_left` on
new storage writes *before* it reaches the verifier, and it does so *inside* the GSE frame, behind
the Rollup-to-GSE 63/64 boundary. The real floor is dominated by `GSE_PRE_CHECK` passed through both
63/64 steps, about 4× that simpler bound. The simpler bound would let the Rollup pass its own check
while the verifier is still starved, so entries could still be dropped.

### Bounds and production guidance

- `GSE_PRE_CHECK` and `REFUND_RESERVE` depend on the EIP-8037 state-gas price and on the GSE's
  storage layout, so they must be **re-derived at every fork that changes the gas schedule**. If
  they are ever made governance-settable, they need hard-coded lower and upper bounds: too low and
  valid entries can be dropped again; too high and a flush no longer fits in the per-transaction gas
  limit, which freezes admission.
- The flush caller only has to *set* a gas limit at or above the floor; unused gas is not charged.
  A 4-entry flush at the recommended 250k-cap floor needs a gas limit of ~4.5M, well under the block
  limit, so the floor can carry a generous margin at no cost to honest callers.

## 4. Validation of the floor

`../flushGasFloor.t.sol` sweeps the gas limit of single-entry, flush-all and batch flushes at the 250k, 300k and
1M caps and classifies every outcome. With the floor, under amsterdam and osaka, each limit either activates
the entry, reverts with `Staking__InsufficientFlushGas`, reverts with `Staking__DepositOutOfGas`, or runs out
of gas; none refunds a valid entry, and the state is unchanged after every revert. Removing only the
`require` in `flushEntryQueue` and re-running the same sweeps under amsterdam refunds the valid entry at a gas
limit of about 1.01M at every cap, which is the behaviour in §1.

## 5. Follow-ups

- **Re-measure on a live network.** All amsterdam numbers come from Foundry's `amsterdam` EVM
  preset, not from a chain that has activated Glamsterdam. EIP-8037 is in *Review*;
  `CPSB`/`STATE_BYTES_PER_STORAGE_SET` and the EIP-8038 execution-gas changes (`COLD_ACCOUNT_ACCESS`,
  `CREATE_ACCESS`, `ACCOUNT_WRITE`) are not final. If they change before mainnet, `GSE_PRE_CHECK`
  and `REFUND_RESERVE` change with them. Run §2 again once Sepolia activates Glamsterdam.
- **Worst case for `GSE_PRE_CHECK`.** Measured at ~683k and flat across the paths tried. A path that
  writes more new slots before the verifier (for example a future change to GSE storage) would
  raise it, so the constant must be re-derived whenever the writes `GSE.deposit` makes before the
  verifier change. The deployed GSE is immutable, so for it the value is fixed until a new GSE.
- **`REFUND_RESERVE` covers a fresh withdrawer** (a new balance slot). A withdrawer that already
  holds AZTEC is cheaper to refund; the reserve is sized for the expensive case.
