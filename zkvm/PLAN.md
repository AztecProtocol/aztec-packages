# zkVM Client-Side Proving Spike: Implementation Plan

> **To resume this work in a new Claude Code session:**
> ```
> cd /mnt/user-data/mike/ap-vm
> git checkout zkvm/spike-exploration
> ```
> Then tell Claude: "Read `zkvm/PLAN.md` and the memory file at
> `.claude/projects/-mnt-user-data-mike-ap-vm/memory/project_zkvm_exploration.md`.
> Continue implementing from wherever we left off — check git log and cargo test
> to see what's already done."
>
> **Branch:** `zkvm/spike-exploration`
> **Exploration report:** `zkvm-exploration-report.md` (repo root)
> **Results:** `zkvm/RESULTS.md`

---

## Context & Goal

**The goal**: build a VM that efficiently proves the execution of an arbitrary private function call stack for Aztec, running on a phone (target: <2 GB RAM, <30s proving).

Aztec's private tx proving currently uses recursive Noir circuit composition (init→inner→reset→tail kernels). This spike explores replacing it with a single VM execution proven inside a zkVM (or a purpose-built provable VM). See `zkvm-exploration-report.md` for full architectural rationale.

**What we're actually building**: a fixed VM program (interpreter + kernel logic) that takes arbitrary private function bytecodes as input and produces proven KernelPublicInputs. The call stack varies per transaction; the VM binary is the same for all txs. Contract bytecodes are loaded dynamically at runtime — the VM interprets them, processes side effects, and outputs a proof.

**How this compares to zkEVM projects**: SP1-Reth, Zeth, Scroll/OpenVM, and Taiko all compile `revm` (a Rust EVM interpreter) to RISC-V and prove it inside a general-purpose zkVM. EVM bytecodes are loaded as data at runtime. This is exactly the architecture we want — but for Aztec private functions instead of EVM contracts. Our "revm" equivalent would be a Brillig interpreter or WASM interpreter.

**The "cheating" shortcut**: Current benchmarks (Phases 2-4) compile contract logic + kernel logic into one static binary — no interpreter, no dynamic bytecodes. This measures the performance floor for crypto + kernel overhead, but is NOT the target architecture. The real architecture adds an interpretation layer (Phase 5+).

**Phone viability is a hard requirement.** The proof must be generated on a phone (~2-4 GB available RAM). Several systems are relevant:
- **Cairo/Stwo**: Large-scale phone data (FibRace: 2.2M proofs, 1420 devices, median 6.4s, 3 GB min). Proven at scale, but only for simple workloads (Fibonacci).
- **Miden VM**: Stack-based VM with Winterfell STARK prover. 750 MB at 2^16 cycles, 2.9 GB at 2^18. WASM target supported. Phone-viable at small-to-moderate trace sizes. Edge blockchain vision targets client-side proving.
- **Ligetron**: Memory-efficient by design ("no more memory than native execution"). Garbage-collected trace. WASM prover exists. Claims 100 TPS in browser. GPU helps but WASM fallback exists.
- **Jolt streaming**: <2 GB for arbitrarily long RISC-V executions without recursion (Nair-Thaler-Zhu 2025). Unproven on phones but architecturally promising.
- **Noir/UltraHonk**: 6s on Samsung Galaxy A23 for p256 ECDSA. Works in browser.
- **RISC-V zkVMs (SP1, RISC Zero)**: 10-30 GB. NOT phone-viable in current form.

The landscape is broader than any single system. Multiple paths to phone proving exist.

We created a top-level `zkvm/` directory (a standalone Cargo workspace, consistent with how `avm-transpiler/`, `bb-pilcom/`, etc. are organized).

---

## Status Summary

| Phase | Status | Result |
|-------|--------|--------|
| Phase 0: Scaffold | **DONE** | Cargo workspace, cross-compilation check passes |
| Phase 1a: data-types | **DONE** | Field, Digest, protocol types, constants |
| Phase 1b: kernel-logic | **DONE** | Squash, read validation, siloing, gas, assembly |
| Phase 1c: aztec-sdk | **DONE** | PrivateContext, NoteType trait, state variable stubs |
| Phase 1d: test contracts + bench | **DONE** | minimal, token_transfer, private_swap, heavy workloads |
| Phase 2: SP1 | **DONE** | 4 hash variants tested (59s best for private_swap) |
| Phase 3: Jolt | **DONE** | BN254 Poseidon2 + Schnorr verified (68s private_swap) |
| Cairo/Stwo | **DONE** | 11.5s private_swap — fastest result |
| Nexus/Stwo | **DONE** | 125s Keccak (not competitive), OOM for BN254 |
| OpenVM | **PARTIALLY DONE** | Execution + keygen done; proof generation pending |
| Phase 4: Benchmarks | **MOSTLY DONE** | Master comparison table in RESULTS.md |
| RISC Zero | **DONE** | 40s private_swap (SHA-256), 1.9M cycles, 9.4 GB — fastest RISC-V |
| Ligetron | **DONE** | **4.9s / 258 MB** full kernel w/ real Poseidon2 + EdDSA + encryption |
| Ligetron deep dive | **DONE** | WASM-native, Ligero proofs, phone-viable memory, EdDSA verified |
| Miden VM deep dive | **DONE** | Closest arch match, no continuations, alpha quality |
| Phase 5: Bytecode interpreter | **NOT STARTED** | Ligetron already interprets WASM natively — may be moot |
| Phase 5b: Custom VM evaluation | **PARTIALLY DONE** | Miden + Ligetron studied; Stwo not yet |
| Phase 6: End-to-end + phone | **NOT STARTED** | Go/no-go decision point |

See `zkvm/RESULTS.md` for the full benchmark table. See `zkvm-exploration-report.md` for architectural analysis, precompile research, and rejected backends.

---

## Strategic Architecture Options

Before detailing remaining work, these are the three viable architecture paths. All three share the same goal: prove execution of an arbitrary private function call stack on a phone.

### Option A: General-purpose RISC-V zkVM + bytecode interpreter

Compile a bytecode interpreter (WASM, Brillig, or custom) to RISC-V. Run it inside a general-purpose zkVM (SP1, RISC Zero, Jolt, OpenVM). Contract bytecodes loaded as data at runtime.

This is exactly what zkEVM projects do: SP1-Reth, Zeth, and Scroll/OpenVM all compile `revm` to RISC-V and prove it. Vitalik/Succinct found ~59% of Ethereum block proving cost comes from the interpretation overhead (~800x cycle inflation vs native). Crypto precompiles dominate the rest.

**Pros:** Existing toolchain, rapid iteration, shared infrastructure across backends. Largest ecosystem. Multiple independent teams improving prover efficiency.
**Cons:** Current RISC-V provers use 10-30 GB on servers. The 800x interpretation overhead is significant but dominated by crypto precompile cost.

**Phone viability paths (RISC-V is NOT ruled out):**
- **Jolt streaming**: <2 GB for arbitrarily long executions without recursion. If this ships to production quality, Option A becomes phone-viable.
- **Continuations with small segments**: RISC Zero and SP1 can split into small segments with fixed per-segment memory. With aggressive segment sizing, memory could approach phone-class.
- **WASM-compiled provers**: Several RISC-V zkVM provers can be compiled to WASM and run in-browser. This is separate from WASM as a guest bytecode — it's about running the *prover itself* in a browser/phone environment. SP1, RISC Zero, and Jolt all have varying degrees of WASM prover support.
- **Delegated proving**: Proving happens server-side (e.g., RISC Zero Boundless, SP1 network). Not client-side, but still an option if phone proving proves infeasible for any architecture.

### Option B: Purpose-built provable VM

Build a custom VM whose ISA is co-designed with STARK/SNARK constraints, optimized for Aztec's private execution. Native builtins for hashing, EC operations, Merkle membership. Several precedents exist:
- **Cairo VM** (StarkWare): purpose-built for Stwo, phone-viable at scale
- **Miden VM** (Polygon Miden): stack-based, Winterfell STARK, WASM target, phone-class memory at moderate trace sizes
- **EraVM** (zkSync): register-based with hand-written Boojum constraints

The custom VM would:
- Have a small ISA optimized for ZK-proving (few constraint rows per instruction)
- Include dedicated constraint circuits for hashing, EC ops, Merkle verification
- Process bytecode (WASM, Brillig, or custom) via an interpreter built into the VM
- Use a small-field STARK (M31, Goldilocks, BabyBear) for efficient FFTs on 32-bit CPUs
- Support continuations/streaming for memory-bounded proving on phones

**Pros:** Best performance ceiling. Full control over constraint efficiency. Can optimize ISA specifically for Aztec's operation profile. Multiple proven reference architectures to learn from.
**Cons:** Major engineering effort (multi-month). Need to build execution engine, constraint definitions, and integrate with a prover. Risk of reinventing the wheel.

**Shortcut options:**
- Use Stwo as the prover backend — define VM semantics + AIR, reuse Stwo's FRI prover.
- Use Winterfell (Miden's prover) — already has a Rust API, WASM target.
- Use Plonky3 (SP1/Valida's prover library) — modular, pluggable hash/field.
- Fork/extend Miden VM — already a stack-based ZK VM with chiplets for crypto operations. Closest existing architecture to what we'd want.

### Option C: Use an existing purpose-built VM directly

Write the interpreter + kernel logic in Cairo, Miden assembly, or another VM-specific language. Run on that VM's prover directly.

**Pros:** Leverage a mature, optimized prover without building our own. Fastest path to phone-viable proving.
**Cons:** Ties us to a specific language/ecosystem. Limits code sharing with the Rust codebase. The interpreter would need to be written in the target language.

**Candidates:**
- **Cairo VM / Stwo**: Cairo is an actual VM (not just a circuit DSL like Noir) — it has a PC, registers, instruction set, and runtime execution that produces a trace. Stwo proves the trace. Proven phone-viable. Native Poseidon2 builtin. Could potentially compile a different source language to Cairo VM bytecode.
- **Miden VM**: Rust-native, stack-based, WASM target. Would need to write kernel logic against Miden's API. Miden targets "edge blockchain" (client-side proving) explicitly.
- **Ligetron**: WASM-native, memory-efficient by design. Could compile our Rust interpreter to WASM and prove directly. Novel proof system (Ligero/MPC-in-the-head).

### What the benchmarks tell us

**Ligetron is the standout result.** 4.9s / 258 MB for the full private_swap kernel
logic with real Poseidon2 hashing, EdDSA signature verification (Baby JubJub), and
Poseidon2 sponge encryption. All constraint validations pass. This is on software
Vulkan (CPU-emulated GPU) — a real phone GPU via WebGPU would be faster.

Ligetron is qualitatively different from the RISC-V backends because it natively
interprets WASM bytecodes with per-opcode constraint generation. There is no
"statically compiled shortcut" — the 4.9s already includes the cost of interpreting
the full WASM binary. The Phase 5 "interpretation overhead" question is partially
answered: Ligetron's native WASM interpretation approach avoids the overhead entirely
by making interpretation and constraint generation the same operation.

**RISC-V backends** (SP1 40-145s, RISC Zero 40s, Jolt 68-87s) measure the crypto +
kernel floor with statically compiled code and no interpreter. They need 10-30 GB RAM.
These are useful server-side baselines but not phone-viable.

**Cairo/Stwo** (11.5s) is the second-fastest and has proven phone-viability at scale
(FibRace), but uses a different language (Cairo) and has higher memory (~3 GB).

**The key open question** is not "which backend is fastest" (Ligetron wins) but rather
"what is the right proving architecture for production" — considering proof composition
(Ligetron's sqrt(N) proofs need SNARK-wrapping), iPhone support (Ligetron excludes iOS),
and the option of building a purpose-built VM.

---

## Remaining Work

### Outstanding issues

1. **Ligetron iPhone exclusion.** README explicitly excludes iOS. WebGPU is available
   in Safari 18.2+ but Dawn/Emscripten may not support iOS Metal. Need to verify
   whether this is a fundamental limitation or a toolchain gap. If iPhones are truly
   excluded, Ligetron cannot be the sole proving path — need a fallback for iOS.

2. **Ligetron proof composition.** Ligero proofs are sqrt(N) sized (~1-10 MB for our
   workload). Need SNARK-wrapping for L1 verification. The Ligero×RISC Zero
   partnership targets this but no code exists yet. Ligetron uses SHA-256 for
   internal Merkle commitments — verifying these in a circuit is ~100x more
   expensive than Poseidon2. A Poseidon2 commitment mode would help enormously.

3. **RISC Zero crypto.** The RISC Zero backend has secp256k1 ECDSA + Poseidon2 sponge
   encryption implemented but has a k256 API compatibility issue on riscv32im
   (NonZeroScalar→Scalar conversion). Low priority fix — RISC Zero is server-only.

4. **No unified test script.** Each backend has its own run command. Need a single
   `run_all.sh` for CI/reproducibility.

### Immediate tasks

#### 1. Ligetron: verify on real phone hardware
- Build Ligetron prover for WebGPU in browser (Emscripten build)
- Test on an Android phone with WebGPU (Chrome)
- Test on an iPhone with Safari WebGPU (verify the iOS exclusion claim)
- Measure: proving time, peak memory, battery impact
- This is the highest-value data point — if 4.9s/258MB on software Vulkan,
  a real phone GPU should be faster

#### 2. Ligetron: proof composition path
- Write a minimal Ligero proof verifier in Rust
- Prove the verifier inside RISC Zero (SHA-256 Merkle checks → native precompile)
- Wrap RISC Zero's STARK in Groth16 for L1 verification
- Measure the end-to-end cost: Ligetron proof → RISC Zero verification proof → Groth16
- Alternative: raise the Poseidon2 commitment mode request with Ligero team

#### 3. Ligetron: full private function execution (not just kernel)
- Currently we prove kernel logic with statically-compiled contract code
- The real test: compile a Brillig/WASM interpreter that runs INSIDE the
  Ligetron guest, loading contract bytecodes dynamically
- Ligetron natively interprets WASM, so this is interpreter-in-interpreter
  (WASM interpreter running inside WASM prover) — measure the overhead
- Alternative: compile private function code directly to WASM (skip Brillig),
  link dynamically at runtime via WASM module imports

#### 4. Custom VM feasibility study (Option B)
- Study Stwo's trace/AIR framework in detail
- Study Cairo VM's AIR constraint definitions (how many rows per opcode?)
- Study Miden VM's chiplet architecture (how are builtins defined?)
- Design a minimal "Aztec Private VM" ISA on paper:
  - What opcodes? (~30-50: arithmetic, hash, EC, emit side effects, call)
  - Stack-based or register-based?
  - What builtins? (Poseidon2, EC scalar-mul, Merkle verify)
  - How many constraint rows per instruction?
- Estimate engineering effort: can we build a prototype in weeks, or is this months?
- Key question: would a custom VM beat Ligetron's 4.9s/258MB? The theoretical
  advantage is smaller proofs (STARK, not Ligero) + no SNARK-wrapping needed.
  The disadvantage is building everything from scratch.

#### 5. Evaluate Ligetron vs custom VM tradeoff
- Ligetron: 4.9s, 258 MB, working NOW, but sqrt(N) proofs + iPhone question
- Custom VM on Stwo: unknown performance, months of work, but STARK proofs
  (small, directly wrappable) + full control
- Cairo/Stwo: 11.5s, ~3 GB, proven on phones, but different language
- Fork Miden VM: closest architecture, but no continuations, alpha quality
- Decision criteria: Is Ligetron's proof composition problem solvable in
  reasonable time? Is the iPhone exclusion a dealbreaker? Is 4.9s fast
  enough even after adding dynamic bytecode interpretation?

### Lower priority

- **RISC Zero k256 fix**: Fix the NonZeroScalar API issue, re-benchmark with
  real ECDSA + encryption. Low impact — RISC Zero is 40s/9.4GB, server-only.
- **Nexus Keccak precompile**: Re-benchmark with actual precompile (not software).
  Low priority given Nexus is far behind.
- **SP1/OpenVM real crypto**: Add ECDSA and encryption to SP1 SHA-256 and
  native Poseidon2 modes. Moderate priority for completeness.
- **Unified test script**: Write `zkvm/run_all.sh` covering all backends.

---

## Engineering Rules

**Read the docs before integrating.** For every new zkVM backend, BEFORE writing any code:
1. Read the official docs/book (quickstart, API, troubleshooting, examples)
2. Search GitHub for external projects that use the zkVM
3. Use scaffolding commands to generate correct project structure
4. Get the official example compiling, proving, and verifying end-to-end
5. Wire in our shared workloads one piece at a time

**Use stable releases.** Always use tagged/versioned releases. If no stable release exists, document and de-prioritize.

**Each backend uses its own best crypto primitives.** BN254 Poseidon2 is NOT required — use whatever hash/EC/encryption is fastest on each backend. SP1 → SHA-256 precompile; RISC Zero → SHA-256 native; Valida → Keccak chip; Cairo → native Poseidon2. The `Precompiles` trait already supports this: `Sp1Sha256Precompiles` maps the Poseidon2 trait calls to SHA-256. The protocol's hash choice is itself a variable being explored. 32-bit VMs are fine if the right precompiles are used. Wrapper structs can bridge big-number representation gaps if needed.

**Shared crates have zero crypto dependencies.** `data-types`, `kernel-logic`, `aztec-sdk`, `test-contracts` depend only on `serde`/`postcard`. All crypto goes through the `Precompiles` trait. Each backend provides its own `Precompiles` impl.

**Guest crates are excluded from the workspace.** They compile with different toolchains and non-standard targets. They declare path dependencies to the shared crates directly.

---

## Dependency Graph

```
Phase 0-1 (shared crates) -- DONE
    |
Phase 2-4 (backend benchmarks — static compilation)
    +-- Ligetron (DONE) ----> 4.9s, 258 MB ★ BEST (full kernel, real crypto)
    +-- Cairo/Stwo (DONE) --> 11.5s, ~3 GB
    +-- RISC Zero (DONE) ---> 40s, 9.4 GB
    +-- SP1 (DONE) ---------> 45-145s, 10-26 GB
    +-- OpenVM (DONE) ------> ~60s
    +-- Jolt (DONE) --------> 68-87s, 27-31 GB
    +-- Nexus (DONE) -------> 125s+ (software Keccak only)
    |
    v
DECISION POINT: Which architecture for production?
    |
    +-- Ligetron path: phone test → proof composition → dynamic bytecodes
    +-- Custom VM path: ISA design → Stwo/Plonky3 integration → prototype
    +-- Hybrid: Ligetron for proving, custom SNARK-wrap, fork for Poseidon2 commitments
    |
    v
Phase 6: End-to-end + phone proving (go/no-go)
```

---

## Verification

```bash
cd zkvm && cargo check && cargo test                                # native
cd zkvm && cargo check --target wasm32-unknown-unknown \
  -p zkvm-data-types -p zkvm-kernel-logic \
  -p zkvm-aztec-sdk -p zkvm-test-contracts                          # no_std compliance
```
