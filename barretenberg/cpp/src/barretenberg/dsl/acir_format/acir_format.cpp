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

    // Size hints: reserve the row storage of the blocks whose growth is predictable from the ACIR
    // constraint counts. Estimates only need to be the right order of magnitude — a single reserve
    // replaces the log2(size) reallocation-and-copy steps of geometric growth. Gadget-generated
    // gates (hashes, ECDSA, recursion) are excluded; those blocks still grow but from a warmer start.
    constexpr size_t GATES_PER_BIG_QUAD_HINT = 4;    // a big quad expands to a short chain of arith gates
    constexpr size_t GATES_PER_SMALL_RANGE_HINT = 3; // delta-range rows per range constraint, order of magnitude
    constexpr size_t ARITH_RESERVE_SLACK = 1024;     // headroom for gadget-generated arith gates
    constexpr size_t BLOCK_RESERVE_FLOOR = 512;      // warm start for blocks that grow only via gadgets
    builder.blocks.arithmetic.reserve(constraints.quad_constraints.size() + constraints.bilinear_constraints.size() +
                                      constraints.batched_eq_check_constraints.size() +
                                      GATES_PER_BIG_QUAD_HINT * constraints.big_quad_constraints.size() +
                                      ARITH_RESERVE_SLACK);
    builder.blocks.delta_range.reserve(GATES_PER_SMALL_RANGE_HINT * constraints.range_constraints.size() +
                                       BLOCK_RESERVE_FLOOR);
    builder.blocks.memory.reserve(BLOCK_RESERVE_FLOOR);
    builder.blocks.nnf.reserve(BLOCK_RESERVE_FLOOR);

    // Add standard width-4 Ultra arithmetic gates
    {
        BB_BENCH_ONLY_NAME("acir::quad_constraints");
        for (auto [constraint, opcode_idx] :
             zip_view(constraints.quad_constraints, constraints.original_opcode_indices.quad_constraints)) {
            create_quad_constraint(builder, constraint);
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
        }
    }

    // When an expression doesn't fit into a single width-4 gate, we split it across multiple gates and we leverage
    // w4_shift to use the least possible number of intermediate witnesses. See the documentation of
    // split_into_mul_quad_gates for more information.
    {
        BB_BENCH_ONLY_NAME("acir::big_quad_constraints");
        for (auto [big_constraint, opcode_idx] :
             zip_view(constraints.big_quad_constraints, constraints.original_opcode_indices.big_quad_constraints)) {
            create_big_quad_constraint(builder, big_constraint);
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
        }
    }

    // Bilinear rows: AssertZero opcodes with two products routed to the bilinear gate (Mega-only; see
    // bilinear_or_batched_eq_check_relation.hpp). Each row originates from a single AssertZero.
    BB_ASSERT(constraints.bilinear_constraints.empty() || IsMegaBuilder<Builder>,
              "Bilinear constraints should only be present when using MegaCircuitBuilder.");
    {
        BB_BENCH_ONLY_NAME("acir::bilinear_constraints");
        for (auto [constraint, opcode_idx] :
             zip_view(constraints.bilinear_constraints, constraints.original_opcode_indices.bilinear_constraints)) {
            create_bilinear_constraint(builder, constraint);
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
        }
    }

    // BatchedEq rows: pairs of linear AssertZeros batched into one row (Mega-only). Each row originates from 1
    // (unpaired single-half) or 2 (paired) AssertZero opcodes.
    BB_ASSERT(constraints.batched_eq_check_constraints.empty() || IsMegaBuilder<Builder>,
              "BatchedEq constraints should only be present when using MegaCircuitBuilder.");
    {
        BB_BENCH_ONLY_NAME("acir::batched_eq_check_constraints");
        for (auto [constraint, opcode_idx] :
             zip_view(constraints.batched_eq_check_constraints,
                      constraints.original_opcode_indices.batched_eq_check_constraints)) {
            create_batched_eq_check_constraint(builder, constraint);
            // For paired BATCHED_EQ rows, the single emitted gate is shared between two opcodes; attribute the
            // delta only to the first (track_diff would record 0 for the second anyway since no new gates
            // were added between the calls).
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx[0]);
        }
    }

    // Add logic constraint
    {
        BB_BENCH_ONLY_NAME("acir::logic_constraints");
        for (const auto& [constraint, opcode_idx] :
             zip_view(constraints.logic_constraints, constraints.original_opcode_indices.logic_constraints)) {
            create_logic_gate(
                builder, constraint.a, constraint.b, constraint.result, constraint.num_bits, constraint.is_xor_gate);
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
        }
    }

    // Add range constraint
    {
        BB_BENCH_ONLY_NAME("acir::range_constraints");
        for (const auto& [constraint, opcode_idx] :
             zip_view(constraints.range_constraints, constraints.original_opcode_indices.range_constraints)) {
            // The failure message is only consumed when the witness is out of range; formatting it eagerly
            // dominates the cost of this loop, so only build it for values that will actually fail.
            std::string msg;
            if (uint256_t(builder.get_variable(constraint.witness)).get_msb() >= constraint.num_bits) {
                msg = std::format("acir_format::build_constraints: range constraint at opcode index {} failed",
                                  opcode_idx);
            }
            builder.create_dyadic_range_constraint(constraint.witness, constraint.num_bits, msg);
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
        }
    }

    // Add aes128 constraints
    {
        BB_BENCH_ONLY_NAME("acir::aes128_constraints");
        for (const auto& [constraint, opcode_idx] :
             zip_view(constraints.aes128_constraints, constraints.original_opcode_indices.aes128_constraints)) {
            create_aes128_constraints(builder, constraint);
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
        }
    }

    // Add sha256 constraints
    {
        BB_BENCH_ONLY_NAME("acir::sha256_compression");
        for (const auto& [constraint, opcode_idx] :
             zip_view(constraints.sha256_compression, constraints.original_opcode_indices.sha256_compression)) {
            create_sha256_compression_constraints(builder, constraint);
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
        }
    }

    // Add ECDSA k1 constraints
    {
        BB_BENCH_ONLY_NAME("acir::ecdsa_k1_constraints");
        for (const auto& [constraint, opcode_idx] :
             zip_view(constraints.ecdsa_k1_constraints, constraints.original_opcode_indices.ecdsa_k1_constraints)) {
            create_ecdsa_verify_constraints<stdlib::secp256k1<Builder>>(builder, constraint);
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
        }
    }

    // Add ECDSA r1 constraints
    {
        BB_BENCH_ONLY_NAME("acir::ecdsa_r1_constraints");
        for (const auto& [constraint, opcode_idx] :
             zip_view(constraints.ecdsa_r1_constraints, constraints.original_opcode_indices.ecdsa_r1_constraints)) {
            create_ecdsa_verify_constraints<stdlib::secp256r1<Builder>>(builder, constraint);
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
        }
    }
    // Add blake2s constraints
    {
        BB_BENCH_ONLY_NAME("acir::blake2s_constraints");
        for (const auto& [constraint, opcode_idx] :
             zip_view(constraints.blake2s_constraints, constraints.original_opcode_indices.blake2s_constraints)) {
            create_blake2s_constraints(builder, constraint);
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
        }
    }

    // Add blake3 constraints
    {
        BB_BENCH_ONLY_NAME("acir::blake3_constraints");
        for (const auto& [constraint, opcode_idx] :
             zip_view(constraints.blake3_constraints, constraints.original_opcode_indices.blake3_constraints)) {
            create_blake3_constraints(builder, constraint);
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
        }
    }

    // Add keccak permutations
    {
        BB_BENCH_ONLY_NAME("acir::keccak_permutations");
        for (const auto& [constraint, opcode_idx] :
             zip_view(constraints.keccak_permutations, constraints.original_opcode_indices.keccak_permutations)) {
            create_keccak_permutations_constraints(builder, constraint);
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
        }
    }

    // Add poseidon2 constraints
    {
        BB_BENCH_ONLY_NAME("acir::poseidon2_constraints");
        for (const auto& [constraint, opcode_idx] :
             zip_view(constraints.poseidon2_constraints, constraints.original_opcode_indices.poseidon2_constraints)) {
            create_poseidon2_permutations_constraints(builder, constraint);
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
        }
    }

    // Add multi scalar mul constraints
    {
        BB_BENCH_ONLY_NAME("acir::multi_scalar_mul_constraints");
        for (const auto& [constraint, opcode_idx] :
             zip_view(constraints.multi_scalar_mul_constraints,
                      constraints.original_opcode_indices.multi_scalar_mul_constraints)) {
            create_multi_scalar_mul_constraint(builder, constraint);
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
        }
    }

    // Add ec add constraints
    {
        BB_BENCH_ONLY_NAME("acir::ec_add_constraints");
        for (const auto& [constraint, opcode_idx] :
             zip_view(constraints.ec_add_constraints, constraints.original_opcode_indices.ec_add_constraints)) {
            create_ec_add_constraint(builder, constraint);
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_idx);
        }
    }

    // Add block constraints
    {
        BB_BENCH_ONLY_NAME("acir::block_constraints");
        for (const auto& [constraint, opcode_indices] :
             zip_view(constraints.block_constraints, constraints.original_opcode_indices.block_constraints)) {
            create_block_constraints(builder, constraint);
            if (collect_gates_per_opcode) {
                // Each block constraint may correspond to multiple opcodes, so we record the average number of gates
                // added by the entire constraint as the number of gates for each opcode.
                size_t avg_gates_per_opcode = gate_counter.compute_diff() / opcode_indices.size();
                for (size_t opcode_index : opcode_indices) {
                    constraints.gates_per_opcode[opcode_index] = avg_gates_per_opcode;
                }
            }
        }
    }

    // RecursionConstraints
    BB_BENCH_ONLY_NAME("acir::recursion_constraints");
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

} // namespace acir_format
