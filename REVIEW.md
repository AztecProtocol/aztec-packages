**Findings**
- [High] `yarn-project/p2p/src/services/gossipsub/topic_score_params.ts:185-206`,
  `yarn-project/p2p/src/services/gossipsub/scoring.ts:19-24`,
  `yarn-project/p2p/src/services/gossipsub/README.md:337-349`:
  The design assumes non‑contributors are pruned once their topic score goes
  negative, but the configured global thresholds are far lower
  (gossipThreshold −500 vs max P3 ≈ −34 per topic, −102 total). If
  libp2p-gossipsub uses `gossipThreshold` for mesh eligibility (as the spec
  commonly does), P3 alone will not push a non‑contributor below −500, so they
  could remain in mesh. Please confirm the actual graft/prune check in
  @chainsafe/libp2p-gossipsub; if it uses `gossipThreshold`, either raise P3
  weights or move `gossipThreshold` closer to 0.
- [High] `yarn-project/p2p/src/services/gossipsub/topic_score_params.ts:128-139`,
  `yarn-project/p2p/src/services/gossipsub/topic_score_params.ts:366-379`:
  All time‑based params are in milliseconds (slotDurationMs,
  meshMessageDeliveriesWindow=5000, meshMessageDeliveriesActivation=slotDurationMs*...).
  If the JS gossipsub implementation expects seconds (some implementations do),
  these values are 1000× too large. Please verify the unit expectations for
  `timeInMeshQuantum`, `meshMessageDeliveriesWindow`, and
  `meshMessageDeliveriesActivation` in @chainsafe/libp2p-gossipsub and convert if
  necessary.
- [Medium] `yarn-project/p2p/src/services/gossipsub/scoring.ts:4-12`,
  `yarn-project/p2p/src/services/peer-manager/peer_scoring.ts:45-53`,
  `yarn-project/p2p/src/services/gossipsub/README.md:283-300`:
  The “alignment” claim isn’t guaranteed once topic scores can be positive.
  With max topic score ≈ +99, a peer at app score −50 contributes −500 + 99
  = −401 (still above gossipThreshold −500), and app score −100 yields −1000
  + 99 = −901 (still above publishThreshold −1000). If strict alignment is
  required, raise `appSpecificWeight` (≈12+) or lower thresholds; otherwise
  clarify this as best‑effort rather than guaranteed.
- [Medium] `yarn-project/p2p/src/services/gossipsub/README.md:352-356`,
  `yarn-project/p2p/src/services/gossipsub/README.md:524-536`:
  The decay/pruning narrative is mathematically inaccurate with the configured
  decay windows. P2 does not decay “50% per heartbeat” or “in seconds” (with
  2-slot decay it reaches 1% after ~144s at 72s slots). P3 penalty ramps as
  (threshold − counter)^2; it does not jump to −34 immediately after crossing
  the threshold. The 30s/90s outage timeline doesn’t match the 2–5 slot decay
  windows, especially for low‑frequency topics.
- [Low] `yarn-project/p2p/src/services/peer-manager/peer_scoring.ts:27-30`,
  `yarn-project/p2p/src/services/reqresp/rate-limiter/rate_limiter.ts:210-219`,
  `yarn-project/p2p/src/services/gossipsub/README.md:588-590`:
  The docs say “rate limit exceeded” is MidTolerance, but the rate limiter
  penalizes with HighTolerance. Align comments/README with actual severities.
- [Low] `yarn-project/p2p/src/services/gossipsub/topic_score_params.ts:205-209`,
  `yarn-project/p2p/src/services/gossipsub/README.md:358-360`:
  “Total P3b across 3 topics = −102” only holds in MBPS. In single‑block mode,
  block_proposal P3 is disabled, so max P3b is −68. Clarify this or avoid
  exporting a fixed NUM_P3_ENABLED_TOPICS.
- [Low] `yarn-project/stdlib/src/timetable/index.ts:37-73`,
  `yarn-project/p2p/src/services/gossipsub/topic_score_params.ts:22-35`:
  blocksPerSlot uses default timetable constants and ignores sequencer
  overrides (e.g., `l1PublishingTime`, test‑chain adjustments). If those values
  differ from defaults, expected block_proposal rates and thresholds can diverge
  from the actual timetable. Consider wiring those inputs or documenting the
  assumption.

**Change Summary**
- Adds dynamic gossipsub topic scoring based on slot/committee/MBPS config,
  introduces detailed README and tests, and re-scales global score thresholds
  to align with application scoring.
