# verify-uh-proof-within-smart-contract

A Chonk (ClientIVC) flow over the **real** private kernels whose app verifies an UltraHonk proof,
the way a smart contract does when it verifies a Noir proof in a private function. It is generated
entirely from code in this repository: no captured fixtures, no aztec-nr, no PXE.

## The flow

```
app_uh_verifier  ->  private_kernel_init  ->  private_kernel_reset_tail  ->  hiding_kernel_to_rollup
```

`app_uh_verifier` is a private function as the kernels see one: it emits `PrivateCircuitPublicInputs`
on the return data bus and, on the way, recursively verifies an UltraHonk ZK proof of
`inner_circuit` through `bb_proof_verification::verify_honk_proof`. That is the pattern a contract
uses to verify a Noir proof in-app, compiled into a Mega circuit and folded by the real kernels.

`flow_inputs_builder` derives every kernel input from the circuits' real verification keys: the VK
tree with the kernels at their protocol indices, the app's function tree and contract address, the
public data tree non-membership proof for class updates, and the (all-skip) reset hints. It runs
unconstrained and is never proven.

`prove_uh_verifier_app_with_real_kernels.py` compiles the flow circuits, proves the inner circuit with bb, executes the
builder, chains each circuit's return data into the next one's call data with `noir-execute`,
assembles the `ivc-inputs.msgpack` stack, then runs `bb prove --scheme chonk` and `bb verify`.

## Running

```
noir-projects/fnd/noir-protocol-circuits/bootstrap.sh generate_variants   # once, if the workspace is absent
noir-projects/fnd/noir-protocol-circuits/integration-tests/verify-uh-proof-within-smart-contract/prove_uh_verifier_app_with_real_kernels.py
```

The kernels are taken from `noir-protocol-circuits/target` and compiled there if missing. The
protocol-circuits build compiles the crates here too (into this directory's `target/`), after which
`--skip-compile` reuses them; that is how the test commands in `noir-protocol-circuits/bootstrap.sh`
run it. Pass
`--flow-dir <dir>` to also write the stack in the `chonk-pinned-flows` layout, which the C++ and
bb.js pinned-flow tests (`CHONK_PINNED_IVC_INPUTS_DIR=<dir>`) accept as-is. `--stack-only` skips
proving.

## Extending it

Other transaction shapes (a second call through `private_kernel_inner`, an intermediate reset, the
to-public tail) need the same treatment as the three circuits above: real VK hashes in the VK tree
and inputs derived from the previous kernel's output. Add them as a builder variant and a chain in
the driver, or as a sibling test directory.
