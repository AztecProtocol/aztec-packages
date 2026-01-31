# Sequencer Attestations & Rewards — FAQ

> This FAQ documents common questions, subtle behaviors, and frequent points of confusion when monitoring sequencer performance, attestations, epochs, and rewards.

---

## 1. Why does my attestation count change from epoch to epoch?

**Short answer:** Because the number of attestation *assignments* is not constant.

You may observe patterns like:

```
31, 31, 31, 30, 26
```

with **zero failures**.

This does **not** indicate missed work or degraded performance. It means that across those epochs, your sequencer was assigned a different number of attestation duties.

### Why this happens
- Committee assignments are reshuffled every epoch using randomness
- Epochs may contain different numbers of attestation slots
- The active sequencer set can change slightly over time
- Dashboard windows may include partial epochs (e.g., at startup or boundaries)

The effective rule is:

> **Your maximum attestations in an epoch = the number of duties assigned to you in that epoch**

---

## 2. What is the maximum number of attestations a sequencer can have?

There is **no global fixed maximum**.

The apparent “max” (often ~30–32) is an artifact of:
- Current committee sizing
- Active sequencer count
- Epoch structure

Seeing a stable number like `31` repeatedly is a sign of *network stability*, not a protocol guarantee.

---

## 3. Is a lower attestation count a performance issue?

**No — not by itself.**

Performance is measured by **success vs. assigned duties**, not by raw counts.

### Healthy sequencer
- Assigned: 26
- Successful: 26
- Missed: 0
- Attestation Rate: 100%

### Unhealthy sequencer
- Assigned: 31
- Successful: 27
- Missed: 4
- Attestation Rate: <100%

If your attestation rate is 100%, the sequencer is performing perfectly regardless of the raw number.

---

## 4. Why did my sequencer receive no rewards despite many successful attestations?

Because **attestations are not directly rewarded** in Aztec.

In Aztec's design:
- **Block proposals** → reward-triggering events (block rewards + transaction fees)
- **Attestations** → liveness and correctness requirements (unpaid participation)

Attestations:
- Keep your sequencer active
- Prevent penalties or slashing
- Maintain eligibility for future proposer rewards

But they do **not** mint rewards on their own.

---

## 5. Can a sequencer participate in an epoch without proposing any blocks?

**Yes — this is extremely common.**

Block proposer selection is:
- Sparse
- Randomized
- Stake-weighted

Over short windows (e.g., 10 epochs), it is normal for a sequencer to:
- Perform dozens of attestations
- Receive zero proposer slots
- Earn zero rewards

This does **not** indicate a problem.

---

## 6. Can a sequencer make successful attestations if it is not included in an epoch?

It depends on what *“included”* means.

### Included in an epoch means:
- Bonded / staked
- Active (not exiting, not slashed)
- Part of the sequencer set for that epoch

If included:
- The sequencer **will** receive attestation duties
- The sequencer **may or may not** receive proposer duties

### What cannot happen
A sequencer that is *truly excluded* from the active set:
- Receives no duties
- Produces no valid attestations
- Shows zero participation

So if you see successful attestations, the sequencer **was included**.

---

## 7. Why does the dashboard sometimes show `0 / 0` block proposals?

This means:
- The sequencer was **not selected** for any proposer slots
- Not that it failed to propose

`0 / 0` is a neutral state, not a failure.

---

## 8. How should I interpret bar charts showing attestations and blocks?

Each epoch column typically includes:
- 🟢 Attestation Success — completed attestation duties
- 🔴 Attestation Missed — assigned but not completed
- 🔵 Blocks Success — successful block proposals
- 🟠 Blocks Missed — failed proposer opportunities

Large green bars with tiny or zero blue bars are **normal**.

---

## 9. Example Dashboard Screenshot (Illustrative)


### Dashboard Screenshot

```
┌───────────────────────────────────────────────┐
│ Sequencer X7C…91A2      Status: Validating    │
│ Epoch Window: 1901–1905                       │
│                                               │
│ Last 5 Epochs Participated                    │
│                                               │
│ Epoch 1901  ████████████████████  Att: 32     │
│ Epoch 1902  ████████████████████  Att: 32     │
│ Epoch 1903  ████████████████████  Att: 31     │
│ Epoch 1904  ███████████████████   Att: 30     │
│ Epoch 1905  ████████████████      Att: 27     │
│                                               │
│ Attestation Rate: 100%   (152 / 152)          │
│ Block Proposals:         0 / 0                │
│ Rewards:                 0                    │
└───────────────────────────────────────────────┘
```

**Interpretation:**
> Fully healthy sequencer, included in all epochs, completed all assigned attestations, but not selected as a block proposer during this window.

---

## 10. Key takeaways

- Attestation counts vary naturally
- Attestation success matters more than volume
- Attestations are usually unpaid
- Proposer selection is rare and stochastic
- `0 / 0` proposals is normal
- No rewards ≠ bad performance

---

## Suggested UI Clarifications (Optional)

To reduce confusion, dashboards may benefit from:
- Labeling attestations as **“Non-rewarded participation”**
- Tooltips explaining `0 / 0` proposer rates
- Separating *assignment counts* from *performance metrics*

---

