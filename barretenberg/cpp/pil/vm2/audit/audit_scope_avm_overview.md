# AVM Circuit Audit Scope Overview

## Scope Boundaries

The audit covers:
- **PIL constraint files** (`.pil`) -- the source of truth for all relation constraints. These define what constitutes a valid trace.
- **Hand-optimized C++ relations** -- only where they replace auto-generated code (currently `poseidon2_perm`). These must be audited for semantic equivalence to their PIL source.
- **Hand-written AVM assembly** (scope 13) -- the MSM transpiler procedure (`avm-transpiler/src/procedures/`). This is executable code whose correctness the circuit faithfully proves; a bug here means wrong results, not a constraint bypass.

The audit does **not** cover:
- **Test files** (`.test.cpp`) -- listed in each scope doc for reference. These are not auditable artifacts but provide useful context for understanding expected behavior and edge cases.
- **Auto-generated C++ relations** -- these are mechanically produced from PIL by `bb-pilcom`. Each scope doc lists the generated files and asks auditors to confirm they directly reflect the PIL. Full line-by-line review of generated code is not expected; the check is that the generation is faithful.
- **Trace generation** (`tracegen/`) -- the C++ code that populates the trace. Tracegen is the prover's witness generation; bugs here cannot produce invalid proofs (they can only cause valid executions to fail to prove). Tracegen is covered by internal audit.
- **Simulation** (`simulation/`) -- the C++ code that simulates AVM execution and emits events consumed by tracegen. Same reasoning as tracegen.

## Audit Scopes

The AVM circuit audit is organized into 13 layered scopes, each building on prerequisites from earlier scopes. The table below shows the order, scope name, file reference, PIL file count, and approximate PIL line count.

| # | Scope | File | PIL | ~Lines of PIL |
|---|-------|------|-----|---------------|
| 1 | Core Gadgets | [`audit_scope_avm_core.md`](audit_scope_avm_core.md) | 5 | 620 |
| 2 | Poseidon2, Merkle Trees, and Note Hash Tree | [`audit_scope_avm_poseidon_merkle_note_hash.md`](audit_scope_avm_poseidon_merkle_note_hash.md) | 5 | 1,880 + 470 (C++) |
| 3 | All Tree Subtraces | [`audit_scope_avm_all_trees.md`](audit_scope_avm_all_trees.md) | 5 | 670 |
| 4 | Side-Effect Traces | [`audit_scope_avm_side_effects.md`](audit_scope_avm_side_effects.md) | 3 | 300 |
| 5 | Derivations, ECC, and Radix Decomposition | [`audit_scope_avm_derivations_and_ecc.md`](audit_scope_avm_derivations_and_ecc.md) | 5 | 560 |
| 6 | Bytecode Pipeline | [`audit_scope_avm_bytecode.md`](audit_scope_avm_bytecode.md) | 6 | 1,070 |
| 7 | TX Traces and Calldata | [`audit_scope_avm_tx.md`](audit_scope_avm_tx.md) | 5 | 1,090 |
| 8 | Execution, Memory, and Calls | [`audit_scope_avm_execution_and_calls.md`](audit_scope_avm_execution_and_calls.md) | 11 | 1,840 |
| 9 | ALU and Bitwise | [`audit_scope_avm_alu_and_bitwise.md`](audit_scope_avm_alu_and_bitwise.md) | 2 | 500 |
| 10 | Hash Gadgets and Memory-Aware Wrappers | [`audit_scope_avm_hash_gadgets_and_mem_wrappers.md`](audit_scope_avm_hash_gadgets_and_mem_wrappers.md) | 7 | 2,460 |
| 11 | Tree and Side-Effect Opcode Wrappers | [`audit_scope_avm_tree_and_side_effect_opcodes.md`](audit_scope_avm_tree_and_side_effect_opcodes.md) | 8 | 510 |
| 12 | Remaining Opcodes (Data Copy, GetEnvVar) | [`audit_scope_avm_remaining_opcodes.md`](audit_scope_avm_remaining_opcodes.md) | 2 | 390 |
| 13 | MSM Transpiler Procedure | [`audit_scope_avm_msm_procedure.md`](audit_scope_avm_msm_procedure.md) | 0 | 57 instructions |

**Total: 64 PIL files, ~11,900 lines of PIL** across all scopes (some PIL files like `public_inputs.pil` appear in limited scope in multiple audits). Scope 13 covers hand-written AVM assembly (Rust, not PIL). Line counts exclude comments and blank lines.

## Dependency Diagram

The diagram below shows all 64 PIL files organized into their audit scopes, with intra-scope dependencies shown as arrows. Inter-scope dependencies are documented in the [Prerequisite Chains](#prerequisite-chains) table below.

```mermaid
graph TB
    subgraph S1["1. Core Gadgets"]
        s1_pre[precomputed]
        s1_cg[constants_gen]
        s1_rc[range_check]
        s1_gt[gt]
        s1_ffgt[ff_gt]
        s1_pre --> s1_rc
        s1_rc --> s1_gt
        s1_rc --> s1_ffgt
    end

    subgraph S2["2. Poseidon2, Merkle, Note Hash Tree"]
        s2_params[poseidon2_params]
        s2_perm[poseidon2_perm]
        s2_hash[poseidon2_hash]
        s2_merkle[merkle_check]
        s2_nht[note_hash_tree_check]
        s2_params --> s2_perm --> s2_hash --> s2_merkle --> s2_nht
        s2_hash --> s2_nht
    end

    subgraph S4["4. Side-Effect Traces"]
        s4_epl[emit_public_log]
        s4_sl2l1[send_l2_to_l1_msg]
    end

    subgraph S8["8. Execution, Memory, Calls"]
        s8_exec[execution]
        s8_addr[addressing]
        s8_reg[registers]
        s8_gas[gas]
        s8_disc[discard]
        s8_mem[memory]
        s8_ctx[context]
        s8_cstk[context_stack]
        s8_ecall[external_call]
        s8_icstk[internal_call_stack]
        s8_icall[internal_call]
        s8_exec --- s8_addr
        s8_exec --- s8_reg
        s8_exec --- s8_gas
        s8_exec --- s8_disc
        s8_exec --- s8_ctx
        s8_exec --- s8_ecall
        s8_exec --- s8_icall
        s8_cstk --> s8_ctx
        s8_icstk --> s8_icall
    end

    subgraph S9["9. ALU & Bitwise"]
        s9_alu[alu]
        s9_bw[bitwise]
    end

    subgraph S3["3. All Tree Subtraces"]
        s3_idx[indexed_tree_check]
        s3_pdc[public_data_check]
        s3_pds[public_data_squash]
        s3_l1l2[l1_to_l2_message_tree_check]
        s3_pi[public_inputs]
        s3_pds --> s3_pdc
    end

    subgraph S5["5. Derivations, ECC, Radix"]
        s5_ecc[ecc]
        s5_sm[scalar_mul]
        s5_tr[to_radix]
        s5_cid[class_id_derivation]
        s5_addr[address_derivation]
        s5_ecc --> s5_sm
        s5_tr --> s5_sm
        s5_ecc --> s5_addr
        s5_sm --> s5_addr
    end

    subgraph S6["6. Bytecode Pipeline"]
        s6_bcd[bc_decomposition]
        s6_bch[bc_hashing]
        s6_if[instr_fetching]
        s6_uc[update_check]
        s6_cir[contract_instance_retrieval]
        s6_bcr[bc_retrieval]
        s6_bcd --> s6_bch
        s6_bcd --> s6_if
        s6_uc --> s6_cir --> s6_bcr
    end

    subgraph S7["7. TX Traces and Calldata"]
        s7_tx[tx]
        s7_txc[tx_context]
        s7_txd[tx_discard]
        s7_cd[calldata]
        s7_cdh[calldata_hashing]
        s7_cd <--> s7_cdh
        s7_tx --- s7_txc
        s7_tx --- s7_txd
        s7_cdh --> s7_tx
    end

    subgraph S10["10. Hash Gadgets & Mem Wrappers"]
        s10_sha[sha256]
        s10_sham[sha256_mem]
        s10_kec[keccakf1600]
        s10_kecm[keccak_memory]
        s10_p2m[poseidon2_mem]
        s10_eccm[ecc_mem]
        s10_trm[to_radix_mem]
        s10_sha --- s10_sham
        s10_kec --- s10_kecm
    end

    subgraph S11["11. Tree & Side-Effect Opcodes"]
        s11_en[emit_nullifier]
        s11_enh[emit_notehash]
        s11_ne[nullifier_exists]
        s11_nhe[notehash_exists]
        s11_l1l2e[l1_to_l2_msg_exists]
        s11_sl[sload]
        s11_ss[sstore]
        s11_gci[get_contract_instance]
    end

    subgraph S12["12. Remaining Opcodes"]
        s12_dc[data_copy]
        s12_gev[get_env_var]
    end

    subgraph S13["13. MSM Procedure"]
        s13_msm[msm assembly]
    end

    %% Inter-scope dependencies enforce vertical layout
    S1 --> S2
    S1 --> S4
    S1 --> S8
    S2 --> S3
    S2 --> S5
    S3 --> S6
    S5 --> S6
    S3 --> S7
    S1 --> S9
    S8 --> S9
    S5 --> S10
    S8 --> S10
    S9 --> S10
    S6 --> S11
    S8 --> S11
    S7 --> S12
    S8 --> S12
    S5 --> S13
    S8 --> S13
    S9 --> S13
    S10 --> S13
```

**Legend:** Solid arrows (`-->`) indicate a dependency (target depends on source). Undirected links (`---`) indicate virtual gadgets that share rows with the same trace. Bidirectional arrows (`<-->`) indicate mutual lookups between traces. Arrows between scope boxes show inter-scope prerequisites.

## Prerequisite Chains

Each scope lists its direct prerequisites. The full prerequisite chains are:

| Scope | Direct Prerequisites |
|-------|---------------------|
| **1. Core Gadgets** | None |
| **2. Poseidon2, Merkle, NHT** | 1 |
| **3. All Tree Subtraces** | 1, 2 |
| **4. Side-Effect Traces** | 1 |
| **5. Derivations, ECC, Radix** | 1, 2 |
| **6. Bytecode Pipeline** | 1, 2, 3, 5 |
| **7. TX Traces and Calldata** | 1, 2, 3 |
| **8. Execution, Memory, Calls** | 1 |
| **9. ALU and Bitwise** | 1, 8 |
| **10. Hash Gadgets & Mem Wrappers** | 1, 2, 5, 8, 9 |
| **11. Tree & Side-Effect Opcodes** | 1, 2, 3, 6, 8 |
| **12. Remaining Opcodes** | 1, 3, 7, 8 |
| **13. MSM Transpiler Procedure** | 5, 8, 9, 10 |

## Recommended Audit Order

The scopes are numbered in a valid topological order. However, there is parallelism available:

- **Phase 1** (no dependencies): Scope 1
- **Phase 2** (depends on 1): Scopes 2, 4, 8 (can be done in parallel)
- **Phase 3** (depends on 1+2): Scopes 3, 5
- **Phase 4** (depends on 1-3+8): Scopes 6, 7, 9
- **Phase 5** (depends on many): Scopes 10, 11, 12 (can be done in parallel)
- **Phase 6** (depends on 5+8+9+10): Scope 13

## PIL File Coverage

Every PIL file under `barretenberg/cpp/pil/vm2` is covered by exactly one audit scope:

| Scope | PIL Files |
|-------|-----------|
| 1 | `precomputed`, `constants_gen`, `range_check`, `gt`, `ff_gt` |
| 2 | `poseidon2_hash`, `poseidon2_perm`, `poseidon2_params`, `trees/merkle_check`, `trees/note_hash_tree_check`, `public_inputs` (limited) |
| 3 | `trees/indexed_tree_check`, `trees/public_data_check`, `trees/public_data_squash`, `trees/l1_to_l2_message_tree_check`, `public_inputs` |
| 4 | `opcodes/emit_public_log`, `opcodes/send_l2_to_l1_msg`, `public_inputs` (limited) |
| 5 | `ecc`, `scalar_mul`, `to_radix`, `bytecode/class_id_derivation`, `bytecode/address_derivation` |
| 6 | `bytecode/bc_decomposition`, `bytecode/bc_hashing`, `bytecode/instr_fetching`, `bytecode/bc_retrieval`, `bytecode/update_check`, `bytecode/contract_instance_retrieval`, `public_inputs` (limited) |
| 7 | `tx`, `tx_context`, `tx_discard`, `calldata`, `calldata_hashing`, `public_inputs` (limited) |
| 8 | `execution`, `execution/addressing`, `execution/registers`, `execution/gas`, `execution/discard`, `memory`, `context`, `context_stack`, `opcodes/external_call`, `internal_call_stack`, `opcodes/internal_call` |
| 9 | `alu`, `bitwise` |
| 10 | `sha256`, `sha256_mem`, `keccakf1600`, `keccak_memory`, `poseidon2_mem`, `ecc_mem`, `to_radix_mem` |
| 11 | `opcodes/emit_nullifier`, `opcodes/emit_notehash`, `opcodes/nullifier_exists`, `opcodes/notehash_exists`, `opcodes/l1_to_l2_message_exists`, `opcodes/sload`, `opcodes/sstore`, `opcodes/get_contract_instance` |
| 12 | `data_copy`, `opcodes/get_env_var`, `public_inputs` (limited) |
| 13 | _(no PIL files -- covers hand-written AVM assembly in `avm-transpiler/src/procedures/`)_ |

## Reference Documentation

For all scopes, the following reference documentation applies:

1. **[AVM Reference Documentation](../../../../../yarn-project/simulator/docs/avm/README.md)** -- The primary reference for the Aztec Virtual Machine: its purpose, execution model, instruction set, memory model, gas metering, and error handling.

2. **[AVM Circuit Guide](../docs/README.md)** -- Comprehensive guide to the AVM circuit architecture, trace structure, subtraces, and the proving system.

3. **[VM Circuit Recipes](../docs/recipes.md)** -- Standard algebraic patterns and recipes used throughout PIL files (boolean checks, conditional assignment, accumulators, comparisons, etc.).
