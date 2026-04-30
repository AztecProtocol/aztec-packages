# zk-honk-verifier

Standalone DAML package for a pure-DAML Barretenberg UltraZK Honk verifier.

The current implementation contains the Canton-facing verifier templates, fixed-width integer, prime-field and BN254 extension-field foundations, G1/G2 curve foundations, Poseidon2 transcript, UltraZK Sumcheck relations, Shplemini/KZG batching, BN254 pairing verification, Barretenberg proof/VK parsing, and fail-closed proof validation.

It verifies the checked-in Barretenberg `bb 5.0.0-nightly.20260324` UltraZK Honk vector generated from the Noir fixture in `barretenberg/docs/examples/fixtures/main`, and rejects structurally valid tampered proofs.

Target proof flavor:

- `UltraZKFlavor`
- `DefaultIO`
- `oracle_hash_type = "poseidon2"`
- `disable_zk = false`
- `ipa_accumulation = false`

## Build and test

The package is pinned to DAML SDK 3.4.7. The SDK installer places `daml` in
`~/.daml/bin`.

```sh
PATH="$HOME/.daml/bin:$PATH" daml build --no-legacy-assistant-warning
cd test
PATH="$HOME/.daml/bin:$PATH" daml build --no-legacy-assistant-warning
PATH="$HOME/.daml/bin:$PATH" daml script --no-legacy-assistant-warning \
  --dar .daml/dist/zk-honk-verifier-tests-0.1.0.dar \
  --script-name ZkHonk.Test:validVectorStructuralSmoke --ide-ledger
PATH="$HOME/.daml/bin:$PATH" daml script --no-legacy-assistant-warning \
  --dar .daml/dist/zk-honk-verifier-tests-0.1.0.dar \
  --script-name ZkHonk.Test:ledgerRejectsInvalidProof --ide-ledger
```

Build the main package before running the test package; the tests load the
freshly built DAR from `../.daml/dist/zk-honk-verifier-0.1.0.dar`.

The full verifier scripts are slow because the cryptographic arithmetic is pure
DAML. Use the focused smoke scripts in `test/daml/ZkHonk/Test.daml` while
developing, and reserve `validVectorVerifies` and `ledgerAcceptsValidProof` for
end-to-end confirmation.

## Canton status

The checked-in vector is a real `bb 5.0.0-nightly.20260324` `noir-recursive`
UltraHonk proof shape: regenerating the fixture with `bb prove --verify`
produces 458 proof fields and one public input.

The current pure-DAML verifier is not viable as a single Canton transaction on
the default sandbox settings. The `ZkHonk.Test:ledgerAcceptsValidProof` script
exercises the actual `ZkHonkVerifier.Verify` choice with the valid vector. On a
wall-clock Canton sandbox it is rejected after about 66 seconds with
`INTERPRETATION_TIME_EXCEEDED`, because interpretation exceeds the default
Ledger Effective Time plus one-minute tolerance.

Starting sandbox in static-time mode avoids that first ledger-time rejection, but
`daml script submit-and-wait` then times out after about 306 seconds with
`REQUEST_TIME_OUT`. The participant continued CPU-bound execution for 29m45s
without producing a completion before the run was stopped.

Measured focused-script costs on this machine:

- `validVectorStructuralSmoke`: 5.9s wall clock
- `validVectorVkHashSmoke`: 86.8s wall clock
- `validVectorChallengeSmoke`: 406.9s wall clock
- `validVectorSumcheckSmoke`: 468.4s wall clock
- `validVectorShpleminiInputsSmoke`: 925.6s wall clock

So the implementation is useful as a correctness/reference port, but not as a
single production Canton verifier choice.

## Learnings

The bottleneck is not proof size. The valid proof contains 458 field elements
and one public input, and structural parsing completes in a few seconds. The
cost comes from evaluating the verifier's cryptographic arithmetic in pure DAML,
inside Canton command interpretation.

The main cost centers are:

- Poseidon2 transcript generation. VK hashing alone took about 86.8s, and full
  challenge generation took about 406.9s.
- BN254 field arithmetic over 16-limb `UInt256` values. Field multiplication,
  modular reduction, and especially Fermat-style inversions are interpreted as
  DAML code rather than native bigint or crypto operations.
- Shplemini/KZG batching and MSM. The current proof shape pads to `logN = 25`,
  and the opening check builds a roughly 67-point G1 MSM over 255-bit scalars.
- BN254 pairing. The final KZG check requires Miller loop and final
  exponentiation over `Fq12`, again implemented as pure DAML extension-field
  arithmetic.

Off-chain computation can preserve soundness and completeness only when the
on-chain DAML code verifies the supplied data cheaply, or when the data is fixed
and audited as package/VK-registration precomputation. Safe examples include:

- supplying inverse witnesses and checking `x * x_inv == 1` on-chain;
- precomputing fixed G2 Miller lines for `g2Generator` and the KZG VK point;
- computing and storing a VK hash once at verifier-registration time;
- using fixed-base or VK-specific MSM tables whose construction is checked or
  treated as audited verifier data.

Unsafe shortcuts include accepting off-chain Fiat-Shamir challenges, MSM
results, or pairing results without recomputing or checking a sound certificate
on-chain. Those would change the trust model and would no longer be full proof
verification on Canton.

The best full-on-chain path is therefore a combination of optimization and
staging: replace expensive inversions with checked witnesses, remove avoidable
list/limb overhead, precompute fixed verifier data, and split verification into
many bounded choices that store checked intermediate state. This can reduce
per-command timeout pressure, but it does not remove the total cryptographic
work. If the final pairing remains too slow after those changes, full pure-DAML
verification is likely the wrong production substrate without native bigint,
MSM, or pairing support.

Alternatives such as off-ledger `bb` verification with on-ledger attestation can
be operationally practical, but they deliberately trade away full on-chain proof
verification for a signature/attestation trust model.
