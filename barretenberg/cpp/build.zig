const std = @import("std");
const builtin = @import("builtin");

const Platform = struct {
    arch: std.Target.Cpu.Arch,
    os: std.Target.Os.Tag,
    name: []const u8,
};

const platforms = [_]Platform{
    .{ .arch = .x86_64, .os = .linux, .name = "x86_64-linux" },
    .{ .arch = .aarch64, .os = .linux, .name = "aarch64-linux" },
    .{ .arch = .x86_64, .os = .macos, .name = "x86_64-macos" },
    .{ .arch = .aarch64, .os = .macos, .name = "aarch64-macos" },
    .{ .arch = .x86_64, .os = .windows, .name = "x86_64-windows" },
    .{ .arch = .aarch64, .os = .windows, .name = "aarch64-windows" },
    .{ .arch = .wasm32, .os = .wasi, .name = "wasm32-wasi" },
};

const common_flags = [_][]const u8{
    "-std=c++20",
    "-fPIC",
    "-fno-sanitize=undefined",
    "-Wno-unused-function",
    "-Wno-unused-variable",
    "-Wno-unused-parameter",
    "-Wno-missing-field-initializers",
    "-DNO_PAR_ALGOS",
    "-fbracket-depth=1024",
};

const no_avm_flags = common_flags ++ [_][]const u8{
    "-DDISABLE_AZTEC_VM=1",
};

const wasm_flags = no_avm_flags ++ [_][]const u8{
    "-DDISABLE_ADX",
    "-DDISABLE_ASM",
    "-D_WASI_EMULATED_PROCESS_CLOCKS",
    "-DBB_NO_EXCEPTIONS",
    "-D_LIBCPP_NO_FILESYSTEM",
    "-fno-exceptions",
};

// Core source files - essential barretenberg functionality
const core_sources = [_][]const u8{
    // Numeric foundations
    "src/barretenberg/numeric/random/engine.cpp",
    "src/barretenberg/numeric/uintx/uintx.cpp",

    // Polynomials
    "src/barretenberg/polynomials/polynomial.cpp",
    "src/barretenberg/polynomials/backing_memory.cpp",
    "src/barretenberg/polynomials/evaluation_domain.cpp",
    "src/barretenberg/polynomials/polynomial_arithmetic.cpp",

    // ECC
    "src/barretenberg/ecc/curves/bn254/c_bind.cpp",
    "src/barretenberg/ecc/curves/grumpkin/c_bind.cpp",
    "src/barretenberg/ecc/curves/secp256k1/c_bind.cpp",
    "src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.cpp",
    "src/barretenberg/ecc/scalar_multiplication/process_buckets.cpp",
    "src/barretenberg/ecc/batched_affine_addition/batched_affine_addition.cpp",
    "src/barretenberg/ecc/fields/field_conversion.cpp",

    // Crypto primitives
    "src/barretenberg/crypto/aes128/aes128.cpp",
    "src/barretenberg/crypto/aes128/c_bind.cpp",
    "src/barretenberg/crypto/blake2s/blake2s.cpp",
    "src/barretenberg/crypto/blake2s/c_bind.cpp",
    "src/barretenberg/crypto/blake3s/c_bind.cpp",
    "src/barretenberg/crypto/blake3s_full/blake3s.cpp",
    "src/barretenberg/crypto/ecdsa/c_bind.cpp",
    "src/barretenberg/crypto/keccak/keccak.cpp",
    "src/barretenberg/crypto/keccak/keccakf1600.cpp",
    "src/barretenberg/crypto/pedersen_commitment/c_bind.cpp",
    "src/barretenberg/crypto/pedersen_commitment/pedersen.cpp",
    "src/barretenberg/crypto/pedersen_hash/c_bind.cpp",
    "src/barretenberg/crypto/pedersen_hash/pedersen.cpp",
    "src/barretenberg/crypto/poseidon2/c_bind.cpp",
    "src/barretenberg/crypto/poseidon2/poseidon2.cpp",
    "src/barretenberg/crypto/schnorr/c_bind.cpp",
    "src/barretenberg/crypto/sha256/c_bind.cpp",
    "src/barretenberg/crypto/sha256/sha256.cpp",

    // Circuit builders
    "src/barretenberg/stdlib_circuit_builders/circuit_builder_base.cpp",
    "src/barretenberg/stdlib_circuit_builders/mega_circuit_builder.cpp",
    "src/barretenberg/stdlib_circuit_builders/ultra_circuit_builder.cpp",
    "src/barretenberg/stdlib_circuit_builders/rom_ram_logic.cpp",
    "src/barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.cpp",
    "src/barretenberg/stdlib_circuit_builders/plookup_tables/non_native_group_generator.cpp",
    "src/barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.cpp",

    // SRS (basic bindings and memory factories only for WASM)
    "src/barretenberg/srs/c_bind.cpp",
    "src/barretenberg/srs/global_crs.cpp",
    "src/barretenberg/srs/factories/mem_bn254_crs_factory.cpp",
    "src/barretenberg/srs/factories/mem_grumpkin_crs_factory.cpp",
    "src/barretenberg/srs/factories/native_crs_factory.cpp",
    "src/barretenberg/srs/factories/get_bn254_crs.cpp",
    "src/barretenberg/srs/factories/get_grumpkin_crs.cpp",

    // Common utilities
    "src/barretenberg/common/c_bind.cpp",
    "src/barretenberg/common/thread.cpp",
    "src/barretenberg/common/thread_pool.cpp",
    "src/barretenberg/common/bb_bench.cpp",
    "src/barretenberg/common/bbmalloc.cpp",
    "src/barretenberg/common/debug_log.cpp",
    "src/barretenberg/common/log.cpp",
    "src/barretenberg/common/parallel_for_queued.cpp",
    "src/barretenberg/common/parallel_for_atomic_pool.cpp",
    "src/barretenberg/common/parallel_for_mutex_pool.cpp",
    "src/barretenberg/common/parallel_for_spawning.cpp",
    "src/barretenberg/common/parallel_for_omp.cpp",
    "src/barretenberg/common/slab_allocator.cpp",
    "src/barretenberg/common/std_string.cpp",
    "src/barretenberg/common/utils.cpp",
    "src/barretenberg/common/msgpack_to_json.cpp",
    "src/barretenberg/common/tracy_mem/overload_operator_new.cpp",

    // Transcript
    "src/barretenberg/transcript/origin_tag.cpp",
    "src/barretenberg/transcript/transcript.cpp",

    // Goblin
    "src/barretenberg/goblin/goblin.cpp",

    // Translator VM
    "src/barretenberg/translator_vm/translator_circuit_builder.cpp",
    "src/barretenberg/translator_vm/translator_prover.cpp",
    "src/barretenberg/translator_vm/translator_proving_key.cpp",
    "src/barretenberg/translator_vm/translator_verifier.cpp",

    // Ultra Honk
    "src/barretenberg/ultra_honk/oink_prover.cpp",
    "src/barretenberg/ultra_honk/oink_verifier.cpp",
    "src/barretenberg/ultra_honk/ultra_prover.cpp",
    "src/barretenberg/ultra_honk/ultra_verifier.cpp",
    "src/barretenberg/ultra_honk/prover_instance.cpp",
    "src/barretenberg/ultra_honk/witness_computation.cpp",
    "src/barretenberg/ultra_honk/decider_prover.cpp",
    "src/barretenberg/ultra_honk/decider_verifier.cpp",
    "src/barretenberg/ultra_honk/merge_prover.cpp",
    "src/barretenberg/ultra_honk/merge_verifier.cpp",

    // Sumcheck
    "src/barretenberg/sumcheck/sumcheck.cpp",

    // Commitment schemes
    "src/barretenberg/commitment_schemes/gemini/gemini.cpp",
    "src/barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.cpp",

    // ECCVM
    "src/barretenberg/eccvm/eccvm_prover.cpp",
    "src/barretenberg/eccvm/eccvm_verifier.cpp",
    "src/barretenberg/eccvm/eccvm_trace_checker.cpp",

    // DSL/ACIR
    "src/barretenberg/dsl/acir_format/acir_format.cpp",
    "src/barretenberg/dsl/acir_format/acir_format_mocks.cpp",
    "src/barretenberg/dsl/acir_format/acir_to_constraint_buf.cpp",
    "src/barretenberg/dsl/acir_format/aes128_constraint.cpp",
    "src/barretenberg/dsl/acir_format/avm2_recursion_constraint.cpp",
    "src/barretenberg/dsl/acir_format/blake2s_constraint.cpp",
    "src/barretenberg/dsl/acir_format/blake3_constraint.cpp",
    "src/barretenberg/dsl/acir_format/block_constraint.cpp",
    "src/barretenberg/dsl/acir_format/civc_recursion_constraints.cpp",
    "src/barretenberg/dsl/acir_format/ec_operations.cpp",
    "src/barretenberg/dsl/acir_format/ecdsa_constraints.cpp",
    "src/barretenberg/dsl/acir_format/honk_recursion_constraint.cpp",
    "src/barretenberg/dsl/acir_format/keccak_constraint.cpp",
    "src/barretenberg/dsl/acir_format/logic_constraint.cpp",
    "src/barretenberg/dsl/acir_format/mock_verifier_inputs.cpp",
    "src/barretenberg/dsl/acir_format/multi_scalar_mul.cpp",
    "src/barretenberg/dsl/acir_format/pg_recursion_constraint.cpp",
    "src/barretenberg/dsl/acir_format/poseidon2_constraint.cpp",
    "src/barretenberg/dsl/acir_format/recursion_constraint.cpp",
    "src/barretenberg/dsl/acir_format/round.cpp",
    "src/barretenberg/dsl/acir_format/sha256_constraint.cpp",
    "src/barretenberg/dsl/acir_format/witness_constant.cpp",
    "src/barretenberg/dsl/acir_proofs/c_bind.cpp",

    // BB API
    "src/barretenberg/bbapi/bbapi_execute.cpp",
    "src/barretenberg/bbapi/c_bind.cpp",
    "src/barretenberg/bbapi/bbapi_client_ivc.cpp",
    "src/barretenberg/bbapi/bbapi_ultra_honk.cpp",

    // Client IVC files
    "src/barretenberg/client_ivc/client_ivc.cpp",
    "src/barretenberg/client_ivc/private_execution_steps.cpp",

    // Stdlib - essential circuit building blocks
    "src/barretenberg/stdlib/primitives/field/field.cpp",
    "src/barretenberg/stdlib/primitives/field/field_conversion.cpp",
    "src/barretenberg/stdlib/primitives/bool/bool.cpp",
    "src/barretenberg/stdlib/primitives/byte_array/byte_array.cpp",
    "src/barretenberg/stdlib/primitives/bigfield/bigfield_bn254.cpp",
    "src/barretenberg/stdlib/primitives/bigfield/bigfield_secp256k1.cpp",
    "src/barretenberg/stdlib/primitives/bigfield/bigfield_secp256r1.cpp",
    "src/barretenberg/stdlib/primitives/databus/databus.cpp",
    "src/barretenberg/stdlib/primitives/group/cycle_group.cpp",
    "src/barretenberg/stdlib/primitives/group/cycle_scalar.cpp",
    "src/barretenberg/stdlib/primitives/group/straus_lookup_table.cpp",
    "src/barretenberg/stdlib/primitives/group/straus_scalar_slice.cpp",
    "src/barretenberg/stdlib/primitives/logic/logic.cpp",
    "src/barretenberg/stdlib/primitives/memory/ram_table.cpp",
    "src/barretenberg/stdlib/primitives/memory/twin_rom_table.cpp",
    "src/barretenberg/stdlib/primitives/memory/dynamic_array.cpp",
    "src/barretenberg/stdlib/primitives/memory/rom_table.cpp",
    "src/barretenberg/stdlib/primitives/plookup/plookup.cpp",
    "src/barretenberg/stdlib/primitives/safe_uint/safe_uint.cpp",

    // Stdlib hash functions
    "src/barretenberg/stdlib/hash/blake2s/blake2s.cpp",
    "src/barretenberg/stdlib/hash/blake3s/blake3s.cpp",
    "src/barretenberg/stdlib/hash/keccak/keccak.cpp",
    "src/barretenberg/stdlib/hash/pedersen/pedersen.cpp",
    "src/barretenberg/stdlib/hash/poseidon2/poseidon2.cpp",
    "src/barretenberg/stdlib/hash/poseidon2/poseidon2_permutation.cpp",
    "src/barretenberg/stdlib/hash/sha256/sha256.cpp",

    // Stdlib encryption
    "src/barretenberg/stdlib/encryption/aes128/aes128.cpp",
    "src/barretenberg/stdlib/encryption/schnorr/schnorr.cpp",

    // Stdlib commitment
    "src/barretenberg/stdlib/commitment/pedersen/pedersen.cpp",

    // Stdlib transcript
    "src/barretenberg/stdlib/transcript/transcript.cpp",

    // Stdlib verifiers
    "src/barretenberg/stdlib/honk_verifier/decider_recursive_verifier.cpp",
    "src/barretenberg/stdlib/honk_verifier/oink_recursive_verifier.cpp",
    "src/barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.cpp",
    "src/barretenberg/stdlib/protogalaxy_verifier/protogalaxy_recursive_verifier.cpp",
    "src/barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.cpp",
    "src/barretenberg/stdlib/eccvm_verifier/eccvm_recursive_verifier.cpp",
    "src/barretenberg/stdlib/eccvm_verifier/ecc_bools_relation.cpp",
    "src/barretenberg/stdlib/eccvm_verifier/ecc_lookup_relation.cpp",
    "src/barretenberg/stdlib/eccvm_verifier/ecc_msm_relation.cpp",
    "src/barretenberg/stdlib/eccvm_verifier/ecc_point_table_relation.cpp",
    "src/barretenberg/stdlib/eccvm_verifier/ecc_set_relation.cpp",
    "src/barretenberg/stdlib/eccvm_verifier/ecc_transcript_relation.cpp",
    "src/barretenberg/stdlib/eccvm_verifier/ecc_wnaf_relation.cpp",
    "src/barretenberg/stdlib/goblin_verifier/goblin_recursive_verifier.cpp",
    "src/barretenberg/stdlib/merge_verifier/merge_recursive_verifier.cpp",
    "src/barretenberg/stdlib/translator_vm_verifier/translator_recursive_verifier.cpp",
    "src/barretenberg/stdlib/translator_vm_verifier/translator_decomposition_relation_ultra.cpp",
    "src/barretenberg/stdlib/translator_vm_verifier/translator_delta_range_constraint_relation.cpp",
    "src/barretenberg/stdlib/translator_vm_verifier/translator_extra_relations.cpp",
    "src/barretenberg/stdlib/translator_vm_verifier/translator_non_native_field_relation.cpp",
    "src/barretenberg/stdlib/translator_vm_verifier/translator_permutation_relation.cpp",

    // Relations (needed for verifiers)
    "src/barretenberg/relations/ecc_vm/ecc_bools_relation.cpp",
    "src/barretenberg/relations/ecc_vm/ecc_lookup_relation.cpp",
    "src/barretenberg/relations/ecc_vm/ecc_msm_relation.cpp",
    "src/barretenberg/relations/ecc_vm/ecc_point_table_relation.cpp",
    "src/barretenberg/relations/ecc_vm/ecc_set_relation.cpp",
    "src/barretenberg/relations/ecc_vm/ecc_transcript_relation.cpp",
    "src/barretenberg/relations/ecc_vm/ecc_wnaf_relation.cpp",
    "src/barretenberg/relations/translator_vm/translator_decomposition_relation_2.cpp",
    "src/barretenberg/relations/translator_vm/translator_delta_range_constraint_relation.cpp",
    "src/barretenberg/relations/translator_vm/translator_extra_relations.cpp",
    "src/barretenberg/relations/translator_vm/translator_decomposition_relation_1.cpp",
    "src/barretenberg/relations/translator_vm/translator_non_native_field_relation.cpp",
    "src/barretenberg/relations/translator_vm/translator_permutation_relation.cpp",

    // API files
    "src/barretenberg/api/acir_format_getters.cpp",
    "src/barretenberg/api/api_ultra_honk.cpp",
    "src/barretenberg/api/api_client_ivc.cpp",
    "src/barretenberg/api/prove_tube.cpp",
    "src/barretenberg/api/api_avm.cpp",

    // CLI functionality
    "src/barretenberg/bb/cli.cpp",

    // Other essentials
    "src/barretenberg/trace_to_polynomials/trace_to_polynomials.cpp",
    // "src/barretenberg/op_queue/ecc_op_queue.cpp",
    // "src/barretenberg/boomerang_value_detection/graph.cpp",
    // "src/barretenberg/circuit_checker/ultra_circuit_checker.cpp",
    // "src/barretenberg/circuit_checker/translator_circuit_checker.cpp",
    // "src/barretenberg/flavor/flavor.cpp",
    // "src/barretenberg/honk/utils/testing.cpp",
    // "src/barretenberg/honk/relation_checker.cpp",
    // "src/barretenberg/honk/prover_instance_inspector.cpp",
    "src/barretenberg/protogalaxy/protogalaxy_prover_mega.cpp",
    "src/barretenberg/protogalaxy/protogalaxy_verifier.cpp",
    // "src/barretenberg/ext/starknet/crypto/poseidon/poseidon.cpp",
};

const world_state_sources = [_][]const u8{
    // LMDB library wrapper
    "src/barretenberg/lmdblib/lmdb_db_transaction.cpp",
    "src/barretenberg/lmdblib/lmdb_environment.cpp",
    "src/barretenberg/lmdblib/lmdb_helpers.cpp",
    "src/barretenberg/lmdblib/lmdb_read_transaction.cpp",
    "src/barretenberg/lmdblib/lmdb_store.cpp",
    "src/barretenberg/lmdblib/lmdb_store_base.cpp",
    "src/barretenberg/lmdblib/lmdb_transaction.cpp",
    "src/barretenberg/lmdblib/lmdb_write_transaction.cpp",
    "src/barretenberg/lmdblib/lmdb_cursor.cpp",
    "src/barretenberg/lmdblib/lmdb_database.cpp",
    "src/barretenberg/lmdblib/queries.cpp",

    // Merkle trees
    "src/barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.cpp",
    "src/barretenberg/crypto/merkle_tree/nullifier_tree/nullifier_tree.cpp",

    // World state
    "src/barretenberg/world_state/types.cpp",
    "src/barretenberg/world_state/world_state.cpp",
};
// _ = world_state_sources;

// Environment-specific files
const env_sources = [_][]const u8{
    "src/barretenberg/env/logstr.cpp",
    "src/barretenberg/env/hardware_concurrency.cpp",
    "src/barretenberg/env/throw_or_abort_impl.cpp",
    "src/barretenberg/env/data_store.cpp",
};

// AVM sources
const avm_sources = [_][]const u8{
    "src/barretenberg/vm2/avm_api.cpp",
    "src/barretenberg/vm2/common/avm_inputs.cpp",
    "src/barretenberg/vm2/common/gas.cpp",
    "src/barretenberg/vm2/common/instruction_spec.cpp",
    "src/barretenberg/vm2/common/opcodes.cpp",
    "src/barretenberg/vm2/common/stringify.cpp",
    "src/barretenberg/vm2/common/tagged_value.cpp",
    "src/barretenberg/vm2/common/to_radix.cpp",
    "src/barretenberg/vm2/constraining/check_circuit.cpp",
    "src/barretenberg/vm2/constraining/flavor.cpp",
    "src/barretenberg/vm2/constraining/full_row.cpp",
    "src/barretenberg/vm2/constraining/polynomials.cpp",
    "src/barretenberg/vm2/constraining/prover.cpp",
    "src/barretenberg/vm2/constraining/recursion/recursive_verifier.cpp",
    "src/barretenberg/vm2/constraining/verifier.cpp",
    "src/barretenberg/vm2/generated/relations/address_derivation.cpp",
    "src/barretenberg/vm2/generated/relations/addressing.cpp",
    "src/barretenberg/vm2/generated/relations/alu.cpp",
    "src/barretenberg/vm2/generated/relations/bc_decomposition.cpp",
    "src/barretenberg/vm2/generated/relations/bc_hashing.cpp",
    "src/barretenberg/vm2/generated/relations/bc_retrieval.cpp",
    "src/barretenberg/vm2/generated/relations/bitwise.cpp",
    "src/barretenberg/vm2/generated/relations/calldata.cpp",
    "src/barretenberg/vm2/generated/relations/calldata_hashing.cpp",
    "src/barretenberg/vm2/generated/relations/class_id_derivation.cpp",
    "src/barretenberg/vm2/generated/relations/context.cpp",
    "src/barretenberg/vm2/generated/relations/context_stack.cpp",
    "src/barretenberg/vm2/generated/relations/contract_instance_retrieval.cpp",
    "src/barretenberg/vm2/generated/relations/data_copy.cpp",
    "src/barretenberg/vm2/generated/relations/discard.cpp",
    "src/barretenberg/vm2/generated/relations/ecc.cpp",
    "src/barretenberg/vm2/generated/relations/ecc_mem.cpp",
    "src/barretenberg/vm2/generated/relations/emit_notehash.cpp",
    "src/barretenberg/vm2/generated/relations/emit_nullifier.cpp",
    "src/barretenberg/vm2/generated/relations/emit_unencrypted_log.cpp",
    "src/barretenberg/vm2/generated/relations/execution.cpp",
    "src/barretenberg/vm2/generated/relations/external_call.cpp",
    "src/barretenberg/vm2/generated/relations/ff_gt.cpp",
    "src/barretenberg/vm2/generated/relations/gas.cpp",
    "src/barretenberg/vm2/generated/relations/get_contract_instance.cpp",
    "src/barretenberg/vm2/generated/relations/get_env_var.cpp",
    "src/barretenberg/vm2/generated/relations/gt.cpp",
    "src/barretenberg/vm2/generated/relations/instr_fetching.cpp",
    "src/barretenberg/vm2/generated/relations/internal_call.cpp",
    "src/barretenberg/vm2/generated/relations/internal_call_stack.cpp",
    "src/barretenberg/vm2/generated/relations/keccak_memory.cpp",
    "src/barretenberg/vm2/generated/relations/keccakf1600.cpp",
    "src/barretenberg/vm2/generated/relations/l1_to_l2_message_exists.cpp",
    "src/barretenberg/vm2/generated/relations/l1_to_l2_message_tree_check.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_address_derivation.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_addressing.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_alu.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_bc_decomposition.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_bc_hashing.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_bc_retrieval.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_bitwise.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_calldata_hashing.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_class_id_derivation.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_context.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_contract_instance_retrieval.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_data_copy.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_ecc_mem.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_emit_notehash.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_emit_nullifier.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_emit_unencrypted_log.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_execution.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_external_call.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_ff_gt.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_gas.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_get_contract_instance.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_get_env_var.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_gt.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_instr_fetching.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_internal_call.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_keccakf1600.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_l1_to_l2_message_exists.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_l1_to_l2_message_tree_check.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_memory.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_merkle_check.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_note_hash_tree_check.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_notehash_exists.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_nullifier_check.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_nullifier_exists.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_poseidon2_hash.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_poseidon2_mem.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_protocol_contract.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_public_data_check.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_range_check.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_retrieved_bytecodes_tree_check.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_scalar_mul.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_send_l2_to_l1_msg.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_sha256.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_sha256_mem.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_sload.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_sstore.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_to_radix.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_to_radix_mem.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_tx.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_tx_context.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_update_check.cpp",
    "src/barretenberg/vm2/generated/relations/lookups_written_public_data_slots_tree_check.cpp",
    "src/barretenberg/vm2/generated/relations/memory.cpp",
    "src/barretenberg/vm2/generated/relations/merkle_check.cpp",
    "src/barretenberg/vm2/generated/relations/note_hash_tree_check.cpp",
    "src/barretenberg/vm2/generated/relations/notehash_exists.cpp",
    "src/barretenberg/vm2/generated/relations/nullifier_check.cpp",
    "src/barretenberg/vm2/generated/relations/nullifier_exists.cpp",
    "src/barretenberg/vm2/generated/relations/poseidon2_hash.cpp",
    "src/barretenberg/vm2/generated/relations/poseidon2_mem.cpp",
    "src/barretenberg/vm2/generated/relations/protocol_contract.cpp",
    "src/barretenberg/vm2/generated/relations/public_data_check.cpp",
    "src/barretenberg/vm2/generated/relations/public_data_squash.cpp",
    "src/barretenberg/vm2/generated/relations/range_check.cpp",
    "src/barretenberg/vm2/generated/relations/registers.cpp",
    "src/barretenberg/vm2/generated/relations/retrieved_bytecodes_tree_check.cpp",
    "src/barretenberg/vm2/generated/relations/scalar_mul.cpp",
    "src/barretenberg/vm2/generated/relations/send_l2_to_l1_msg.cpp",
    "src/barretenberg/vm2/generated/relations/sha256.cpp",
    "src/barretenberg/vm2/generated/relations/sha256_mem.cpp",
    "src/barretenberg/vm2/generated/relations/sload.cpp",
    "src/barretenberg/vm2/generated/relations/sstore.cpp",
    "src/barretenberg/vm2/generated/relations/to_radix.cpp",
    "src/barretenberg/vm2/generated/relations/to_radix_mem.cpp",
    "src/barretenberg/vm2/generated/relations/tx.cpp",
    "src/barretenberg/vm2/generated/relations/tx_context.cpp",
    "src/barretenberg/vm2/generated/relations/tx_discard.cpp",
    "src/barretenberg/vm2/generated/relations/update_check.cpp",
    "src/barretenberg/vm2/generated/relations/written_public_data_slots_tree_check.cpp",
    "src/barretenberg/vm2/optimized/relations/poseidon2_perm.cpp",
    "src/barretenberg/vm2/proving_helper.cpp",
    "src/barretenberg/vm2/simulation/address_derivation.cpp",
    "src/barretenberg/vm2/simulation/addressing.cpp",
    "src/barretenberg/vm2/simulation/alu.cpp",
    "src/barretenberg/vm2/simulation/bitwise.cpp",
    "src/barretenberg/vm2/simulation/bytecode_hashing.cpp",
    "src/barretenberg/vm2/simulation/bytecode_manager.cpp",
    "src/barretenberg/vm2/simulation/calldata_hashing.cpp",
    "src/barretenberg/vm2/simulation/class_id_derivation.cpp",
    "src/barretenberg/vm2/simulation/concrete_dbs.cpp",
    "src/barretenberg/vm2/simulation/context.cpp",
    "src/barretenberg/vm2/simulation/context_provider.cpp",
    "src/barretenberg/vm2/simulation/contract_instance_manager.cpp",
    "src/barretenberg/vm2/simulation/data_copy.cpp",
    "src/barretenberg/vm2/simulation/ecc.cpp",
    "src/barretenberg/vm2/simulation/emit_unencrypted_log.cpp",
    "src/barretenberg/vm2/simulation/events/memory_event.cpp",
    "src/barretenberg/vm2/simulation/execution.cpp",
    "src/barretenberg/vm2/simulation/execution_components.cpp",
    "src/barretenberg/vm2/simulation/field_gt.cpp",
    "src/barretenberg/vm2/simulation/gas_tracker.cpp",
    "src/barretenberg/vm2/simulation/get_contract_instance.cpp",
    "src/barretenberg/vm2/simulation/gt.cpp",
    "src/barretenberg/vm2/simulation/internal_call_stack_manager.cpp",
    "src/barretenberg/vm2/simulation/keccakf1600.cpp",
    "src/barretenberg/vm2/simulation/l1_to_l2_message_tree_check.cpp",
    "src/barretenberg/vm2/simulation/lib/contract_crypto.cpp",
    "src/barretenberg/vm2/simulation/lib/merkle.cpp",
    "src/barretenberg/vm2/simulation/lib/protocol_contract_tree.cpp",
    "src/barretenberg/vm2/simulation/lib/raw_data_dbs.cpp",
    "src/barretenberg/vm2/simulation/lib/retrieved_bytecodes_tree.cpp",
    "src/barretenberg/vm2/simulation/lib/serialization.cpp",
    "src/barretenberg/vm2/simulation/lib/sha256_compression.cpp",
    "src/barretenberg/vm2/simulation/lib/uint_decomposition.cpp",
    "src/barretenberg/vm2/simulation/lib/written_slots_tree.cpp",
    "src/barretenberg/vm2/simulation/memory.cpp",
    "src/barretenberg/vm2/simulation/merkle_check.cpp",
    "src/barretenberg/vm2/simulation/note_hash_tree_check.cpp",
    "src/barretenberg/vm2/simulation/nullifier_tree_check.cpp",
    "src/barretenberg/vm2/simulation/poseidon2.cpp",
    "src/barretenberg/vm2/simulation/protocol_contracts.cpp",
    "src/barretenberg/vm2/simulation/public_data_tree_check.cpp",
    "src/barretenberg/vm2/simulation/range_check.cpp",
    "src/barretenberg/vm2/simulation/retrieved_bytecodes_tree_check.cpp",
    "src/barretenberg/vm2/simulation/sha256.cpp",
    "src/barretenberg/vm2/simulation/siloing.cpp",
    "src/barretenberg/vm2/simulation/to_radix.cpp",
    "src/barretenberg/vm2/simulation/tx_execution.cpp",
    "src/barretenberg/vm2/simulation/update_check.cpp",
    "src/barretenberg/vm2/simulation/written_public_data_slots_tree_check.cpp",
    "src/barretenberg/vm2/simulation_helper.cpp",
    "src/barretenberg/vm2/tooling/debugger.cpp",
    "src/barretenberg/vm2/tooling/stats.cpp",
    "src/barretenberg/vm2/tracegen/address_derivation_trace.cpp",
    "src/barretenberg/vm2/tracegen/alu_trace.cpp",
    "src/barretenberg/vm2/tracegen/bitwise_trace.cpp",
    "src/barretenberg/vm2/tracegen/bytecode_trace.cpp",
    "src/barretenberg/vm2/tracegen/calldata_trace.cpp",
    "src/barretenberg/vm2/tracegen/class_id_derivation_trace.cpp",
    "src/barretenberg/vm2/tracegen/context_stack_trace.cpp",
    "src/barretenberg/vm2/tracegen/contract_instance_retrieval_trace.cpp",
    "src/barretenberg/vm2/tracegen/data_copy_trace.cpp",
    "src/barretenberg/vm2/tracegen/ecc_trace.cpp",
    "src/barretenberg/vm2/tracegen/execution_trace.cpp",
    "src/barretenberg/vm2/tracegen/field_gt_trace.cpp",
    "src/barretenberg/vm2/tracegen/gt_trace.cpp",
    "src/barretenberg/vm2/tracegen/internal_call_stack_trace.cpp",
    "src/barretenberg/vm2/tracegen/keccakf1600_trace.cpp",
    "src/barretenberg/vm2/tracegen/l1_to_l2_message_tree_trace.cpp",
    "src/barretenberg/vm2/tracegen/lib/get_contract_instance_spec.cpp",
    "src/barretenberg/vm2/tracegen/lib/get_env_var_spec.cpp",
    "src/barretenberg/vm2/tracegen/lib/instruction_spec.cpp",
    "src/barretenberg/vm2/tracegen/lib/interaction_def.cpp",
    "src/barretenberg/vm2/tracegen/lib/phase_spec.cpp",
    "src/barretenberg/vm2/tracegen/lib/trace_conversion.cpp",
    "src/barretenberg/vm2/tracegen/memory_trace.cpp",
    "src/barretenberg/vm2/tracegen/merkle_check_trace.cpp",
    "src/barretenberg/vm2/tracegen/note_hash_tree_check_trace.cpp",
    "src/barretenberg/vm2/tracegen/nullifier_tree_check_trace.cpp",
    "src/barretenberg/vm2/tracegen/opcodes/emit_unencrypted_log_trace.cpp",
    "src/barretenberg/vm2/tracegen/opcodes/get_contract_instance_trace.cpp",
    "src/barretenberg/vm2/tracegen/poseidon2_trace.cpp",
    "src/barretenberg/vm2/tracegen/precomputed_trace.cpp",
    "src/barretenberg/vm2/tracegen/protocol_contract_trace.cpp",
    "src/barretenberg/vm2/tracegen/public_data_tree_trace.cpp",
    "src/barretenberg/vm2/tracegen/public_inputs_trace.cpp",
    "src/barretenberg/vm2/tracegen/range_check_trace.cpp",
    "src/barretenberg/vm2/tracegen/retrieved_bytecodes_tree_check.cpp",
    "src/barretenberg/vm2/tracegen/sha256_trace.cpp",
    "src/barretenberg/vm2/tracegen/to_radix_trace.cpp",
    "src/barretenberg/vm2/tracegen/trace_container.cpp",
    "src/barretenberg/vm2/tracegen/tx_trace.cpp",
    "src/barretenberg/vm2/tracegen/update_check_trace.cpp",
    "src/barretenberg/vm2/tracegen/written_public_data_slots_tree_check_trace.cpp",
    "src/barretenberg/vm2/tracegen_helper.cpp",
};

// WASI-specific sources (for JS WASM reactor builds).
const wasi_sources = [_][]const u8{
    // "src/barretenberg/wasi/wasm_init.cpp",
    "src/barretenberg/wasi/wasi_stubs.cpp",
};

// Combine source files based on AVM option.
const full_sources = core_sources ++ env_sources;
const full_avm_sources = core_sources ++ avm_sources;
const full_reactor_sources = core_sources ++ wasi_sources;

fn buildLmdb(b: *std.Build, target: std.Build.ResolvedTarget, optimize: std.builtin.OptimizeMode) *std.Build.Step.Compile {
    const lmdb_dep = b.dependency("lmdb", .{
        .target = target,
        .optimize = optimize,
    });

    const lmdb_lib = b.addLibrary(.{
        .name = "lmdb",
        .linkage = .static,
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    lmdb_lib.addCSourceFiles(.{
        .files = &.{
            "libraries/liblmdb/mdb.c",
            "libraries/liblmdb/midl.c",
        },
        .root = lmdb_dep.path("."),
    });

    lmdb_lib.addIncludePath(lmdb_dep.path("libraries/liblmdb"));
    lmdb_lib.linkLibC();

    return lmdb_lib;
}

fn buildLibdeflate(b: *std.Build, target: std.Build.ResolvedTarget, optimize: std.builtin.OptimizeMode) *std.Build.Step.Compile {
    const libdeflate_dep = b.dependency("libdeflate", .{
        .target = target,
        .optimize = optimize,
    });

    const libdeflate_lib = b.addLibrary(.{
        .name = "deflate",
        .linkage = .static,
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    const libdeflate_sources = [_][]const u8{
        "lib/utils.c",
        "lib/deflate_compress.c",
        "lib/deflate_decompress.c",
        "lib/gzip_compress.c",
        "lib/gzip_decompress.c",
        "lib/zlib_compress.c",
        "lib/zlib_decompress.c",
        "lib/adler32.c",
        "lib/crc32.c",
        "lib/arm/cpu_features.c",
        "lib/x86/cpu_features.c",
    };

    libdeflate_lib.addCSourceFiles(.{
        .files = &libdeflate_sources,
        .flags = &[_][]const u8{"-std=c99"},
        .root = libdeflate_dep.path("."),
    });

    libdeflate_lib.addIncludePath(libdeflate_dep.path("."));
    libdeflate_lib.addIncludePath(libdeflate_dep.path("lib"));
    libdeflate_lib.linkLibC();

    return libdeflate_lib;
}

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    var optimize = b.standardOptimizeOption(.{});

    // Add AVM option
    const enable_avm = b.option(bool, "avm", "Enable Aztec Virtual Machine support") orelse false;

    // Determine current host platform for default build
    const host_platform = std.fmt.allocPrint(
        b.allocator,
        "{s}-{s}",
        .{ @tagName(target.result.cpu.arch), @tagName(target.result.os.tag) },
    ) catch unreachable;

    // Create cross-compilation step
    const cross_step = b.step("cross", "Build for all platforms");

    for (platforms) |platform| {
        // We always default to ReleaseSmall for WASM builds.
        // Debug builds are so slow they basically hang.
        if (platform.os == .wasi) {
            optimize = .ReleaseSmall;
        }

        const platform_step = buildForTarget(b, platform, optimize, enable_avm);
        cross_step.dependOn(platform_step);

        // If this platform matches the host, add to default build.
        if (std.mem.eql(u8, platform.name, host_platform)) {
            b.getInstallStep().dependOn(platform_step);
        }

        if (platform.os == .wasi) {
            buildWasmReactor(b, optimize, platform_step);
            // cross_step.dependOn(wasm_reactor_step);
        }
    }
}

fn buildForTarget(
    b: *std.Build,
    platform: Platform,
    optimize: std.builtin.OptimizeMode,
    enable_avm: bool,
) *std.Build.Step {
    const target = b.resolveTargetQuery(.{
        .cpu_arch = platform.arch,
        .os_tag = platform.os,
        .cpu_features_add = if (platform.os == .wasi)
            std.Target.wasm.featureSet(&.{ .atomics, .bulk_memory })
        else
            std.Target.Cpu.Feature.Set.empty,
    });

    const sources = if (enable_avm) &full_avm_sources else &full_sources;
    const flags = if (platform.os == .wasi) &wasm_flags else if (enable_avm) &common_flags else &no_avm_flags;

    const libdeflate_dep = b.dependency("libdeflate", .{ .target = target, .optimize = optimize });
    const msgpack_dep = b.dependency("msgpack", .{});

    // const lmdb_lib = buildLmdb(b, target, optimize);
    const libdeflate_lib = buildLibdeflate(b, target, optimize);

    // Create library.
    const lib = b.addLibrary(.{
        .name = "barretenberg",
        .linkage = .static,
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
            .single_threaded = false,
        }),
    });

    lib.addCSourceFiles(.{
        .files = sources,
        .flags = flags,
    });

    lib.addIncludePath(b.path("src"));
    lib.addIncludePath(b.path("src/tracy_stub"));
    lib.addIncludePath(msgpack_dep.path("include"));
    lib.addIncludePath(libdeflate_dep.path("."));
    lib.addIncludePath(libdeflate_dep.path("lib"));
    lib.linkLibCpp();

    // Create executable.
    const exe = b.addExecutable(.{
        .name = "bb",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
            .single_threaded = false,
            .strip = false,
        }),
    });

    exe.addCSourceFiles(.{
        .files = &.{"src/barretenberg/bb/main.cpp"},
        .flags = flags,
    });

    exe.linkLibrary(lib);
    // exe.linkLibrary(lmdb_lib);
    exe.linkLibrary(libdeflate_lib);
    exe.linkLibCpp();
    exe.addIncludePath(b.path("src"));

    // Install the library and executable.
    const install_lib = b.addInstallArtifact(lib, .{ .dest_dir = .{ .override = .{ .custom = platform.name } } });
    const install = b.addInstallArtifact(exe, .{ .dest_dir = .{ .override = .{ .custom = platform.name } } });

    const platform_step = b.step(platform.name, b.fmt("Build for {s}", .{platform.name}));
    platform_step.dependOn(&install_lib.step);
    platform_step.dependOn(&install.step);

    // Platform-specific settings.
    switch (target.result.os.tag) {
        .windows => {
            exe.linkSystemLibrary("ws2_32");
            exe.linkSystemLibrary("advapi32"); // For CryptoAPI
            exe.linkSystemLibrary("psapi"); // For process info
        },
        .wasi => {
            exe.libc_file = b.path("wasi-libc-posix.txt");
            exe.wasi_exec_model = .command;
            exe.shared_memory = true;
            exe.import_memory = true;
            exe.export_memory = true;
            exe.export_table = true;
            exe.initial_memory = 1024 * 1024 * 64;
            exe.max_memory = 1024 * 1024 * 1024 * 4;
            exe.stack_size = 1024 * 1024 * 8;
        },
        else => {},
    }

    return platform_step;
}

fn buildWasmReactor(
    b: *std.Build,
    optimize: std.builtin.OptimizeMode,
    platform_step: *std.Build.Step,
) void {
    const target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .wasi,
        .cpu_features_add = std.Target.wasm.featureSet(&.{ .atomics, .bulk_memory }),
    });

    const libdeflate_lib = buildLibdeflate(b, target, optimize);
    const libdeflate_dep = b.dependency("libdeflate", .{});
    const msgpack_dep = b.dependency("msgpack", .{});

    const exe = b.addExecutable(.{
        .name = "barretenberg",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
            .single_threaded = false,
        }),
    });
    exe.libc_file = b.path("wasi-libc-posix.txt");
    exe.entry = .disabled;
    exe.wasi_exec_model = .reactor;
    exe.shared_memory = true;
    exe.import_memory = true;
    exe.import_symbols = true;
    exe.export_memory = true;
    exe.export_table = true;
    exe.stack_size = 1024 * 1024;
    exe.max_memory = 1024 * 1024 * 1024 * 4;
    exe.rdynamic = true;

    // Includes
    exe.addIncludePath(b.path("src"));
    exe.addIncludePath(b.path("src/tracy_stub"));
    exe.addIncludePath(libdeflate_dep.path("."));
    exe.addIncludePath(libdeflate_dep.path("lib"));
    exe.addIncludePath(msgpack_dep.path("include"));

    // Sources
    exe.addCSourceFiles(.{
        .files = &full_reactor_sources,
        .flags = &wasm_flags,
    });

    exe.linkLibC();
    exe.linkLibCpp();
    exe.linkLibrary(libdeflate_lib);

    const install = b.addInstallArtifact(exe, .{ .dest_dir = .{ .override = .{ .custom = "wasm32-wasi" } } });
    // Add step to gzip the output wasm file to the same file with .gz extension.
    const gzip = b.addSystemCommand(&.{ "gzip", "-k", "-f", b.getInstallPath(.{ .custom = "wasm32-wasi" }, "barretenberg.wasm") });
    gzip.step.dependOn(&install.step);
    platform_step.dependOn(&gzip.step);
}
