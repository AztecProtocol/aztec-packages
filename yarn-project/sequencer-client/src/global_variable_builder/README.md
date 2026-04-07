# Fee Prediction

The `FeePredictor` predicts min fees for upcoming L2 slots based on the current L1
oracle state and an assumed mana usage pattern.

## Prediction Window

The prediction covers `LAG = 2` entries (the next available slot plus 1 more).
A new oracle update can activate at `startSlot + LAG`, so only the first LAG entries
are guaranteed stable. Beyond that, L1 fees could change unpredictably.

Each entry uses:

- The **actual L1 fees** the oracle would return for that slot's timestamp (pre or post,
  depending on whether the slot is before or after `slotOfChange`).
- A **configurable congestion assumption** (`ManaUsageEstimate`): none (0 mana), target
  (steady state), or limit (worst case, 2x target).

The client picks `max(predicted[0..LAG-1])` as their `maxFeesPerGas`.

```
predicted[0]  →  fee at next slot     (current oracle + current congestion)
predicted[1]  →  fee at next slot + 1 (congestion may change based on usage estimate)
```

## Why LAG and not LIFETIME?

The L1 gas oracle has two timing constants:

- **LAG = 2 slots**: when new fees are queued, they activate LAG slots later
- **LIFETIME = 5 slots**: after an oracle update, the next update is rejected until
  `slotOfChange + (LIFETIME - LAG)` slots have passed

If the oracle cooldown has already elapsed (i.e., no recent update), a new update can
be enqueued at any moment. Its new values would activate LAG slots later. This means
predictions beyond LAG slots could be invalidated by an oracle update that happens
right after we query.

With a LIFETIME-sized window, we'd give a false sense of coverage: the prediction
would look like it covers 6 slots, but slots beyond LAG could be wrong if an update
is enqueued after the prediction is computed.

By limiting to LAG entries, we guarantee that all predicted L1 fees are the ones that
will actually be used — no oracle update can change them within this window.
