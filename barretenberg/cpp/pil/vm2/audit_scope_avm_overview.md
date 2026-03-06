# AVM Circuit Audit Scope Overview

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: `ab47a6e7754a0cc86278fe9d47c9c8884ca6d363` ([link](https://github.com/AztecProtocol/aztec-packages/tree/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363))

## Audit Scopes

The AVM circuit audit is organized into 11 layered scopes, each building on prerequisites from earlier scopes. The table below shows the order, scope name, file reference, PIL file count, C++ item count, and test file count.

| # | Scope | File | PIL | C++ Items | Tests |
|---|-------|------|-----|-----------|-------|
| 1 | Core Components, ALU, and Bitwise | `audit_scope_avm_core_alu_bitwise.md` | 7 | 51 | 22 |
| 2 | Poseidon2, Merkle Trees, and Note Hash Tree | `audit_scope_avm_poseidon_merkle_note_hash.md` | 5 | — | — |
| 3 | All Tree Subtraces | `audit_scope_avm_all_trees.md` | 5 | — | — |
| 4 | Side-Effect Traces | `audit_scope_avm_side_effects.md` | 3 | 14 | 4 |
| 5 | Derivations, ECC, and Radix Decomposition | `audit_scope_avm_derivations_and_ecc.md` | 5 | 36 | 14 |
| 6 | Bytecode Pipeline | `audit_scope_avm_bytecode.md` | 6 | 29 | 14 |
| 7 | TX Traces and Calldata | `audit_scope_avm_tx.md` | 5 | 20 | 8 |
| 8 | Execution, Memory, and Calls | `audit_scope_avm_execution_and_calls.md` | 11 | 45 | 18 |
| 9 | Hash Gadgets and Memory-Aware Wrappers | `audit_scope_avm_hash_gadgets_and_mem_wrappers.md` | 7 | 21 | 7 |
| 10 | Tree and Side-Effect Opcode Wrappers | `audit_scope_avm_tree_and_side_effect_opcodes.md` | 8 | 17 | 8 |
| 11 | Remaining Opcodes (Data Copy, GetEnvVar) | `audit_scope_avm_remaining_opcodes.md` | 2 | 9 | 5 |

**Total: 64 PIL files** across all scopes (some PIL files like `public_inputs.pil` appear in limited scope in multiple audits).

## Dependency Diagram

The diagram below shows all 64 PIL files organized into their audit scopes, with intra-scope dependencies shown as arrows. Inter-scope dependencies are documented in the [Prerequisite Chains](#prerequisite-chains) table below.

```mermaid
graph TB
    subgraph S1["1. Core, ALU, Bitwise"]
        s1_pre[precomputed]
        s1_cg[constants_gen]
        s1_rc[range_check]
        s1_gt[gt]
        s1_ffgt[ff_gt]
        s1_alu[alu]
        s1_bw[bitwise]
        s1_pre --> s1_rc
        s1_rc --> s1_gt
        s1_rc --> s1_ffgt
        s1_rc --> s1_alu
    end

    subgraph S2["2. Poseidon2, Merkle, Note Hash Tree"]
        s2_params[poseidon2_params]
        s2_perm[poseidon2_perm]
        s2_hash[poseidon2_hash]
        s2_merkle[merkle_check]
        s2_nht[note_hash_tree_check]
        s2_params --> s2_perm --> s2_hash --> s2_merkle --> s2_nht
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

    subgraph S3["3. All Tree Subtraces"]
        s3_idx[indexed_tree_check]
        s3_pdc[public_data_check]
        s3_pds[public_data_squash]
        s3_l1l2[l1_to_l2_message_tree_check]
        s3_pi[public_inputs]
        s3_pdc --> s3_pds
    end

    subgraph S5["5. Derivations, ECC, Radix"]
        s5_ecc[ecc]
        s5_sm[scalar_mul]
        s5_tr[to_radix]
        s5_cid[class_id_derivation]
        s5_addr[address_derivation]
        s5_ecc --> s5_sm
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
    end

    subgraph S9["9. Hash Gadgets & Mem Wrappers"]
        s9_sha[sha256]
        s9_sham[sha256_mem]
        s9_kec[keccakf1600]
        s9_kecm[keccak_memory]
        s9_p2m[poseidon2_mem]
        s9_eccm[ecc_mem]
        s9_trm[to_radix_mem]
        s9_sha --- s9_sham
        s9_kec --- s9_kecm
    end

    subgraph S10["10. Tree & Side-Effect Opcodes"]
        s10_en[emit_nullifier]
        s10_enh[emit_notehash]
        s10_ne[nullifier_exists]
        s10_nhe[notehash_exists]
        s10_l1l2e[l1_to_l2_msg_exists]
        s10_sl[sload]
        s10_ss[sstore]
        s10_gci[get_contract_instance]
    end

    subgraph S11["11. Remaining Opcodes"]
        s11_dc[data_copy]
        s11_gev[get_env_var]
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
    S5 --> S9
    S8 --> S9
    S6 --> S10
    S8 --> S10
    S7 --> S11
    S8 --> S11
```

**Legend:** Solid arrows (`-->`) indicate a dependency (target depends on source). Undirected links (`---`) indicate virtual gadgets that share rows with the same trace. Bidirectional arrows (`<-->`) indicate mutual lookups between traces. Arrows between scope boxes show inter-scope prerequisites.

## Prerequisite Chains

Each scope lists its direct prerequisites. The full prerequisite chains are:

| Scope | Direct Prerequisites |
|-------|---------------------|
| **1. Core, ALU, Bitwise** | None |
| **2. Poseidon2, Merkle, NHT** | 1 |
| **3. All Tree Subtraces** | 1, 2 |
| **4. Side-Effect Traces** | 1 |
| **5. Derivations, ECC, Radix** | 1, 2 |
| **6. Bytecode Pipeline** | 1, 2, 3, 4 |
| **7. TX Traces and Calldata** | 1, 2, 3 |
| **8. Execution, Memory, Calls** | 1 |
| **9. Hash Gadgets & Mem Wrappers** | 1, 2, 5, 8 |
| **10. Tree & Side-Effect Opcodes** | 1, 2, 3, 6, 8 |
| **11. Remaining Opcodes** | 1, 3, 7, 8 |

## Recommended Audit Order

The scopes are numbered in a valid topological order. However, there is parallelism available:

- **Phase 1** (no dependencies): Scope 1
- **Phase 2** (depends on 1): Scopes 2, 4, 8 (can be done in parallel)
- **Phase 3** (depends on 1+2): Scopes 3, 5
- **Phase 4** (depends on 1-3): Scopes 6, 7
- **Phase 5** (depends on many): Scopes 9, 10, 11 (can be done in parallel)

## PIL File Coverage

Every PIL file under `barretenberg/cpp/pil/vm2` is covered by exactly one audit scope:

| Scope | PIL Files |
|-------|-----------|
| 1 | `precomputed`, `constants_gen`, `range_check`, `gt`, `ff_gt`, `alu`, `bitwise` |
| 2 | `poseidon2_hash`, `poseidon2_perm`, `poseidon2_params`, `trees/merkle_check`, `trees/note_hash_tree_check` |
| 3 | `trees/indexed_tree_check`, `trees/public_data_check`, `trees/public_data_squash`, `trees/l1_to_l2_message_tree_check`, `public_inputs` |
| 4 | `opcodes/emit_public_log`, `opcodes/send_l2_to_l1_msg`, `public_inputs` (limited) |
| 5 | `ecc`, `scalar_mul`, `to_radix`, `bytecode/class_id_derivation`, `bytecode/address_derivation` |
| 6 | `bytecode/bc_decomposition`, `bytecode/bc_hashing`, `bytecode/instr_fetching`, `bytecode/bc_retrieval`, `bytecode/update_check`, `bytecode/contract_instance_retrieval` |
| 7 | `tx`, `tx_context`, `tx_discard`, `calldata`, `calldata_hashing` |
| 8 | `execution`, `execution/addressing`, `execution/registers`, `execution/gas`, `execution/discard`, `memory`, `context`, `context_stack`, `opcodes/external_call`, `internal_call_stack`, `opcodes/internal_call` |
| 9 | `sha256`, `sha256_mem`, `keccakf1600`, `keccak_memory`, `poseidon2_mem`, `ecc_mem`, `to_radix_mem` |
| 10 | `opcodes/emit_nullifier`, `opcodes/emit_notehash`, `opcodes/nullifier_exists`, `opcodes/notehash_exists`, `opcodes/l1_to_l2_message_exists`, `opcodes/sload`, `opcodes/sstore`, `opcodes/get_contract_instance` |
| 11 | `data_copy`, `opcodes/get_env_var` |

## Reference Documentation

For all scopes, the following reference documentation applies:

1. **[AVM Reference Documentation](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/yarn-project/simulator/docs/avm/README.md)** -- The primary reference for the Aztec Virtual Machine: its purpose, execution model, instruction set, memory model, gas metering, and error handling.

2. **[AVM Circuit Guide](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/barretenberg/cpp/pil/vm2/docs/README.md)** -- Comprehensive guide to the AVM circuit architecture, trace structure, subtraces, and the proving system.

3. **[VM Circuit Recipes](https://github.com/AztecProtocol/aztec-packages/blob/ab47a6e7754a0cc86278fe9d47c9c8884ca6d363/barretenberg/cpp/pil/vm2/docs/recipes.md)** -- Standard algebraic patterns and recipes used throughout PIL files (boolean checks, conditional assignment, accumulators, comparisons, etc.).
