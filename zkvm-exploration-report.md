# zkVM Client-Side Proving: Architecture & Exploration Plan

## For: Future Claude sessions and Mike

This document describes an ongoing investigation into replacing Aztec's current
client-side recursive circuit composition with a provable VM that executes
arbitrary private function call stacks on a phone. It is a reference for future
sessions: read it before working on any zkVM-related task.

### Status and key findings (2026-04-13)

**HEADLINE: Ligetron proves the full private_swap kernel logic (with real
Poseidon2 hashing, EdDSA signature verification, and Poseidon2 sponge
encryption) in 4.9 seconds using 258 MB of RAM on software Vulkan (no GPU).**

This is 2.3x faster than Cairo/Stwo (11.5s) and uses 12x less memory than
Cairo/Stwo (~3 GB). RISC-V backends are 8-30x slower and use 36-100x more RAM.

Ligetron achieves this because it uses the Ligero proof system (MPC-in-the-head,
O(N) prover time, streaming commitment) rather than STARKs (O(N log N), full
trace materialization). The tradeoff: Ligero proofs are sqrt(N) sized (~1-10 MB)
and need SNARK-wrapping for L1 verification.

**The current benchmark uses a "statically compiled shortcut"** — contract logic
and kernel logic are compiled into one WASM binary with no dynamic bytecode
interpretation. However, Ligetron natively interprets WASM with per-opcode
constraint generation, so the path to dynamic bytecodes is clear: compile a
Brillig or WASM interpreter as WASM and prove it on Ligetron.

**Three architecture paths are under evaluation** (see PLAN.md for details):
1. **Ligetron path**: Use Ligetron as-is. Resolve iPhone support (WebGPU on
   iOS), build a proof composition pipeline (Ligero→SNARK wrapping), add
   dynamic bytecode interpretation.
2. **Custom VM path**: Build a purpose-built provable VM (like Cairo or Miden)
   with STARK proofs (small, directly wrappable). More engineering effort but
   full control over proof properties.
3. **Hybrid**: Use Ligetron's prover architecture but with Poseidon2 commitments
   (instead of SHA-256) for efficient recursive verification.

**Outstanding issues:**
- Ligetron explicitly excludes iPhones in its README
- Ligero proofs need SNARK-wrapping (no code exists yet; Ligero×RISC Zero
  partnership is pre-code)
- Ligetron uses SHA-256 for internal Merkle commitments — ~100x more expensive
  to verify in a circuit than Poseidon2. A Poseidon2 commitment mode would
  dramatically reduce SNARK-wrapping cost.
- No unified test script across backends

**What the Phase 0–4 work IS still useful for:**
- The shared crate infrastructure (kernel logic, SDK, data types, Precompiles
  trait) is reusable regardless of the final VM architecture.
- The benchmark data gives a crypto + kernel floor per prover backend.
- The per-backend experience (SP1, Jolt, RISC Zero, OpenVM, Cairo, Ligetron)
  informs which prover libraries and architectures are viable.
- The Ligetron integration demonstrates that WASM-native proving with
  host-function-accelerated crypto is dramatically more efficient than
  RISC-V-based approaches for phone-scale workloads.

See Section 14 (zkEVM lessons), Section 15 (phone viability landscape),
Section 15b (Miden VM deep dive), and Section 16 (strategic options) for
the full analysis. See `zkvm/PLAN.md` for the current task list.

---

## Terminology

- **zkVM**: A virtual machine that proves correct execution. You give it a
  program and inputs; it executes the program and produces a cryptographic proof
  that the execution was correct and produced certain outputs.
- **Guest**: The program running *inside* the zkVM, whose execution is proven.
  Analogous to a process running on a CPU. For this project, the guest is the
  bytecode interpreter + kernel logic. The guest cannot do I/O directly — it
  must ask the host via oracle calls.
- **Host**: The program running *outside* the zkVM, which launches the guest,
  provides inputs, and answers oracle calls. For this project, the host is the
  PXE. Host computation is NOT proven — only the guest's execution is.
- **Oracle call / foreign call**: A guest→host call. The guest pauses, sends a
  request to the host, and receives data back. Used to fetch notes, keys,
  membership witnesses, contract bytecodes, etc. The host's answers are
  "trusted" inputs to the guest (the proof says "given these oracle responses,
  the guest computed this output correctly" — not "these oracle responses are
  truthful").
- **Precompile / gadget**: A cryptographic operation (e.g., Poseidon2 hash) that
  the zkVM backend accelerates with custom circuits, rather than proving each
  instruction of a software implementation. Dramatically faster for
  crypto-heavy workloads.

---

## 1. Project Intent

Aztec's private transaction execution currently works as follows:

1. Each private function call is a standalone Noir circuit, executed via ACVM
   (native binary or WASM), producing a witness and (when proving) a proof.
2. A sequence of kernel circuits (init, inner, reset, tail) processes the
   outputs of each function call: collecting side effects, squashing transient
   data, siloing values by contract address, splitting revertible from
   non-revertible data. Each kernel circuit is also a Noir circuit run via ACVM.
3. The proofs are composed recursively via HyperNova folding (Chonk).
4. A hiding kernel converts the folding accumulator into a standard MegaHonk
   proof, masking ECC operation traces for zero-knowledge.

This architecture is complex. It requires:
- Multiple independent circuits proven and recursively composed.
- Kernel circuits that duplicate logic at every stage (init, inner, reset, tail).
- A folding scheme (HyperNova) with specialized infrastructure.
- A hiding kernel to convert from folding to a standard proof.

Beyond the overall complexity, the current design has specific rigidity problems
that motivate exploring a VM-based alternative:

**Rigid array sizes.** Each private function circuit has fixed-size arrays in its
`PrivateCircuitPublicInputs` for note hashes, nullifiers, L2→L1 messages,
private call requests, public call requests, and private logs. In practice, most
private functions emit only a few elements (or zero) into each array — a
significant under-utilisation of capacity. Because static circuits cannot
dynamically break out of `for` loops, the kernel circuits must iterate over
entire arrays regardless of how many elements are actually populated. This means
the kernel does substantial unnecessary work on most transactions.

**Reset circuit over-iteration.** The reset kernel circuits exist to squash
transient data, validate read requests, and perform other expensive batch
operations. We try to compile several "variants" at different "dimension" sizes
to handle different transaction profiles, but these circuits still tend to
iterate more than necessary for typical transactions. The constraints for all the
recursive proof verification at each kernel step also feel wasteful.

**Inflexible per-function capacity.** Ideally, a private function should be able
to emit *any* number of note hashes, nullifiers, L2→L1 messages, private call
requests, public call requests, and private logs. It should also be able to
*read* any number of note hashes, nullifiers, public state tree leaves, archive
tree leaves, and block header items, and make any number of key validation
requests. The current fixed-array design caps each of these at compile time,
forcing developers to work within rigid limits that don't reflect real usage
patterns.

**Read requests could be inlined.** With the current standalone-circuit design,
reads (of notes, nullifiers, public state, etc.) generate read requests that
must be validated by the kernel via Merkle witness checks in a later kernel step.
With a VM design, reads could potentially be inlined: the interpreter could
perform the Merkle witness check during function execution, when the read occurs,
rather than deferring validation to a separate kernel phase. (Whether inlining
is actually better than batch verification after execution is a design choice —
section 5 shows the batch approach. Inlining simplifies the mental model but
means Merkle witnesses must be available during interpretation, not just during
kernel processing.)

**Note on scope:** even with a zkVM replacing the private execution internals,
the *final* public inputs submitted to the mempool will still be fixed-size
arrays — the rollup circuits and base rollup verification are out of scope of
this exploration. Changes to the layout of the final public inputs of the hiding
kernel circuit, and changes to the rollup circuits, are not part of this work.
The improvement is that each private function *within* the transaction gets
dynamic flexibility, and the final bounding/padding happens once at the end
rather than being imposed at every function boundary.

**The proposed alternative**: execute the entire private component of a
transaction — all private function calls plus all kernel logic — inside a
single provable VM. The VM proves correct execution and outputs a single proof
whose public inputs match what the current kernel tail produces.

The VM must be able to interpret arbitrary private function bytecodes
dynamically (the call stack varies per transaction). The key architectural
question is HOW this VM is built:

- **Option A (general-purpose zkVM):** Compile a bytecode interpreter to
  RISC-V and prove it inside a general-purpose zkVM (SP1, Jolt, RISC Zero).
  This is what all zkEVM projects do. Fast to prototype, but RISC-V provers
  need 10–30 GB RAM and the interpretation overhead may be prohibitive for
  phones. See Section 14 for zkEVM analysis.
- **Option B (purpose-built VM):** Build or adapt a VM whose ISA and
  constraints are co-designed for Aztec's private execution. Dedicated
  circuits for hashing, EC ops, Merkle proofs. Like Cairo VM or Miden VM, but
  for Aztec. Most promising for phone viability, but more engineering effort.
  See Section 16 for detailed analysis.
- **Option C (existing purpose-built VM):** Write the logic directly in Cairo,
  target Miden VM, or use Ligetron's WASM runtime. Fastest path to phone-viable
  prototype, but ties us to an external ecosystem.

The Phase 0–4 benchmark work measures the crypto + kernel performance floor
using statically compiled workloads (no interpreter). Phase 5 will measure
interpretation overhead, which is the critical data point for choosing between
these options.

### Additional benefits of a VM approach

**Bytecode-based function identity.** In the current design, each private
function is a standalone circuit represented by its verification key (VK), and
each VK is baked into the contract's address preimage. This means if there is a
bug in the proving system, the VK embodies that bug, and hence the contract
address embodies it. Similarly, if the proving system is improved (different
constraint structure, new optimizations), VKs may change, potentially
invalidating already-deployed contracts. With a zkVM, each private function is
represented by *bytecode*. Changes to the proving system (bug fixes,
optimizations, or even replacing the entire proving backend) leave the bytecode
unchanged — all existing contracts remain safe. (This does not protect against
compiler bugs that produce incorrect bytecode, but that is an orthogonal
concern.)

**Try/catch semantics for reverts.** With the current design, if a private
function's circuit fails (e.g., an assertion violation), the circuit simply
cannot be proven, and therefore the entire transaction cannot be proven — there
is no way to catch the failure. With a VM, private function failures can be
caught: if function B reverts, function A (the caller) can catch the revert and
continue execution, exactly like try/catch in traditional programming.

**Traditional call-stack execution flow.** In the current design, although
private function *execution* is already depth-first (the PXE recursively
executes nested calls via the `callPrivateFunction` oracle), the *proof
composition* is a flat sequence: init → inner → inner → reset → tail, with each
kernel step verifying a proof from the previous step. With a VM, execution and
proving are unified — the VM proves the entire call tree in a single pass: if A calls B and C, and B calls D and E, the
execution flows as: execute some of A → enter B → execute some of B → enter D →
process all of D → return to B → enter E → process all of E → return to B →
process the remainder of B → return to A → enter C → process all of C → return
to A → process the remainder of A. This is the execution model developers
already understand, and it enables richer inter-function communication patterns
than the current flat-sequence model.

**Simpler codebase.** The current kernel circuit optimizations (multiple reset
variants, dimension tuning, folding scheme infrastructure) are difficult to
understand and maintain. A VM approach replaces this with straightforward Rust
code (interpreter + kernel logic), which is dramatically easier to understand,
audit, and modify.

**Side-effect counters may be unnecessary.** In the current design, each side
effect carries a monotonic counter so the kernel circuits can reconstruct
execution ordering after processing function outputs one at a time in a flat
sequence. With depth-first execution in a single VM, side effects are naturally
ordered by when they occur in the execution trace — the ordering is implicit.
The revertible/non-revertible split may still need a boundary marker (to know
which side effects are in the setup phase vs the app logic phase), but this
could be a single index into the side effect arrays rather than a per-item
counter. This is a meaningful data structure simplification that reduces both
the per-item overhead and the kernel processing complexity.

### Goal

**The goal of this investigation** is to determine the best architecture for
proving the execution of an arbitrary private function call stack on a phone.
This is a hard requirement — the proof must be generated on a mobile device
(~2-4 GB available RAM, ~30 second target). We are not committing to a
particular zkVM, but we ARE committing to phone viability as a constraint.

The key architectural question is: should we (a) use a general-purpose RISC-V
zkVM and accept the interpretation overhead, (b) build a purpose-built provable
VM optimized for Aztec's private execution (like Cairo is for StarkWare), or
(c) use Cairo/Stwo directly? See `PLAN.md` "Strategic Architecture Options"
for the detailed analysis.

**What we learn from zkEVM projects:** The industry has converged on compiling
an interpreter (revm) to RISC-V and proving it inside a general-purpose zkVM.
Scroll abandoned hand-written PLONKish circuits for OpenVM (RISC-V). Polygon
abandoned custom zkASM for ZisK (RISC-V). These are server-side systems (GPU
clusters, 10-30 GB RAM), but RISC-V is NOT ruled out for phones — Jolt's
streaming prover achieves <2 GB without recursion, and continuations can bound
per-segment memory. Multiple phone-viable systems exist across different
architectures: Cairo/Stwo (FibRace: 2.2M phone proofs), Miden VM (750 MB at
2^16 cycles, WASM target), Ligetron (memory-efficient WASM prover), and
Noir/UltraHonk (6s on Samsung Galaxy A23). The right phone architecture is an
open question — not a settled one.

---

## 2. Current Architecture Reference

Key files in the codebase (read these to understand what the zkVM must replace):

### The TypeScript kernel simulator (reference implementation for kernel logic)

`pxe/src/contract_function_simulator/contract_function_simulator.ts:424-706`
— `generateSimulatedProvingResult()`. This is the cleanest representation of
what the kernel circuits do. It is pure TypeScript, no circuits, no constraints.
It walks the execution tree, collects side effects, squashes transient data,
siloes by contract, splits revertible/non-revertible, computes gas, and
assembles the final public inputs. **This is the primary reference for porting
kernel logic to Rust.**

### The output format the zkVM must produce

`stdlib/src/kernel/private_kernel_tail_circuit_public_inputs.ts:101-132`
— `PrivateKernelTailCircuitPublicInputs`. Fields:
- `constants: TxConstantData` (block header, tx context, vk tree root, protocol contracts hash)
- `gasUsed: Gas`
- `feePayer: AztecAddress`
- `expirationTimestamp: UInt64`
- Either `forPublic` (tx with public calls) or `forRollup` (private-only tx),
  containing the accumulated side effect data (note hashes, nullifiers, logs,
  L2-to-L1 messages, public call requests).

### Oracle interface (what the guest program calls out to the host for)

`pxe/src/contract_function_simulator/oracle/interfaces.ts` — defines the
three oracle tiers:
- `IMiscOracle` — logging, randomness
- `IUtilityExecutionOracle` — note queries, key retrieval, membership witnesses,
  public storage reads, capsule/ephemeral storage, auth witnesses, AES
  decryption, shared secret computation, log retrieval
- `IPrivateExecutionOracle` — extends utility with: nested private function
  calls (`callPrivateFunction`), note/nullifier creation notifications, hash
  preimage caching, revertible phase management, contract class log tracking

There are ~64 oracle methods total. Not all would need to exist in the zkVM
guest; many (capsule storage, ephemeral arrays, log retrieval) are PXE-side
bookkeeping that could remain in the host. The core set needed inside the VM is
smaller: note queries, key retrieval, membership witnesses, and bytecode
fetching (for nested calls — see section 5).

### Fixed array sizes (the rigidity problem in concrete numbers)

**Per-call limits** (from `PrivateCircuitPublicInputs`):
- 16 note hashes, 16 nullifiers, 16 private logs per call
- 8 nested private calls, 32 enqueued public calls per call
- 8 L2→L1 messages per call
- 16 note hash read requests, 16 nullifier read requests per call
- 16 key validation requests per call

**Per-tx limits** (accumulated across all calls):
- 64 note hashes, 64 nullifiers, 64 private logs per tx
- 8 L2→L1 messages, 32 enqueued public calls per tx
- 64 note hash / nullifier read requests per tx
- 16 private call stack depth per tx

**Reset circuit variants**: 9 independent dimensions, each with 2-3 size options.
**41 non-simulated reset circuit variants** are compiled (82 total including
simulated variants). Each variant is a separate circuit with different array
sizes for: pending/settled note hash reads, pending/settled nullifier reads,
key validation, transient squashing, note hash siloing, nullifier siloing, and
private log siloing. The orchestrator selects the cheapest variant that fits.

### How nested private calls work today

`pxe/src/contract_function_simulator/oracle/private_execution_oracle.ts:510-607`
— When a private function calls another, it invokes the
`aztec_prv_callPrivateFunction` oracle. The PXE creates a new execution context,
retrieves the target function's ACIR artifact, and recursively executes it via
ACVM. In the zkVM model, this dispatch happens *inside* the VM instead (the host
provides the callee's bytecode via oracle, and the VM runtime interprets it).

---

## 3. Pluggable Architecture Design

### Execution model: pre-flight then prove

In zkVM systems (SP1, RISC Zero, etc.), the host supplies all input data to the
guest **upfront** before proving begins. The guest reads from a pre-filled input
stream — there are no synchronous guest→host calls during proof generation.
(This differs from Aztec's current ACVM oracle model, where the circuit pauses
mid-execution to call back to the PXE.)

This leads to a three-phase execution model:

```
Phase 1: PRE-FLIGHT (host, not proven)
  The PXE executes the tx natively using live oracle calls (note queries,
  key retrieval, membership witnesses, etc.) — essentially what it does
  today. It collects all data the guest will need, plus pre-computes
  kernel processing hints (see "Hints" below).

Phase 2: GUEST EXECUTION (inside the zkVM, proven)
  The guest reads the pre-packaged bundle from the input stream.
  It re-executes all private functions via the interpreter, collects
  side effects, and verifies kernel processing using the hints.
  It commits KernelPublicInputs as the proof's public output.

Phase 3: PROOF GENERATION (host, by the zkVM prover)
  The zkVM prover generates a proof that Phase 2 was executed correctly.
```

### The hints pattern

This is a standard, well-established pattern in zkVM programming (and ZK
systems generally), deriving from the NP structure of ZK proofs (the prover
provides a witness, the verifier checks it). Confirmed across SP1
([io::read/hint API](https://docs.rs/sp1-zkvm/latest/sp1_zkvm/io/)),
RISC Zero ([env::read API](https://docs.rs/risc0-zkvm/latest/risc0_zkvm/guest/env/)),
Noir's own docs on unconstrained hints, and the
[Sigma Prime SP1 security guide](https://blog.sigmaprime.io/sp1-zkvm-security-guide.html).
Only data committed via `io::commit()` (SP1) or `env::commit()` (RISC Zero)
becomes part of the proof's public outputs; all host-provided data via `read()`
is private and untrusted.

The principle: **verification is cheaper than computation.**

Instead of having the guest compute expensive operations (sorting, searching,
matching), the host pre-computes the answers and provides them as "hints." The
guest just verifies the hints are correct. This derives from the fundamental NP
structure of ZK proofs: the prover provides a witness, the verifier checks it.

Examples relevant to kernel logic:

| Operation | Host pre-computes (not proven) | Guest verifies (proven) |
|-----------|-------------------------------|------------------------|
| Squash transient data | Which (note_hash, nullifier) pairs cancel | Each claimed pair references the same underlying note |
| Read request validation | Merkle membership witness paths | Hash each path, check it reaches the known tree root |
| Revertible/non-revertible split | Which side effects go where | Each item's counter is on the correct side of the threshold |
| Ordering side effects | Sorted output arrays | Each adjacent pair is in correct order |
| Note hash uniquification | The nonce and unique hash for each | Recompute: `unique = poseidon2(nonce, siloed_hash)` and check it matches |

**What the guest MUST compute from scratch** (no shortcut via hints):
- Re-executing app functions via the interpreter — this is the core thing
  being proven: that the contract logic was executed correctly.
- Cryptographic operations: hashing (Poseidon2), signature verification. The
  guest must actually run these; there is no way to "verify a hash hint" without
  recomputing the hash. (Precompiles accelerate these, but they still execute
  inside the VM.)
- Siloing note hashes and nullifiers — each is one Poseidon2 call, cheap.
- Gas metering — arithmetic, cheap.

### Architecture diagram

```text
┌──────────────────────────────────────────────────────────────────┐
│  HOST (PXE)                                                       │
│                                                                    │
│  Phase 1: Pre-flight                                               │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │ Oracle (live)                                               │   │
│  │  get_notes, get_keys, get_membership_witness, ...          │   │
│  │  (queries note DB, key store, Aztec node)                  │   │
│  └───────────────────────┬────────────────────────────────────┘   │
│                          │                                         │
│  ┌───────────────────────▼────────────────────────────────────┐   │
│  │ Pre-flight execution + hint generation                      │   │
│  │  - Execute all private functions natively                   │   │
│  │  - Compute kernel hints (squash pairs, witness paths, etc.) │   │
│  │  - Package into TxExecutionBundle                           │   │
│  └───────────────────────┬────────────────────────────────────┘   │
│                          │                                         │
│  Phase 3: Proving        │                                         │
│  ┌───────────────────────▼────────────────────────────────────┐   │
│  │ ZkvmBackend::prove(bundle)                                  │   │
│  │  - Feeds bundle to guest via input stream                   │   │
│  │  - Runs zkVM prover                                         │   │
│  │  - Returns (Proof, KernelPublicInputs)                      │   │
│  └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  GUEST (inside zkVM, proven)                                      │
│                                                                    │
│  Phase 2: Execute + verify                                         │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │ Read TxExecutionBundle from input stream                    │   │
│  ├────────────────────────────────────────────────────────────┤   │
│  │ Interpreter: re-execute all private functions               │   │
│  │  (bytecodes + args from bundle, results must match)         │   │
│  ├────────────────────────────────────────────────────────────┤   │
│  │ Kernel verification:                                        │   │
│  │  - Silo note hashes & nullifiers (recompute, cheap)         │   │
│  │  - Verify squash hints (check each pair matches)            │   │
│  │  - Verify read request witnesses (check Merkle paths)       │   │
│  │  - Verify ordering, splitting, uniquification hints         │   │
│  │  - Meter gas (recompute, cheap)                             │   │
│  ├────────────────────────────────────────────────────────────┤   │
│  │ Commit KernelPublicInputs as public output                  │   │
│  └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Data structures

All types are generic over a field type `F` — see section 4a for why.

```rust
/// The field element type. Each backend provides its native field.
pub trait Field: Copy + Eq + Add + Mul + Sub + Sized {
    fn zero() -> Self;
    fn one() -> Self;
    fn from_bytes(bytes: &[u8]) -> Self;
    fn to_bytes(&self) -> Vec<u8>;
}

/// Everything the guest needs for one transaction, pre-packaged by the host.
/// Read from the zkVM input stream at the start of guest execution.
pub struct TxExecutionBundle<F: Field> {
    /// The tx request (entrypoint address, function selector, args).
    pub tx_request: TxExecutionRequest,

    /// Block header the tx is anchored to (for tree root references).
    pub anchor_block_header: BlockHeader<F>,

    /// Bytecodes for each contract function called during execution,
    /// keyed by (contract_address, function_selector).
    pub function_bytecodes: Vec<(AztecAddress, FunctionSelector, Vec<u8>)>,

    /// Oracle responses, pre-fetched by the host during pre-flight.
    /// The guest reads these sequentially as the interpreter re-executes
    /// and encounters oracle-dependent operations (get_notes, get_key, etc.).
    pub oracle_responses: Vec<OracleResponse<F>>,

    /// Kernel processing hints, pre-computed by the host.
    pub kernel_hints: KernelHints<F>,
}

pub struct KernelHints<F: Field> {
    /// Pairs of (note_hash_index, nullifier_index) that cancel each other.
    pub transient_squash_pairs: Vec<(usize, usize)>,

    /// Merkle membership witnesses for settled note hash read requests.
    pub note_hash_read_witnesses: Vec<MembershipWitness<F>>,

    /// Merkle membership witnesses for settled nullifier read requests.
    pub nullifier_read_witnesses: Vec<MembershipWitness<F>>,

    /// The min revertible side effect counter (determines the split point).
    pub min_revertible_counter: u32,
}
```

Note: nested private function calls are handled inside the guest, not via the
host. In the current architecture, `callPrivateFunction` is an oracle because
each function is a separate circuit. In the zkVM model, all function calls
execute inside the same VM — the interpreter dispatches them directly using
bytecodes from the pre-packaged bundle.

### Precompiles trait

Accelerated cryptographic primitives. Each backend provides an implementation
using its native precompile mechanism (special ISA instructions, accelerated
circuits, etc.). A default pure-Rust implementation serves as a fallback
(correct but slow to prove).

```rust
pub trait Precompiles {
    type F: Field;

    fn poseidon2_hash(inputs: &[Self::F]) -> Self::F;
    fn poseidon2_permutation(state: &mut [Self::F; 4]);
    fn schnorr_verify(pubkey: &Point, sig: &SchnorrSignature, msg: &[u8]) -> bool;
    fn ecdsa_secp256k1_verify(pubkey: &[u8; 64], sig: &[u8; 64], msg_hash: &[u8; 32]) -> bool;
    fn sha256(data: &[u8]) -> [u8; 32];
    fn aes128_decrypt(ciphertext: &[u8], key: &[u8; 16], iv: &[u8; 16]) -> Vec<u8>;
}
```

### Host-side Oracle trait

Used during Phase 1 (pre-flight) only. The host queries the PXE's note DB,
key store, and Aztec node to collect all data, then packages it into the
`TxExecutionBundle`. This trait is NOT used by the guest.

```rust
pub trait Oracle {
    type F: Field;

    fn get_notes(&self, storage_slot: Self::F, filter: NoteFilter) -> Vec<Note<Self::F>>;
    fn get_key_validation_request(&self, pk_m_hash: Self::F) -> KeyValidationRequest;
    fn check_nullifier_exists(&self, inner_nullifier: Self::F) -> bool;
    fn get_note_hash_membership_witness(
        &self, block_hash: Self::F, note_hash: Self::F,
    ) -> MembershipWitness<Self::F>;
    fn get_nullifier_membership_witness(
        &self, block_hash: Self::F, nullifier: Self::F,
    ) -> MembershipWitness<Self::F>;
    fn get_public_storage(
        &self, block_hash: Self::F, contract: AztecAddress, slot: Self::F,
    ) -> Self::F;
    fn get_auth_witness(&self, message_hash: Self::F) -> Vec<Self::F>;
    fn get_function_bytecode(
        &self, contract: AztecAddress, selector: FunctionSelector,
    ) -> Vec<u8>;
    fn get_contract_instance(&self, address: AztecAddress) -> ContractInstance;
    fn get_public_keys(&self, address: AztecAddress) -> PublicKeys;
    fn get_l1_to_l2_membership_witness(
        &self, contract: AztecAddress, msg_hash: Self::F, secret: Self::F,
    ) -> MembershipWitness<Self::F>;
    fn get_shared_secret(
        &self, address: AztecAddress, eph_pk: Point, contract: AztecAddress,
    ) -> Self::F;
    fn get_random_field(&self) -> Self::F;
}
```

### Backend trait

```rust
/// A complete proving backend. Implementations bundle the ISA, constraint
/// system, prover, and precompile circuits internally.
pub trait ZkvmBackend {
    type F: Field;
    type Proof: Serialize + Deserialize;

    /// Run pre-flight (Phase 1): execute natively, collect oracle data,
    /// compute kernel hints, and package into a TxExecutionBundle.
    fn preflight(
        &self,
        oracle: &dyn Oracle<F = Self::F>,
        tx_request: &TxExecutionRequest,
    ) -> Result<TxExecutionBundle<Self::F>, PreflightError>;

    /// Prove (Phases 2+3): feed the bundle to the guest, run the zkVM,
    /// generate a proof. Returns the proof and committed public inputs.
    fn prove(
        &self,
        bundle: &TxExecutionBundle<Self::F>,
    ) -> Result<(Self::Proof, KernelPublicInputs<Self::F>), ProveError>;

    /// Verify a proof and extract public inputs.
    fn verify(
        &self,
        proof: &Self::Proof,
    ) -> Result<KernelPublicInputs<Self::F>, VerifyError>;

    /// Return metadata about this backend (for benchmarking/logging).
    fn backend_info(&self) -> BackendInfo;
}
```

Splitting `preflight` from `prove` is useful for benchmarking (measure them
independently) and for simulation (run `preflight` only, skip proving).

**Note on pluggability:** This trait works at the host/orchestration level. The
guest binary (which runs inside the zkVM) cannot be abstracted behind a trait —
each backend has a different guest I/O API, and the guest is compiled separately
for each backend. The shared kernel logic is a Rust crate that each backend's
guest binary imports. See section 10 for the code organisation.

### Why NOT generics at every layer

We considered a design with separate generic traits for ISA, constraint
generation, and proving backend — allowing arbitrary composition like
"WASM ISA + powdr constraints + Stwo prover". We rejected this because:

1. **Most zkVMs are vertically integrated.** SP1, RISC Zero, and Valida
   bundle ISA + constraints + prover as a unit. You cannot take SP1's constraint
   generation and plug Stwo underneath it. Exposing separate layer traits would
   create a combinatorial space where most combinations are invalid.

2. **powdr is the exception, not the rule.** powdr genuinely separates
   constraint generation from proving (via PIL). But powdr handles that
   decomposition internally. A powdr-based backend can swap its own proving
   backend without the host knowing.

3. **Precompiles are vertically integrated.** A Poseidon2 precompile is a
   special ISA instruction, a custom constraint circuit, and prover-specific
   logic, all tightly coupled within one backend. You cannot mix SP1's Poseidon2
   instruction with Stwo's prover. The guest-side `Precompiles` trait abstracts
   this: each backend provides its own implementation, and the runtime doesn't
   care how it's done internally.

4. **The abstraction we need is simple.** We want to try different complete
   proving systems and compare them. A single `ZkvmBackend` trait plus
   guest-side `Precompiles` and host-side `Oracle` traits achieves this with
   minimal ceremony. If a future system requires decomposition, we can refine
   then.

---

## 4. App Function Execution Within the zkVM

### Architecture

The zkVM guest binary is a fixed program: an interpreter + kernel logic. It is
the same binary for every transaction. Contract bytecodes are dynamic data,
loaded at runtime via oracle calls — exactly as a traditional VM loads and
executes programs.

```
Fixed guest binary (compiled once, identical for all txs):
├── Bytecode interpreter     (executes arbitrary contract functions)
├── Kernel logic              (processes side effects between/after calls)
└── Oracle interface          (fetches dynamic data from the host PXE)

Dynamic inputs (per-tx, provided by host via oracle):
├── Contract bytecodes        (for each function being called)
├── Function selectors + arguments
├── Notes, keys, membership witnesses, auth witnesses, etc.
```

The zkVM proves: "given these contract bytecodes and these inputs, the
interpreter + kernel logic produced these KernelPublicInputs." This is
exactly what a VM does — execute dynamically-loaded code. There is no need
to recompile the guest binary per-contract or per-transaction.

### The bytecode format question

Two related but separable decisions:

1. **What language do developers write private functions in?**
2. **What bytecode format do those functions compile to?**

#### Developer language

**Rust** (recommended starting point):
- Maximum compatibility with the zkVM ecosystem — all major zkVMs (SP1, RISC
  Zero, Jolt, etc.) are Rust-native.
- Rich tooling: cargo, existing crates, testing frameworks.
- Developers write private functions using an Aztec SDK crate that exposes
  operations like `emit_note_hash()`, `get_notes()`, `call_private_function()`.
- Compiles to WASM or RISC-V bytecode via standard Rust toolchains.

**Noir** (current language):
- Preserves the existing developer ecosystem and contract deployment model.
- Compiles to Brillig (a simple register-based bytecode specific to Aztec).
- Limits ecosystem compatibility — Brillig requires a custom interpreter.

Starting with Rust gives direct access to the zkVM ecosystem without requiring
a custom interpreter for the language itself. Noir/Brillig support can be added
later if desired — it just means writing a Brillig interpreter for the guest.

#### Bytecode format

Given Rust as the development language, the bytecode format options are:

**WASM** (recommended starting point):
- Rust has mature WASM compilation (`wasm32-unknown-unknown`).
- Well-defined, sandboxed execution model with a clear spec.
- Multiple Rust-based WASM interpreters exist (wasmi, wasm3) that could run
  inside a zkVM guest.
- Used by other blockchain VMs (Polkadot/Substrate, NEAR, CosmWasm) — ecosystem
  precedent for smart contracts as WASM modules.
- Aztec-specific operations map naturally to WASM host function imports — the
  standard mechanism for calling out to the embedding environment.
- The spec is large, but only a subset is needed (no threads, no SIMD, no GC).

**RISC-V**:
- Rust compiles to RISC-V natively.
- Simpler ISA than WASM in some respects.
- But: interpreting RISC-V bytecode inside a RISC-V zkVM means
  meta-interpreting the same ISA, which is particularly wasteful.
- Aztec-specific operations would use a trap/syscall mechanism (`ecall`).

**Brillig** (Noir's bytecode):
- Only relevant if developers write in Noir.
- Simple register-based bytecode with a small opcode set.
- Requires a custom Brillig interpreter in the guest.

**Custom bytecode**:
- Maximum proving performance — instruction set co-designed with interpreter.
- Requires a custom compiler backend. Only justified if benchmarking shows
  standard bytecodes are too expensive.

**Recommendation**: Start with WASM. It has the best Rust tooling, a
well-defined host import mechanism for Aztec-specific operations, and
blockchain ecosystem precedent. If WASM interpretation inside the zkVM proves
too expensive, a custom bytecode is a later optimization informed by profiling.

### Should private functions use custom opcodes?

Private functions perform operations that have no analogue in general-purpose
bytecodes. Looking at the oracle interface in aztec.nr
(`noir-projects/aztec-nr/aztec/src/oracle/`), the bespoke operations include:

**Emitting side effects:**
- `emit_note_hash(value)` — add a note hash to the tx output
- `emit_nullifier(value)` — add a nullifier to the tx output
- `send_l2_to_l1_msg(recipient, content)` — emit a cross-chain message
- `emit_private_log(log_data)` — emit an encrypted log

**Making calls:**
- `call_private_function(target, selector, args)` — nested private function call
- `enqueue_public_call(target, selector, args)` — schedule a public function

**Reading state:**
- `get_notes(storage_slot, filter, sort)` — read notes from note hash tree
- `check_nullifier_exists(nullifier)` — check nullifier tree
- `raw_storage_read(contract, slot)` — read public state
- `get_block_header(block_number)` — read historical block header
- `get_note_hash_membership_witness(leaf)` — Merkle proof for note hash
- `get_block_hash_membership_witness(block_hash)` — Merkle proof for archive

**Key management:**
- `get_public_keys(address)` — retrieve public key set for an account
- `validate_keys(pk_m_hash)` — key validation request
- `get_shared_secret(address, eph_pk)` — compute ECDH shared secret

**Other:**
- `get_auth_witness(message_hash)` — fetch authorization witness
- `get_contract_instance(address)` — retrieve deployed contract metadata
- `notify_created_note()` / `notify_nullified_note()` — PXE bookkeeping
- `random()` — generate randomness (unconstrained)

The question is whether these operations should be represented as custom opcodes
in the bytecode, or handled via standard calling/foreign-call conventions.

#### Approach 1: Custom opcodes for Aztec-specific operations

Each bespoke operation becomes a native opcode in the bytecode format. The VM
(or interpreter) recognizes these opcodes and handles them with dedicated logic.

**Advantages:**
- Semantically explicit: the VM/interpreter natively understands what the program
  is doing.
- In a custom VM (see section 4b), these opcodes can have dedicated constraint
  gadgets — e.g., `EMIT_NOTE_HASH` directly writes to a side effect trace
  without going through general-purpose memory/register operations.
- Easier to audit: the operations and their effects are visible in the bytecode.
- Potentially more efficient: one opcode vs. many general-purpose instructions.

**Disadvantages:**
- Requires a custom compiler backend (Noir → bytecode with these opcodes).
- Ties the bytecode format to Aztec's specific protocol semantics. If the
  protocol evolves (new side effect types, changed read semantics), the ISA must
  also evolve.
- With a general-purpose zkVM host, custom opcodes in the bytecode don't
  translate to custom VM opcodes — the interpreter still treats them as dispatch
  cases in a switch statement, proved instruction-by-instruction by the
  underlying RISC-V/WASM VM.

#### Approach 2: Standard bytecode with runtime calls

All Aztec-specific operations are implemented as calls to a "runtime library"
compiled into the guest binary. The private function bytecode uses standard call
instructions; the callee address/name determines the operation.

**Advantages:**
- Bytecode format stays generic (Brillig, WASM, or RISC-V). No custom ISA
  needed.
- The runtime library is just Rust code compiled alongside the interpreter —
  standard tooling applies.
- Protocol evolution just means updating the runtime library, not the ISA.

**Disadvantages:**
- Each "oracle" operation has higher overhead: function call setup, argument
  passing, dispatch, vs. a single opcode.
- The VM has no semantic understanding of what operations are being performed —
  it just sees memory operations and jumps.
- Harder to optimize at the constraint level (in a custom VM scenario), because
  the operations are buried in general-purpose instruction sequences.

#### Approach 3: Brillig with extended foreign call conventions

Brillig already has a `ForeignCall` opcode for oracle interactions. Today, these
foreign calls trap to the host (PXE). In the zkVM model, many of these foreign
calls would be handled *inside* the VM by the interpreter/kernel logic rather
than trapping to the host. The foreign call opcode carries a function name
string, so the interpreter dispatches on the name (e.g.,
`aztec_prv_emit_note_hash`, `aztec_prv_call_private_function`, etc.).

This is a middle ground: the bytecode format stays Brillig (no new ISA), but the
interpreter gives special treatment to known foreign call names.

**Advantages:**
- No change to the Noir compiler or bytecode format.
- Foreign call dispatch is already part of Brillig's design.
- A custom VM could still optimize specific foreign calls with dedicated gadgets
  (keyed by the call name string).

**Disadvantages:**
- String-based dispatch is slightly less efficient than opcode dispatch.
- The bytecode still doesn't make the operations structurally visible (they're
  hidden behind generic foreign call opcodes).

**Recommendation**: Start with Approach 2 (host function imports via WASM). This
is the idiomatic pattern for WASM-based VMs, requires no custom bytecode, and
works with standard Rust compilation. The Aztec SDK crate exposes operations
that internally map to WASM host imports. If Noir/Brillig support is added
later, Approach 3 (Brillig foreign calls) is the natural fit for that path.
If proving performance demands it, a custom bytecode with dedicated opcodes
(Approach 1) can be designed later, informed by profiling data.

### Rust guest environment restrictions

All shared crates (kernel logic, SDK, interpreter) must compile for zkVM guest
environments. The compilation targets differ significantly across backends:

#### Compilation targets

| Backend | Target triple | Word size | `std` support |
|---------|--------------|-----------|---------------|
| SP1 v6 | `riscv64im-succinct-zkvm-elf` | 64-bit | Custom std (not no_std!) |
| Jolt | `riscv64imac-unknown-none-elf` | 64-bit | no_std default, std optional |
| RISC Zero | `riscv32im-risc0-zkvm-elf` | **32-bit** | no_std required |
| WASM zkVMs | `wasm32-unknown-unknown` | **32-bit** | std stubs (prefer no_std) |
| Valida | Custom ISA (LLVM-based) | varies | no_std |

Each backend requires its own Rust toolchain: SP1 uses "succinct" (installed
via `sp1up`), RISC Zero uses "rzup", Jolt uses nightly 1.94. These are
per-backend concerns, not shared code concerns.

References:
- SP1 guest compilation: [docs.succinct.xyz/docs/sp1/writing-programs](https://docs.succinct.xyz/docs/sp1/writing-programs/compiling)
- Jolt guest quickstart: [jolt.a16zcrypto.com/usage/quickstart](https://jolt.a16zcrypto.com/usage/quickstart.html)
- RISC Zero guest docs: [dev.risczero.com/api/zkvm](https://dev.risczero.com/api/zkvm)
- Rust WASM targets: [doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown](https://doc.rust-lang.org/beta/rustc/platform-support/wasm32-unknown-unknown.html)
- wasmi (no_std WASM interpreter): [github.com/wasmi-labs/wasmi](https://github.com/wasmi-labs/wasmi)
- SP1 security guide (Sigma Prime): [blog.sigmaprime.io/sp1-zkvm-security-guide](https://blog.sigmaprime.io/sp1-zkvm-security-guide.html)

#### Feature compatibility across targets

| Feature | SP1 | Jolt | RISC Zero | WASM |
|---------|-----|------|-----------|------|
| `alloc` / `Vec` / `Box` | Yes | Yes | Yes | Yes |
| `String` | Yes | Yes | Yes | Yes |
| `HashMap` | Yes | **No — use BTreeMap** | Needs fixed hasher | Needs hashbrown |
| `BTreeMap` | Yes | Yes | Yes | Yes |
| Generics | Yes | Yes | Yes | Yes |
| Closures | Yes | Yes | Yes | Yes |
| Trait objects (`dyn`) | Yes | Yes | Yes | Yes |
| Serde derive | Yes | Yes | Yes | Yes |
| Floating point | Software (expensive) | Software (expensive) | Software (expensive) | Native (avoid) |
| Threads / async | No | Optional feature | No | No |

#### Critical constraints for shared code

**Use explicit integer types, not `usize`.** RISC Zero and WASM are 32-bit
(`usize` = `u32`), while SP1 and Jolt are 64-bit (`usize` = `u64`). Any data
structures that are serialized must use `u32` or `u64` explicitly, never
`usize` — otherwise the same bytes would deserialize differently on different
backends. In practice, all our metadata values (array indices up to 64, side
effect counters, lengths) fit easily in `u32`. The efficiency difference
between `u32` and `u64` is negligible for metadata — the hot-path computation
(Poseidon2, Merkle hashing) uses the backend's native `Field` type, which is
independent of this choice.

**Use `BTreeMap`, not `HashMap`.** Jolt explicitly recommends `BTreeMap`
(HashMap has randomization/nondeterminism issues in their guest). RISC Zero and
WASM lack OS entropy for HashMap's random hasher. `BTreeMap` works everywhere
with deterministic ordering.

**Serialization format is per-backend.** SP1 uses bincode, Jolt uses postcard,
RISC Zero supports various. Shared types should derive
`serde::Serialize + Deserialize` and let each backend wrapper choose its format.
Do NOT hardcode a serialization format in shared code.

**Jolt has a 4096-byte default I/O limit** (`max_input_size` / `max_output_size`
in the `#[jolt::provable]` macro). A `TxExecutionBundle` will easily exceed
this. The Jolt backend wrapper must configure larger limits.

**Pure-Rust crypto only.** Crypto crates with x86 ASM, ARM NEON, or SIMD
intrinsics do not compile for any zkVM target. All cryptographic dependencies
must have pure-Rust fallback implementations. SP1 and RISC Zero provide
"patched" forks of popular crypto crates (e.g., `sha2`, `k256`,
`curve25519-dalek`) that route to precompile syscalls — these are per-backend
optimizations, not shared code concerns.

**No floating point.** Software-emulated on all RISC-V targets (no FPU in
rv32im/rv64im). Each float operation costs thousands of cycles. Our workload
has no need for floats.

**No threads or async.** Single-threaded, synchronous execution on all backends.
No tokio, rayon, or async-std.

#### WASM-specific considerations

For WASM-native zkVMs (zkWASM, Ligetron), compile to `wasm32-unknown-unknown`
with `no_std + alloc`. Host function imports use the standard WASM import
mechanism:

```rust
#[link(wasm_import_module = "aztec")]
extern "C" {
    fn emit_note_hash(value_ptr: *const u8, value_len: u32);
    fn get_notes(slot: u32, buf_ptr: *mut u8, buf_len: u32) -> u32;
}
```

This is the idiomatic way for WASM modules to call host-provided functions.
The zkVM runtime provides these functions when instantiating the module.

For running a WASM interpreter (e.g., wasmi) inside a RISC-V zkVM guest: wasmi
supports `no_std + alloc`, is pure Rust, and is confirmed to work in
constrained environments. But this creates double interpretation overhead
(section 4b).

#### Practical rules for shared crate code

1. Write `no_std` + `alloc` (compatible with all backends, even though SP1
   doesn't require it)
2. Use `BTreeMap`, never `HashMap`
3. Use `u32` / `u64` explicitly, never `usize` in serialized types
4. Derive `serde::Serialize + Deserialize` on all shared types
5. Depend only on pure-Rust crates (no C FFI, no ASM, no SIMD)
6. No floating point, no threads, no async
7. **Test compilation against at least two targets early** — e.g.,
   `riscv64im-succinct-zkvm-elf` (SP1) and `wasm32-unknown-unknown` (WASM) —
   to catch incompatibilities before they compound

### Interpretation overhead

Every contract bytecode instruction (WASM, or other) will cost multiple native
VM cycles to interpret: fetch the instruction, decode the opcode, dispatch,
execute the operation, update state. This is inherent to any interpreter-in-a-VM
design (see section 4b for the full N × M analysis).

The key question for benchmarking is: **what is the cycle multiplier?** If one
WASM instruction costs 10-20 native VM cycles, that's likely acceptable. If it
costs 100+, we may need a simpler bytecode or a different approach.

powdr's auto-precompile mechanism is interesting here: if the interpreter's
hot loops (instruction decode, field arithmetic dispatch) can be automatically
accelerated into custom circuits, the interpretation overhead shrinks.

### Prototyping shortcut

For initial backend comparison, it's acceptable to skip the interpreter entirely
and statically compile a few test contracts (token transfer, account contract)
directly into the guest binary as Rust functions. This isolates the "which zkVM
is fastest?" question from the "how expensive is interpretation?" question. Add
the bytecode interpreter once the backend comparison is done.

---

## 4a. The Field Element Question

### The problem

Aztec's current protocol uses the BN254 scalar field (a 254-bit prime) for
everything: note hashes, nullifiers, siloing, Merkle tree nodes, storage slots,
addresses. Poseidon2-over-BN254 is the primary hash function.

STARK-based zkVMs work over much smaller native fields:
- **BabyBear** (31-bit prime, used by SP1, RISC Zero, Plonky3)
- **Goldilocks** (64-bit prime, used by Plonky2, some Plonky3 configs)
- **M31 / Mersenne-31** (31-bit prime, used by Stwo, Circle STARKs)

Doing BN254 field arithmetic inside a BabyBear-native zkVM is like doing 64-bit
math on an 8-bit CPU: each 254-bit multiplication decomposes into many native
operations, costing hundreds of zkVM cycles. This would make Poseidon2-over-BN254
prohibitively expensive without a dedicated precompile — and most zkVMs'
"Poseidon2 precompiles" are Poseidon2-over-their-native-field, not over BN254.

### The solution: make the field generic

Rather than being locked to BN254, the runtime should be generic over the field
type. Each backend provides its native field. The hash function, note hashes,
nullifiers, tree nodes, and all internal arithmetic use whatever field is
efficient for that backend.

This is why the traits above use `type F: Field` rather than a concrete `Fr`
type. The kernel logic, interpreter, and all data structures are parameterized:

```rust
struct NoteHash<F: Field> {
    value: F,
    counter: u32,
}

struct KernelPublicInputs<F: Field> {
    note_hashes: Vec<F>,
    nullifiers: Vec<F>,
    // ...
}

fn silo_note_hash<P: Precompiles>(
    contract_address: P::F,
    note_hash: P::F,
) -> P::F {
    P::poseidon2_hash(&[contract_address, note_hash])
}
```

The requirement is not "use BN254" — it is "use a hash function that is
efficient in a SNARK and provides ~128 bits of security."

### How small-field hashing works in practice

Every small-field zkVM ecosystem converges on the same design: **Poseidon2 with
a sponge of width 16, rate 8, capacity 8, producing 8 field elements as the
hash output** (~248 bits total, ~124 bits of collision resistance).

- **SP1** (BabyBear/KoalaBear): `PaddingFreeSponge<Poseidon2, 16, 8, 8>` →
  output is `[F; 8]`. The Poseidon2 precompile exposes the raw permutation
  (16 elements in, 16 out); the sponge wrapper extracts 8 output elements.
- **Stwo** (M31): Same pattern. Width 16, rate 8, capacity 8. Uses Poseidon2
  for in-circuit hashing and Blake2s/SHA-256 for prover-side Merkle trees.
- **Plonky3** (generic): Provides `PaddingFreeSponge` and
  `TruncatedPermutation` types parameterised over field and width.

Extension fields (e.g., BabyBear^4) are **not** used for hashing. They are used
for the FRI challenge space (Fiat-Shamir), not for Poseidon2.

For **Merkle tree compression**: two 8-element children (16 elements total)
are loaded into the width-16 permutation state, permuted, and the first 8
elements are extracted. This maps directly to one Poseidon2 permutation call.

**BN254-native backends (Jolt)** sidestep this entirely: a single BN254 field
element is ~254 bits, providing ~127 bits of collision resistance directly. No
multi-element outputs needed.

### Implications for Aztec's data structures

On a small-field backend, every value that is currently a single BN254 field
element becomes an array of 8 small-field elements:

| Value | Current (BN254) | Small-field backend |
|-------|----------------|---------------------|
| Note hash | 1 × Fr (32 bytes) | 8 × F (32 bytes) |
| Nullifier | 1 × Fr (32 bytes) | 8 × F (32 bytes) |
| Siloed hash | 1 × Fr (32 bytes) | 8 × F (32 bytes) |
| Merkle node | 1 × Fr (32 bytes) | 8 × F (32 bytes) |
| Storage slot | 1 × Fr (32 bytes) | 8 × F (32 bytes) |
| Address | 1 × Fr (32 bytes) | 8 × F (32 bytes) |

Storage overhead is essentially zero (8 × 31-bit = 248 bits ≈ 32 bytes ≈
254-bit BN254 element). But the data structure implications cascade:

- **Equality checks** require comparing 8 elements instead of 1.
- **Siloing** (`poseidon2(contract_address, note_hash)`) takes two 8-element
  inputs and produces an 8-element output — one permutation call.
- **Merkle proofs** use the same 42-deep trees, but each node is 8 elements.
  The proof itself has the same depth and the same number of permutation calls.
- **Ordering/sorting** (e.g., for the indexed nullifier tree) requires
  lexicographic comparison across 8 elements.
- **Cross-system boundary**: L1 contracts and the public VM use 254-bit BN254
  elements. A small-field note hash must be packed into a 256-bit value for L1
  submission (8 × 31 = 248 < 256, so this is trivial packing). But this means
  the hiding kernel's public inputs would still be expressed as 256-bit values
  externally, with a packing/unpacking step at the boundary.

### The field-generic design (revisited)

The `F: Field` generic in the shared crates needs to accommodate this. A "hash
digest" is not `F` but `[F; DIGEST_WIDTH]` where `DIGEST_WIDTH` is 1 for BN254
and 8 for BabyBear/M31/KoalaBear. This parameterisation affects every data
structure that holds a hash value.

The approach: define a `Digest` wrapper type that each backend provides. The
kernel logic works entirely with `Digest` values and never sees the internal
representation. On BN254 backends it wraps a single element; on small-field
backends it wraps 8 elements.

```rust
pub trait Precompiles {
    type F: Field;

    /// A hash output with ~128-bit security. Wraps 1 BN254 element or
    /// 8 BabyBear/M31 elements, depending on the backend.
    type Digest: Copy + Eq + Ord + Serialize + Deserialize;

    fn poseidon2_hash(inputs: &[Self::Digest]) -> Self::Digest;
    fn poseidon2_compress(left: &Self::Digest, right: &Self::Digest) -> Self::Digest;

    /// Convert a raw field element (e.g., a user-provided value) to a Digest.
    fn field_to_digest(f: Self::F) -> Self::Digest;

    /// Pack a Digest into 32 bytes for L1 submission / cross-system boundary.
    fn digest_to_bytes(d: &Self::Digest) -> [u8; 32];
}
```

All protocol types use `Digest`, not `F`, for hash-derived values:

```rust
struct NoteHash<P: Precompiles> {
    value: P::Digest,       // not P::F
}

struct MerkleNode<P: Precompiles> {
    hash: P::Digest,        // not P::F
}

struct KernelPublicInputs<P: Precompiles> {
    note_hashes: Vec<P::Digest>,
    nullifiers: Vec<P::Digest>,
    // ...
}

fn silo_note_hash<P: Precompiles>(
    contract_address: P::Digest,
    note_hash: P::Digest,
) -> P::Digest {
    P::poseidon2_hash(&[contract_address, note_hash])
}
```

The kernel logic stays clean and backend-agnostic. Each backend provides its
`Digest` wrapper:

```rust
// Jolt (BN254): Digest wraps a single Fr element
struct BN254Digest(Fr);  // 254 bits, ~127-bit collision resistance

// SP1 (BabyBear): Digest wraps 8 elements
struct BabyBearDigest([BabyBear; 8]);  // 248 bits, ~124-bit collision resistance
```

The wrapper implements `Eq` (compare all inner elements), `Ord` (lexicographic),
`Serialize`/`Deserialize` (pack to/from 32 bytes), hiding the 1-vs-8
difference from all callers.

**Jolt's BN254 field is a practical advantage here**: `Digest` is a single
element, so all data structures look like today's and comparisons are cheap.
Small-field backends work correctly but carry the 8-element overhead internally.
This is a meaningful factor when comparing backends, though the wrapper ensures
the kernel logic doesn't care either way.

### Benchmarking implications

- Compare Poseidon2-over-BN254 (emulated in a small-field VM — very expensive,
  each 254-bit multiply decomposes into many 31-bit operations) vs
  Poseidon2-over-native-field (with precompile, but 8-element outputs).
- On a BN254-native backend (Jolt), no field mismatch at all.
- The cost of small-field hashing is not the hash itself (one precompile call)
  but the cascading complexity of 8-element digests through all data structures.

---

## 4b. General-Purpose vs Custom zkVM Design

### Understanding the layering

A typical general-purpose zkVM works at two levels:

1. **The VM level**: The VM accepts arbitrary compiled bytecode (e.g., RISC-V
   instructions from a Rust program) and a set of inputs. It executes the
   bytecode and produces a proof that the execution trace is correct, along with
   committed outputs.

2. **The program level**: The user writes a Rust program, compiles it to the VM's
   target ISA (RISC-V, WASM), and the VM proves it.

This is conceptually straightforward: one VM, any program.

### The three-level problem for Aztec

Aztec's use case is more complex. The aim is: developers around the world write
many private functions (in Noir), each compiled to some bytecode. When a user
initiates a transaction, the system must prove the correct execution of a call
tree of these private functions — including nested calls — along with all the
kernel processing (siloing, squashing, read validation, gas metering, etc.).

With an off-the-shelf general-purpose zkVM, this creates **three levels of
interpretation**:

1. **Level 1 (VM layer):** The general-purpose zkVM (e.g., SP1, RISC Zero)
   proves execution of a guest binary compiled to RISC-V.
2. **Level 2 (Kernel + interpreter):** That guest binary is itself an interpreter
   plus kernel logic, written in Rust and compiled to RISC-V.
3. **Level 3 (Private function bytecode):** The interpreter inside the guest
   binary executes private function bytecode (e.g., WASM instructions).

This is **meta-interpretation**: an interpreter running inside a VM that is
itself being proven. Each private function bytecode instruction costs N RISC-V
cycles to interpret (fetch, decode, dispatch, execute, update state). Each
RISC-V cycle costs M prover cycles (constraint generation, witness computation).
The total cost per bytecode instruction is roughly N × M.

The kernel logic (siloing, squashing, read validation) is compiled Rust code
running at Level 2, so it pays only the M-factor overhead. But the private
function execution — the core thing being proven — pays both factors.

### The alternative: a custom zkVM

With a custom zkVM, the kernel logic is **baked into the VM's constraint
relations** rather than being guest-level code interpreted by the VM. This
collapses the three levels to two:

1. **Level 1 (Custom VM layer):** The custom VM proves execution of private
   function bytecode directly. Kernel operations (emit note hash, validate read
   request, silo nullifier, etc.) are native operations in the VM's constraint
   system, not interpreted guest code.
2. **Level 2 (Private function bytecode):** The private function bytecode
   executes within the VM, and kernel-specific operations are handled by
   dedicated constraint gadgets.

This eliminates one layer of interpretation overhead and allows kernel operations
to have optimized constraint representations — similar to how the Aztec AVM
(section 7) uses dedicated gadget traces for Poseidon2, Merkle checks, etc.

### Trade-offs

| | General-purpose zkVM | Custom zkVM |
|---|---|---|
| **Development effort** | Low — use existing VM, write Rust guest | High — design ISA, constraint system, prover integration |
| **Interpretation overhead** | High — double interpretation (N × M) | Lower — single interpretation layer, kernel ops native |
| **Ecosystem leverage** | Full — benefit from SP1/Jolt/etc. improvements | Limited — must build and maintain custom infrastructure |
| **Portability** | Easy to swap backends via `ZkvmBackend` trait | Tied to custom design; major effort to change |
| **Maintenance** | Rust guest code, standard tooling | Custom constraint system, PIL/circuit maintenance |
| **Optimization ceiling** | Bounded by general-purpose VM architecture | Unbounded — constraint layout optimized for exact workload |
| **Time to prototype** | Weeks | Months |

### Tooling for building a custom VM

If the custom VM path is pursued, several tools and references are relevant:

- **powdr**: Compiler middleware that accepts RISC-V or WASM programs, generates
  PIL constraints, and can target multiple proving backends (Plonky3, Stwo,
  Halo2). Its auto-precompile mechanism can identify hot loops and synthesize
  optimized circuits. A custom VM could use powdr as its constraint generation
  layer. Notably, powdr supports defining custom instructions and co-processors
  that get their own constraint circuits.

- **PIL (Polynomial Identity Language)**: The constraint language used by both
  the Aztec AVM and powdr. Modular, well-understood, with tooling for
  auto-generating prover code from constraint definitions. The natural choice for
  expressing custom VM relations.

- **OpenVM (Axiom)**: Designed for extensibility — its "no-CPU" architecture
  allows defining custom opcodes via modular "chips" without forking the core
  VM. If the custom path requires RISC-V compatibility with Aztec-specific
  extensions, OpenVM's architecture is the closest existing model.

- **Plonky3**: The STARK proving library used by SP1, Valida, OpenVM, and
  others. Provides the infrastructure a custom VM's prover would build on.

- **The Aztec AVM** (section 7): Already a fully custom zkVM built on
  Barretenberg/Honk with PIL-defined constraints, dedicated gadget traces, and
  Aztec-specific opcodes. Its three-phase pipeline (simulate → tracegen → prove)
  and modular gadget architecture are a direct reference for how a private
  execution VM could be structured, though the prover would likely target a STARK
  system rather than Honk for client-side viability.

### Recommended approach

The general-purpose VM path should be explored first: it is faster to prototype,
allows backend comparison, and may prove "good enough" once Poseidon2
precompiles and other optimizations are accounted for. The cycle multiplier per
bytecode instruction (the N × M factor from three-level interpretation) is the
key number to measure.

If benchmarking shows the general-purpose overhead is prohibitive for client-side
proving, the custom VM path becomes the fallback — informed by real data on
where cycles are spent and which operations dominate. The powdr + PIL +
Plonky3/Stwo stack is the most viable toolchain for this path, and the AVM's
architecture provides a concrete design reference.

---

## 5. Guest Execution Flow

In the current architecture, a nested private function call triggers an oracle
(`aztec_prv_callPrivateFunction`) that causes the PXE to create a new execution
context, retrieve the callee's ACIR, and run it as a separate circuit.

In the zkVM architecture, nested calls execute inside the same VM, and kernel
processing is split between recomputation (cheap operations) and hint
verification (expensive operations). The guest reads everything from the
pre-packaged `TxExecutionBundle`:

```
Guest reads TxExecutionBundle from input stream
│
├── PHASE A: Re-execute all private functions
│   │
│   ├── Read entrypoint bytecode from bundle
│   ├── Interpreter executes entrypoint
│   │   ├── Entrypoint calls nested function A
│   │   │   ├── Read A's bytecode from bundle
│   │   │   ├── Interpreter executes A
│   │   │   ├── Collect A's side effects into arrays
│   │   │   │   (note hashes, nullifiers, logs, etc.)
│   │   │   └── Return to entrypoint
│   │   ├── Entrypoint calls nested function B
│   │   │   ├── (same as above)
│   │   │   └── Return to entrypoint
│   │   └── Entrypoint returns
│   │
│   └── All side effects now in arrays
│
├── PHASE B: Kernel processing (recompute cheap things)
│   ├── Silo note hashes by contract address (one poseidon2 each)
│   ├── Silo nullifiers by contract address (one poseidon2 each)
│   ├── Meter gas
│   ├── Track fee payer, expiration timestamp
│   │
│   └── Kernel processing (verify hints for expensive things)
│       ├── Read squash hints from bundle
│       │   └── For each (note_hash_idx, nullifier_idx) pair:
│       │       verify the note hash and nullifier actually match
│       ├── Read read-request witnesses from bundle
│       │   └── For each witness: hash the Merkle path,
│       │       check it reaches the tree root in the block header
│       ├── Split revertible / non-revertible using min_revertible_counter
│       │   (just compare each item's counter — cheap)
│       └── Compute unique note hashes
│           (one poseidon2 per surviving note hash — recompute, cheap)
│
├── Assemble KernelPublicInputs
│
└── Commit KernelPublicInputs as proof's public output
```

**No recursive proof verification.** The kernel doesn't need to verify proofs
of app function execution because everything ran in the same VM. The VM's proof
covers all of it. This eliminates one of the most expensive parts of the current
architecture.

**Oracle responses during interpretation.** When the interpreter encounters an
operation that needs external data (e.g., `get_notes`), it reads the next
pre-fetched response from the bundle's `oracle_responses` array. This is a
sequential read from memory, not a host call — all responses were collected
during pre-flight and baked into the bundle. The guest just consumes them in
order.

---

## 6. zkVM and Proving System Landscape

### Overview

The landscape splits into three categories:
1. **Complete zkVMs** — take a program (Rust/WASM/custom), prove execution.
2. **Proving systems / PCS** — lower-level components that zkVMs build on.
3. **Middleware / toolkits** — sit between programs and provers (powdr, Mopro).

### Complete zkVMs

**SP1 (Succinct)** — Server-side, largest ecosystem
- ISA: RISC-V (rv64im as of v6.x). Field: KoalaBear (31-bit, switched from
  BabyBear in Hypercube).
- Proof system: Plonky3 STARK, with STARK→Groth16 wrapping (~256 bytes on-chain).
- Precompiles: Poseidon2, ECDSA, ed25519, BLS12-381, BN254 pairing.
- **VEIL** (April 2026): Native zero-knowledge for STARKs with ~3% prover
  overhead ([ePrint 2026/683](https://eprint.iacr.org/2026/683)). Shipped in
  SP1 v6.1.0. Eliminates the need for Groth16 wrapping just for ZK. Applies a
  lightweight ZK compiler to the algebraic components only, leaving the
  hash-based Merkle machinery untouched. Plausibly post-quantum.
- Client-side: No (10+ GB RAM).
- Useful as: performance ceiling benchmark, largest precompile ecosystem.
- Links: [docs.succinct.xyz](https://docs.succinct.xyz), [SP1 proof types](https://docs.succinct.xyz/docs/sp1/generating-proofs/proof-types),
  [VEIL paper](https://eprint.iacr.org/2026/683)

**RISC Zero** — Server-side, most mature
- ISA: RISC-V (rv32im). Field: BabyBear.
- Proof system: FRI STARK, with STARK→Groth16 wrapping.
- Precompiles: SHA-256, RSA, ECDSA, modular math. No Poseidon2.
- Client-side: No (10+ GB RAM). Has Boundless proof marketplace.
- Links: [risczero.com](https://risczero.com), [precompiles docs](https://dev.risczero.com/api/2.1/zkvm/precompiles)

**Jolt (a16z / Justin Thaler)** — Research-leading, server-side optimized
- ISA: RISC-V 64-bit (RV64IMAC, switched from RV32IM in v0.3.0-alpha Oct 2025).
  Field: BN254 scalar field (254-bit prime). Binius/binary field integration was
  previously planned but **removed from the roadmap** (PR #665, May 2025) — Jolt
  is staying on prime-field sumcheck.
- Proof system: Sumcheck + Lasso lookups (unique — not STARK or SNARK based).
  >500k cycles/sec on MacBook, >1.5M cycles/sec on 32-core. Proof sizes: ~50 KB.
  ~700 MB per million cycles (3x improvement as of Oct 2025).
- Precompiles: natural to add via sumcheck-based extensions.
- Client-side: **No.** Prover depends on rayon, AVX-512/NEON, large allocations.
  WASM support is **verifier-only** (PR #1290, Mar 2026). No WASM prover exists
  or is planned. However, the raw numbers are interesting: a 300k-cycle signature
  proves in ~0.6s with ~210 MB on a MacBook — so laptop-class client-side may
  be within reach even without explicit targeting.
- Streaming prover: The "small-space proving" paper (Nair, Thaler, Zhu, 2025)
  describes O(sqrt(T)) memory proving. Partially implemented — streaming R1CS
  witness landed (PR #881, Aug 2025), full streaming prover still in progress.
- ZK: BlindFold protocol ([PR #1205](https://github.com/a16z/jolt/pull/1205),
  Mar 2026) adds native zero-knowledge via folding-based ZK sumcheck — no
  Groth16/Plonk wrapper needed for privacy.
- Maturity: Alpha (v0.3.0). Strong research backing, not production-ready.
- Links: [Jolt update](https://a16zcrypto.com/posts/article/jolt-an-update/),
  [64-bit proving](https://a16zcrypto.com/posts/article/64-bit-proving-jolt/),
  [Twist and Shout](https://a16zcrypto.com/posts/article/introducing-twist-and-shout/),
  [small-space paper (ePrint 2025/611)](https://eprint.iacr.org/2025/611),
  [GitHub](https://github.com/a16z/jolt)

**Ligetron (Ligero Inc.)** — Best memory efficiency, Google production use
- ISA: WASM. Developers write Rust/C/C++, compile to WASM.
- Proof system: Ligero (hash-based, MPC-in-the-head paradigm). Post-quantum
  secure. Proof sizes grow as sqrt(computation_size).
- Client-side: **Best-in-class memory efficiency.** Prover uses "no more memory
  than the underlying computation requires natively." Browser-native proving
  demonstrated. Claims ~100 TPS from a browser.
- **Google Wallet deployment:** Google adopted Ligero + GKR for ZKP-based age
  verification in Google Wallet. Proves in <2 seconds on Android phones with
  constrained memory. Deployed in UK and at US TSA checkpoints.
- Maturity: Seed stage ($4M raised). Limited public benchmarks/docs, but the
  Google deployment is strong production validation.
- Links: [ligero-inc.com](https://ligero-inc.com/introduction),
  [Google adoption](https://ligero-inc.com/google),
  [The Block coverage](https://www.theblock.co/post/352865/google-wallet-integrates-zk-proofs),
  [NIST presentation](https://csrc.nist.gov/presentations/2023/mpts2023-day2-talk-zksnarks-wasm)

**Cairo M + Stwo (StarkWare / KKRT Labs)** — Most proven on real phones
- ISA: Cairo (custom). Field: M31 (31-bit Mersenne prime).
- Proof system: Circle STARK (Stwo). Stwo is claimed to be "the fastest prover."
  Supports CPU, SIMD, GPU, with WebGPU/WASM coming.
- Client-side: **Proven at scale.** The FibRace benchmark (Sept 2025): 6,047
  players, 1,420 unique phone models, 2.1M proofs generated, most phones <5s,
  <1% crash rate, peak 260K proofs/hour.
- Maturity: Stwo is production-grade (live on Starknet mainnet). Cairo M for
  mobile is newer. Cairo language itself is mature.
- Links: [Stwo announcement](https://starkware.co/blog/s-two-prover/),
  [Stwo on mainnet](https://www.starknet.io/blog/s-two-is-live-on-starknet-mainnet/),
  [FibRace paper (arXiv)](https://arxiv.org/abs/2510.14693),
  [Nexus x Stwo](https://starkware.co/blog/nexus-stwo-zkvm-scalable-verifiable-computation/)

**Nexus v3** — Modular, uses Stwo
- ISA: RISC-V. Field: M31 (via Stwo).
- Proof system: Stwo backend (switched from HyperNova folding in v1/v2).
- Client-side: Inherits Stwo's mobile capabilities.
- Links: [Nexus zkVM 3.0](https://blog.nexus.xyz/nexus-zkvm-3/)

**Miden VM (Polygon / 0xMiden)** — Designed for client-side execution
- ISA: Custom stack machine (not RISC-V). Field: p = 2^64 - 2^32 + 1.
- Proof system: Modified Plonky3 STARK. 96-bit security target.
- Client-side: Core design goal — the entire Miden blockchain is built around
  "edge execution" where users prove locally. WASM client exists. Transaction
  proofs take 1-2s on MacBook Pro. **Memory concern:** 14 GB reported for 2^20
  cycles at 96-bit security — may be too high for phones.
- Maturity: Alpha testnet v4.
- Links: [Miden testnet v4](https://polygon.technology/blog/polygon-miden-alpha-testnet-v4-is-live),
  [Miden docs](https://docs.polygon.technology/miden/)

**Valida (Lita Foundation)** — Custom ISA, ZK-optimized
- ISA: Custom Valida ISA (spec v1.0, May 2025). Harvard architecture, no general-purpose
  registers — opcodes address stack operands directly in RAM. Compiler accepts Rust, C, WASM.
  Rust target: `valida-unknown-baremetal-gnu` (core only, no std).
- Proof system: Plonky3 STARK over 31-bit field (BabyBear/Mersenne-31 compatible).
- Precompiles: **Keccak-256 only** (8x speedup vs software, 23s vs 183s for 500 hashes).
  SHA-256 available but likely software-only. **No Poseidon2 precompile.**
  Experimental secp256k1/Ed25519 EC opcodes (v0.10.0).
- Client-side: WASM prover compiled via wasm-pack. Browser demo exists.
  Claims 50x latency improvement over alternatives (not independently verified).
- Maturity: v1.0 released (Sep 2025). Docker images for amd64/arm64.
- **Assessment (2026-04-12):** Deferred for this spike. No Poseidon2 precompile means
  our hash-heavy workload would run in software over a custom ISA — likely slower than
  RISC-V backends. Rust complex-program reliability was flagged by Logos/Vac research
  (Sep 2024) as problematic, though v1.x has improved. **Revisit trigger:** if Lita ships
  a guest-facing Poseidon2 precompile over BabyBear/M31.
- Install: Docker recommended (`ghcr.io/lita-xyz/llvm-valida-releases/valida-build-container:v1.0.0-amd64`).
  Native Linux: download from github.com/lita-xyz/valida-releases.
- Links: [Valida client-side proving](https://www.lita.foundation/blog/client-side-proving-and-verification-with-valida),
  [Valida ISA spec](https://arxiv.org/html/2505.08114),
  [GitHub](https://github.com/lita-xyz/valida-vm),
  [Keccak benchmark](https://www.lita.foundation/blog/keccak-acceleration-chip-and-benchmarks)

**OpenVM (Axiom)** — Most extensible, server-side
- ISA: RISC-V (extensible, "no-CPU" design).
- Proof system: Plonky3 STARK. Precompiles: custom opcodes without forking.
- Client-side: No. Server-side focused.
- Links: [OpenVM intro](https://blog.axiom.xyz/openvm/),
  [OpenVM v1.0](https://blog.axiom.xyz/openvm-v1/)

**zkWASM (Delphinus Lab)** — WASM-native
- ISA: WASM bytecode directly. Supports STARK, Groth16, Plonk proofs.
- Client-side: Built from single Rust codebase that compiles to WASM.
- Maturity: Operational network (zkWASM HUB).
- Links: [delphinuslab.com](https://delphinuslab.com/)

### Proving systems and components (not full zkVMs)

**Binius / Binius64 (Irreducible)** — Binary field proving system
- What: Direct circuit proving system over binary tower fields (GF[2^64]).
  Not a zkVM — developers write circuits using its constraint API.
- Key property: binary operations (XOR, AND, shifts) are native and free.
  ARM64 NEON optimized. Keccak: 112ms single-threaded, 6x smaller proofs
  than Plonky3.
- Client-side: targets "fast client-side proving on everyday hardware."
  No WASM yet. Missing zero-knowledge and succinctness (end-of-2025 roadmap).
- Relevance: planned as Jolt's commitment scheme backend (5-10x speedup).
  Polygon + Irreducible are collaborating on a Binius-based zkVM.
- Links: [Binius64 announcement](https://www.irreducible.com/posts/announcing-binius64),
  [benchmarks](https://www.binius.xyz/benchmarks/),
  [Polygon x Irreducible](https://polygon.technology/blog/polygon-labs-x-irreducible-a-binius-based-zkvm)

**WHIR / Whirlaway** — Hash-based PCS + STARK, small proofs
- What: WHIR is a polynomial commitment scheme (Arnon, Chiesa, Fenzi, Yogev,
  EUROCRYPT 2025). Whirlaway (LambdaClass) is a STARK using WHIR as PCS.
- Proof sizes: Spartan+WHIR ~14 KB (best in class). Whirlaway ~114 KB.
  WHIR verification: ~360 microseconds. Post-quantum secure.
- Client-side: A detailed research evaluation ([HackMD: WHIR-based CSP](https://hackmd.io/@clientsideproving/whir-based))
  confirms HyperPlonk+WHIR and Whirlaway are within the phone feasibility
  envelope (~4 GB RAM, KoalaBear field for SIMD on mobile).
- Relevance: ProveKit (World Foundation / Worldcoin) uses Spartan+WHIR as the
  baseline reference for client-side proving benchmarks.
- Links: [LambdaClass blog on Whirlaway](https://blog.lambdaclass.com/whirlaway-multilinear-starks-using-whir-as-polynomial-commitment-scheme/),
  [WHIR-based CSP evaluation](https://hackmd.io/@clientsideproving/whir-based)

**Halo2 (Zcash / PSE / Axiom)** — Most mature, PLONK-based
- What: Proving system (PLONK + IPA). Not a zkVM.
- Client-side: [halo2-browser](https://github.com/axiom-crypto/halo2-browser)
  WASM compilation by Axiom. PSE benchmarked across 100 browser instances.
  Slower than newer STARK-based systems but most audited.
- Links: [halo2-browser](https://github.com/axiom-crypto/halo2-browser)

### Middleware and toolkits

**powdr** — Compiler middleware, see section 7a.

**Mopro** — Mobile prover SDK
- What: Toolkit for integrating ZK proving into iOS/Android apps. Not a proving
  system itself — wraps Circom and Noir. Generates native Swift/Kotlin bindings.
  GPU acceleration via Apple Metal (40-100x improvement for MSM).
- Links: [zkmopro.org](https://zkmopro.org/)

### Summary: client-side viability

| System | Type | Client-side status | Memory model | Proof size | Field |
|--------|------|--------------------|-------------|------------|-------|
| **Ligetron** | zkVM (WASM) | **Deployed** (Google Wallet) | Native-equivalent (best) | ~sqrt(N) | 256-bit prime |
| **Cairo M + Stwo** | VM + prover | **Proven at scale** (2.1M proofs on phones) | Mobile-optimized | STARK (~50-150 KB) | M31 (31-bit) |
| **Jolt** | zkVM (RISC-V) | **Laptop viable** (~0.6s/300k cycles, ~210 MB) | ~700 MB/M cycles, streaming WIP | ~50 KB | BN254 (254-bit) |
| **Jolt + Binius** | zkVM (RISC-V) | **Speculative** (Binius removed from Jolt roadmap) | O(sqrt(T)) theoretical | ~50 KB | Binary (GF[2^128]) |
| **WHIR-based** | PCS + PIOP | **Research confirms feasible** | ~4 GB on phones | 14-114 KB | KoalaBear (31-bit) |
| **Valida** | zkVM (custom ISA) | **WASM demo** | Optimized | STARK | Via Plonky3 |
| **Nexus v3** | zkVM (RISC-V) | **Via Stwo** | Via Stwo | STARK | M31 |
| **Miden** | zkVM (custom stack) | **WASM client, 1-2s proofs** | 14 GB concern | STARK | 2^64-2^32+1 |
| **SP1** | zkVM (RISC-V) | No (server-side) | 10+ GB | STARK → Groth16 | BabyBear |
| **RISC Zero** | zkVM (RISC-V) | No (server-side) | 10+ GB | STARK → Groth16 | BabyBear |

### Client-side ISA trends

A notable pattern: the zkVMs that are actually deployed or proven on phones today
tend to use **custom ISAs or WASM**, not RISC-V:
- **WASM**: Ligetron (Google Wallet), zkWASM
- **Custom ISA**: Cairo M + Stwo (FibRace), Valida, Miden
- **RISC-V**: SP1 and RISC Zero are server-side (10+ GB RAM). Jolt is
  laptop-viable but not phone/browser. Nexus v3 inherits Stwo's mobile
  capabilities but is RISC-V.

This matters for the pluggable backend design: the zkVM's native ISA determines
what the guest binary compiles to (RISC-V, WASM, Cairo, etc.), which is a
backend-specific concern. The contract bytecode format (what private functions
compile to) is a separate choice — contracts are always interpreted by the guest,
regardless of the underlying ISA. So the bytecode format should be chosen for
interpreter efficiency and developer tooling, not for ISA compatibility.

For the exploration, "client-side" should encompass **both phone/browser and
laptop targets**. Some backends (Stwo-based, Ligetron) target phones. Others
(Jolt) are viable on laptops but not phones. Both are worth evaluating — the
right answer depends on where Aztec's user base actually runs wallets.

### Precompile coverage for Aztec's needs

| Primitive | Why needed | SP1 | RISC Zero | Jolt | OpenVM | Valida | powdr |
|-----------|-----------|-----|-----------|------|--------|--------|-------|
| Poseidon2 (native field) | Note hashes, nullifiers, siloing | Yes (BabyBear) | No | Planned | Yes | Limited | Auto-generated |
| ECDSA secp256k1 | Account contracts | Yes | Yes | Via fork | Yes | Limited | Auto-generated |
| Schnorr | Account contracts | No | No | No | No | No | Auto-generated |
| SHA-256 | L1 interop | Yes | Yes | No | Yes | Yes | Auto-generated |
| AES-128 | Log encryption | No | No | No | No | No | Auto-generated |

Note: Poseidon2 over the backend's native field is the single most important
precompile. With a field-generic design (section 4a), each backend uses its own
Poseidon2 variant. The key requirement is ~128 bits of security, not a specific
field.

powdr's auto-precompile approach is notable: it analyzes the program, identifies
hot loops (e.g., Poseidon2 permutation rounds), and automatically synthesizes
optimized circuits. Their benchmarks show auto-generated precompiles matching or
exceeding hand-written ones in some cases.

### Proof sizes

| System type | Raw proof | After wrapping | On-chain cost |
|------------|-----------|---------------|---------------|
| STARK (FRI/Circle) | 42-165 KB | STARK→Groth16: ~256 bytes | ~275K gas |
| Jolt (sumcheck) | 50-200 KB | Via Zeromorph: ~25 KB planned | TBD |
| Ligero | ~sqrt(N) KB | N/A | TBD |
| WHIR-based (Spartan+WHIR) | ~14 KB | N/A (already small) | TBD |
| Halo2 (PLONK) | 2-5 KB | N/A (already SNARK) | ~250K gas |

---

## 7. Reference: Aztec's AVM for Public Execution

The Aztec AVM (`barretenberg/cpp/src/barretenberg/vm2/`) is a custom zkVM built
for proving public transaction execution. It is NOT what this project aims to
replace (we are replacing *private* execution), but its architecture offers
useful reference patterns. The AVM is designed for server-side proving by the
sequencer, not client-side proving.

### Architecture

The AVM is a **register-based VM** with 6 general-purpose registers, typed
memory (values carry tags: u8/u16/u32/u64/u128/FF/address), and a custom
instruction set of ~53 execution opcodes (95 wire opcodes including size
variants). The ISA includes Aztec-specific opcodes for state access:
SLOAD, SSTORE, NOTEHASHEXISTS, EMITNOTEHASH, NULLIFIEREXISTS, EMITNULLIFIER,
GETCONTRACTINSTANCE, etc.

### Three-phase pipeline: simulate → tracegen → prove

The AVM separates execution from proving via an **event-driven** architecture:

1. **Simulation**: The VM executes instructions. In "witness mode," each
   instruction emits a structured `ExecutionEvent` containing sub-events for
   addressing, ALU operations, memory accesses, gas tracking, context changes,
   and gadget invocations. In "fast mode" (block building), events are skipped.

2. **Trace generation (tracegen)**: Events are converted into a sparse trace
   matrix (rows × columns). Each component gets its own columns: execution
   trace, ALU trace, memory trace, and separate traces per gadget (Poseidon2,
   SHA256, Keccak, ECC). Sparse storage means only non-zero entries are stored.

3. **Proving**: Honk/Sumcheck proves the trace satisfies all PIL relations.
   KZG commitments. Lookups and permutations link the main execution trace to
   gadget sub-traces.

### Gadgets as separate trace subtables

Expensive operations are not inline in the main execution trace. Each gadget
(Poseidon2, SHA256, Keccak, ECC, range checks, Merkle tree checks) has:
- A simulation component that emits gadget-specific events
- A dedicated trace subtable with its own columns
- PIL relations constraining the gadget's internals
- Lookup/permutation connections linking it to the main execution trace

This is the AVM's version of "precompiles" — the gadget's internal structure
is optimized independently from the main VM trace.

### PIL-based constraints

Constraints are defined in `.pil` files (`barretenberg/cpp/pil/vm2/`, 40+ files)
using Polynomial Identity Language — the same language powdr uses. Relations are
modular: `execution.pil`, `alu.pil`, `memory.pil`, `context.pil`, separate
files per gadget, per tree type, etc. C++ code is auto-generated from PIL via
`scripts/avm2_gen.sh`.

### Patterns relevant to this project

| AVM pattern | Relevance to private zkVM |
|-------------|--------------------------|
| Event-driven simulation → tracegen | Analogous to our pre-flight → guest model. The AVM also separates "execute to understand what happened" from "build the proof." |
| Gadgets as separate traces | Shows how to isolate Poseidon2, SHA256, etc. with dedicated constraint structures. In a generic zkVM, precompiles serve the same role. |
| Typed memory with tag checking | Our interpreter could benefit from type-safe memory, catching mismatches at the constraint level. |
| Two-layer opcodes (wire vs execution) | Clean separation of bytecode encoding from execution semantics. Relevant if we design a custom bytecode. |
| PIL for constraint definition | If we ever build a custom VM (rather than using an off-the-shelf zkVM), PIL is the natural constraint language — it's already used in the AVM and in powdr. |
| Fast mode vs witness mode | The AVM's "fast mode" (no events, no proving) is analogous to our Phase 1 pre-flight. Same code, two execution modes. |

### Key difference from our approach

The AVM is a **fully custom VM with a custom constraint system**, built from
scratch in C++ using Barretenberg's Honk prover. This exploration considers both
off-the-shelf zkVMs (SP1, Jolt, Ligetron, etc.) where the constraint system and
prover are provided by the framework, and the custom VM path (section 4b) where
kernel logic is baked into constraint relations. In either case, we write core
logic in Rust. The AVM's architecture — PIL constraints, gadget traces,
event-driven simulation — is a direct reference for the custom VM path.

Files: `barretenberg/cpp/src/barretenberg/vm2/` (simulation, tracegen,
constraining), `barretenberg/cpp/pil/vm2/` (PIL constraints).

---

## 7a. What powdr Is (and Is Not)

powdr is commonly confused with a zkVM or a proving system. It is neither.

**powdr is a compiler middleware** — analogous to LLVM in traditional compilers.
It sits between program execution and proof generation:

```
[Rust program] → [RISC-V or WASM binary]
                          ↓
                   [powdr middleware]        ← constraint generation + optimization
                     - Execution tracing
                     - PIL constraint emission
                     - Auto-precompile synthesis
                          ↓
                   [Proving backend]         ← Plonky3, Stwo, Halo2, etc.
                          ↓
                      [ZK Proof]
```

powdr does not compete with SP1 or RISC Zero. It competes with their internal
constraint-generation layer. The key capabilities:

- **Backend-agnostic**: same program, multiple provers, via PIL intermediate
  representation.
- **Auto-precompiles**: compiler analyzes execution traces, identifies expensive
  code blocks, automatically synthesizes optimized circuits. Avoids hand-writing
  precompiles.
- **powdr-OpenVM integration**: powdr sits on top of OpenVM, providing
  auto-precompile acceleration to OpenVM's modular chip architecture.
- **powdr-wasm**: alternative frontend that compiles WASM (instead of RISC-V) to
  constraints, using a novel infinite-register IR ("crush") that avoids
  register-spilling overhead.

For this project, powdr is relevant as an **implementation strategy for a
backend**, not as an alternative to the `ZkvmBackend` trait. A powdr-based
backend would internally use powdr for constraint generation and delegate to a
chosen prover. From the runtime's perspective, it's just another backend.

---

## 8. Benchmarking Plan

### Metrics

Every backend must report the following for each benchmark workload:

| Metric | Unit | Why it matters |
|--------|------|---------------|
| **Total proving time** | ms | The headline number. Must be tolerable on client devices. |
| **Pre-flight time** | ms | Host-side: native execution + hint generation. Not proven, but must complete before proving starts. |
| **Witness generation time** | ms | Guest execution without proving. Measures interpretation + hint verification overhead. |
| **Proof generation time** | ms | Total minus witness generation. Measures the prover's efficiency on this workload. |
| **Peak memory usage** | MB | Must fit within WASM 4 GB limit (browser) or device RAM (phone). |
| **Proof size** | bytes | Matters for transmission to the rollup and for recursive verification cost. |
| **Verification time** | ms | Time to verify the proof. Relevant for rollup throughput. |
| **Precompile hit rate** | % of cycles | What fraction of execution used accelerated precompiles vs software fallback. Explains performance differences between backends. |

### Benchmark workloads

Design workloads that represent real Aztec transactions at different complexity
levels:

| Workload | Description | Private calls | Notes touched | Nullifiers |
|----------|-------------|---------------|---------------|------------|
| **Minimal** | Single function, no nested calls, one note | 1 | 1 | 1 |
| **Token transfer** | Account entrypoint → token.transfer (2 notes destroyed, 2 created) | 2 | 4 | 2 |
| **Multi-hop** | Account → A.foo → B.bar → C.baz (chain of calls) | 4 | 6 | 4 |
| **Heavy** | Many notes, many nullifiers, many logs, public call requests | 4+ | 16 | 16 |
| **Kernel-heavy** | Few app operations but many transient note-nullifier pairs (stress-tests squashing logic) | 2 | 32 created + 32 nullified | 32 |

### Platform targets

Measure on each:
- **Native x86_64** (Linux, high-end desktop) — ceiling performance
- **Native ARM** (Apple Silicon Mac) — representative of high-end mobile SoC
- **WASM in browser** (Chrome/Firefox) — primary client target
- **WASM on mobile** (if feasible) — stretch target

### Baselines for comparison

1. **Current Noir/BB recursive proving pipeline**: Measure the full
   init→inner→reset→tail→hiding sequence for the same workload. This is the
   number to beat.

2. **TypeScript kernel simulation** (`generateSimulatedProvingResult`): Measures
   execution-only time with no proving. This is the speed-of-light lower bound
   for the kernel logic portion. Useful for estimating what fraction of zkVM
   proving time is "overhead" vs "useful work".

3. **Pure Rust execution (no proving)**: Run the Rust runtime natively without
   any zkVM. This measures the baseline cost of the logic itself and isolates
   zkVM overhead.

### Benchmarking harness

```rust
pub struct BenchmarkResult {
    pub backend_info: BackendInfo,
    pub workload: WorkloadId,
    pub platform: Platform,

    pub witness_generation_ms: u64,
    pub proof_generation_ms: u64,
    pub total_proving_ms: u64,
    pub peak_memory_bytes: u64,
    pub proof_size_bytes: u64,
    pub verification_ms: u64,
    pub precompile_hit_rate: f64,

    /// Cycle count (if the backend reports it). Useful for comparing
    /// efficiency independent of prover speed.
    pub cycle_count: Option<u64>,
}
```

### What to look for in results

- **Is any backend feasible for client-side?** "Client-side" includes laptop,
  phone, and browser. Thresholds differ: laptop can tolerate ~4 GB and ~10s;
  phone/browser needs <2 GB and <30s in WASM.
- **How much does Poseidon2 precompile support matter?** Compare backends with
  and without it on the same workload. If the difference is >10x, Poseidon2
  precompile support is a hard requirement.
- **How does proving time scale with tx complexity?** If proving time scales
  linearly with the number of private calls, the zkVM approach is sound. If it
  scales super-linearly, large transactions could become infeasible.
- **How does the zkVM approach compare to the current Noir/BB pipeline?** The
  zkVM wins on architectural simplicity, but does it also win on performance?
  It's acceptable if it's somewhat slower, as long as it's within the same order
  of magnitude, given the simplicity benefits and the expectation that zkVMs will
  improve rapidly.
- **How expensive is BN254 field arithmetic vs native field arithmetic?** Run
  the same workload with Poseidon2-over-BN254 (emulated) vs Poseidon2-over-
  native-field. This quantifies the cost of BN254 compatibility and informs
  whether the protocol should adopt a different field for the zkVM path.

---

## 9. Critical Assessment (updated with AVM fallback)

### Arguments for the zkVM approach

1. **Architectural simplification.** No kernel circuits, no folding scheme, no
   hiding kernel. The "circuit" is just a Rust program. Dramatically easier to
   understand, audit, and modify. The current kernel optimizations (multiple reset
   variants, dimension tuning) are difficult to maintain.
2. **No recursive proof verification overhead.** In the current architecture,
   each kernel step verifies a proof from the previous step. In the zkVM, all
   execution is in the same VM — no inner proofs to verify.
3. **Dynamic flexibility.** Private functions can emit and read any number of
   side effects, rather than being constrained by fixed-size arrays. The kernel
   doesn't waste cycles iterating over empty array slots (see section 1).
4. **Bytecode-based function identity.** Functions are represented by bytecode,
   not VKs. Proving system changes (bug fixes, optimizations, backend swaps)
   don't affect deployed contracts — bytecode remains unchanged (see section 1).
5. **Try/catch semantics.** Private function reverts can be caught by callers,
   instead of causing the entire tx to be unprovable (see section 1).
6. **Natural call-stack execution.** Nested calls follow depth-first execution
   like traditional programs, enabling richer inter-function patterns.
7. **Future-proofing.** The zkVM space is improving rapidly. A pluggable
   architecture lets us adopt better provers as they emerge.
8. **Kernel logic in Rust is easier to maintain** than the equivalent Noir
   kernel circuits, which are complex and constrained by circuit-friendly coding
   patterns.

### Arguments against / risks

1. **Loss of parallelism.** Currently, independent private function calls can
   be proven in parallel, then composed. A single zkVM execution is sequential.
   On phones (few cores), this may not matter. On desktop, it's a trade-off.
2. **Maturity.** Noir/Barretenberg is battle-tested for exactly this use case.
   zkVMs are newer and less proven for privacy applications. Poseidon2
   precompile support is spotty.
3. **Interpretation overhead.** App functions are bytecode interpreted inside
   the VM (the guest binary is a fixed interpreter). Every contract instruction
   costs multiple zkVM cycles. This is inherent and the main technical risk.
   The cycle multiplier per bytecode instruction determines viability.
4. **Proof size.** STARK proofs (tens of KB) are much larger than the current
   Noir/BB proofs. This affects bandwidth and recursive verification cost in the
   rollup. A STARK-to-SNARK wrapping step adds client-side proving time.
5. **No existing zkVM has all the precompiles we need.** Poseidon2, Schnorr,
   AES-128, and potentially recursive proof verification are all required.
   Missing precompiles force software fallback with severe performance impact.
   powdr's auto-precompile approach may mitigate this.
6. **The "single VM" model concentrates trust.** In the current architecture,
   each app circuit is an independent Noir program — a bug in one contract's
   circuit doesn't affect others. In the zkVM model, all contracts run through
   the same interpreter and kernel logic. A bug in the Rust runtime (interpreter
   or kernel) affects every transaction. The correctness of the runtime becomes
   the single critical dependency.
7. **Zero-knowledge is not free.** Aztec requires actual ZK (the proof must
   hide the execution trace), not just succinctness. Many STARK-based systems
   are transparent by default — the proof reveals the witness. ZK status by
   backend:
   - **Jolt**: Native ZK via BlindFold protocol (no wrapping needed).
   - **SP1**: VEIL (April 2026, [ePrint 2026/683](https://eprint.iacr.org/2026/683))
     adds native ZK to STARKs with ~3% prover overhead — shipped in v6.1.0.
     Groth16 wrapping no longer needed for ZK (may still be used for proof
     compression).
   - **RISC Zero**: STARK is transparent → wraps to Groth16 for ZK. May adopt
     VEIL-like techniques in future (the paper is generic to hash-based
     multilinear proof systems).
   - **Stwo**: Transparent by default. ZK requires additional construction.
   - **Ligetron**: Ligero proofs have information-theoretic ZK properties.
   If a backend requires STARK→SNARK wrapping for ZK, that wrapping cost is
   part of the client-side proving budget and must be benchmarked.
8. **Rollup verification compatibility.** The base rollup currently verifies a
   MegaHonk proof from the hiding kernel. Changing to a zkVM means the rollup
   must verify whatever proof the zkVM produces (STARK, Groth16, Jolt proof,
   etc.). This is out of scope for this exploration but is a hard downstream
   dependency that constrains backend choice.

### General-purpose vs custom VM (see section 4b for full analysis)

The three-level interpretation problem (section 4b) is a key architectural risk.
With an off-the-shelf zkVM, every contract bytecode instruction costs N native
VM cycles × M prover cycles per VM cycle. With a custom VM, kernel logic is
baked into constraint relations and contract bytecode is interpreted directly,
eliminating one multiplication factor.

The recommended approach is: prototype with a general-purpose zkVM first (faster,
pluggable, measures the overhead), then fall back to custom VM if the N × M
overhead is prohibitive. The powdr + PIL + Plonky3/Stwo toolchain is the most
viable path for a custom VM, with the Aztec AVM as a design reference.

### Open questions (with partial answers where available)

**Answered or partially answered:**

- *How should pre-flight oracle responses be ordered in the bundle?*
  **Likely answered:** The TS kernel simulator already traverses the call tree
  depth-first with deterministic counter-based ordering. The same traversal
  order in pre-flight produces a deterministic sequence. A sequential array
  consumed in execution order should work — the guest interpreter replays the
  same depth-first traversal and consumes responses in the same order.

- *Should Aztec-specific operations be custom opcodes or runtime calls?*
  **Addressed in section 4.** For the general-purpose VM path, host function
  imports (WASM) or syscalls (RISC-V) are the natural mechanism. Custom opcodes
  only provide a constraint-level benefit with a custom VM. Start with host
  imports.

- *What's the minimal viable precompile set?* **Poseidon2 is critical** — it's
  used for siloing every note hash and nullifier (one hash each), computing
  unique note hashes (one hash each), and all Merkle tree membership proofs
  (42 hashes per proof for note hash/nullifier trees). A token transfer with
  2 notes and 2 nullifiers involves ~10 Poseidon2 calls for siloing/uniqueness
  plus ~168 for 4 Merkle proofs. ECDSA/Schnorr depends on account contract
  design. AES-128 is needed for log encryption. SHA-256 for L1 interop.

**Still open — require benchmarking:**

- What is the actual interpretation overhead (N × M factor from section 4b)?
  How many native VM cycles does one WASM instruction cost to interpret inside
  the guest? This is the single most important number for viability.

- What's the cost of Poseidon2-over-BN254 (emulated in a small-field VM) vs
  Poseidon2-over-native-field (with precompile)? If emulation is 100x+ slower,
  the protocol must adopt the backend's native field — with implications for
  Merkle tree structures, address formats, and the Noir compilation target.

- How much memory does the interpreter + kernel logic + transaction state
  consume inside the VM? The current kernel accumulates up to 64 note hashes,
  64 nullifiers, 64 private logs, plus Merkle witnesses (42 nodes each). Can
  this fit in a laptop's RAM? In WASM's 4 GB limit?

- Can powdr's auto-precompiles effectively accelerate Poseidon2? What speedup
  vs software implementation?

**Still open — require design decisions:**

- If a custom VM is needed, should it target the STARK ecosystem (powdr +
  Plonky3/Stwo) for client-side viability, or share infrastructure with the
  AVM (PIL + Barretenberg/Honk) for internal consistency? The AVM uses Honk
  (server-side); client-side needs STARKs. Likely STARK ecosystem.

- How should the field choice interact with Noir? If production uses a
  non-BN254 field, existing Noir contracts (compiled against BN254) would need
  recompilation or a field-mapping layer. Starting with Rust sidesteps this,
  but Noir support is a future consideration.

---

## 10. Recommended Exploration Path

### Goals and non-goals

**This is a spike.** The aim is to build enough to measure, not to ship. We
are not committing to any particular zkVM, bytecode format, or architecture.
We are building the shared infrastructure (kernel logic, SDK, interpreter) and
thin per-backend wrappers so we can compare multiple candidates with real data.

**Explore broadly.** Evaluate ALL promising candidate VMs — including non-ZK
ones — to understand the performance landscape. ZK is a hard requirement for
production, but a non-ZK backend that's 10x faster still tells us useful things
about where the performance ceiling is.

**Priorities:** (1) measure interpretation overhead (the N×M factor), (2) measure
end-to-end proving time on realistic Aztec workloads, (3) compare backends on
the same workloads, (4) determine whether any backend is viable for
laptop/phone/browser client-side proving.

**Current status (2026-04-12):** Phases 0, 1a-d, and the first backend round
(SP1 × 4 hash configs, Jolt, Cairo/Stwo, Nexus, RISC Zero) are complete or
nearly complete. Benchmark results are in `zkvm/RESULTS.md` and summarized in
Section 12 of this document.

**Important:** The current benchmarks measure a statically compiled shortcut
(contract logic + kernel logic compiled into one binary, no interpreter). This
is NOT the target architecture — it's a performance floor for crypto + kernel
overhead. The real architecture adds a bytecode interpreter that loads contract
bytecodes dynamically. Phase 5 (interpretation overhead measurement) is the
critical next step. The plan has been updated to focus on three strategic options:
general-purpose RISC-V zkVM, purpose-built provable VM, or Cairo/Stwo directly.
See `zkvm/PLAN.md` for the current strategic direction and task list.

### Code organisation: shared core + per-backend directories

Different zkVMs have fundamentally different APIs. SP1 uses `sp1_zkvm::io`,
RISC Zero uses `risc0_zkvm::guest::env`, Jolt uses `#[jolt::provable]`
annotations, Ligetron/zkWASM are WASM-native. You cannot write one guest binary
that runs on all of them. A generic `ZkvmBackend` trait is viable at the
host/orchestration level but not at the guest level.

The realistic architecture is **shared core + per-backend wrappers**:

```
shared/
  kernel_logic/     # Pure Rust, no_std: siloing, squashing, gas metering,
                    #   read validation, revertibility splitting, unique
                    #   note hash computation. Portable across all backends.
  aztec_sdk/        # Contract-facing Rust SDK (replaces aztec.nr).
                    #   PrivateContext, state variables, note types, log
                    #   encryption. Pure Rust, no zkVM dependencies.
  data_types/       # TxExecutionBundle, KernelHints, KernelPublicInputs,
                    #   all side effect types. Shared by kernel and SDK.
  interpreter/      # Contract bytecode interpreter (WASM or other).
                    #   Pure Rust, no zkVM dependencies.
  preflight/        # Host-side: execute tx natively, collect oracle data,
                    #   compute hints, package into TxExecutionBundle.
  benchmarks/       # Benchmark workload definitions, comparison framework,
                    #   baseline measurements.
  test_contracts/   # Example contracts written against aztec_sdk (token
                    #   transfer, account contract, etc.) for benchmarking.

backends/
  sp1/
    guest/          # SP1 guest binary: imports shared/kernel_logic,
                    #   uses sp1_zkvm::io for I/O
    host/           # SP1 host: ProverClient setup, prove/verify
  jolt/
    guest/          # Jolt guest: #[jolt::provable] wrapper around
                    #   shared kernel logic
    host/           # Jolt host: prover setup
  stwo/             # Cairo M + Stwo (if evaluated)
  ligetron/         # WASM-native path
  ...
```

What's shared (most of the code):
- All kernel logic: siloing, squashing, gas metering, read validation,
  revertibility, unique note hashes — this is the same regardless of backend
- The Aztec contract SDK (PrivateContext, state variables, note types, etc.)
- Data structures and serialisation
- The bytecode interpreter
- Pre-flight execution and hint generation
- Test contracts and benchmark definitions

What's per-backend (starts as thin wrappers, free to diverge):
- Guest binary I/O (how to read the bundle, how to commit public outputs)
- Host prover setup (how to compile the guest, launch the prover, etc.)
- Precompile integration (each backend exposes Poseidon2 differently)
- `Digest` wrapper implementation (1 BN254 element vs 8 small-field elements)
- Backend-specific optimisations (patched crypto crates, batched precompile
  calls, data layout tuning, ZK wrapping if needed)

The shared crates are the source of truth for correctness. Per-backend
directories pursue performance. Adding a new backend starts small (I/O glue +
host setup), but each backend is free to diverge with tailored optimisations
as benchmarking reveals bottlenecks.

### Phase 1: Shared Rust crates (no zkVM yet)

Two foundational crates, designed together because they share data types and
conventions. Both are `no_std` and have no zkVM dependencies. This is the core
deliverable — valuable regardless of which zkVM wins.

#### 1a. Kernel logic crate

Port the kernel logic from the TypeScript simulator
(`pxe/src/contract_function_simulator/contract_function_simulator.ts:424-706`).

The kernel logic has two modes (both in the same crate):

**Pre-flight mode** (runs on host natively, computes hints):
- Traverse call tree depth-first, collect all side effects with counters
- Build transient squash pairs (note_hash ↔ nullifier matching)
- Collect Merkle membership witnesses for settled read requests
- Determine min_revertible_counter
- Package everything into `TxExecutionBundle` + `KernelHints`

**Verification mode** (runs inside zkVM, proven):
- Re-traverse call tree, re-collect side effects (must match pre-flight)
- Silo note hashes and nullifiers by contract address (Poseidon2)
- Verify squash hints (check each claimed pair actually matches)
- Verify Merkle witnesses (hash each path, check against tree root)
- Split side effects by revertibility (compare counters)
- Compute unique note hashes (Poseidon2 with nonce)
- Meter gas (DA gas: count fields; L2 gas: sum operation costs)
- Assemble final `KernelPublicInputs`

The current kernel has these concrete dimensions (from `constants.nr`):
- 64 note hashes, 64 nullifiers, 64 private logs per tx
- 8 L2→L1 messages, 32 enqueued public calls per tx
- 64 note hash / nullifier read requests per tx
- 42-deep Merkle trees for note hash and nullifier proofs

Test the Rust implementation against the TypeScript simulator: given identical
inputs, both must produce identical `KernelPublicInputs`.

#### 1b. Aztec contract SDK crate (Rust replacement for aztec.nr)

This is the developer-facing library that contract authors use. It replaces the
functionality of aztec.nr (`noir-projects/aztec-nr/`) in the zkVM paradigm.
Contracts are Rust code that depends on this crate.

**Core context and side effect emission:**

```rust
pub struct PrivateContext { /* internal: counters, collected side effects */ }

impl PrivateContext {
    // Emit side effects
    fn emit_note_hash(&mut self, note_hash: Field);
    fn emit_nullifier(&mut self, nullifier: Field);
    fn emit_l2_to_l1_message(&mut self, recipient: EthAddress, content: Field);
    fn emit_private_log(&mut self, log: PrivateLog);

    // Make calls
    fn call_private_function(
        &mut self, target: AztecAddress, selector: FunctionSelector, args: &[Field],
    ) -> CallResult;
    fn enqueue_public_call(
        &mut self, target: AztecAddress, selector: FunctionSelector, args: &[Field],
    );

    // Read state (these become host function imports at the WASM level)
    fn get_notes(&self, storage_slot: Field, filter: NoteFilter) -> Vec<Note>;
    fn check_nullifier_exists(&self, nullifier: Field) -> bool;
    fn get_public_storage(&self, contract: AztecAddress, slot: Field) -> Field;
    fn get_block_header(&self) -> BlockHeader;
    fn get_archive_leaf(&self, index: u32) -> Field;
    fn get_l1_to_l2_message(&self, msg_hash: Field, secret: Field) -> Field;

    // Key management
    fn request_key_validation(&mut self, pk_m_hash: Field) -> KeyValidationRequest;
    fn get_public_keys(&self, address: AztecAddress) -> PublicKeys;

    // Auth
    fn get_auth_witness(&self, message_hash: Field) -> Vec<Field>;
}
```

**State variable abstractions** (mirroring aztec.nr's state model):

```rust
// Note types
pub trait NoteType: Serialize + Deserialize {
    fn compute_note_hash(&self) -> Field;
    fn compute_nullifier(&self, secret_key: Field) -> Field;
}

// State variables — same abstractions as aztec.nr
pub struct PrivateMutable<N: NoteType> { /* storage_slot, context */ }
pub struct PrivateSet<N: NoteType> { /* storage_slot, context */ }
pub struct PrivateImmutable<N: NoteType> { /* storage_slot, context */ }
pub struct SharedMutable<T: Serialize> { /* storage_slot, context */ }
pub struct PublicMutable<T: Serialize> { /* storage_slot, context */ }
pub struct PublicImmutable<T: Serialize> { /* storage_slot, context */ }
pub struct Map<K, V: StateVariable> { /* storage_slot, context */ }
```

**Private log creation and encryption:**

```rust
impl PrivateContext {
    fn encrypt_and_emit_log<N: NoteType>(
        &mut self, note: &N, ovpk: Point, ivpk: Point,
    );
}
```

**How it connects to the VM:** At the WASM level, the SDK's read/call methods
become host function imports (e.g., `aztec::get_notes`, `aztec::emit_note_hash`)
that the interpreter intercepts. During pre-flight, these are resolved by the
PXE against live state. During proving, the guest reads pre-fetched responses
from the bundle. The SDK itself is pure Rust — the host import plumbing is
handled by the compilation target (WASM imports, RISC-V syscalls, etc.).

**Scope for Phase 1:** Design the API surface and implement the core types.
The actual host function import wiring happens in Phase 5 when the interpreter
is built. For Phases 2-3, statically compiled test contracts can call the SDK
directly as Rust function calls (no imports needed since they're compiled into
the guest binary).

### Phase 2: First backend — SP1 (server-side ceiling)

Write the SP1 backend (guest wrapper + host wrapper). Run the shared kernel
logic inside SP1 with a few test contracts statically compiled as Rust functions
(skip the interpreter to isolate backend overhead from interpretation overhead).

**Why SP1 first:**
- Largest ecosystem, best documentation, fastest path to working prototype
- Has Poseidon2 precompile (critical for our workload)
- Server-side only (10+ GB RAM), but establishes a performance ceiling

**Key measurements:**
- Cycle count for the kernel logic alone (no interpretation)
- Proving time and memory on a server
- How many cycles do Poseidon2 precompiles save vs software?

### Phase 3: Second backend — Jolt (laptop-class candidate)

Write the Jolt backend. Same shared kernel logic, different guest/host wrapper.

**Why Jolt second:**
- Laptop-viable (~500k cycles/sec, ~700 MB/M cycles on MacBook)
- BN254-native field — avoids the 8-element digest complexity entirely;
  `Digest` is just a single `Fr`, matching today's protocol exactly
- Native ZK via BlindFold (no STARK→SNARK wrapping needed for privacy) —
  this is a significant advantage for Aztec's privacy requirements
- Architecturally different from SP1 (sumcheck vs STARK) — good diversity

**Key measurements:**
- Proving time and memory on a MacBook
- How does BN254-native Poseidon2 compare to SP1's BabyBear precompile?
- Is Jolt's laptop performance acceptable for Aztec tx complexity?
- What is the BlindFold ZK overhead vs non-ZK proving?

### Phase 4: Benchmarking comparison

Run the benchmark suite (section 8) on both backends. Compare against:
- Current Noir/BB recursive proving pipeline on the same workloads
- Pure Rust execution (no proving) — the speed-of-light lower bound

Also evaluate at least one additional candidate from the client-side tier:
- **Cairo M + Stwo** (proven on phones, but requires Cairo — how much Rust
  interop is realistic?)
- **Ligetron** (WASM-native, best memory efficiency, inherent ZK properties,
  but limited docs)
- **Valida** (custom ISA, WASM prover, browser demo exists)

These may only be doc/example evaluation at this stage, not full backend
implementations.

**Evaluate ZK in every backend.** For each backend, measure the total
client-side cost of producing a zero-knowledge proof (not just a succinct one).
For SP1/RISC Zero, this includes the STARK→Groth16 wrapping step. For Jolt,
measure BlindFold overhead. A backend that produces fast proofs but can't do ZK
(or does ZK only with expensive wrapping) is not viable for Aztec.

### Phase 5: Bytecode interpreter — THE CRITICAL MEASUREMENT

Write a WASM interpreter (or adapt an existing one like wasmi) that runs inside
the zkVM guest. This is the production architecture for Option A: the guest
binary is a fixed program (interpreter + kernel logic) that dynamically executes
any contract's WASM bytecode.

**Key measurements:**
- Interpretation overhead: how many native VM cycles per WASM instruction?
  This is the N factor in the N × M analysis (section 4b).
- End-to-end proving time for a real contract (e.g., token transfer) with
  interpretation vs the statically compiled shortcut from earlier phases.
- Memory consumption of the interpreter + contract state inside the VM.
- Cycle count breakdown: how much is interpreter loop vs crypto vs kernel?

**Context from zkEVM:** Succinct/Vitalik report ~800x cycle inflation for EVM
interpretation inside SP1, with ~59% of total proving cost from interpretation.
Our numbers may differ — Aztec private functions are more crypto-heavy and less
control-flow-heavy than EVM. But if interpretation pushes RISC-V proving time
from 45s to 300s+, Option A is dead for phones.

If the interpretation overhead makes RISC-V zkVMs unviable for phones, this is
the trigger to invest seriously in Option B (purpose-built VM on Stwo) or
Option C (Cairo directly). See PLAN.md for the three strategic options.

### Phase 5b: Evaluate custom VM feasibility (Option B)

In parallel with Phase 5, research whether building a purpose-built "Aztec
Private VM" on top of Stwo is feasible:

1. Study Stwo's trace/AIR framework and Cairo VM's AIR definitions.
2. Study Miden VM's architecture (stack-based, dedicated chiplets per operation).
3. Estimate the ISA: what instructions do we need for Aztec private execution?
4. Estimate the AIR: how many constraint rows per instruction?
5. Estimate engineering effort: months? quarters?
6. Prototype: can we define a minimal instruction set and prove a trivial
   program on Stwo?

This is the path Cairo took: a purpose-built VM where every instruction has a
small, fixed constraint footprint, with dedicated builtins for expensive crypto.
Cairo/Stwo is the only system that has proven phone-viable at scale.

### Phase 6: End-to-end prototype + phone benchmark

Combine everything: pre-flight → interpreter + kernel logic → proof. Run on the
most promising path(s). **Must demonstrate phone viability:**

1. Compile prover to WASM or native mobile
2. Run on a real phone (or phone-class hardware)
3. Measure: proving time, peak RSS, battery impact
4. Target: private_swap workload proven in <30s with <2 GB RAM

This is the go/no-go decision point for the zkVM approach.

---

## 11. Precompile and Gadget Comparison Across zkVMs

> **Research date:** 2026-04-11. **Updated:** 2026-04-11 late session with
> code-level verification of precompile availability (not just docs).
> Sources: official docs, GitHub repos, actual crate source inspection, and
> runtime testing. The zkVM landscape moves fast -- verify upstream.
>
> **CRITICAL CORRECTION (session 3):** SP1 has a guest-callable Poseidon2
> precompile (`syscall_poseidon2` in sp1-lib, width=16, rate=8, over
> KoalaBear field). This was missed in initial research — 1 syscall per
> permutation. Also: Jolt has Grumpkin field division inlines
> (`jolt-inlines/grumpkin`), and OpenVM has Poseidon2 AIR circuits used
> for recursion (not yet guest-callable as an extension).

### Legend

| Abbreviation | Meaning |
|---|---|
| **Precompile** | Dedicated accelerated circuit / chip / coprocessor built into the VM. Orders of magnitude faster than software. |
| **Patched crate** | Optimized fork of a standard Rust crate that transparently invokes precompiles (e.g. RISC Zero's patched `sha2`, `k256`). |
| **Extension** | Modular ISA extension that can be compiled in (OpenVM model). Functionally equivalent to a precompile. |
| **Builtin** | Cairo/Miden term for a dedicated algebraic constraint (AIR) accelerating an operation. Equivalent to a precompile. |
| **Chiplet** | Miden term for a co-processor table. Equivalent to a precompile. |
| **Software** | Runs as normal guest code in the generic VM (no acceleration). Correct but slow to prove. |
| **N/A** | Not available / not applicable for this VM. |
| **Planned** | Announced on roadmap but not yet shipped. |

### 11.1 Hash Functions

| Hash | SP1 | RISC Zero | OpenVM | Jolt | Nexus | Cairo + Stwo | Miden | Valida | zkWASM | Ligetron |
|---|---|---|---|---|---|---|---|---|---|---|
| **Poseidon2** | **Precompile** (`syscall_poseidon2`, KoalaBear field, width=16 rate=8, 1 syscall/perm — **CONFIRMED guest-callable**) | Software | Extension (Poseidon2 AIR, BabyBear — used for recursion, **not yet confirmed as guest extension**) | Software (no hash precompile; Grumpkin field div inlines exist) | Software (Keccak precompile exists but Poseidon2 not available) | **Builtin** (native over Stark252 field, dedicated AIR column — **CONFIRMED 620K hashes/sec on M3**) | Chiplet (RPO is native, Poseidon2 also available) | Software | Software | Software |
| **SHA-256** | Precompile + patched `sha2` crate | Precompile + patched `sha2` crate | Extension | Software | Software | Software (no builtin) | Software | Software | Software | Software |
| **Keccak-256** | Precompile | Precompile (audited by Veridise 2025) | Extension (dedicated AIR) | Software (sum-check precompile planned via Binius) | Precompile (Keccak round function) | Builtin (dedicated AIR) | Software (available but expensive to prove) | Precompile (Keccak-f acceleration chip) | Software | Software |
| **Blake2/Blake2s** | Software (blake2 precompile requested, issue #231) | Software | Software | Software | Software | Software | Software | Software | Software | Software |
| **Blake3** | Precompile | Software | Software | Software | Software | Software | Software (Blake3 supported but not proof-efficient) | Software | Software | Software |
| **Pedersen** | Software | Software | Software | Software | Software | Builtin (dedicated AIR) | Software | Software | Software | Software |
| **Rescue Prime (RPO)** | N/A | N/A | N/A | N/A | N/A | N/A | Chiplet (native hash, first-class Merkle support) | N/A | N/A | N/A |
| **Tip5** | N/A | N/A | N/A | N/A | N/A | N/A | N/A | Precompile (coprocessor chip) | N/A | N/A |

### 11.2 Big Integer / Field Arithmetic

| Operation | SP1 | RISC Zero | OpenVM | Jolt | Nexus | Cairo + Stwo | Miden | Valida | zkWASM | Ligetron |
|---|---|---|---|---|---|---|---|---|---|---|
| **uint256 arithmetic** | Precompile (`uint256` mul/add) | Precompile (256-bit mul via patched `crypto-bigint` crate) | Extension (`int256` arithmetic) | Software | Software | Builtin (`add_mod`, `mul_mod`, `range_check96`) | Software (native u32 ops; u256 via library) | Precompile (`u32_mul`, `u32_add_sub` coprocessors) | Software | Software |
| **Modular arithmetic (arbitrary modulus)** | Software (bigint precompile covers some cases) | Patched crate (`crypto-bigint`) | Extension (arbitrary compile-time modulus, complex field extensions) | Software | Software | Builtin (`add_mod`, `mul_mod` over arbitrary modulus) | Software | Software | Software | Software |
| **BN254 Fp / Fr** | Precompile (field ops via Weierstrass precompile) | Software | Extension (via modular arithmetic with BN254 modulus) | Software | Software | Software (felt252 native, BN254 Fp via `add_mod`/`mul_mod`) | Software | Software | Software | Software |
| **u256 x u2048 multiply** | Precompile (for RSA) | Patched crate (`rsa`) | Software | Software | Software | Software | Software | Software | Software | Software |

### 11.3 Elliptic Curve Operations

| Curve / Op | SP1 | RISC Zero | OpenVM | Jolt | Nexus | Cairo + Stwo | Miden | Valida | zkWASM | Ligetron |
|---|---|---|---|---|---|---|---|---|---|---|
| **BN254 G1 add/mul** | Precompile (Weierstrass) | Software | Extension (arbitrary Weierstrass curves) | Software | Software | Builtin (`ec_op` on STARK curve; BN254 via `add_mod`/`mul_mod`) | Software | Software | Software | Software |
| **BN254 G2 ops** | Precompile | Software | Extension | Software | Software | Software | Software | Software | Software | Software |
| **secp256k1** | Precompile (Weierstrass) + patched `k256` crate | Patched `k256` crate (precompile-backed) | Extension (ECDSA verification built-in) | Software | Software | Software (ECDSA builtin on STARK curve only) | Software (ECDSA k256 via library, Keccak-based) | Software | Software | Software |
| **secp256r1 / P-256** | Precompile (Weierstrass) + patched `p256` crate | Patched `p256` crate (precompile-backed) | Extension (ECDSA verification built-in) | Software | Software | Software | Software | Software | Software | Software |
| **Ed25519** | Precompile (Edwards) + patched `ed25519-dalek` | Patched `ed25519-dalek` crate (precompile-backed) | Software (arbitrary curve extension could support it) | Software | Software | Software | Precompile (`eddsa_ed25519` in `miden::core::crypto`) | Software | Software | Software |
| **Grumpkin** | Software | Software | Software (could be added as custom extension) | Software | Software | Software | Software | Software | Software | Software |
| **BLS12-381 G1/G2** | Precompile (field mul/add + curve ops) | Software | Extension (elliptic curve ops on arbitrary curves) | Software | Software | Software | Software | Precompile (`Bls12` coprocessor) | Software | Software |
| **MSM (multi-scalar mul)** | Software (composed from EC precompiles) | Software | Extension (native MSM support) | Software | Software | Software | Software | Software | Software | Software |

### 11.4 Pairings

| Pairing | SP1 | RISC Zero | OpenVM | Jolt | Nexus | Cairo + Stwo | Miden | Valida | zkWASM | Ligetron |
|---|---|---|---|---|---|---|---|---|---|---|
| **BN254 Ate pairing** | Precompile | Software | Extension (optimal Ate pairing) | Software | Software | Software | Software | Software | Software | Software |
| **BLS12-381 pairing** | Precompile | Software | Extension (optimal Ate pairing) | Software | Software | Software | Software | Software | Software | Software |

### 11.5 Signature Verification

| Scheme | SP1 | RISC Zero | OpenVM | Jolt | Nexus | Cairo + Stwo | Miden | Valida | zkWASM | Ligetron |
|---|---|---|---|---|---|---|---|---|---|---|
| **ECDSA secp256k1** | Precompile (via `k256` + Weierstrass) | Patched crate (`k256`) | Extension (native ECDSA) | Software | Software | Builtin (ECDSA on STARK curve only) | Software (library-level, uses Keccak) | Software | Software | Software |
| **ECDSA secp256r1** | Precompile (via `p256` + Weierstrass) | Patched crate (`p256`) | Extension (native ECDSA) | Software | Software | Software | Software | Software | Software | Software |
| **EdDSA / Ed25519** | Precompile (Edwards) | Patched crate (`ed25519-dalek`) | Software | Software | Software | Software | Precompile (`eddsa_ed25519`) | Software | Software | Software |
| **Schnorr** | Software | Software | Software | Software | Software | Software | Software | Software | Software | Software |
| **BLS signatures** | Precompile (via BLS12-381 curve ops) | Software | Extension (via BLS12-381 curve ops) | Software | Software | Software | Software | Software | Software | Software |
| **Falcon-512** | Software | Software | Software | Software | Software | Software | Precompile (`rpo_falcon512`, RPO-based variant, native to VM) | Software | Software | Software |

### 11.6 Merkle Tree Operations

| Operation | SP1 | RISC Zero | OpenVM | Jolt | Nexus | Cairo + Stwo | Miden | Valida | zkWASM | Ligetron |
|---|---|---|---|---|---|---|---|---|---|---|
| **Merkle path verify** | Software (compose hash precompile) | Software (compose hash precompile) | Software (compose hash extension) | Software | Software | Software (compose hash builtin) | Builtin (`mtree_get` instruction, native RPO Merkle) | Software | Software | Software |
| **Merkle tree update** | Software | Software | Software | Software | Software | Software | Builtin (`mtree_set` instruction) | Software | Software | Software |
| **Sparse Merkle tree** | Software | Software | Software | Software | Software | Software | Builtin (native SMT ops via `SimpleSmt`) | Software | Software | Software |

### 11.7 Encryption / Symmetric Ciphers

| Cipher | SP1 | RISC Zero | OpenVM | Jolt | Nexus | Cairo + Stwo | Miden | Valida | zkWASM | Ligetron |
|---|---|---|---|---|---|---|---|---|---|---|
| **AES-128/256** | Software | Software | Software | Software | Software | Software | Software | Software | Software | Software |
| **ChaCha20** | Software | Software | Software | Software | Software | Software | Software | Software | Software | Software |

> No zkVM currently provides accelerated AES or ChaCha circuits. These are
> prohibitively expensive in arithmetic circuits due to their bit-mixing
> structure. All implementations run in software within the generic VM.

### 11.8 Recursive Proof / SNARK Verification

| Proof system | SP1 | RISC Zero | OpenVM | Jolt | Nexus | Cairo + Stwo | Miden | Valida | zkWASM | Ligetron |
|---|---|---|---|---|---|---|---|---|---|---|
| **Groth16 verify (BN254)** | Precompile (~20x speedup via BN254 pairing precompile) | Software (Groth16 used for wrapping, not in-guest verification) | Extension (via BN254 pairing extension) | Software | Software | Software | Software | Software | Software | Software |
| **PlonK-KZG verify** | Precompile (via BN254 pairing precompile) | Software | Extension (via BN254 pairing extension) | Software | Software | Software | Software | Software | Software | Software |
| **STARK verify (recursive)** | Precompile (native STARK recursion over BabyBear) | Precompile (native STARK recursion: lift, join, resolve programs) | Extension (native STARK verify via `openvm-verify-stark`) | Software | Software | Builtin (native Cairo recursive verifier) | Software (STARK recursion via RPO; Blake3 variant less efficient) | Software | Software | Software |

### 11.9 Other Notable Operations

| Operation | SP1 | RISC Zero | OpenVM | Jolt | Nexus | Cairo + Stwo | Miden | Valida | zkWASM | Ligetron |
|---|---|---|---|---|---|---|---|---|---|---|
| **RSA verification** | Precompile (u256x2048 mul) | Patched crate (`rsa`) | Software | Software | Software | Software | Software | Software | Software | Software |
| **KZG commitment ops** | Precompile (via BLS12-381 precompile) | Software | Extension (via BLS12-381 extension) | Software | Software | Software | Software | Software | Software | Software |
| **Range check** | Software (RISC-V native) | Software (RISC-V native) | Software (RISC-V native) | Software (RISC-V native) | Software (RISC-V native) | Builtin (`range_check`, `range_check96`) | Chiplet (16-bit range checks) | Software (Valida ISA native) | Software | Software |
| **Bitwise ops** | Software (RISC-V native) | Software (RISC-V native) | Software (RISC-V native) | Software (RISC-V native) | Software (RISC-V native) | Builtin (dedicated `bitwise` AIR) | Chiplet (32-bit binary ops) | Software (Valida ISA native) | Software (WASM native) | Software (WASM native) |

### 11.10 Summary and Relevance to Aztec

**For Aztec's private-tx kernel proving, the critical accelerated operations are:**

1. **Poseidon2 hashing** -- the dominant cost (84+ hashes per tx for Merkle
   proofs alone). Three backends have guest-callable Poseidon2 precompiles:
   - **SP1**: `syscall_poseidon2` (KoalaBear field, width=16, rate=8).
     **Confirmed**: 1 syscall per permutation. Different field from BN254 Fr.
   - **Cairo/Stwo**: native Poseidon2 builtin (Stark252 field). **Confirmed**:
     620K hashes/sec on M3 laptop. Proves 107-hash workload in 11.5s.
   - **Miden**: RPO chiplet (native hash).
   - **OpenVM**: Poseidon2 AIR exists but not yet confirmed as guest-callable
     extension (used internally for recursion).
   
   **Key insight**: none of these use BN254 Fr. Aztec would need to either
   adopt the VM's native field for hashing, or accept software Poseidon2-BN254
   (which is 6-30x slower). Benchmark data strongly favors switching fields.

2. **Schnorr / ECDSA signature verification** -- Grumpkin EC scalar mul.
   - **Jolt**: has Grumpkin field division inlines (`jolt-inlines/grumpkin`).
     Not full EC mul precompile, but accelerates the expensive division step.
   - **SP1**: has secp256k1/Ed25519 point operation precompiles (add/double/
     decompress). No Grumpkin precompile. If Aztec switched to secp256k1, SP1
     would be fast.
   - **OpenVM**: EC extension available (need to test with Grumpkin).
   - All others: software.

3. **Merkle path verification** -- composes from hash precompiles. With native
   Poseidon2, Merkle proofs are essentially free (hash count barely affects
   Cairo/Stwo proving time: 10.5s for 6 hashes vs 11.5s for 107 hashes).

4. **AES decryption** -- no zkVM accelerates AES. Known bottleneck.

**Tier ranking by precompile coverage (for Aztec's needs), UPDATED:**

- **Tier 1 (SNARK-friendly hash + broad coverage):** SP1 (Poseidon2 precompile
  + SHA-256 + Keccak + EC ops + BN254 field arith), OpenVM (modular arith +
  Keccak + SHA-256 + EC + pairing extensions).
- **Tier 1b (native hash, domain-specific):** Cairo+Stwo (fastest Poseidon2
  via builtin, but requires Cairo language), Miden (RPO/Poseidon2 chiplets).
- **Tier 2 (good coverage, no SNARK-friendly hash):** RISC Zero (SHA-256 +
  Keccak + patched crates), Jolt (Grumpkin inlines, bigint, but no hash
  precompile).
- **Tier 3 (limited):** Nexus (Keccak precompile exists but SDK doesn't
  expose it), Valida, zkWASM (rejected), Ligetron (rejected).

---

## 12. Benchmark Results

> **Last updated:** 2026-04-12. Full detailed results in `zkvm/RESULTS.md`.
> Workloads use realistic Aztec tx flows with FPC fee payment, authwits, and
> 42-deep Merkle reads. Measured on a shared server (RAM numbers may be inflated).

### 12.1 Master Comparison Table (private_swap workload)

`private_swap` = account entrypoint → FPC fee payment (authwit) → 2 token
transfers (each with authwit + 42-deep Merkle read + nullifier + change note) →
AMM public call. ~107 hash calls including 84 Merkle compress calls.

| # | Backend | Hash | Prove | Cycles | RAM | Verify | EC sig? |
|---|---------|------|------:|-------:|----:|-------:|---------|
| 1 | **Cairo/Stwo** | **Native Poseidon2 builtin (Stark252)** | **11.5s** | N/A | N/A | N/A | no |
| 2 | **SP1 SHA-256** | Dedicated precompile | **45.3s** | 1.9M | ~17GB | 121ms | no |
| 3 | **SP1 native Poseidon2** | syscall_poseidon2 (KoalaBear) | **59.1s** | 624K | ~12GB | 121ms | no |
| 4 | **Jolt** | Software Poseidon2-BN254 | **67.8s** | 32.7M | ~27GB | 184ms | no |
| 5 | **SP1 Fp Poseidon2** | BN254 Fp mul/add syscalls | **69.6s** | 4.1M | ~26GB | 119ms | no |
| 6 | **Jolt (+ Schnorr)** | Software Poseidon2-BN254 + Grumpkin EC | **87s** | ~35M | ~31GB | 188ms | **yes** |
| 7 | **Nexus/Stwo Keccak** | Software Keccak256 (tiny-keccak) | **125s** | N/A | ~134GB | 779ms | no |
| 8 | **SP1 software** | Software Poseidon2-BN254 (ark-bn254) | **145.3s** | 29.7M | N/A | 346ms | no |
| 9 | **Nexus/Stwo BN254** | Software Poseidon2-BN254 (rv32) | **233s** min only | N/A | OOM | 2.5s | no |

**Target**: prove private_swap in <1 minute on laptop. Currently 11.5s (Cairo/Stwo standalone) or 45s (SP1 SHA-256).

**Important caveat on comparability**: Cairo/Stwo (row 1) uses hand-written standalone Cairo code, not the shared Rust runner. It does not include the data structure, serde, and runner overhead that all RISC-V rows include. The number measures proving speed for ~107 Poseidon2 hashes — a meaningful lower bound but not a complete apples-to-apples comparison.

### 12.2 Key Findings

1. **Cairo/Stwo is 4–13x faster than any RISC-V backend** for hash-heavy
   workloads. Native Poseidon2 builtin makes hash cost essentially free. 11.5s
   for private_swap.

2. **SP1 SHA-256 precompile is the best RISC-V option** at 45s —
   counterintuitively faster than SP1's own native Poseidon2 (59s) because
   SHA-256 circuit rows are cheaper to prove despite 3x more cycles.

3. **Hash function choice is the #1 optimization lever.** Gap between native
   precompile (11.5–45s) and software BN254 Poseidon2 (68–145s) is 1.5–13x.

4. **No zkVM has BN254 Fr Poseidon2 precompile.** The protocol must either adopt
   the VM's native field (KoalaBear, Stark252) or accept software BN254 costs.

5. **RAM is prohibitive for all RISC-V backends** — 12–31 GB. Only Cairo/Stwo
   has demonstrated phone viability.

6. **Merkle proofs are essentially free with a native hash precompile.** Cairo/Stwo
   takes 10.5s for 6 hashes and 11.5s for 107 hashes — the prover overhead
   dominates, not the hash count. This inverts the usual concern about
   42-deep Merkle trees being a bottleneck.

7. **Signature verification (Grumpkin EC scalar mul) adds ~20–30%** to Jolt
   proving time (68s → 87s). Jolt has Grumpkin division inlines but no full
   EC mul precompile. SP1 has secp256k1/Ed25519 precompiles that would be much
   faster if the protocol switched curves.

8. **Jolt's power-of-2 trace padding** can double cost when near a boundary.
   token_transfer (31.6M cycles) pads to 33.6M; private_swap (32.7M) also pads
   to 33.6M — so adding more work "for free" up to the next boundary.

### 12.3 Nexus v3 Assessment — Not Competitive

**Verdict:** Nexus v0.3.6 (Stwo backend, rv32im) is not viable for our workload
with any hash function available today.

| Hash | private_swap result | Why |
|------|--------------------:|-----|
| Software Keccak | 125s, ~134 GB RAM | Software Keccak is catastrophic |
| Software BN254 Poseidon2 | 233s (minimal only), OOM for full tx | rv32 emulating 254-bit math |

**Root cause**: Nexus's Stwo backend uses rv32im (32-bit RISC-V). Emulating
254-bit BN254 field arithmetic on rv32 is approximately 28x worse than on rv64
(Jolt). Software Keccak fares equally badly.

**Poseidon2 precompile situation**: Nexus has a Keccak precompile in the Stwo
backend, but the SDK does not expose it to guest programs. There is no guest API
for M31 Poseidon2 via Stwo's internal circuits. Until the SDK exposes these,
Nexus cannot achieve competitive proving times for our workload.

**Verdict**: Deprioritize. Revisit if Nexus ships a Poseidon2 guest precompile.

---

## 13. Rejected Approaches

### 13.1 Ligetron (Ligero Inc.) — Promising but blocked on verification

**Date investigated:** 2026-04-11 (initial), 2026-04-12 (deep dive)
**Initial verdict:** Rejected for GPU-mandatory architecture.
**Revised verdict (2026-04-12):** Ligetron has genuinely exceptional memory
efficiency (~100 MB for our workload) and good crypto support (Poseidon2,
ECDSA, BN254). Two issues remain: (1) iPhones explicitly excluded in README
(Dawn/Emscripten WebGPU may not support iOS Metal), (2) no proof
recursion/composition yet. Proofs are sqrt(N) sized (MB-scale) but this is
not a fundamental blocker — any proof can be SNARK-wrapped for L1 verification
(the RISC Zero partnership targets this). See detailed analysis below.

#### Background

Ligetron is a WASM zkVM built by Ligero Inc. (founded by Muthu
Venkitasubramaniam, co-inventor of the original Ligero protocol from ACM CCS
2017). It uses a hash-based SNARK descended from the MPC-in-the-head paradigm,
offering post-quantum security and no trusted setup.

- **ISA**: WebAssembly (WASM)
- **Guest language**: Rust (SDK at `sdk/rust/`, target `wasm32-wasip1`) or C/C++
  (via Emscripten)
- **Proof system**: Ligero (hash-based, 2-round, O(sqrt(n)) proof size)
- **Repos**: `ligeroinc/ligero-prover` (public mirror, Apache 2.0, 62 stars),
  `ligeroinc/ligetron` (private, canonical source)
- **Rust SDK**: v1.2.0, includes Poseidon2, SHA-256, BN254 field arithmetic,
  BabyJubJub, EdDSA, secp256k1 ECDSA. Not on crates.io (git/path dep only).
- **Prover**: C++ with WebGPU acceleration. No pre-built binaries — must be
  built from source with cmake, GCC 13+, Dawn (WebGPU), Vulkan, WABT, Boost,
  GMP. Six releases (v1.0.0–v1.4.0), all source-only.

#### Why it was initially attractive

Ligetron appeared promising for several reasons:
- WASM ISA means our shared crates (already `no_std` + `extern crate alloc`)
  compile directly to the guest target.
- Claimed ~1,000 TPS on GPU, ~100 TPS in browser via WebGPU.
- Claimed "native-equivalent" memory efficiency (constant prover overhead).
- Post-quantum security (hash-based, no pairing assumptions).
- "Google Wallet deployment" suggested real-world mobile validation.

#### Why it was rejected

**1. GPU is mandatory, no CPU fallback.**

Ligetron requires WebGPU (Vulkan/Metal/DX12) for all proving. Their README
explicitly states: "Currently, we don't provide a fallback implementation if
WebGPU is not available on your system." If the device lacks WebGPU support, the
prover does not degrade gracefully — it simply does not run.

Every other client-side-viable prover (Stwo, Binius, Miden) is CPU-only and
works on any device with sufficient RAM.

**2. The "Google Wallet deployment" is a different product.**

Google Wallet's ZK proofs use `google/longfellow-zk`, a native C++ CPU-only
library implementing the original Ligero protocol + GKR. It is architecturally
unrelated to Ligetron: no WebGPU, no WASM, no browser. Ligero Inc. markets the
two together, but the Google deployment validates the Ligero *math*, not
Ligetron's WebGPU-based prover architecture. The claim that Ligetron is
"deployed in Google Wallet" is misleading.

**3. Independent benchmarks show poor mobile performance.**

PSE (Privacy & Scaling Explorations, Ethereum Foundation) published client-side
proving benchmarks. For a SHA-256 proving workload:

| Device         | Ligero (GPU) | Binius (CPU) | Notes                   |
|----------------|-------------|-------------|--------------------------|
| Laptop         | 12.06s      | 5.08s       | Ligero 2.4x slower       |
| iPhone 13 Pro  | 29.77s      | 5.26s       | Ligero 5.7x slower       |
| Pixel 6        | 93.59s      | 5.51s       | Ligero **17x slower**    |

Mobile phone GPUs deliver a fraction of desktop GPU throughput. The "100 TPS in
browser" figure is from a desktop browser with a discrete GPU. On actual phones,
WebGPU acceleration provides far less benefit, and the lack of a CPU fallback
means there's no alternative path.

**4. iPhone support is effectively nonexistent.**

- WebGPU on iOS requires iPhone 15 Pro+ (A17 Pro chip) — excludes the vast
  majority of the installed base.
- WebGPU is NOT available in iOS WKWebView, which is how most apps embed web
  content. Even on a supported iPhone, an app embedding a Ligetron prover page
  would fail.
- Ligetron's own README acknowledges this: "with the exception of iOS devices
  (specifically, iPhones)."

**5. Android WebGPU coverage is incomplete.**

- Requires Android 12+ with Chrome 121+ and Qualcomm Adreno or ARM Mali GPUs.
  This covers most phones from 2021+, but:
- Android WebView WebGPU support is undocumented and uncertain.
- Android 16's Advanced Protection Mode disables WebGPU in Chrome.
- No fallback means excluded devices get zero functionality.

**6. Proof sizes are large.**

Ligetron proofs are 2.5–12.5 MiB depending on the packing parameter, compared
to ~50 KB for Jolt, ~256 bytes for Groth16-wrapped STARKs (SP1/RISC Zero), or
~50–150 KB for raw STARKs. For an on-chain submission use case, this is a
significant cost.

#### Comparison: mobile client-side proving viability

| System       | GPU required? | Phone-proven?                   | CPU fallback? | Mobile perf (SHA-256)     | RAM        |
|-------------|--------------|----------------------------------|--------------|--------------------------|------------|
| **Stwo**     | No (CPU+SIMD)| 1,420 models, 2.1M proofs        | Yes          | Designed for it           | Moderate   |
| **Binius**   | No (CPU)     | 5s on Pixel 6, 5s on iPhone 13   | Yes          | Excellent (~22–45 MB)     | Very low   |
| **Miden**    | No (CPU)     | Designed for client-side          | Yes          | TBD                       | Moderate   |
| **Ligetron** | **Yes**      | Not deployed on phones            | **No**       | 94s on Pixel 6            | Low (GPU)  |

#### What Ligetron IS good for (not our use case)

- **Server-side GPU proving**: where GPUs are plentiful and the post-quantum +
  low-memory properties matter.
- **Desktop browser proofs**: WebGPU on laptops/desktops is ~85% coverage and
  delivers good performance.
- **Memory-constrained server environments**: constant prover overhead is a
  genuine differentiator for large computations.

#### Corrections to earlier sections of this report

The following claims made earlier in this report (written before this
investigation) should be read with the above context:

- Section 6 describes Ligetron as "Best memory efficiency, Google production
  use" — the Google production use is `longfellow-zk`, not Ligetron.
- Section 6 table marks Ligetron as "**Deployed** (Google Wallet)" — this is
  inaccurate; it should say "Not deployed on phones (Google Wallet uses a
  separate CPU-only library)."
- Section 10 lists Ligetron as a candidate for phone-viable proving — qualified:
  phone GPU via WebGPU works on Android, but iPhones are excluded and there is
  no CPU fallback.

#### Deep dive findings (2026-04-12)

**Architecture:** Ligetron is a C++ WASM interpreter that generates ZK
constraints as it runs. It takes a `.wasm` binary, interprets it opcode by
opcode, and produces linear/quadratic constraints over BN254 Fr. The Ligero
proof system (MPC-in-the-head, 2-round) allows the prover to commit row by
row, discarding committed rows — this is what enables the memory efficiency.

**Crypto SDK (v1.2.0):** Poseidon2 (arbitrary input length), SHA-256, BN254 Fr
field arithmetic, Baby JubJub, EdDSA, ECDSA (secp256k1 + P-256 as of Feb 2026).
These are host module imports that generate optimized constraints, similar to
SP1 precompiles.

**Memory for our workload:** Estimated <100 MB for ~100 Poseidon2 hashes + EC
operations. Genuinely best-in-class — 100x better than RISC-V backends.

**Production user:** Midnight Network (Cardano privacy chain) uses Ligetron as
their client-side prover. This is real, deployed software.

**Remaining concerns:**

1. **iPhones explicitly excluded.** README says "with the exception of iOS
   devices (specifically, iPhones)." Even though Safari 18.2+ has WebGPU,
   Dawn/Emscripten WebGPU may not support iOS Metal. No CPU fallback exists.
   This needs direct verification — it may be a toolchain limitation rather
   than a fundamental one.

2. **No proof recursion yet.** Cannot compose or aggregate proofs. Each proof
   is standalone. The RISC Zero partnership targets this.

3. **Proof size is sqrt(N).** Estimated 1-10 MB for our workload. Not directly
   verifiable on L1, but any proof can be SNARK-wrapped (STARK→Groth16 is
   standard practice for SP1 and RISC Zero already). Not a fundamental blocker.

4. **Oblivious control flow required.** Secret-dependent branching requires
   both branches to execute (data-oblivious MUX). This is a constraint for
   programs with secret-dependent control flow, which private functions have.

**Assessment:** Ligetron's memory efficiency is genuinely exceptional and its
Poseidon2/ECDSA support matches our needs. The iPhone exclusion and lack of
proof recursion are the main concerns. If iPhone WebGPU support can be
resolved (or a CPU fallback built), and the RISC Zero SNARK-wrapping
partnership ships, the memory efficiency + phone GPU proving combo could be
very compelling.

### 13.2 zkWASM (Delphinus Lab) — Rejected for modern Rust guests

**Date investigated:** 2026-04-11
**Verdict:** Rejected. Does not support the WebAssembly bulk memory extension
(opcode 0xFC), which modern Rust compilers (1.82+) emit by default. Cannot
prove non-trivial Rust programs without using obsolete toolchains.

#### Background

zkWASM is a WASM-native zkVM that proves WebAssembly execution using ZKSNARK
circuits (halo2-based). The prover is a CLI tool (`zkwasm-cli`) with a
setup/prove/verify workflow.

- **ISA**: WebAssembly bytecode directly
- **Guest language**: Rust via `wasm32-unknown-unknown` target, or AssemblyScript
- **Proof system**: halo2 PLONK (ZKSNARK)
- **Repos**: `DelphinusLab/zkWasm` (850 commits, 541 stars)
- **Rust SDK**: `zkwasm-rust-sdk` with `wasm_input()`/`wasm_output()` host functions
- **Maturity**: WIP, 4 tagged releases, actively maintained

#### Why it was initially attractive

- WASM-native: our shared crates compile directly to `wasm32-unknown-unknown`
- Standard Rust WASM toolchain (no custom ISA or compiler)
- Established project with documentation and SDK

#### Why it was rejected

**The WASM bulk memory extension (opcode 0xFC) is not supported.**

Modern Rust (1.82+) compiles `memcpy`/`memset` operations to WASM's
`memory.copy` (0xFC 0x0A) and `memory.fill` (0xFC 0x0B) instructions. These
are part of the bulk memory operations extension, standardized since 2019 and
enabled by default in all major WASM runtimes.

Our guest module contains 123 `memory.copy` instructions from standard library
routines (Vec operations, slice copies, serde deserialization). These cannot be
avoided in non-trivial Rust programs.

**Attempted workarounds (all failed):**

1. `RUSTFLAGS="-C target-feature=-bulk-memory"` — does not prevent LLVM's core
   library from emitting `memory.copy`. The instructions come from pre-compiled
   standard library artifacts, not from target feature flags.

2. `wasm-opt --disable-bulk-memory` — does not remove `memory.copy` from
   pre-existing WASM. The tool can only prevent new emissions during
   optimization, not strip existing ones.

3. The zkWASM team's recommended fix (GitHub issue #235) is
   `--disable bulk-memory` in the AssemblyScript compiler (`asc`), which is
   irrelevant for Rust guests.

**The fundamental problem**: zkWASM's WASM interpreter was written for the
MVP WASM spec and has not been updated to support post-MVP extensions that
modern compilers rely on. This makes it incompatible with any Rust code
compiled with a toolchain from the last 2+ years.

#### References

- [zkWASM issue #235](https://github.com/DelphinusLab/zkWasm/issues/235):
  "Unknown opcode 252" — closed as "solved" by recommending AssemblyScript
  users disable bulk memory. Not applicable to Rust.
- [zkWASM issue #54](https://github.com/DelphinusLab/zkWasm/issues/54):
  "feat: add support or workaround for bulk-memory-operations" — closed in
  Jan 2023, but support was never fully implemented for all opcodes.

### 13.3 Valida (Lita Foundation) — Deferred pending soundness review

**Date investigated:** 2026-04-12
**Verdict:** Deferred. Prover is explicitly unsound per their own v1.0.0 release
notes. Benchmarking proving time is meaningless if proofs provide no guarantees.
Revisit when the soundness review completes.

#### Background

Valida is a zkVM with a custom ZK-optimized ISA (not RISC-V). Harvard
architecture, no general-purpose registers, stack-based operand addressing.
Proven via Plonky3 STARK over BabyBear. Has a WASM prover for browser-side
proving. Compiles Rust via a custom LLVM backend
(`valida-unknown-baremetal-gnu` target). v1.0.0 released September 2025.

Interesting properties: custom ISA co-designed for ZK efficiency (memory accesses
are cheaper than register accesses in STARKs, so Valida eliminates registers
entirely). WASM prover is genuinely available. Keccak-f acceleration chip is
proven and working (500 sequential Keccak hashes in 23s on z1d.metal). The
Keccak chip is the right primitive to benchmark with — BN254 Poseidon2 is not
required (each backend uses its own best-available hash function).

#### Why it was deferred

1. **Prover is explicitly unsound.** The v1.0.0 release notes state: "The prover
   is unsound, which means that verifying a proof does not provide completely
   convincing evidence that the statement being proven is true." Soundness review
   is ongoing. Proving time benchmarks are only meaningful if the resulting proofs
   are sound — otherwise we're measuring the cost of producing nothing useful.

2. **secp256k1 opcodes are execution-only.** Four secp256k1 opcodes exist
   (COMBSECP256K1, SMULSECP256K1, SINVSECP256K1, MULSSECP256K1) but they have no
   prover constraints — you can execute programs with EC operations but cannot
   generate valid proofs of them.

3. **Host API is a CLI wrapper.** The Rust API (`valida-vm-api-linux-x86` crate)
   shells out to the embedded `valida` binary. I/O is via sequential stdin/stdout
   tapes. This is workable (serialize all input upfront, deserialize output) but
   clunkier than library-level APIs.

#### What would make it worth revisiting

- Soundness review completes and constraints are added for all chips
- secp256k1 opcodes get prover constraints (enabling signature verification)
- The Keccak chip + custom ISA combination could be competitive for hash-heavy
  workloads. The 32-bit ISA is not inherently a problem — with the Keccak chip
  accelerating hashing and wrapper structs for big numbers, it could perform
  well. The key unknown is whether the prover overhead (FFT, FRI) is competitive
  with RISC-V-based provers.

#### References

- [Valida v1.0.0 release](https://www.lita.foundation/blog/introducing-valida-zkvm-1-0):
  "soundness review on Valida is ongoing and it should not be considered
  production ready software"
- [Valida ISA spec](https://arxiv.org/abs/2505.08114)
- [GitHub](https://github.com/lita-xyz/valida-vm)
- [Keccak benchmarks](https://www.lita.foundation/blog/keccak-acceleration-chip-and-benchmarks)

### 13.4 google/longfellow-zk — Not applicable (special-purpose, not a zkVM)

**Date investigated:** 2026-04-11
**Verdict:** Not applicable. This is a special-purpose ZK proof library for
identity credential protocols, not a general-purpose zkVM.

#### What it is

`google/longfellow-zk` (Apache 2.0, 1,065 stars) is the ZK library Google
deployed in Google Wallet for privacy-preserving age verification with digital
IDs (mDL/mDOC). It implements Ligero + Sumcheck over hand-built arithmetic
circuits. Written in C++, with a Go reference verifier. Actively maintained
(latest release v0.9, 2026-03-31). Has an IETF draft specification
(`draft-google-cfrg-libzk`).

- **No ISA, no VM, no bytecode.** Circuits are hand-built in C++ using a
  `QuadCircuit<Field>` API (`add`, `mul`, `input`, `assert0`).
- **Pre-built circuits:** ECDSA P-256, SHA-256, CBOR parsing, mDOC selective
  disclosure — all specific to the identity credential use case.
- **No Rust bindings.** No FFI, no WASM target, no `Cargo.toml`.
- **No program compilation.** You cannot compile Rust (or any language) to
  something Longfellow can prove.

#### Why it was considered

The Google Wallet deployment proved ~1.2 second ZK proof generation on phone
hardware (CPU-only, no GPU). The underlying Ligero+Sumcheck proof system has
attractive properties: no trusted setup, hash-based security (plausibly
post-quantum), and good performance on constrained devices. It was investigated
as part of the Ligetron due diligence, since Ligero Inc. markets the Google
Wallet deployment alongside Ligetron.

#### Why it does not apply

To prove arbitrary computation (like Aztec's kernel logic), you would need to
build a full VM circuit on top of Longfellow's Quad gate model — essentially
reimplementing what SP1, Jolt, RISC Zero, etc. provide. That would be a
multi-year effort. The library is designed for proving specific statements about
cryptographic credentials, not for general-purpose program execution.

---

## 14. How zkEVM Projects Handle VM-in-VM Execution

**Date added:** 2026-04-12

This section documents how Ethereum zkEVM projects encode the EVM inside their
proving systems, as a reference for designing Aztec's private execution VM.

### 14.1 The industry convergence: interpreter compiled to RISC-V

As of 2026, the major zkEVM projects have converged on a single architectural
pattern: compile a Rust EVM interpreter (`revm`) to RISC-V, then prove the
RISC-V execution inside a general-purpose zkVM. Contract bytecodes are loaded as
*data* at runtime and interpreted by the compiled-in interpreter.

| Project | Previous approach | Current approach | When changed |
|---------|------------------|-----------------|-------------|
| **Scroll** | Hand-written PLONKish circuits (Halo2), 2000+ custom gates | OpenVM (RISC-V) + revm | April 2025 (Euclid) |
| **Polygon zkEVM** | Custom zkASM micro-VM with ROM-based EVM translation | ZisK (RISC-V 64-bit, spin-off) | June 2025 |
| **SP1-Reth** | N/A (always RISC-V) | revm compiled to rv64im, precompile-accelerated | From inception |
| **RISC Zero Zeth** | N/A (always RISC-V) | revm + Reth compiled to rv32im | From inception |
| **Taiko Raiko** | N/A (multi-prover) | revm on SP1 + RISC Zero + SGX simultaneously | From inception |
| **zkSync Era** | Custom EraVM with hand-written Boojum constraints | Still EraVM, but added EVM interpreter as system contract | Ongoing |

### 14.2 Why hand-rolled VMs were abandoned (for Ethereum)

The key drivers for abandoning hand-written constraint sets were:

1. **Maintenance cost.** Every Ethereum hard fork (Cancun, Prague, etc.) changes
   EVM semantics. Each change requires re-engineering constraints, re-auditing,
   and re-deploying. Scroll's 2000+ custom gates had to be re-validated for each
   fork. The audit cycle alone was months per change.

2. **Audit surface.** Hand-written constraints are easy to get wrong. A single
   missing constraint = soundness bug. General-purpose zkVMs have one constraint
   set (the ISA) audited once; any program runs safely on it.

3. **Ecosystem velocity.** RISC-V zkVMs (SP1, RISC Zero, OpenVM) improve their
   provers continuously. Hand-rolled systems don't benefit from these
   improvements — they're frozen at their own optimization level.

4. **Vitalik's RISC-V proposal.** In May 2025, Vitalik proposed replacing the
   EVM itself with RISC-V on Ethereum L1. If this happens, the interpretation
   layer disappears entirely. The industry is positioning for this future.

### 14.3 But Aztec is different from Ethereum

The reasons Ethereum abandoned hand-rolled VMs may not apply to Aztec:

1. **We control our ISA.** Aztec's private function ISA is our own — no external
   hard forks. Changes happen on our schedule, with our audit process. The
   maintenance burden is proportional to ISA complexity, which we control.

2. **Our ISA is much simpler.** The EVM has ~140 opcodes, many complex (SSTORE,
   CREATE2, SELFDESTRUCT). Aztec private functions need maybe 30–50 opcodes:
   arithmetic, hashing, EC ops, emit side effects, make calls. The constraint set
   would be a fraction of a zkEVM's.

3. **Phone viability demands efficiency.** The 2-3x gap between hand-rolled and
   general-purpose constraints could be the difference between "fits in 2 GB" and
   "needs 6 GB" on a phone. On servers with 30+ GB, this doesn't matter. On
   phones, it's critical.

4. **Crypto dominates our workload.** Aztec private functions are heavily
   crypto-oriented (Poseidon2 hashing, EC operations, Merkle proofs). Dedicated
   constraint circuits (chiplets/builtins) for these operations yield outsized
   gains. A purpose-built VM can co-design the ISA with the constraint system to
   minimize rows per crypto operation.

### 14.4 Interpretation overhead: the 800x number

Succinct/Vitalik (April 2025) measured the cost of interpreting EVM bytecode
inside SP1 (RISC-V):

- ~59% of total proving cost comes from the EVM interpretation loop
- ~800x cycle inflation vs native RISC-V execution of the same logic
- The remaining ~41% is crypto precompiles (ecrecover, bn254 pairings, Keccak)

For Aztec, the overhead distribution may differ:
- Private functions are more crypto-heavy, less control-flow-heavy than EVM
- Our "precompile" fraction (hashing, EC ops) would be larger
- The interpretation loop would be simpler (smaller ISA, no storage trie)
- Phase 5 of the spike will measure this directly

### 14.5 zkSync's VM-in-VM: the concrete overhead

zkSync Era is the only major project doing true VM-in-VM at runtime:
- EraVM (custom register-based VM, 16 registers) executes EraVM bytecode
- An EVM interpreter runs as a system contract inside EraVM
- Gas conversion ratio: 5:1 (5 EraVM ergs per 1 EVM gas)
- Nested calls spawn new interpreter instances

This is the closest precedent to what Aztec would do (interpret private function
bytecode inside a provable VM), though our interpreter would be simpler than
a full EVM interpreter.

---

## 15. Phone-Viable Proving: Landscape and Requirements

**Date added:** 2026-04-12

Phone viability is a hard requirement for Aztec private transaction proving.
This section documents the current landscape of phone-viable proof systems.

### 15.1 Phone hardware constraints (2025–2026)

- **Total RAM**: Flagship 8–16 GB, mid-range 4–8 GB
- **Available to a single process**: ~2–4 GB (OS + background apps consume rest)
- **WASM 32-bit address space hard limit**: 4 GB
- **Browser tab memory limits**: typically 2–4 GB
- **WebGPU**: available in Chrome, Edge, Firefox, Safari (iOS 18.2+)
- **CPU**: 4–8 high-performance cores, ARM NEON SIMD

### 15.2 Systems with phone proving evidence

| System | Evidence | Workload | Performance | RAM | Architecture |
|--------|----------|----------|-------------|-----|-------------|
| **Cairo/Stwo** | FibRace: 2.2M proofs, 1420 devices | Fibonacci | Median 6.4s, P10 1.5s | 3 GB min | Purpose-built VM, M31 STARK |
| **Noir/UltraHonk** | Hyli browser benchmark | p256 ECDSA | 6s on Samsung Galaxy A23 | Moderate | Circuit DSL, Honk prover |
| **Miden VM** | Benchmarks (not on phones) | Various | 885ms at 2^16 cycles (M4 Max) | 750 MB at 2^16 | Stack VM, Goldilocks STARK |
| **Ligetron** | Claims, no phone data | Various | "100 TPS in browser" (desktop) | Low (by design) | WASM VM, Ligero proof, WebGPU |
| **IMP1 (Ingonyama)** | iPhone 16 benchmark | Neural net (1M constraints) | 2.3s | Strict budget | Groth16 (not general-purpose) |

### 15.3 Systems NOT phone-viable in current form

| System | Reason | RAM needed |
|--------|--------|-----------|
| SP1 | Prover needs 10–26 GB | 10–26 GB |
| RISC Zero | Prover needs 12+ GB | 12+ GB |
| Jolt (current) | 27–31 GB | 27–31 GB |
| Nexus | 6–134 GB | 6–134 GB |

**But RISC-V is not ruled out.** Paths to phone viability exist:
- **Jolt streaming** (Nair-Thaler-Zhu 2025): <2 GB for arbitrary executions
  without recursion. Unproven on phones but architecturally promising.
- **Continuations with small segments**: RISC Zero and SP1 can prove small
  segments with fixed per-segment memory. Aggressive segment sizing could
  approach phone-class RAM.
- **WASM-compiled provers**: Several RISC-V provers can compile to WASM and
  run in-browser, subject to the 4 GB address space limit.
- **Delegated proving**: Server-side proving as a fallback. Not client-side,
  but avoids the phone constraint entirely.

### 15.4 Continuations and streaming proofs

**Continuations (segmented proving):** Split long execution into fixed-size
segments. Each segment is proved independently with bounded memory. The trace
is discarded after proving each segment. Proofs are composed recursively.
- RISC Zero: configurable segment size, fixed memory per segment
- SP1: 2^21 cycle shards, auto-tuned to available memory
- Memory per segment is typically still several GB

**Streaming proofs (constant memory):** Process the execution trace
row-by-row without holding it all in memory.
- Jolt streaming (ePrint 2025/611): <2 GB for arbitrary RISC-V, no recursion
- Gemini (Eurocrypt 2022): logarithmic memory for R1CS
- Ligetron: garbage-collected trace, "no more memory than native execution"
- No production STARK prover does row-by-row streaming — FRI requires the
  full committed polynomial (LDE). Sumcheck-based proofs are streamable.

### 15.5 Key references

- FibRace paper (arXiv:2510.14693): large-scale phone proving data
- Proving CPU Executions in Small Space (ePrint 2025/611): Jolt streaming
- Gemini: Elastic SNARKs (ePrint 2022/420): logarithmic-memory proving
- Mopro mobile benchmarks (zkmopro.org): cross-system phone benchmarks
- Hyli in-browser ECDSA benchmark (blog.hyli.org): browser proving comparison

---

## 15b. Miden VM Deep Dive

**Date added:** 2026-04-12

Miden VM is the closest existing architectural match to what Aztec needs for a
purpose-built private execution VM. This section documents the deep-dive
findings.

### Architecture

Stack-based VM over Goldilocks field (p = 2^64 - 2^32 + 1). 7-bit opcodes,
9 packed per "operation group." ~70 main trace columns + 9 auxiliary columns.

- **Stack**: top 16 elements directly accessible, overflow table for deeper items
- **Memory**: word-addressable (4 field elements per address), random-access
  read-write, context-isolated per CALL
- **Chiplets**: Hash (Poseidon2, 8 trace rows per permutation), Bitwise (AND,
  XOR), Memory, ACE (arithmetic circuit evaluation for recursive verification),
  Kernel ROM. All connected via a chiplet bus (running product column).
- **Kernel/SYSCALL**: Programs can SYSCALL into kernel procedures loaded at
  initialization. Kernel runs in root context with separate memory. This maps
  directly to Aztec's kernel/private-function separation.

### Crypto Primitives

- **Poseidon2**: Native hash chiplet, 8 trace rows per permutation. Primary hash.
- **Merkle trees**: Native operations (`mtree.get`, `mtree.set`), up to depth 64
- **Signatures**: RPO-Falcon512 (post-quantum), ECDSA secp256k1, Ed25519 (via precompiles)
- **No native EC chiplet**: EC operations are either precompiles (cheaper proving,
  larger proof) or software in MASM (expensive proving)
- **Encryption**: AEAD-RPO (authenticated encryption using RPO permutation)

### Programming model

Three tiers: Miden Assembly (MASM, low-level), Rust via midenc compiler (WIP,
134 open issues), or any WASM-producing language via the midenc frontend.
The Miden protocol already implements the exact pattern we need: a transaction
kernel in MASM that orchestrates private execution with context isolation.

### Phone viability

| VM Cycles | RAM | Proving (1-core) | Proving (multi-core M4 Max) |
|-----------|-----|------------------|-----------------------------|
| 2^14 (16K) | 200 MB | 885ms | — |
| 2^16 (65K) | 750 MB | 3.6s | — |
| 2^18 (262K) | 2.9 GB | 14.7s | — |
| 2^20 (1M) | 11 GB | 59s | 5.9s |

**Phone-feasible at 2^16 cycles (750 MB).** Tight at 2^18 (2.9 GB). Not
feasible at 2^20 (11 GB).

**Critical gap: no segmented proving/continuations.** If a workload exceeds
~65K cycles, memory grows to 2.9 GB+. Unlike SP1/RISC Zero, there is no way
to split a large execution into smaller segments. This is the single biggest
limitation for phone proving.

**Estimate for Aztec workload**: ~100 Poseidon2 hashes (800 chiplet rows) +
EC signature verification. If done via precompiles, fits in 2^16 cycles
(~750 MB, ~4s on phone). If EC ops are in MASM software, could push to 2^18
(~2.9 GB, ~15s) — tight but potentially feasible on flagship phones.

### Extensibility

- Custom host/advice providers: easy (trait-based)
- Custom kernel procedures (MASM): easy (intended extension point)
- Custom precompiles: supported (v0.12+ framework)
- Custom chiplets: hard (requires forking VM/prover)
- Custom opcodes: very hard

### Assessment for Aztec

**Strengths:**
- Kernel/SYSCALL model is a direct architectural match
- Native Poseidon2 + Merkle operations
- MIT/Apache 2.0 license, can fork freely
- Miden protocol already implements private execution pattern (prior art)
- Designed for client-side proving from day one

**Weaknesses:**
- No continuations — hard memory ceiling for large workloads
- Alpha quality, mainnet June 2026, recursive verifier incomplete
- Goldilocks field requires re-implementing Aztec crypto primitives
- Rust compiler (midenc) is WIP — complex logic must be written in MASM
- No native EC chiplet

**Recommendation:** Study Miden's architectural patterns (kernel model, chiplet
design, context isolation) as reference architecture for Option B. Consider
whether forking Miden VM and adding continuations + Aztec-specific chiplets
is more practical than building from scratch. The ~4 years of VM development
Miden represents would be extremely expensive to replicate.

---

## 16. Strategic Architecture Options for Aztec

**Date added:** 2026-04-12

See `zkvm/PLAN.md` for the current implementation plan. This section provides
the architectural rationale for the three options under consideration.

### 16.1 Option A: General-purpose zkVM + bytecode interpreter

Compile a bytecode interpreter (WASM, Brillig, or custom) to the zkVM's ISA.
Run it inside a general-purpose zkVM. Contract bytecodes loaded as data at
runtime. This is what all zkEVM projects do.

**Best for:** Rapid prototyping, leveraging existing ecosystems, comparing
multiple backends. The shared crate architecture already supports this.

**Risk:** Phone viability. Current RISC-V provers need 10-30 GB. Jolt streaming
and continuations may solve this, but are unproven on phones.

### 16.2 Option B: Purpose-built provable VM

Build (or fork) a VM whose ISA is co-designed with STARK/SNARK constraints,
optimized for Aztec's private execution. Precedents:

- **Cairo VM**: purpose-built for Stwo, phone-viable at scale
- **Miden VM**: stack-based, Winterfell STARK, WASM target, crypto chiplets
- **EraVM**: register-based with hand-written Boojum constraints

For Aztec, a hand-rolled VM is more defensible than for Ethereum because:
- We control our ISA (no external hard forks)
- Our ISA is much simpler (~30-50 opcodes vs ~140 for EVM)
- Phone viability demands the efficiency gains from co-designed constraints
- Crypto operations dominate our workload and benefit most from dedicated circuits

**Best for:** Achieving phone viability with minimal overhead. Full control over
performance characteristics.

**Risk:** Engineering effort. Need to build or adapt execution engine, constraint
definitions, and prover integration. But existing systems (Miden, Cairo) provide
reference architectures, and STARK prover libraries (Stwo, Winterfell, Plonky3)
can be reused.

### 16.3 Option C: Use an existing purpose-built VM directly

Write the interpreter + kernel logic in Cairo, Miden assembly, or target
Ligetron's WASM runtime directly.

**Candidates:**
- **Cairo VM / Stwo**: proven phone-viable, native Poseidon2 builtin, active
  ecosystem. Cairo is an actual VM (PC, registers, instruction set, runtime
  trace) — not a circuit DSL like Noir. Could compile a different source
  language to Cairo VM bytecode.
- **Miden VM**: Rust-native, stack-based, WASM target, dedicated crypto
  chiplets, targets client-side proving explicitly. Potentially extensible
  with custom chiplets for Aztec-specific operations.
- **Ligetron**: WASM-native, memory-efficient, WebGPU-accelerated (now
  available on most modern phones). Compile Rust to WASM and prove directly.

**Best for:** Fastest path to a working phone-viable prototype. Avoids building
a custom VM from scratch.

**Risk:** Ties to a specific ecosystem. May limit flexibility for Aztec-specific
optimizations. Language mismatch for Cairo (not Rust).

### 16.4 Current approach and what it measures

The Phase 2-4 benchmarks compile contract logic + kernel logic into a single
static binary — no interpreter, no dynamic bytecodes. This measures the
**performance floor** for crypto + kernel overhead.

This is a useful baseline but is NOT the target architecture. The real
architecture adds a bytecode interpreter that loads contract code dynamically.
Phase 5 will measure the interpretation overhead, which is the critical data
point for choosing between Options A, B, and C.

The Ligero+Sumcheck *proof system* is interesting for future reference (it
demonstrates that Ligero-family proofs can run fast on phones without GPUs), but
the *library* is not usable as a zkVM backend.
