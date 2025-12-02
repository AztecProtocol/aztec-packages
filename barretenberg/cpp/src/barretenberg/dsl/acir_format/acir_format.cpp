// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "acir_format.hpp"

#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
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

template <typename Builder> void set_zero_idx(const Builder& builder, mul_quad_<typename Builder::FF>& mul_quad)
{
    using FF = Builder::FF;

    auto replace_and_check_zero_scaling = [&](uint32_t& index, const FF& scaling) {
        if (index == bb::stdlib::IS_CONSTANT) {
            index = builder.zero_idx();
            BB_ASSERT_EQ(scaling, FF(0), "mul_quad_ gate with IS_CONSTANT witness index has non-zero scaling");
        }
    };

    replace_and_check_zero_scaling(mul_quad.b, mul_quad.b_scaling);
    replace_and_check_zero_scaling(mul_quad.c, mul_quad.c_scaling);
    replace_and_check_zero_scaling(mul_quad.d, mul_quad.d_scaling);
}

template <typename Builder>
void check_mul_add_gate(Builder& builder,
                        const mul_quad_<typename Builder::FF>& mul_quad,
                        const typename Builder::FF next_wire_w4)
{
    using FF = Builder::FF;

    FF result = mul_quad.const_scaling + next_wire_w4;
    result += builder.get_variable(mul_quad.a) * builder.get_variable(mul_quad.b) * mul_quad.mul_scaling;
    result += builder.get_variable(mul_quad.a) * mul_quad.a_scaling;
    result += builder.get_variable(mul_quad.b) * mul_quad.b_scaling;
    result += builder.get_variable(mul_quad.c) * mul_quad.c_scaling;
    result += builder.get_variable(mul_quad.d) * mul_quad.d_scaling;

    if (result != FF::zero() && !builder.failed()) {
        builder.failure("mul_add_gate");
    }
}

template <typename Builder>
void build_constraints(Builder& builder, AcirProgram& program, const ProgramMetadata& metadata)
{
    bool has_valid_witness_assignments = !program.witness.empty();
    bool collect_gates_per_opcode = metadata.collect_gates_per_opcode;
    AcirFormat& constraint_system = program.constraints;

    if (collect_gates_per_opcode) {
        constraint_system.gates_per_opcode.resize(constraint_system.num_acir_opcodes, 0);
    }

    GateCounter gate_counter{ &builder, collect_gates_per_opcode };

    // Add arithmetic gates

    // AUDITTODO(federico): remove poly_triple_constraints
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraint_system.arithmetic_triple_constraints,
                  constraint_system.original_opcode_indices.arithmetic_triple_constraints)) {
        builder.create_arithmetic_gate(constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode, opcode_idx);
    }

    // Add standard width-4 Ultra arithmetic gates
    for (auto [constraint, opcode_idx] :
         zip_view(constraint_system.quad_constraints, constraint_system.original_opcode_indices.quad_constraints)) {
        set_zero_idx(builder, constraint);
        check_mul_add_gate(builder, constraint);
        builder.create_big_mul_add_gate(constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode, opcode_idx);
    }

    // When an expression doesn't fit into a single width-4 gate, we split it across multiple gates and we leverage
    // w4_shift to use the least possible number of intermediate witnesses. See the documentation of
    // split_into_mul_quad_gates for more information.
    for (auto [big_constraint, opcode_idx] : zip_view(constraint_system.big_quad_constraints,
                                                      constraint_system.original_opcode_indices.big_quad_constraints)) {
        create_big_quad_constraint(builder, big_constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode, opcode_idx);
    }

    // Add logic constraint
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraint_system.logic_constraints, constraint_system.original_opcode_indices.logic_constraints)) {
        create_logic_gate(
            builder, constraint.a, constraint.b, constraint.result, constraint.num_bits, constraint.is_xor_gate);
        gate_counter.track_diff(constraint_system.gates_per_opcode, opcode_idx);
    }

    // Add range constraint
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraint_system.range_constraints, constraint_system.original_opcode_indices.range_constraints)) {
        uint32_t range = constraint.num_bits;
        builder.create_range_constraint(constraint.witness, range, "");
        gate_counter.track_diff(constraint_system.gates_per_opcode, opcode_idx);
    }

    // Add aes128 constraints
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraint_system.aes128_constraints, constraint_system.original_opcode_indices.aes128_constraints)) {
        create_aes128_constraints(builder, constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode, opcode_idx);
    }

    // Add sha256 constraints
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraint_system.sha256_compression, constraint_system.original_opcode_indices.sha256_compression)) {
        create_sha256_compression_constraints(builder, constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode, opcode_idx);
    }

    // Add ECDSA k1 constraints
    for (const auto& [constraint, opcode_idx] : zip_view(
             constraint_system.ecdsa_k1_constraints, constraint_system.original_opcode_indices.ecdsa_k1_constraints)) {
        create_ecdsa_verify_constraints<stdlib::secp256k1<Builder>>(builder, constraint, has_valid_witness_assignments);
        gate_counter.track_diff(constraint_system.gates_per_opcode, opcode_idx);
    }

    // Add ECDSA r1 constraints
    for (const auto& [constraint, opcode_idx] : zip_view(
             constraint_system.ecdsa_r1_constraints, constraint_system.original_opcode_indices.ecdsa_r1_constraints)) {
        create_ecdsa_verify_constraints<stdlib::secp256r1<Builder>>(builder, constraint, has_valid_witness_assignments);
        gate_counter.track_diff(constraint_system.gates_per_opcode, opcode_idx);
    }

    // Add blake2s constraints
    for (const auto& [constraint, opcode_idx] : zip_view(
             constraint_system.blake2s_constraints, constraint_system.original_opcode_indices.blake2s_constraints)) {
        create_blake2s_constraints(builder, constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode, opcode_idx);
    }

    // Add blake3 constraints
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraint_system.blake3_constraints, constraint_system.original_opcode_indices.blake3_constraints)) {
        create_blake3_constraints(builder, constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode, opcode_idx);
    }

    // Add keccak permutations
    for (const auto& [constraint, opcode_idx] : zip_view(
             constraint_system.keccak_permutations, constraint_system.original_opcode_indices.keccak_permutations)) {
        create_keccak_permutations(builder, constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode, opcode_idx);
    }

    for (const auto& [constraint, opcode_idx] :
         zip_view(constraint_system.poseidon2_constraints,
                  constraint_system.original_opcode_indices.poseidon2_constraints)) {
        create_poseidon2_permutations(builder, constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode, opcode_idx);
    }

    // Add multi scalar mul constraints
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraint_system.multi_scalar_mul_constraints,
                  constraint_system.original_opcode_indices.multi_scalar_mul_constraints)) {
        create_multi_scalar_mul_constraint(builder, constraint, has_valid_witness_assignments);
        gate_counter.track_diff(constraint_system.gates_per_opcode, opcode_idx);
    }

    // Add ec add constraints
    for (const auto& [constraint, opcode_idx] :
         zip_view(constraint_system.ec_add_constraints, constraint_system.original_opcode_indices.ec_add_constraints)) {
        create_ec_add_constraint(builder, constraint, has_valid_witness_assignments);
        gate_counter.track_diff(constraint_system.gates_per_opcode, opcode_idx);
    }

    // Add block constraints
    for (const auto& [constraint, opcode_indices] :
         zip_view(constraint_system.block_constraints, constraint_system.original_opcode_indices.block_constraints)) {
        create_block_constraints(builder, constraint, has_valid_witness_assignments);
        if (collect_gates_per_opcode) {
            size_t avg_gates_per_opcode = gate_counter.compute_diff() / opcode_indices.size();
            for (size_t opcode_index : opcode_indices) {
                constraint_system.gates_per_opcode[opcode_index] = avg_gates_per_opcode;
            }
        }
    }

    // RecursionConstraints
    const bool is_hn_recursion_constraints = !constraint_system.hn_recursion_constraints.empty();
    HonkRecursionConstraintsOutput<Builder> output = create_recursion_constraints<Builder>(
        builder,
        gate_counter,
        constraint_system.gates_per_opcode,
        metadata.ivc,
        /*honk_recursion_data=*/
        { constraint_system.honk_recursion_constraints,
          constraint_system.original_opcode_indices.honk_recursion_constraints },
        /*avm_recursion_data=*/
        { constraint_system.avm_recursion_constraints,
          constraint_system.original_opcode_indices.avm_recursion_constraints },
        /*hn_recursion_data=*/
        { constraint_system.hn_recursion_constraints,
          constraint_system.original_opcode_indices.hn_recursion_constraints },
        /*chonk_recursion_data=*/
        { constraint_system.chonk_recursion_constraints,
          constraint_system.original_opcode_indices.chonk_recursion_constraints });

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

    Builder builder{ metadata.size_hint, witness, constraints.public_inputs, constraints.varnum };

    build_constraints(builder, program, metadata);

    vinfo("created circuit");

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

    auto op_queue = (metadata.ivc == nullptr) ? std::make_shared<ECCOpQueue>() : metadata.ivc->get_goblin().op_queue;

    // Construct a builder using the witness and public input data from acir and with the goblin-owned op_queue
    auto builder = MegaCircuitBuilder{ op_queue, witness, constraints.public_inputs, constraints.varnum };

    // Populate constraints in the builder via the data in constraint_system
    build_constraints(builder, program, metadata);

    return builder;
};

template void build_constraints<MegaCircuitBuilder>(MegaCircuitBuilder&, AcirProgram&, const ProgramMetadata&);

template void set_zero_idx<UltraCircuitBuilder>(const UltraCircuitBuilder&,
                                                mul_quad_<typename UltraCircuitBuilder::FF>&);

template void set_zero_idx<MegaCircuitBuilder>(const MegaCircuitBuilder&, mul_quad_<typename MegaCircuitBuilder::FF>&);

template void check_mul_add_gate<UltraCircuitBuilder>(UltraCircuitBuilder&,
                                                      const mul_quad_<typename UltraCircuitBuilder::FF>&,
                                                      const typename UltraCircuitBuilder::FF);

template void check_mul_add_gate<MegaCircuitBuilder>(MegaCircuitBuilder&,
                                                     const mul_quad_<typename MegaCircuitBuilder::FF>&,
                                                     const typename MegaCircuitBuilder::FF);

} // namespace acir_format
