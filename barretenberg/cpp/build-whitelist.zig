const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // Build Barretenberg library with explicit file list
    const bb_lib = b.addLibrary(.{
        .name = "barretenberg",
        .linkage = .static,
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    // C++ compilation flags
    const cpp_flags = [_][]const u8{
        "-std=c++20",
        "-fPIC",
        "-DDISABLE_AZTEC_VM=1",
        "-fno-sanitize=undefined",
        "-Wno-unused-function",
        "-Wno-unused-variable",
        "-Wno-unused-parameter",
        "-Wno-missing-field-initializers",
        "-DNO_PAR_ALGOS", // Disable parallel algorithms (std::execution::par_unseq)
    };

    // Core source files - explicit whitelist
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

        // Merkle trees (needs lmdb)
        "src/barretenberg/crypto/merkle_tree/nullifier_tree/nullifier_tree.cpp",
        "src/barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.cpp",

        // Circuit builders
        "src/barretenberg/stdlib_circuit_builders/circuit_builder_base.cpp",
        "src/barretenberg/stdlib_circuit_builders/mega_circuit_builder.cpp",
        "src/barretenberg/stdlib_circuit_builders/ultra_circuit_builder.cpp",
        "src/barretenberg/stdlib_circuit_builders/rom_ram_logic.cpp",
        "src/barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.cpp",
        "src/barretenberg/stdlib_circuit_builders/plookup_tables/non_native_group_generator.cpp",
        "src/barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.cpp",

        // SRS
        "src/barretenberg/srs/c_bind.cpp",
        "src/barretenberg/srs/global_crs.cpp",
        "src/barretenberg/srs/factories/native_crs_factory.cpp",
        "src/barretenberg/srs/factories/mem_bn254_crs_factory.cpp",
        "src/barretenberg/srs/factories/mem_grumpkin_crs_factory.cpp",
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

        // Environment
        "src/barretenberg/env/logstr.cpp",
        "src/barretenberg/env/hardware_concurrency.cpp",
        "src/barretenberg/env/throw_or_abort_impl.cpp",
        "src/barretenberg/env/data_store.cpp",

        // Transcript
        "src/barretenberg/transcript/origin_tag.cpp",
        "src/barretenberg/transcript/transcript.cpp",

        // Client IVC (needs libdeflate)
        "src/barretenberg/client_ivc/client_ivc.cpp",
        "src/barretenberg/client_ivc/private_execution_steps.cpp",

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

        // World state
        "src/barretenberg/world_state/types.cpp",
        "src/barretenberg/world_state/world_state.cpp",

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

        // API
        "src/barretenberg/api/acir_format_getters.cpp",
        "src/barretenberg/api/api_ultra_honk.cpp",
        "src/barretenberg/api/api_client_ivc.cpp",
        "src/barretenberg/api/prove_tube.cpp",
        "src/barretenberg/api/api_avm.cpp",

        // BB CLI
        "src/barretenberg/bb/cli.cpp",

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

        // Other essentials
        "src/barretenberg/trace_to_polynomials/trace_to_polynomials.cpp",
        "src/barretenberg/op_queue/ecc_op_queue.cpp",
        "src/barretenberg/boomerang_value_detection/graph.cpp",
        "src/barretenberg/circuit_checker/ultra_circuit_checker.cpp",
        "src/barretenberg/circuit_checker/translator_circuit_checker.cpp",
        "src/barretenberg/flavor/flavor.cpp",
        "src/barretenberg/honk/utils/testing.cpp",
        "src/barretenberg/honk/relation_checker.cpp",
        "src/barretenberg/honk/prover_instance_inspector.cpp",
        "src/barretenberg/protogalaxy/protogalaxy_prover_mega.cpp",
        "src/barretenberg/protogalaxy/protogalaxy_verifier.cpp",
        "src/barretenberg/wasi/wasm_init.cpp",
        "src/barretenberg/wasi/wasi_stubs.cpp",
        "src/barretenberg/ext/starknet/crypto/poseidon/poseidon.cpp",
    };

    // Add source files to library
    bb_lib.addCSourceFiles(.{
        .files = &core_sources,
        .flags = &cpp_flags,
    });

    // Add include paths
    bb_lib.addIncludePath(b.path("src"));
    bb_lib.addIncludePath(b.path("build/_deps/msgpack-c/src/msgpack-c/include"));
    bb_lib.addIncludePath(b.path("build/_deps/tracy-src/public"));
    bb_lib.addIncludePath(b.path("build/_deps/lmdb/src/lmdb_repo/libraries/liblmdb"));
    bb_lib.addIncludePath(b.path("build/_deps/libdeflate-src"));

    // Link system libraries
    bb_lib.linkLibCpp();

    // Don't add pre-built .a files to the library - they should only be linked at the executable stage

    // Install the library
    b.installArtifact(bb_lib);

    // Build bb executable
    const bb_exe = b.addExecutable(.{
        .name = "bb",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    // Add main.cpp for bb executable
    bb_exe.addCSourceFiles(.{
        .files = &.{"src/barretenberg/bb/main.cpp"},
        .flags = &cpp_flags,
    });

    bb_exe.linkLibrary(bb_lib);
    bb_exe.linkLibCpp();
    bb_exe.addIncludePath(b.path("src"));
    bb_exe.addObjectFile(b.path("build/_deps/lmdb/src/lmdb_repo/libraries/liblmdb/liblmdb.a"));
    bb_exe.addObjectFile(b.path("build/_deps/libdeflate-build/libdeflate.a"));

    b.installArtifact(bb_exe);

    // Run step
    const run_cmd = b.addRunArtifact(bb_exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| {
        run_cmd.addArgs(args);
    }

    const run_step = b.step("run", "Run the bb executable");
    run_step.dependOn(&run_cmd.step);
}
