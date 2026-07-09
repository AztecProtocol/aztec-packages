---
name: network-spot-check
description: Spot-check the health of a live Aztec network deployment by sweeping recent GCP logs for warn/error messages, mapping each to the deployed code, classifying expected vs unexpected, and verifying the hard invariants (no slashing, no attestation timeouts, no unexplained prunes/conflicts). Use when asked to "spot-check", "review logs", or "health check" a network (staging, testnet, devnet, ...) over a recent window.
argument-hint: <namespace and window, e.g. "staging-internal, last 4 hours">
---

# Network spot-check

A structured review of a live network's recent logs. This goes deeper than a one-off
`/network-logs` query: it sweeps a whole time window, maps every distinct warn/error to
the code that emits it, verifies the network's hard invariants with explicit queries, and
produces a classified report. It was designed from a staging-internal review; the
procedure generalizes to any namespace.

## Parameters

- **Namespace**: which deployment (e.g. `staging-internal`, `testnet`, `devnet`). Ask if unclear.
- **Window**: default the last 4 hours.
- **Deployed branch**: which git branch the network runs. Do NOT assume it is the current
  checkout. As of 2026-07, `staging-internal` runs `v5-next` while the default checkout is
  `next` — a log string that exists on one line may not exist on the other. If unknown, ask,
  or determine it empirically: `git grep "<log message>" origin/<branch> -- yarn-project` and
  `git log -S "<log message>" --all --oneline` to see which line contains a given message.
- **Invariants / acceptable errors**: unless the operator overrides, use the defaults below.

## Procedure

### 1. Delegate the sweep to a subagent

Spawn a **sonnet** `network-logs` subagent (keeps the token-heavy log dumps out of the main
context). Its prompt must ask for, over the full window:

1. All warn+error entries from the core block-building/sync modules — **sequencer**,
   **validator**, **archiver**, and **slasher** (`slasher:*` plus the offense watchers:
   `attested-invalid-proposal-watcher`, `checkpoint-equivocation-watcher`,
   `data-withholding-watcher`, `broadcasted-invalid-checkpoint-proposal-watcher`) — and
   from the supporting subsystems where their failures actually surface: `p2p:*`
   (attestation pool/gossip, tx collection, peering), `world-state:*` (sync),
   `node:l1-tx-utils` / `ethereum:publisher` (L1 tx submission — where failed checkpoint
   pushes show up), and `prover-node:*` (epoch-monitor / epoch-proving-job — epochs that
   fail to prove are what eventually cause prunes). Page through the window; do not
   sample only the newest entries.
2. Grouping by **distinct message template**, with count, first/last timestamp, and emitting pods.
3. Code mapping: grep the checkout for each template to find the emitting `file:line` and
   understand the condition that fires it.
4. Surrounding context (same pod, ±2 min, all severities) for anything significant: what led
   to it, and did the node recover.
5. The explicit invariant checks from step 3 below, with the queries used.
6. Overall health signals: checkpoint/block heights advancing monotonically with no gaps,
   archiver download lag, pod restarts (a restart marks a redeploy — relevant for classification).

Have it return raw structured data (tables, sample lines with timestamps and pods), not prose.

### 2. Verify the code mapping yourself

The subagent greps the working checkout; re-check anything it could not find against the
**deployed branch** (`git grep "<msg>" origin/<deployed-branch>`, `git log -S`). Read the
emitting function before classifying: the surrounding code and comments usually state whether
the path is expected (e.g. an early-return for empty blocks) or a genuine failure.

### 3. Explicit invariant checks (never skip, even if the sweep looks clean)

Run these as direct queries over the window, all severities, and report each as a
zero/non-zero with the query used:

- **Slashing** (must be zero): `[Ss]lash` — then distinguish real slashing from bookkeeping.
  `Starting new slashing round N` (slasher_client.ts `handleNewRound`) is routine round
  rotation, NOT slashing. Also check `executed with` (slash execution), `[Oo]ffen[cs]e`
  (offense detection), and `Slashing is disabled`. Any activity from the offense watchers
  listed in step 1 means a node misbehaved (equivocation, invalid proposal, data
  withholding) — investigate it even if no slash was ever executed.
- **Attestation-collection timeouts** (must be zero): the exact string is
  `Timeout while waiting for attestations` (sequencer-client, checkpoint proposal job,
  fires on `AttestationTimeoutError`).
- **Prunes**: `[Pp]run`. A short prune following a checkpoint that failed to push to L1
  under congestion is acceptable; anything else needs a root cause.
- **Conflicts / reorgs**: `[Cc]onflict`, `[Rr]eorg` — must be zero.
- **Timeout sweep**: `[Tt]imeout|[Tt]imed out` — classify every hit.

### 4. Classification

**Acceptable (list, don't alarm):**
- Checkpoint push to L1 failing under L1 congestion, followed by a short prune.
- Errors clearly caused by a redeploy/restart (correlate with pod restart times).
- Known noise (verify these are still current before relying on the list):
  - `Uniswap V4 StateView contract not found, skipping fee asset price oracle` — StateView
    only exists on mainnet; expected everywhere else.
  - OTel telemetry noise: `BatchSpanProcessor dropping spans` and
    `PeriodicExportingMetricReader ... Request Timeout` blips (cross-pod, simultaneous =
    shared collector hiccup; confirm block production continued through it).
  - `Provided no txs to ... addTxs` from the prover orchestrator — expected for every empty
    block (demoted to verbose in PR #24593; only relevant on lines without that change).

**Investigate and report prominently (raw lines, timestamps, pods, counts, root cause):**
any slashing, attestation-collection timeouts, unexplained prunes, conflicts/reorgs, sync
failures, or unclassified timeouts.

### 5. Correlating L1-wait timeouts with actual L1 blocks

`Timed out waiting for previous L1 block before sending requests, proceeding`
(sequencer-publisher, from PR #24037) is the designed fallback when the L1 slot right before
the target slot appears skipped. To confirm each occurrence against ground truth:

1. Pull the entries with `--format=json`: the `jsonPayload` carries `previousL1BlockTs`,
   `waitDeadlineTs` (= previousL1BlockTs + 8s default), `targetSlot`.
2. For each `previousL1BlockTs`, find the bracketing L1 blocks via an execution RPC
   (`eth_getBlockByNumber`; estimate the block number from a latest-block anchor at 12s/slot,
   then step). L1 slot timestamps are 12s-aligned: if no block carries exactly that timestamp
   (i.e. it falls inside a ≥24s gap), the slot was genuinely missed and the warn is benign.
3. Ask the operator for an RPC endpoint for the network's L1 if none is configured. Be
   gentle with third-party endpoints: cache every block fetched, sleep between calls, and
   back off on HTTP 429.

If the slot was NOT missed, the node's L1 RPC served the block late — then (and only then)
dig into what the node's L1 watchers/archiver were doing at that moment.

### 6. Deliverable

Full classified report (distinct-template table, invariant check results with queries,
context samples, health signals) as a gist; short outcome-first summary in the thread. If a
log turns out to be mis-leveled (routine control flow logged at warn), propose demoting it —
but only open a PR when the operator asks, and against the branch they name.
