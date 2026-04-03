// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Federico], commit: 2094fd1467dd9a94803b2c5007cf60ac357aa7d2 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "acir_format.hpp"

#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/honk/prover_instance_inspector.hpp"
#include "barretenberg/stdlib/eccvm_verifier/verifier_commitment_key.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"
#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <cstddef>
#include <cstdint>
#include <memory>

namespace acir_format {

using namespace bb;

template <typename Builder>
void build_constraints(Builder& builder, AcirFormat& constraints, const ProgramMetadata& metadata)
{
    bool collect_gates_per_opcode = metadata.collect_gates_per_opcode;

    if (collect_gates_per_opcode) {
        constraints.gates_per_opcode.resize(constraints.num_acir_opcodes, 0);
    }

    GateCounter gate_counter{ &builder, collect_gates_per_opcode };

    // Add standard width-4 Ultra arithmetic gates
    for (auto [constraint, opcode_idx] :
         zip_view(constraints.quad_constraints, constraints.original_opcode_indices.quad_constraints)) {
        create_quad_constraint(builder, constraint);
        gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
    }

    // When an expression doesn't fit into a single width-4 gate, we split it across multiple gates and we leverage
    // w4_shift to use the least possible number of intermediate witnesses. See the documentation of
    // split_into_mul_quad_gates for more information.
    for (auto [big_constraint, opcode_idx] :
         zip_view(constraints.big_quad_constraints, constraints.original_opcode_indices.big_quad_constraints)) {
        create_big_quad_constraint(builder, big_constraint);
        gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
    }

    // Add logic constraint
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraints.logic_constraints, constraints.original_opcode_indices.logic_constraints)) {
        create_logic_gate(
            builder, constraint.a, constraint.b, constraint.result, constraint.num_bits, constraint.is_xor_gate);
        gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
    }

    // Add range constraint
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraints.range_constraints, constraints.original_opcode_indices.range_constraints)) {
        builder.create_dyadic_range_constraint(
            constraint.witness,
            constraint.num_bits,
            std::format("acir_format::build_constraints: range constraint at opcode index {} failed", opcode_idx));
        gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
    }

    // Add aes128 constraints
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraints.aes128_constraints, constraints.original_opcode_indices.aes128_constraints)) {
        create_aes128_constraints(builder, constraint);
        gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
    }

    // Add sha256 constraints
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraints.sha256_compression, constraints.original_opcode_indices.sha256_compression)) {
        create_sha256_compression_constraints(builder, constraint);
        gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
    }

    // Add ECDSA k1 constraints
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraints.ecdsa_k1_constraints, constraints.original_opcode_indices.ecdsa_k1_constraints)) {
        create_ecdsa_verify_constraints<stdlib::secp256k1<Builder>>(builder, constraint);
        gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
    }

    // Add ECDSA r1 constraints
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraints.ecdsa_r1_constraints, constraints.original_opcode_indices.ecdsa_r1_constraints)) {
        create_ecdsa_verify_constraints<stdlib::secp256r1<Builder>>(builder, constraint);
        gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
    }

    // Add blake2s constraints
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraints.blake2s_constraints, constraints.original_opcode_indices.blake2s_constraints)) {
        create_blake2s_constraints(builder, constraint);
        gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
    }

    // Add blake3 constraints
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraints.blake3_constraints, constraints.original_opcode_indices.blake3_constraints)) {
        create_blake3_constraints(builder, constraint);
        gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
    }

    // Add keccak permutations
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraints.keccak_permutations, constraints.original_opcode_indices.keccak_permutations)) {
        create_keccak_permutations_constraints(builder, constraint);
        gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
    }

    // Add poseidon2 constraints
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraints.poseidon2_constraints, constraints.original_opcode_indices.poseidon2_constraints)) {
        create_poseidon2_permutations_constraints(builder, constraint);
        gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
    }

    // Add multi scalar mul constraints
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraints.multi_scalar_mul_constraints,
                  constraints.original_opcode_indices.multi_scalar_mul_constraints)) {
        create_multi_scalar_mul_constraint(builder, constraint);
        gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
    }

    // Add ec add constraints
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraints.ec_add_constraints, constraints.original_opcode_indices.ec_add_constraints)) {
        create_ec_add_constraint(builder, constraint);
        gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
    }

    // Add block constraints
    for (const auto& [constraint, opcode_indices] :
         zip_view(constraints.block_constraints, constraints.original_opcode_indices.block_constraints)) {
        create_block_constraints(builder, constraint);
        if (collect_gates_per_opcode) {
            // Each block constraint may correspond to multiple opcodes, so we record the average number of gates added
            // by the entire constraint as the number of gates for each opcode.
            size_t avg_gates_per_opcode = gate_counter.compute_diff() / opcode_indices.size();
            for (size_t opcode_index : opcode_indices) {
                constraints.gates_per_opcode[opcode_index] = avg_gates_per_opcode;
            }
        }
    }

    // RecursionConstraints
    const bool is_hn_recursion_constraints = !constraints.hn_recursion_constraints.empty();
    HonkRecursionConstraintsOutput<Builder> output = create_recursion_constraints<Builder>(
        builder,
        gate_counter,
        constraints.gates_per_opcode,
        metadata.ivc,
        /*honk_recursion_data=*/
        { constraints.honk_recursion_constraints, constraints.original_opcode_indices.honk_recursion_constraints },
        /*avm_recursion_data=*/
        { constraints.avm_recursion_constraints, constraints.original_opcode_indices.avm_recursion_constraints },
        /*hn_recursion_data=*/
        { constraints.hn_recursion_constraints, constraints.original_opcode_indices.hn_recursion_constraints },
        /*chonk_recursion_data=*/
        { constraints.chonk_recursion_constraints, constraints.original_opcode_indices.chonk_recursion_constraints });

    // Process the result of adding recursion constraints and propagate the public inputs as needed
    output.finalize(builder, is_hn_recursion_constraints, metadata.has_ipa_claim);
}

/**
 * @brief Specialization for creating an Ultra circuit from an acir program
 *
 * @param program constraints and optionally a witness
 * @param metadata additional data needed to construct the circuit
 */
template <> UltraCircuitBuilder create_circuit(AcirProgram& program, const ProgramMetadata& metadata)
{
    BB_BENCH();
    AcirFormat& constraints = program.constraints;
    WitnessVector& witness = program.witness;
    const bool is_write_vk_mode = witness.empty();

    if (!is_write_vk_mode) {
        BB_ASSERT_EQ(witness.size(),
                     constraints.max_witness_index + 1,
                     "ACIR witness size (" << witness.size() << ") does not match max witness index + 1 ("
                                           << (constraints.max_witness_index + 1) << ").");
    } else {
        witness.resize(constraints.max_witness_index + 1, 0);
    }

    UltraCircuitBuilder builder{ witness, constraints.public_inputs, is_write_vk_mode };

    // Populate constraints in the builder
    build_constraints(builder, constraints, metadata);

    vinfo("Created circuit");

    return builder;
};

/**
 * @brief Specialization for creating a Mega circuit from an acir program
 *
 * @param program constraints and optionally a witness
 * @param metadata additional data needed to construct the circuit
 */
template <> MegaCircuitBuilder create_circuit(AcirProgram& program, const ProgramMetadata& metadata)
{
    BB_BENCH();
    AcirFormat& constraints = program.constraints;
    WitnessVector& witness = program.witness;
    const bool is_write_vk_mode = witness.empty();

    if (!is_write_vk_mode) {
        BB_ASSERT_EQ(witness.size(),
                     constraints.max_witness_index + 1,
                     "ACIR witness size (" << witness.size() << ") does not match max witness index + 1 ("
                                           << (constraints.max_witness_index + 1) << ").");
    } else {
        witness.resize(constraints.max_witness_index + 1, 0);
    }

    auto op_queue = (metadata.ivc == nullptr) ? std::make_shared<ECCOpQueue>() : metadata.ivc->get_goblin().op_queue;

    // Construct a builder using the witness and public input data from acir and with the goblin-owned op_queue
    MegaCircuitBuilder builder{ op_queue, witness, constraints.public_inputs, is_write_vk_mode };

    // Populate constraints in the builder
    build_constraints(builder, constraints, metadata);

    vinfo("Created circuit");

    return builder;
};

template void build_constraints<UltraCircuitBuilder>(UltraCircuitBuilder&, AcirFormat&, const ProgramMetadata&);
template void build_constraints<MegaCircuitBuilder>(MegaCircuitBuilder&, AcirFormat&, const ProgramMetadata&);

/**
 * @brief Profile data for a constraint type, extracted from a throwaway builder.
 * @details Eventually this will be a compile-time table lookup. For now, it's computed
 * by running constraints on a throwaway builder and extracting the resulting state.
 */
struct ConstraintProfile {
    UltraCircuitBuilder::TaskBlockSizes block_sizes;
    std::vector<bb::fr> constants;                // constant values to pre-register
    std::vector<uint64_t> range_list_targets;     // range list target ranges to pre-create
    std::vector<plookup::BasicTableId> table_ids; // lookup tables to pre-create
    size_t num_rom_arrays_per_instance = 0;       // ROM arrays created per constraint instance
    size_t num_ram_arrays_per_instance = 0;       // RAM arrays created per constraint instance
    std::vector<size_t> rom_array_sizes;          // sizes of ROM arrays created per instance
    std::vector<size_t> ram_array_sizes;          // sizes of RAM arrays created per instance
};

/**
 * @brief Profile a constraint type by running it on a throwaway builder and extracting cache state.
 * @details Runs two instances: the first triggers one-time setup, the second measures steady-state cost.
 * Extracts all constants, range list targets, and lookup table IDs that the constraint type needs.
 * This simulates the eventual table lookup.
 */
template <typename ConstraintType, typename Handler>
ConstraintProfile profile_constraint_type(ConstraintType representative, Handler&& handler, size_t num_witnesses)
{
    ConstraintProfile profile;

    // Create a throwaway builder with enough witness slots
    WitnessVector dummy_witness(num_witnesses, bb::fr(0));
    UltraCircuitBuilder throwaway{ dummy_witness, {}, false };

    // First instance: triggers one-time setup
    handler(throwaway, representative);

    // Second instance: measures steady-state cost
    auto before = throwaway.snapshot_block_sizes();
    size_t rom_before = throwaway.rom_ram_logic.rom_arrays.size();
    size_t ram_before = throwaway.rom_ram_logic.ram_arrays.size();
    handler(throwaway, representative);
    auto after = throwaway.snapshot_block_sizes();
    profile.block_sizes = UltraCircuitBuilder::delta(before, after);

    // Extract ROM/RAM array counts per instance
    profile.num_rom_arrays_per_instance = throwaway.rom_ram_logic.rom_arrays.size() - rom_before;
    profile.num_ram_arrays_per_instance = throwaway.rom_ram_logic.ram_arrays.size() - ram_before;
    for (size_t i = rom_before; i < throwaway.rom_ram_logic.rom_arrays.size(); i++) {
        profile.rom_array_sizes.push_back(throwaway.rom_ram_logic.rom_arrays[i].state.size());
    }
    for (size_t i = ram_before; i < throwaway.rom_ram_logic.ram_arrays.size(); i++) {
        profile.ram_array_sizes.push_back(throwaway.rom_ram_logic.ram_arrays[i].state.size());
    }

    // Extract constants
    for (const auto& [value, _] : throwaway.constant_variable_indices) {
        profile.constants.push_back(value);
    }

    // Extract range list targets
    for (const auto& [target_range, _] : throwaway.range_lists) {
        profile.range_list_targets.push_back(target_range);
    }

    // Extract lookup table IDs
    for (const auto& table : throwaway.get_lookup_tables()) {
        profile.table_ids.push_back(table.id);
    }

    return profile;
}

/**
 * @brief Prepare a builder's caches from constraint profiles WITHOUT running any constraints.
 * @details Populates the builder's constant cache, range lists, and lookup tables using data
 * extracted from profiles. After this, all parallel constraint execution will find everything
 * cached — no cache misses, no one-time setup costs.
 */
void prepare_builder_from_profiles(UltraCircuitBuilder& builder, const std::vector<ConstraintProfile>& profiles)
{
    // Register all constants from all profiles
    for (const auto& profile : profiles) {
        for (const auto& value : profile.constants) {
            builder.put_constant_variable(value);
        }
    }

    // Create all needed range lists
    for (const auto& profile : profiles) {
        for (const auto target_range : profile.range_list_targets) {
            if (builder.range_lists.count(target_range) == 0) {
                builder.range_lists.insert({ target_range, builder.create_range_list(target_range) });
            }
        }
    }

    // Create all needed lookup tables
    for (const auto& profile : profiles) {
        for (const auto table_id : profile.table_ids) {
            builder.get_table(table_id);
        }
    }
}

void build_constraints_parallel(UltraCircuitBuilder& builder,
                                AcirFormat& constraints,
                                const ProgramMetadata& metadata,
                                size_t num_threads)
{
    using TaskBlockSizes = UltraCircuitBuilder::TaskBlockSizes;
    size_t num_witnesses = constraints.max_witness_index + 1;

    // Phase 1: Profile each constraint type on throwaway builders (simulates table lookup).
    // Collect ALL instances as parallel tasks.
    std::vector<ConstraintProfile> profiles;
    std::vector<std::function<void(UltraCircuitBuilder&)>> tasks;
    std::vector<TaskBlockSizes> task_sizes;
    std::vector<size_t> task_profile_indices; // which profile each task belongs to

    // Helper: profile a constraint type and register all its instances as tasks
    auto profile_and_collect = [&](auto& items, auto handler) {
        if (items.empty()) {
            return;
        }
        auto profile = profile_constraint_type(items[0], handler, num_witnesses);
        size_t profile_idx = profiles.size();
        profiles.push_back(profile);
        auto sizes = profile.block_sizes;
        sizes.num_rom_arrays = profile.num_rom_arrays_per_instance;
        sizes.num_ram_arrays = profile.num_ram_arrays_per_instance;
        for (size_t i = 0; i < items.size(); i++) {
            tasks.emplace_back([handler, &items, i](UltraCircuitBuilder& b) { handler(b, items[i]); });
            task_sizes.push_back(sizes);
            task_profile_indices.push_back(profile_idx);
        }
    };

    profile_and_collect(constraints.quad_constraints,
                        [](UltraCircuitBuilder& b, QuadConstraint& c) { create_quad_constraint(b, c); });
    profile_and_collect(constraints.big_quad_constraints,
                        [](UltraCircuitBuilder& b, BigQuadConstraint& c) { create_big_quad_constraint(b, c); });
    profile_and_collect(constraints.logic_constraints, [](UltraCircuitBuilder& b, const LogicConstraint& c) {
        create_logic_gate(b, c.a, c.b, c.result, c.num_bits, c.is_xor_gate);
    });
    // Range constraints must be grouped by num_bits since different bit widths produce different gate counts.
    {
        // Group range constraints by num_bits
        std::map<uint32_t, std::vector<size_t>> range_groups; // num_bits -> indices into range_constraints
        for (size_t i = 0; i < constraints.range_constraints.size(); i++) {
            range_groups[constraints.range_constraints[i].num_bits].push_back(i);
        }
        auto handler = [](UltraCircuitBuilder& b, const RangeConstraint& c) {
            b.create_dyadic_range_constraint(c.witness, c.num_bits, "parallel range constraint");
        };
        for (auto& [num_bits, indices] : range_groups) {
            auto& representative = constraints.range_constraints[indices[0]];
            auto profile = profile_constraint_type(representative, handler, num_witnesses);
            size_t profile_idx = profiles.size();
            profiles.push_back(profile);
            auto sizes = profile.block_sizes;
            sizes.num_rom_arrays = profile.num_rom_arrays_per_instance;
            sizes.num_ram_arrays = profile.num_ram_arrays_per_instance;
            for (size_t idx : indices) {
                tasks.emplace_back([handler, &constraints, idx](UltraCircuitBuilder& b) {
                    handler(b, constraints.range_constraints[idx]);
                });
                task_sizes.push_back(sizes);
                task_profile_indices.push_back(profile_idx);
            }
        }
    }
    profile_and_collect(constraints.aes128_constraints,
                        [](UltraCircuitBuilder& b, const AES128Constraint& c) { create_aes128_constraints(b, c); });
    profile_and_collect(constraints.sha256_compression, [](UltraCircuitBuilder& b, const Sha256Compression& c) {
        create_sha256_compression_constraints(b, c);
    });
    profile_and_collect(constraints.ecdsa_k1_constraints, [](UltraCircuitBuilder& b, const EcdsaConstraint& c) {
        create_ecdsa_verify_constraints<stdlib::secp256k1<UltraCircuitBuilder>>(b, c);
    });
    profile_and_collect(constraints.ecdsa_r1_constraints, [](UltraCircuitBuilder& b, const EcdsaConstraint& c) {
        create_ecdsa_verify_constraints<stdlib::secp256r1<UltraCircuitBuilder>>(b, c);
    });
    profile_and_collect(constraints.blake2s_constraints,
                        [](UltraCircuitBuilder& b, const Blake2sConstraint& c) { create_blake2s_constraints(b, c); });
    profile_and_collect(constraints.blake3_constraints,
                        [](UltraCircuitBuilder& b, const Blake3Constraint& c) { create_blake3_constraints(b, c); });
    profile_and_collect(constraints.keccak_permutations, [](UltraCircuitBuilder& b, const Keccakf1600& c) {
        create_keccak_permutations_constraints(b, c);
    });
    profile_and_collect(constraints.poseidon2_constraints, [](UltraCircuitBuilder& b, const Poseidon2Constraint& c) {
        create_poseidon2_permutations_constraints(b, c);
    });
    profile_and_collect(constraints.multi_scalar_mul_constraints, [](UltraCircuitBuilder& b, const MultiScalarMul& c) {
        create_multi_scalar_mul_constraint(b, c);
    });
    profile_and_collect(constraints.ec_add_constraints,
                        [](UltraCircuitBuilder& b, const EcAdd& c) { create_ec_add_constraint(b, c); });

    // Phase 2: Prepare the builder's caches from profiles (no constraint execution).
    prepare_builder_from_profiles(builder, profiles);

    // Phase 2b: Pre-create ROM/RAM arrays for all task instances in deterministic (sequential) order.
    // Each task instance creates a known number of ROM/RAM arrays (from profiling).
    // We pre-create them all now so that create_ROM_array/create_RAM_array can return
    // pre-assigned IDs via per-thread cursors without any races or nondeterminism.
    for (size_t t = 0; t < tasks.size(); t++) {
        const auto& profile = profiles[task_profile_indices[t]];
        for (size_t r = 0; r < profile.num_rom_arrays_per_instance; r++) {
            builder.rom_ram_logic.create_ROM_array(profile.rom_array_sizes[r]);
        }
        for (size_t r = 0; r < profile.num_ram_arrays_per_instance; r++) {
            builder.rom_ram_logic.create_RAM_array(profile.ram_array_sizes[r]);
        }
    }

    // Phase 3: Execute ALL instances in parallel
    // execute_parallel will set up per-thread ROM/RAM cursors using the num_rom/ram_arrays in task_sizes
    if (!tasks.empty()) {
        builder.execute_parallel(tasks, task_sizes, num_threads);
    }

    // Phase 4: Block constraints and recursion constraints are processed sequentially.
    for (const auto& [constraint, opcode_indices] :
         zip_view(constraints.block_constraints, constraints.original_opcode_indices.block_constraints)) {
        create_block_constraints(builder, constraint);
    }

    const bool is_hn_recursion_constraints = !constraints.hn_recursion_constraints.empty();
    GateCounter gate_counter{ &builder, false };
    std::vector<size_t> dummy_gates_per_opcode;
    HonkRecursionConstraintsOutput<UltraCircuitBuilder> output = create_recursion_constraints<UltraCircuitBuilder>(
        builder,
        gate_counter,
        dummy_gates_per_opcode,
        metadata.ivc,
        { constraints.honk_recursion_constraints, constraints.original_opcode_indices.honk_recursion_constraints },
        { constraints.avm_recursion_constraints, constraints.original_opcode_indices.avm_recursion_constraints },
        { constraints.hn_recursion_constraints, constraints.original_opcode_indices.hn_recursion_constraints },
        { constraints.chonk_recursion_constraints, constraints.original_opcode_indices.chonk_recursion_constraints });

    output.finalize(builder, is_hn_recursion_constraints, metadata.has_ipa_claim);
}

} // namespace acir_format
