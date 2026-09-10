# Transactions Bot

Simple bot that connects to a PXE to send txs on a recurring basis.

`BOT_MODE` selects what it does:

| `BOT_MODE`   | What it does                                                                                |
| ------------ | ------------------------------------------------------------------------------------------- |
| `transfer`   | Default. Sends token transfers, one L2 transaction per tick.                                  |
| `amm`        | Swaps tokens on an AMM, one L2 transaction per tick.                                          |
| `crosschain` | Consumes one L1→L2 message and emits L2→L1 messages per tick, keeping a small seed pipeline.  |
| `inbox`      | Exercises the Fast Inbox: produces atomic batches of L1→L2 messages and consumes every one.   |

The rest of this document is about `inbox` mode.

## Inbox mode

The bot produces batches of L1→L2 messages through the Inbox and follows each message all the way to
consumption on L2, checking the node's messaging API as it goes. It is a monitoring bot: the useful output is
its telemetry, not its transactions.

One production step sends `BOT_INBOX_MESSAGES_PER_BATCH` `sendL2Message` calls through Multicall3 in **one
atomic L1 transaction**, so every message in a batch shares an L1 block and gets contiguous Inbox indices. The
Multicall3 contract — not the signing EOA — is the `sender` the Inbox records, and consumption is built against
that address.

Every message is then assigned an L2 domain (`public` or `private`) and consumed through it, and the bot
records whether the consuming block was also the block that inserted the message.

Once a day (by default) it runs a **saturation batch** of 257 messages: one more than a bucket holds, so the
Inbox has to roll a full bucket over inside a single L1 block.

### Two independent clocks

| Clock                | Interval                        | Drives                                                             |
| -------------------- | ------------------------------- | ------------------------------------------------------------------ |
| L1 batch production  | `BOT_TX_INTERVAL_SECONDS`       | One atomic Inbox batch per tick, at most one submission in flight.  |
| Consumption polling  | Fixed 1s, not configurable      | Observation, readiness, consumption attempts and receipt polling.   |

They are deliberately separate: the polling cadence tracks how fast blocks appear, while the batch interval is
the knob that controls how much load the bot puts on the chain. `BOT_MAX_PENDING_TXS` gates new L2
submissions; `BOT_L1_TO_L2_SEED_COUNT` caps how many produced messages may be outstanding at once and is what
gates production.

### Readiness semantics

Three different questions get confused easily; the bot keeps them apart:

- **`node.getL1ToL2MessageIndex(msgHash)` is an observation.** It answers "the archiver has read this message
  from L1 and knows its index". It does **not** mean the message is in any block's message tree. The bot uses
  it to move a message to `observed`, and to start the *public* consumption — the sequencer inserts the block's
  messages before executing its transactions, so a public consumption can legitimately land in the very block
  that inserts the message.
- **`isL1ToL2MessageReady(node, msgHash, tip)` is an index comparison.** It answers "the message's index is
  below the message tree size at that tip". It neither proves membership nor guarantees that a transaction
  built against that tip will be included. The bot uses it as the *private* gate, then proves the answer:
  it pins the tip to a concrete block number, fetches the membership witness at that block, and verifies the
  witness against that block's own `l1ToL2MessageTree` root (`check=readiness_witness`). Anything that moved
  under the check is reported as inconclusive, never as a failure.
- **Inclusion** is a receipt. Nothing before it is a promise that a transaction lands.

### Wallet sync tip vs. completion policy

Two more things that are easy to conflate:

- The **wallet sync tip** (the `syncChainTip` the bot is constructed with, `latest` by default) is the anchor a
  readiness check and a private simulation are answered at. It labels the `anchor_policy` attribute.
- **`BOT_FOLLOW_CHAIN`** is the tip a *receipt* must reach before the bot calls a message completed
  (`PROPOSED`, `CHECKPOINTED` or `PROVEN`). It labels the `completion_policy` attribute. `NONE` is rejected in
  inbox mode.

The bot records first proposed inclusion separately from completion, so `l1_mined_to_included` stays a
block-building latency even when `BOT_FOLLOW_CHAIN=PROVEN` makes `l1_mined_to_completed` an epoch-scale one.

### Configuration

Inbox-specific variables:

| Env var                                  | Default | Meaning                                                                          |
| ---------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| `BOT_MODE=inbox`                         | —       | Selects this mode.                                                                |
| `BOT_INBOX_MESSAGES_PER_BATCH`           | `4`     | Messages per atomic L1 batch. Integer in `[1, 257]`.                              |
| `BOT_INBOX_CONSUME_MODE`                 | `mixed` | `mixed` alternates public/private across messages *and* batches; or force either. |
| `BOT_INBOX_SATURATION_INTERVAL_SECONDS`  | `86400` | How often the 257-message saturation batch runs. `0` disables it entirely.        |

Shared variables that matter in inbox mode:

| Env var                        | Inbox default        | Meaning                                                              |
| ------------------------------ | -------------------- | -------------------------------------------------------------------- |
| `BOT_L1_TO_L2_SEED_COUNT`      | `512` (crosschain: 1)| Cap on outstanding produced messages. Setting it explicitly wins.     |
| `BOT_TX_INTERVAL_SECONDS`      | `60`                 | L1 batch cadence.                                                     |
| `BOT_FOLLOW_CHAIN`             | —                    | Completion policy. `NONE` is rejected in inbox mode.                  |
| `BOT_L1_TO_L2_TIMEOUT_SECONDS` | `3600`               | How long a message may stay pending before it is written off.         |
| `ETHEREUM_HOSTS`               | —                    | L1 RPC. Required.                                                     |
| `BOT_L1_PRIVATE_KEY` / `BOT_L1_MNEMONIC` | —          | L1 account that pays for the Inbox batches. Required.                 |
| `BOT_MAX_CONSECUTIVE_ERRORS`   | `0`                  | Consecutive failures before the bot reports itself unhealthy.          |

Configuration is validated at startup and never silently clamped. The bot refuses to start when
`BOT_FOLLOW_CHAIN=NONE`, when `BOT_INBOX_MESSAGES_PER_BATCH` is outside `[1, 257]`, when
`BOT_L1_TO_L2_SEED_COUNT` is below the batch size, or when saturation is enabled and the seed count is below
257 (a saturation batch could then never fit under the outstanding cap).

**Keep `BOT_L1_TO_L2_TIMEOUT_SECONDS` comfortably below `BOT_INBOX_SATURATION_INTERVAL_SECONDS`.** The bot
never starts a saturation run while the previous one is unresolved, and a run resolves once every one of its
messages is either consumed or timed out. With a message timeout longer than the saturation interval, a single
stuck run blocks every later run: `saturation_next_due_timestamp` goes overdue while `runInFlight` is still
set. The defaults (1 hour against 1 day) satisfy this with a wide margin. This is a tuning rule rather than a
startup check, because a slow devnet may legitimately want a long message timeout, and the overdue-run alert
below already surfaces the stall.

### Worked configurations

Low-latency: measure how fast a message becomes consumable, small batches, no saturation run.

```sh
BOT_MODE=inbox
BOT_FOLLOW_CHAIN=PROPOSED
BOT_INBOX_MESSAGES_PER_BATCH=4
BOT_INBOX_CONSUME_MODE=mixed
BOT_TX_INTERVAL_SECONDS=60
BOT_L1_TO_L2_TIMEOUT_SECONDS=1800
BOT_INBOX_SATURATION_INTERVAL_SECONDS=0
```

Proven completion: measure end-to-end latency to the proven tip. The message timeout has to outlast an epoch's
proving, so it is raised, and the saturation interval with it.

```sh
BOT_MODE=inbox
BOT_FOLLOW_CHAIN=PROVEN
BOT_INBOX_MESSAGES_PER_BATCH=4
BOT_INBOX_CONSUME_MODE=mixed
BOT_TX_INTERVAL_SECONDS=300
BOT_L1_TO_L2_TIMEOUT_SECONDS=21600      # 6h, must outlast proving
BOT_INBOX_SATURATION_INTERVAL_SECONDS=86400
BOT_L1_TO_L2_SEED_COUNT=512
```

Saturation disabled — for a network where a 257-message batch is not wanted:

```sh
BOT_MODE=inbox
BOT_FOLLOW_CHAIN=CHECKPOINTED
BOT_INBOX_SATURATION_INTERVAL_SECONDS=0
```

With saturation disabled, `aztec.bot.inbox.saturation_enabled` reports `0` and both saturation timestamps
report `0`. **A disabled schedule must never alert as a missing run** — every daily-run alert below is gated
on `saturation_enabled == 1`.

## Telemetry

Meter and tracer name: `InboxBot`. Sixteen instruments, all under `aztec.bot.inbox.`. Counters are
`UpDownCounter`s that only ever move up (the telemetry wrapper has no monotonic counter), so Prometheus does
**not** append `_total` to them; known attribute combinations are pre-seeded to `0` so a quiet bot still
exports every series a dashboard queries.

The Prometheus names below follow the collector's OTLP→Prometheus translation: dots become underscores and the
OTel unit is appended (`spartan/metrics` runs the contrib collector's `prometheus` exporter with its default
suffixing). That rule is directly observable on the metrics already in the backend, e.g. `aztec.l1_publisher.balance`
with unit `eth` appears as `aztec_l1_publisher_balance_eth`, and `aztec.peer_manager.peer_count` with unit
`peers` as `aztec_peer_manager_peer_count_peers`. Unit `s` normalizes to `seconds` and unit `1` on a gauge to
`ratio`; no aztec metric carrying those units is exported to that backend yet, so confirm those two suffixes in
the metric browser the first time the bot runs.

| Instrument (OTel)                                | Type              | Unit       | Prometheus series                                        |
| ------------------------------------------------ | ----------------- | ---------- | -------------------------------------------------------- |
| `aztec.bot.inbox.message_count`                   | UpDownCounter     | `messages` | `aztec_bot_inbox_message_count_messages`                 |
| `aztec.bot.inbox.stage_duration`                  | Histogram         | `s`        | `aztec_bot_inbox_stage_duration_seconds_{bucket,sum,count}` |
| `aztec.bot.inbox.simulation_count`                | UpDownCounter     | `attempts` | `aztec_bot_inbox_simulation_count_attempts`              |
| `aztec.bot.inbox.public_execution_count`          | UpDownCounter     | `attempts` | `aztec_bot_inbox_public_execution_count_attempts`        |
| `aztec.bot.inbox.prediction_mismatch_count`       | UpDownCounter     | `attempts` | `aztec_bot_inbox_prediction_mismatch_count_attempts`     |
| `aztec.bot.inbox.check_count`                     | UpDownCounter     | `checks`   | `aztec_bot_inbox_check_count_checks`                     |
| `aztec.bot.inbox.failure_count`                   | UpDownCounter     | `failures` | `aztec_bot_inbox_failure_count_failures`                 |
| `aztec.bot.inbox.pending_count`                   | ObservableGauge   | `messages` | `aztec_bot_inbox_pending_count_messages`                 |
| `aztec.bot.inbox.oldest_pending_age`              | ObservableGauge   | `s`        | `aztec_bot_inbox_oldest_pending_age_seconds`             |
| `aztec.bot.inbox.l1_batch_count`                  | UpDownCounter     | `batches`  | `aztec_bot_inbox_l1_batch_count_batches`                 |
| `aztec.bot.inbox.l1_batch_size`                   | Histogram         | `messages` | `aztec_bot_inbox_l1_batch_size_messages_{bucket,sum,count}` |
| `aztec.bot.inbox.l1_gas_used`                     | Histogram         | `gas`      | `aztec_bot_inbox_l1_gas_used_gas_{bucket,sum,count}`     |
| `aztec.bot.inbox.saturation_run_count`            | UpDownCounter     | `runs`     | `aztec_bot_inbox_saturation_run_count_runs`              |
| `aztec.bot.inbox.saturation_last_success_timestamp`| ObservableGauge  | `s`        | `aztec_bot_inbox_saturation_last_success_timestamp_seconds` |
| `aztec.bot.inbox.saturation_enabled`              | ObservableGauge   | `1`        | `aztec_bot_inbox_saturation_enabled_ratio`               |
| `aztec.bot.inbox.saturation_next_due_timestamp`   | ObservableGauge   | `s`        | `aztec_bot_inbox_saturation_next_due_timestamp_seconds`  |

Attribute keys translate the same way (`aztec.bot.inbox.scenario` → label `aztec_bot_inbox_scenario`), and
every value is drawn from a bounded set — no hash, address, index, block or bucket number, batch id, exception
text or timestamp ever reaches a label. Those live in the logs and spans instead.

| Attribute        | Values                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| `mode`           | `public`, `private`                                                                                   |
| `scenario`       | `normal`, `saturation`                                                                                |
| `stage`          | `l1_submission_to_mined`, `l1_mined_to_observed`, `l1_mined_to_ready`, `l1_mined_to_included`, `l1_mined_to_completed` |
| `milestone`      | `sent`, `observed`, `ready`, `included`, `completed`, `timed_out`, `failed`                            |
| `block_relation` | `same_block`, `later_block`, `unknown`                                                                |
| `check`          | `unknown_message`, `event_integrity`, `index_match`, `readiness_witness`, `consumption_nullifier`, `replay_rejection`, `bucket_rollover` |
| `reason`         | `l1_submission`, `l1_revert`, `rpc`, `simulation`, `l2_drop`, `l2_revert`, `timeout`, `api_inconsistency`, `invalid_witness`, `invalid_consumption`, `replay_accepted`, `bucket_mismatch`, `reorg` |
| `anchor_policy`  | `latest`, `proposed`, `checkpointed`, `proven`, `finalized`                                           |
| `completion_policy` | `proposed`, `checkpointed`, `proven`                                                               |
| `result`         | Per instrument: simulation `accepted`/`not_ready`/`error`; public execution `success`/`reverted`; check `passed`/`failed`; L1 batch `success`/`reverted`; saturation run `started`/`success`/`failed` |

Durations are **bot-observed**: each is the gap between two of the bot's own observations, so it includes
polling delay and is always at least the chain-level latency it approximates. Real L1 block timestamps are kept
in logs, never in metrics. Export is not exactly-once — the bot persists a marker after handing a sample to an
instrument, but an OTel export and a KV commit cannot be made atomic.

`InboxBot.produceBatch`, `InboxBot.consumptionAttempt` and `InboxBot.replayProbe` are the three spans; each is
scoped to one batch, one attempt or one check, and none is held open across a proving wait. Batch and message
ids are span attributes only.

## Operator recipe

Latency, split by domain and scenario:

```promql
# p50 / p95 mined -> first proposed inclusion, by mode
histogram_quantile(0.5, sum by (le, aztec_bot_inbox_mode) (rate(
  aztec_bot_inbox_stage_duration_seconds_bucket{aztec_bot_inbox_stage="l1_mined_to_included"}[30m])))
histogram_quantile(0.95, sum by (le, aztec_bot_inbox_mode) (rate(
  aztec_bot_inbox_stage_duration_seconds_bucket{aztec_bot_inbox_stage="l1_mined_to_included"}[30m])))

# ... and to completion under the configured policy, split by scenario
histogram_quantile(0.95, sum by (le, aztec_bot_inbox_scenario) (rate(
  aztec_bot_inbox_stage_duration_seconds_bucket{aztec_bot_inbox_stage="l1_mined_to_completed"}[30m])))
```

Same-block success fraction — `unknown` is counted separately rather than folded into either side, because an
inconclusive insertion-block search says nothing about the race:

```promql
sum(rate(aztec_bot_inbox_message_count_messages{
  aztec_bot_inbox_milestone="included", aztec_bot_inbox_block_relation="same_block"}[30m]))
/
sum(rate(aztec_bot_inbox_message_count_messages{
  aztec_bot_inbox_milestone="included", aztec_bot_inbox_block_relation=~"same_block|later_block"}[30m]))

# watch this alongside, and do not let it grow
sum(rate(aztec_bot_inbox_message_count_messages{
  aztec_bot_inbox_milestone="included", aztec_bot_inbox_block_relation="unknown"}[30m]))
```

Not-ready ratio — how often a consumption raced the block that absorbs its message. Expected to be non-zero;
a sharp rise means messages are taking longer to become consumable:

```promql
sum(rate(aztec_bot_inbox_simulation_count_attempts{aztec_bot_inbox_result="not_ready"}[30m]))
/ sum(rate(aztec_bot_inbox_simulation_count_attempts[30m]))
```

Correctness signals — all three should sit at zero:

```promql
# a public execution that reverted after its simulation was accepted
sum(rate(aztec_bot_inbox_prediction_mismatch_count_attempts[30m]))
# any semantic check the node failed
sum by (aztec_bot_inbox_check) (rate(aztec_bot_inbox_check_count_checks{aztec_bot_inbox_result="failed"}[30m]))
# messages written off after the timeout
sum(rate(aztec_bot_inbox_message_count_messages{aztec_bot_inbox_milestone="timed_out"}[30m]))
```

Backlog:

```promql
sum by (aztec_bot_inbox_scenario) (aztec_bot_inbox_pending_count_messages)
max by (aztec_bot_inbox_scenario) (aztec_bot_inbox_oldest_pending_age_seconds)
```

Saturation gas and outcomes:

```promql
histogram_quantile(0.95, sum by (le) (rate(
  aztec_bot_inbox_l1_gas_used_gas_bucket{aztec_bot_inbox_scenario="saturation"}[1d])))
sum by (aztec_bot_inbox_result) (rate(aztec_bot_inbox_saturation_run_count_runs[1d]))
```

Daily-run health. Both alerts are gated on the schedule being enabled, so a bot with saturation turned off
never alerts as missing a run:

```promql
# (1) enabled and overdue: the next run has been due for more than an hour
(time() - max(aztec_bot_inbox_saturation_next_due_timestamp_seconds) > 3600)
  and on() max(aztec_bot_inbox_saturation_enabled_ratio) == 1

# (2) enabled and a run started with no terminal outcome: more runs have started than have finished.
#     Set the alert rule's `for:` to BOT_L1_TO_L2_TIMEOUT_SECONDS, which is how long a stuck run may take
#     to resolve itself by timing its messages out.
(sum(aztec_bot_inbox_saturation_run_count_runs{aztec_bot_inbox_result="started"})
   - sum(aztec_bot_inbox_saturation_run_count_runs{aztec_bot_inbox_result=~"success|failed"})) > 0
  and on() max(aztec_bot_inbox_saturation_enabled_ratio) == 1
```

`aztec.bot.inbox.saturation_last_success_timestamp` only advances when a run was verified in full: every one of
its 257 messages consumed **and** every check of that run passed, including the bucket layout check. A run
whose bucket counts could not be read off L1 leaves the check unresolved, which also leaves the run short of a
success — the run is reported as `failed` and the timestamp does not move.

## L1 gas

Measured by `end-to-end/src/single-node/cross-chain/inbox_bot.test.ts` against this implementation: one
Multicall3 `aggregate3` carrying `count` `sendL2Message` calls, gas taken from `eth_estimateGas` plus a margin,
sent by a plain EOA to a freshly deployed Inbox on anvil.

Revision: `50d6672446e` plus the phase-5 working tree (this README's change set). These figures move whenever
the Inbox, the calldata encoding, or the L1 gas schedule changes — re-run the test rather than trusting the
table.

| Messages | `gasUsed` | Gas per message | Buckets |
| -------- | --------- | --------------- | ------- |
| 4        | 134,103   | 33,525          | 1       |
| 256      | 3,682,558 | 14,384          | 1       |
| 257      | 3,741,197 | 14,557          | 2       |

Reading it:

- The 257th message costs `3,741,197 - 3,682,558 = 58,639` gas, because it opens a new bucket (two cold storage
  slots) on top of its own insert. A message absorbed into an already-open bucket costs about 14.4k.
- Small batches pay the transaction's fixed cost over few messages, which is why 4 messages cost 33.5k each and
  256 cost 14.4k each.
- The absolute numbers vary by roughly ±17k between runs at the same size, depending on whether the batch's
  first message writes a ring slot that was already warm.
- A **compact Solidity loop** — a helper contract taking one array and looping over `sendL2Message` — was not
  measured: it would need a production helper contract deployed alongside the Inbox, which this bot deliberately
  does not add. Multicall3 is already deployed everywhere the bot runs.
- The historical figure of `2,212,595` execution gas that circulated during design is **not** a limit and is not
  comparable to the table above; use the measured numbers.
