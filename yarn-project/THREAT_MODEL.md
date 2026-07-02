# Aztec Network Threat Model

This document describes the threat model of the Aztec L2 network: how transactions flow from users into the proven
chain, what each participant can and cannot do, and the properties the implementation must uphold. It is intended as a
guideline for the security of the node implementation (`yarn-project`) and its interaction with the L1 rollup
contracts (`l1-contracts`).

**In scope**: transaction dissemination and the mempool, the p2p layer, block and checkpoint production, committee
attestation, L1 checkpoint submission and sync, epoch proving, slashing, and the escape hatch.

**Out of scope**: client-side private execution and proving (PXE, wallets), hardening of a node's public RPC interface,
the cryptographic soundness of the proving system itself (treated as an assumption below), and L1 governance internals.

## 1. System overview

### Actors

| Actor | Role |
| --- | --- |
| User | Executes private functions locally, produces a client-side proof, submits the tx to a node via RPC. |
| Node | Syncs L2 state from L1 and p2p, maintains a mempool, serves RPC. Every other server-side actor runs one. |
| Proposer | The validator elected for a slot. Builds blocks, collects attestations, submits the checkpoint to L1. |
| Committee | Per-epoch sample of validators. Re-executes proposals and attests to checkpoints; its attestations gate proof acceptance (training wheels for the proving system, A2) and back data availability (A8). |
| Prover | Generates the epoch validity proof and submits it to L1. Permissionless. |
| Escape hatch proposer | Bonded candidate, randomly selected, may propose without a committee during periodic windows. |
| Vetoer | Designated L1 role that can block slash payloads during the execution delay. |
| L1 contracts | Rollup (checkpoints, proofs, pruning, invalidation), Inbox/Outbox (cross-chain messages), slashing and governance periphery. |

### Time and validator selection

Time is divided into **slots** (fixed windows, e.g. 72 s): each slot has exactly one elected proposer and produces at
most one checkpoint, built as several blocks in fixed sub-slots. Slots group into **epochs**: each epoch has one
committee, and epochs are the unit of proving and pruning.

The committee for epoch N is sampled (Fisher–Yates, without replacement) from the registered validator set, seeded from
Ethereum's RANDAO. Both inputs are taken from the past: the validator set is snapshotted `lagInEpochsForValidatorSet`
epochs before N and the seed `lagInEpochsForRandao` epochs before N, with set lag ≥ seed lag — by the time the
randomness is known, the population it samples from can no longer be changed. L1 stores a commitment to each epoch's
committee to prevent substitution (`ValidatorSelectionLib`); nodes mirror the computation locally
([epoch-cache README](epoch-cache/README.md)). The proposer for a slot is
`keccak(epoch, slot, seed) % committeeSize` — deterministic and computable by anyone.

Selection bias is an audit surface in its own right: seed grinding via L1 `prevrandao`, and timing games against the
validator-set snapshot. The lag scheme above and the escape hatch's snapshot-before-seed ordering are the existing
defenses. Edge case: an empty committee (target size 0) means anyone may propose, and nodes accept checkpoints without
attestation validation.

### Transaction lifecycle

1. **Submission.** A user sends a tx (with its client-side proof) to a node via JSON-RPC `sendTx`. The node fully
   validates it — proof verification plus protocol rules (double-spend, fees, gas limits, expiration, metadata) —
   before admitting it to the mempool ([server.ts](aztec-node/src/aztec-node/server.ts),
   [tx validators](p2p/src/msg_validators/tx_validator/)).
2. **Propagation.** The node gossips the tx on the p2p `tx` topic. Every receiving node runs the same validation
   pipeline *before* the message is re-propagated: gossipsub only forwards messages the local node accepted. Peers that
   originate invalid data are penalized; validation outcomes that could be another node's fault are dropped without
   penalty (see §6).
3. **Mempool.** The pool ([tx_pool_v2](p2p/src/mem_pools/tx_pool_v2/)) admits txs subject to nullifier-conflict,
   fee-payer-balance, and priority rules, and evicts txs that become ineligible (nullifiers mined by a block, expired
   timestamps, insufficient fee-payer balance, invalid anchor block after a reorg, lowest priority when full).
4. **Block building.** The proposer for a slot builds several blocks back-to-back (sub-slots), pulling txs from its
   mempool and executing public calls against a fork of world state. Each block is signed and broadcast as a
   `BlockProposal`; the last block ships inside the `CheckpointProposal` that closes the slot. Production runs
   pipelined: blocks for slot N are built during slot N−1 ([sequencer-client README](sequencer-client/README.md)).
5. **Attestation.** Committee members re-execute every block in the proposal and, if the result matches, sign a
   `CheckpointAttestation` over the checkpoint header and archive root. Attestations are checkpoint-only; individual
   blocks are never attested ([validator-client README](validator-client/README.md)).
6. **L1 submission.** Once the proposer holds a quorum of attestations — ⌊2n/3⌋+1 of the committee — it submits the
   checkpoint to the rollup contract in a single Multicall3 tx (invalidations first, then propose, then
   governance/slashing votes). At propose time L1 validates the header, blob commitments, and the proposer signature,
   but **not** the attestations (posted as calldata) and **not** tx validity (`ProposeLib`).
7. **Sync.** Nodes track two chains. The **proposed chain** comes from p2p: proposals are re-executed locally and
   pushed into the archiver as provisional blocks. The **checkpointed (pending) chain** comes from L1
   `CheckpointProposed` events: each node verifies the posted attestations from calldata (committee membership and
   quorum, per *delayed attestation verification*) before fetching and decoding blobs; checkpointed blocks are **not**
   re-executed ([archiver README](archiver/README.md), [validation.ts](archiver/src/modules/validation.ts)).
8. **Proving.** Prover nodes prove epochs optimistically, starting sub-tree work as checkpoints land on L1. The rollup
   accepts an epoch proof only if the proof verifies **and** the last checkpoint in the range carries valid committee
   attestations (`EpochProofLib`). The proven tip then advances. If no proof
   lands within the proof submission window, all unproven checkpoints are pruned — the pending chain reorgs back to the
   proven tip; nodes unwind preemptively and the mempool resurrects the affected txs.
9. **Finality.** Proven state enables L2→L1 message consumption via the Outbox, and fees/rewards are distributed from
   the committee-attested checkpoint headers. Once the L1 block containing the verified proof is itself finalized on
   L1, the state can no longer be reorged out.

### Chain states

| Chain | Source | Trust |
| --- | --- | --- |
| Proposed | p2p proposals | Re-executed locally; trustless but reorgs freely within/across slots. |
| Checkpointed (pending) | L1 events + blobs | Attestation-gated; contents trusted from the committee (not re-executed). Reorgs on prune or invalidation. |
| Proven | L1 verified proof | Trust reduces to circuit soundness + L1 verifier. Still subject to L1 reorgs. |
| Finalized | Proof's L1 block finalized | The L1 block containing the verified proof is finalized; cannot be reorged out of L1. |

### Where the details live

| Topic | Document |
| --- | --- |
| Proposer flow, pipelining, timetable, L1 publisher | [sequencer-client README](sequencer-client/README.md) |
| Proposal validation, attestation creation, building limits | [validator-client README](validator-client/README.md) |
| Committee/proposer selection, RANDAO seed, epoch caching | [epoch-cache README](epoch-cache/README.md) |
| Gossip topics, message validation, peer scoring, req/resp | [p2p README](p2p/README.md) and sub-READMEs |
| Mempool state machine and eviction | [tx_pool_v2 README](p2p/src/mem_pools/tx_pool_v2/README.md) |
| L1 sync, reorgs, invalid checkpoints, pruning | [archiver README](archiver/README.md) |
| Epoch proving pipeline | [prover-node README](prover-node/README.md) |
| Slashing architecture and offenses | [slasher README](slasher/README.md) |
| Operator-facing slashing guide (amounts, veto, ejection) | [slashing configuration guide](../docs/docs-operate/operators/sequencer-management/slashing-configuration.md) |

## 2. Trust assumptions

- **A1 — Committee quorum.** Safety of the *pending* chain assumes fewer than ⌊2n/3⌋+1 members of any epoch committee
  are malicious; liveness assumes at least ⌊2n/3⌋+1 are honest and online (`computeQuorum` in
  [epoch-helpers](stdlib/src/epoch-helpers/), mirrored in `InvalidateLib`).
- **A2 — Proven-chain soundness.** It must be impossible to prove an invalid state transition: the *proven* chain
  assumes the protocol circuits are sound and the L1 verifier is correct, without relying on committee honesty. The
  committee is nevertheless a second, independent gate: proof submission requires committee attestations on the proven
  range (V4), so it acts as training wheels for the proving system — exploiting a soundness bug also requires a
  colluding quorum (or an escape-hatch bond, §7). Invalid state reaches the proven chain only if *both* layers fail.
- **A3 — Completeness.** Every state transition the network considers valid must be provable. An unprovable-but-attested
  checkpoint forces a prune, so a completeness bug converts into a liveness attack.
- **A4 — Prover liveness.** At least one prover is willing and able to prove each epoch; otherwise the chain reorgs at
  the proof submission deadline.
- **A5 — L1 liveness.** Ethereum remains live and censorship-resistant enough for time-windowed actions to land:
  checkpoint proposal, invalidation, proof submission, slashing votes and execution.
- **A6 — Blind checkpoint trust.** Nodes follow attested checkpoints without re-executing them. A committee quorum can
  therefore feed nodes invalid pending state (bounded by A2 + pruning). This assumption may be revisited.
- **A7 — Uniform validation config.** Slashing relies on all honest validators making identical deterministic validity
  decisions; operators must not run divergent block/checkpoint validation limits.
- **A8 — Data availability.** Checkpoint effects are published as L1 blobs; tx preimages needed for proving are served
  over p2p. Committees are slashed if the data behind their attested checkpoints is not made available.

## 3. Threat actors and worst-case impact

| Actor | Can do (accepted worst case) | Cannot do (must hold) | Mitigations |
| --- | --- | --- | --- |
| Malicious user | Submit txs that later become ineligible (e.g. nullifier races); attempt mempool flooding | Saturate mempools with unincludable txs; get an invalid tx included; force an unprovable state transition | Full validation incl. proof verification at every hop; eviction rules; priority fees + price-bump replacement; per-tx gas floors |
| Malicious peer (non-validator) | Send garbage, replay, or spam over gossip/req-resp | Get invalid data re-broadcast by honest nodes; cause honest nodes to be penalized by their peers; eclipse a node cheaply | Validate-before-forward; peer scoring, rate limits, bans (§6); AUTH handshake on nodes that only accept validator peers |
| Malicious proposer | Censor txs; waste its own slot and the next one (pipelining); post an unattested/badly-attested checkpoint to L1; equivocate | Convince honest nodes of an invalid state transition; corrupt state beyond slot N+1; brick other nodes' sync | Re-execution before attestation/adoption; pipeline depth capped at 2; delayed attestation verification + permissionless invalidation; slashing (§5) |
| Committee minority (< quorum, not proposer) | Withhold their own attestations; equivocate (slashable) | Prevent a slot from being attested; get honest members slashed | Quorum only needs ⌊2n/3⌋+1 of n; equivocation slashing |
| Committee quorum (≥ ⌊2n/3⌋+1 malicious) | Post invalid-but-attested checkpoints that nodes follow blindly; withhold tx data; halt the pending chain until the epoch prune | Get invalid state proven or exited on L1 (A2); avoid slashing for data withholding / attested-invalid | Unprovable state → prune at proof-window expiry; archiver preemptive unwind; slashing incl. `DATA_WITHHOLDING` |
| Malicious prover | Nothing by proving (proofs are verified); grief by *not* proving | Prove an invalid transition (A2); steal fees/rewards via forged proof calldata | Proof verification; attestation gate at proof submission (A2); fees bound to attested headers (see §4.4); A4 for liveness |
| Escape hatch proposer | Same as a malicious committee during its hatch window: post arbitrary unattested checkpoints, halt pending chain until prune | Exceed malicious-committee damage; escape its bond | Bond + punishment for failing to propose-and-prove; hatch windows are bounded (`ACTIVE_DURATION` out of every `FREQUENCY` epochs) |
| Malicious slashing majority | Vote through an unfair slash (requires >50% of a round's proposers) | Execute it silently or instantly | Execution delay + vetoer; offense votes are public on L1 |

## 4. Security properties

Properties are numbered for reference from audit findings. Each states the requirement, the enforcing mechanism, and
notable caveats.

### 4.1 P2P and mempool

- **P1 — Validate before forward.** No node re-broadcasts a gossip message it has not fully validated (including tx
  proof verification). Enforced by running validation inside the gossipsub message-validation hook; only `Accept`
  results propagate.
- **P2 — No penalty for relayed faults.** A peer must not be penalized for forwarding data that was plausibly valid
  from its point of view. Encoded three ways: (a) tx validation splits outcomes into `REJECT` + penalty for
  sender-attributable faults (malformed data, invalid proof) vs `IGNORE`/low-severity for state-divergence-explainable
  ones (recent double-spend, timestamp expiry); (b) proposal gossip validators only run shallow, syntactic checks
  (signature, slot window, proposer identity, tx-hash consistency) — deep re-execution failures are attributed to the
  *proposer* via slashing and never penalize the relaying peer; (c) equivocating or oversized proposals are
  deliberately `Accept`ed and re-broadcast as slashing evidence so the network can witness the offense, again without
  penalizing relayers. A malicious node must not be able to craft data that honest nodes accept, re-broadcast, and are
  then penalized for.
- **P3 — Mempool inclusion-eligibility.** Every tx in the pending pool must be includable in a future block; txs
  invalidated by chain progress are evicted (mined nullifiers, expiry, fee-payer balance, reorged anchor blocks).
  Accepted residual: executing a tx inside a block can invalidate sibling txs mid-slot (nullifier collision); at least
  one tx of any colliding set is includable, and the builder drops the rest during execution.
- **P4 — Flood resistance.** Pool size is capped with priority-fee eviction; replacement requires a configurable price
  bump; gossip messages have per-topic size caps; req/resp protocols have per-peer and global rate limits (§6).
- **P5 — Sybil/eclipse resistance.** Peer discovery (discv5), connection gating, auth handshakes on nodes that only
  accept validator peers (`p2pAllowOnlyValidators`, off by default; no such nodes are deployed today), failed-auth
  lockouts, and IP colocation penalties raise the cost of surrounding a node. This is a defense-in-depth area, not an
  absolute guarantee.

### 4.2 Block proposal and attestation

- **B1 — Proposer exclusivity.** Only the slot's elected proposer can land a checkpoint: L1 verifies the proposer
  signature over the payload digest at propose time (`ValidatorSelectionLib.verifyProposer`); validators independently
  check proposal provenance before processing. During hatch windows, only the designated escape hatch proposer may
  propose.
- **B2 — Re-execution gate.** Honest validators attest only after re-executing all blocks in the checkpoint and
  matching the resulting state (archive root, header hash). Honest full nodes adopt proposed blocks into their view
  only via the same re-execution path. A proposal that fails validation is rejected and triggers a slash vote
  (`BROADCASTED_INVALID_BLOCK_PROPOSAL` / `BROADCASTED_INVALID_CHECKPOINT_PROPOSAL`).
- **B3 — Equivocation detection.** Two proposals for the same position with different content, or two attestations by
  the same signer for the same slot, are slashable (`DUPLICATE_PROPOSAL`, `DUPLICATE_ATTESTATION`). The first duplicate
  proposal is deliberately propagated so other validators can witness the offense. Checkpoint-vs-L1 equivocation is
  caught by comparing signed p2p proposals against L1-confirmed checkpoints.
- **B4 — Bounded proposer blast radius.** Pipelining lets a proposer build on an in-flight parent, so a failed or
  malicious slot can waste the *next* proposer's work, but no more: pipeline depth is capped at 2 checkpoints beyond the
  confirmed tip, and a parent that fails to land cleanly causes the child's work to be discarded and an invalidation to
  be enqueued ([checkpoint_proposal_job.ts](sequencer-client/src/sequencer/checkpoint_proposal_job.ts)).
- **B5 — Attestation quorum.** A checkpoint is valid only with ⌊2n/3⌋+1 committee signatures over the consensus payload
  (EIP-712, slot-bound). Enforced off-chain by every syncing node, and on-chain at proof submission and in
  `invalidateInsufficientAttestations`.

### 4.3 Checkpointed chain and delayed attestation verification

L1 does **not** verify committee attestations at propose time (gas optimization). The security burden moves to:

- **C1 — Nodes never follow bad-attestation checkpoints.** Every node validates attestations (signatures, committee
  membership at the correct index, quorum) from L1 **calldata** before fetching or decoding blobs, so a checkpoint with
  invalid attestations is rejected without touching potentially malformed blob data
  ([validation.ts](archiver/src/modules/validation.ts)).
- **C2 — Sync never bricks.** The archiver skips invalid checkpoints, advances its syncpoint past them, and keeps
  processing. The `inHash` check cannot be weaponized: L1 enforces `header.inHash == inbox.consume(...)` at propose
  time, so a local mismatch indicates a node bug, not attacker-controlled input (`ProposeLib`).
- **C3 — Bad-attestation checkpoints are removable and unprovable.** Anyone can call `invalidateBadAttestation` /
  `invalidateInsufficientAttestations` to purge them (no rebate; expected callers: next proposer, then committee, then
  any validator, with timed fallbacks in the sequencer). They cannot enter the proven chain: `submitEpochRootProof`
  re-verifies the last checkpoint's attestations (`InvalidateLib`, `EpochProofLib`).
- **C4 — Posting bad attestations is punished.** `PROPOSED_INSUFFICIENT_ATTESTATIONS`,
  `PROPOSED_INCORRECT_ATTESTATIONS`, and `PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS` target the
  publishing proposer (only the one who publishes to L1 — a pipelined builder that discarded its work is not at fault).
- **C5 — Malicious-quorum damage is time-bounded.** Invalid-but-attested state persists at most until the epoch's proof
  submission window expires, at which point the rollup prunes on the next propose and nodes preemptively unwind
  (`canPruneAtTime`). Honest checkpoints built on top are collateral damage of the prune (accepted).

### 4.4 Proving

- **V1 — Soundness (A2).** No prover input may yield an accepted proof of an invalid transition. Circuit-level; out of
  scope here but the anchor for everything above.
- **V2 — Completeness (A3).** Anything the network accepts as valid must be provable. Consequence for node config:
  restrictions enforced only in validator software (e.g. block/tx caps) must never make circuit-valid state unprovable
  or unsyncable — see S1.
- **V3 — Prune on missing proof.** Epochs unproven past the window are removed; the chain falls back to the proven tip.
  This is the designed recovery from both prover outages and malicious-quorum garbage.
- **V4 — Unsound-verifier blast radius.** Defense in depth for a hypothetical L1 verifier bug: (a) epoch-proof fee
  data is not free calldata — fees and rewards derive from checkpoint headers that L1 re-hashes against the
  committee-attested header hashes, so a forged proof cannot redirect or inflate fees; (b) proof submission
  requires valid committee attestations on the range's last checkpoint, so a lone prover cannot promote arbitrary state
  — it needs a colluding quorum (or a hatch window, see §7). This is the committee's training-wheels role from A2.
  Residual exposure: Outbox withdrawals from a maliciously-proven state; tracked as a known gap in §7.

### 4.5 L1 sync completeness

- **S1 — Sync everything provable.** Nodes must be able to sync from L1 any checkpoint that provers can prove, even if
  local validator policy would have refused to attest to it. Validator-side caps (`VALIDATOR_MAX_*`) apply only to p2p
  proposal validation; the archiver's L1 path enforces only attestation validity, `inHash` consistency, and structural
  blob decoding. Rationale: escape-hatch and malicious-quorum checkpoints bypass validator policy but can still reach
  the proven chain, and a node that refuses to sync them forks itself off.
- **S2 — L1 reorg resilience.** Message and checkpoint sync detect L1 reorgs (rolling hashes, archive root comparison),
  unwind to the common ancestor, and re-fetch — including the subtle case of checkpoints added *behind* the syncpoint.
  See [archiver README](archiver/README.md) § Edge Cases.

### 4.6 Slashing fairness

- **F1 — Honest validators are never slashable.** Every offense requires either the offender's own signature
  (proposals, attestations — EIP-712 slot-bound, so replay across slots is impossible) or sustained, locally-observable
  inactivity. An honest validator signs only what it built or successfully re-executed, so no message from a malicious
  peer can route it into slashable behavior. HA deployments coordinate signing via a shared store to prevent
  self-equivocation ([validator-ha-signer](validator-ha-signer/)).
- **F2 — Individual accountability.** Offenses target individuals: an honest committee member is not slashed because
  the majority misbehaved. Note `DATA_WITHHOLDING` targets *all attesters* of the checkpoint — making the data
  available is part of the attester's duty, and any single honest attester publishing the txs clears the whole
  committee.
- **F3 — Governance backstop.** Slashes need >50% of a round's proposers to vote, wait out an execution delay, and can
  be vetoed. Protects against correlated false positives from software bugs (and from A7 violations).

## 5. Slashing

Consensus-based: proposers vote (2 bits per validator: 0–3 slash units) during round N on offenses from round N−2; the
L1 `SlashingProposer` tallies and executes after the delay unless vetoed. Full mechanics in
[slasher README](slasher/README.md); offense rationale in AZIP-7.

| Offense | Target | Trigger |
| --- | --- | --- |
| `DATA_WITHHOLDING` | All attesters of the checkpoint | Checkpoint txs not available on p2p within the tolerance window |
| `INACTIVITY` | Individual validator | Missed proposals/attestations beyond threshold for consecutive committee epochs (Sentinel) |
| `BROADCASTED_INVALID_BLOCK_PROPOSAL` | Proposer | Block proposal fails validation/re-execution |
| `BROADCASTED_INVALID_CHECKPOINT_PROPOSAL` | Proposer | Checkpoint proposal invalid: truncates its own later block, header mismatch on recomputation, malformed fee modifier |
| `PROPOSED_INSUFFICIENT_ATTESTATIONS` | Publishing proposer | L1 checkpoint with < ⌊2n/3⌋+1 signatures |
| `PROPOSED_INCORRECT_ATTESTATIONS` | Publishing proposer | L1 checkpoint with non-committee or invalid signatures |
| `PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS` | Publishing proposer | Built on an invalid-attestation checkpoint |
| `DUPLICATE_PROPOSAL` | Proposer | Conflicting proposals for the same position (p2p or p2p-vs-L1) |
| `DUPLICATE_ATTESTATION` | Attester | Conflicting attestations for the same slot |
| `ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL` | Attesters | Attested in a slot where the node detected (via re-execution) a slashable invalid proposal |

Amounts map to three L1-configured tiers. On the v5 testnet (AZIP-16 preset) any offense effectively ejects the
validator (slash drops stake below the local ejection threshold, forcing full exit); mainnet uses smaller amounts.
Grace period after genesis; own validators are auto-protected from a node's own votes; `SLASH_VALIDATORS_NEVER/ALWAYS`
allow operator overrides.

Audit angles: offense detection soundness under A7 (config divergence), vote encoding and tally correctness on L1,
veto/delay windows vs validator exit timing, and whether any honest behavior can satisfy an offense predicate.

## 6. P2P peer penalization

Peer standing combines two layers. The **application-level score**
([peer_scoring.ts](p2p/src/services/peer-manager/peer_scoring.ts))
accumulates penalties only (there is no reward path), decays by ×0.9 per minute, and drives the peer manager: score
below −50 → GOODBYE + disconnect on the next heartbeat (~30s); below −100 → 24h ban. While banned, the score is frozen
(no decaying out early) and fresh inbound connections are refused; a mere "disconnect"-scored peer may reconnect. The
**gossipsub score** independently combines the app score (weight 10, `-Infinity` for unauthenticated peers when the
node only accepts validator peers via `p2pAllowOnlyValidators`), per-topic delivery scoring (rewards up to +33/topic on predictable-rate topics; the `tx`
topic has no delivery scoring), an invalid-message penalty (P4, weight −20, ~4-slot decay, incremented by every gossip
`REJECT`), and an IP-colocation penalty (−5). Tuning math: [gossipsub README](p2p/src/services/gossipsub/README.md).

Application-level severities (penalty points against the −50/−100 thresholds; boundaries are strict, so e.g. two
`LowTolerance` strikes reach exactly −100 and a third is needed to ban):

| Severity | Points | Example conditions |
| --- | --- | --- |
| `LowToleranceError` | 50 | Invalid tx proof, undeserializable message, double-spend of a long-settled nullifier, malformed req/resp payload |
| `MidToleranceError` | 10 | Most tx validation failures (metadata, gas, phases, size), inconsistent req/resp batch responses |
| `HighToleranceError` | 2 | Conditions plausibly caused by state lag or transient faults: recent double-spend, timestamp expiry, per-peer rate-limit breach, connection resets/timeouts |

Req/resp (PING, STATUS, AUTH, GOODBYE, TX, BLOCK_TXS): per-peer and global rate limits per protocol (handshake
protocols 5/s per peer, 10/s global; TX and BLOCK_TXS 10/s per peer, 200/s global). The per-peer check runs before the
global one, so a single peer cannot exhaust the shared budget and have others blamed; exceeding a per-peer limit costs
a `HighToleranceError`, exceeding the global limit returns `RATE_LIMIT_EXCEEDED` with no penalty. Malformed
requests/responses penalize the sender (`LowToleranceError`); transport errors and timeouts are treated as transient
(`HighToleranceError`); self-inflicted aborts are never penalized.

Handshake failures are a separate subsystem that bypasses scoring: failed AUTH attempts (nodes running with
`p2pAllowOnlyValidators`) get
exponential dial backoff (5 min doubling to 160 min) and, past `p2pMaxFailedAuthAttemptsAllowed` (default 3), inbound
denial until 1h passes without failures. Trusted/private/preferred peers are exempt from manager-initiated
disconnection and capacity eviction, but **not** from scoring or gossipsub graylisting.

The reject-vs-ignore mapping per message type (which failures penalize the sender vs get silently dropped) is the
enforcement of P2 and is catalogued per validator in [message validator READMEs](p2p/src/msg_validators/).

## 7. Known gaps

1. **Descendants of invalid checkpoints.** If a malicious quorum attests to a *descendant* of an invalid-attestation
   checkpoint, nodes currently follow it (they assume an honest majority) instead of ignoring it until proven. Flagged
   in [archiver README](archiver/README.md); the corresponding slash (`PROPOSED_DESCENDANT_…`) exists, but node-side
   chain-selection does not.
2. **Escape hatch × unsound verifier.** `submitEpochRootProof` skips attestation verification for hatch epochs (there
   is no committee), so during a hatch window the attestation gate of V4(b) is absent: a malicious hatch proposer plus
   an L1 verifier bug could prove invalid state. Fee theft is still blocked (V4(a)); Outbox withdrawals are the
   remaining exposure. Compensating controls today: bond, random selection among bonded candidates, bounded window.
3. **Validation config divergence (A7).** Divergent `VALIDATOR_MAX_*` limits across honest validators can produce
   divergent invalidity verdicts and therefore divergent slash votes against honest proposers. Mitigated by the >50%
   vote quorum and the vetoer; no protocol-level enforcement of config uniformity exists.
4. **Committee trust is a standing decision (A6).** Following attested checkpoints without re-execution is deliberate
   and may be revisited (e.g. stateless validation of checkpointed data); until then, C1–C5 are the whole story for
   pending-chain integrity.
5. **Blob retention.** Nodes syncing later than the L1 blob retention window depend on out-of-protocol blob archives to
   reconstruct the checkpointed chain; availability of that path is operational, not protocol-enforced.
