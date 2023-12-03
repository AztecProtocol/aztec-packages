#include "acir_format.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/dsl/acir_format/pedersen.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"

namespace acir_format {

void read_witness(Builder& builder, WitnessVector const& witness)
{
    builder.variables[0] = 0;
    for (size_t i = 0; i < witness.size(); ++i) {
        builder.variables[i + 1] = witness[i];
    }
}

void add_public_vars(Builder& builder, acir_format const& constraint_system)
{
    for (size_t i = 1; i < constraint_system.varnum; ++i) {
        // If the index is in the public inputs vector, then we add it as a public input

        if (std::find(constraint_system.public_inputs.begin(), constraint_system.public_inputs.end(), i) !=
            constraint_system.public_inputs.end()) {

            builder.add_public_variable(0);

        } else {
            builder.add_variable(0);
        }
    }
}

void build_constraints(Builder& builder, acir_format const& constraint_system, bool has_valid_witness_assignments)
{
    // Add arithmetic gates
    for (const auto& constraint : constraint_system.constraints) {
        builder.create_poly_gate(constraint);
    }

    // Add logic constraint
    for (const auto& constraint : constraint_system.logic_constraints) {
        create_logic_gate(
            builder, constraint.a, constraint.b, constraint.result, constraint.num_bits, constraint.is_xor_gate);
    }

    // Add range constraint
    for (const auto& constraint : constraint_system.range_constraints) {
        builder.create_range_constraint(constraint.witness, constraint.num_bits, "");
    }

    // Add sha256 constraints
    for (const auto& constraint : constraint_system.sha256_constraints) {
        create_sha256_constraints(builder, constraint);
    }

    // Add schnorr constraints
    for (const auto& constraint : constraint_system.schnorr_constraints) {
        create_schnorr_verify_constraints(builder, constraint);
    }

    // Add ECDSA k1 constraints
    for (const auto& constraint : constraint_system.ecdsa_k1_constraints) {
        create_ecdsa_k1_verify_constraints(builder, constraint, has_valid_witness_assignments);
    }

    // Add ECDSA r1 constraints
    for (const auto& constraint : constraint_system.ecdsa_r1_constraints) {
        create_ecdsa_r1_verify_constraints(builder, constraint, has_valid_witness_assignments);
    }

    // Add blake2s constraints
    for (const auto& constraint : constraint_system.blake2s_constraints) {
        create_blake2s_constraints(builder, constraint);
    }

    // Add keccak constraints
    for (const auto& constraint : constraint_system.keccak_constraints) {
        create_keccak_constraints(builder, constraint);
    }
    for (const auto& constraint : constraint_system.keccak_var_constraints) {
        create_keccak_var_constraints(builder, constraint);
    }

    // Add pedersen constraints
    for (const auto& constraint : constraint_system.pedersen_constraints) {
        create_pedersen_constraint(builder, constraint);
    }

    for (const auto& constraint : constraint_system.pedersen_hash_constraints) {
        create_pedersen_hash_constraint(builder, constraint);
    }

    // Add fixed base scalar mul constraints
    for (const auto& constraint : constraint_system.fixed_base_scalar_mul_constraints) {
        create_fixed_base_constraint(builder, constraint);
    }

    // Add hash to field constraints
    for (const auto& constraint : constraint_system.hash_to_field_constraints) {
        create_hash_to_field_constraints(builder, constraint);
    }

    // Add block constraints
    for (const auto& constraint : constraint_system.block_constraints) {
        create_block_constraints(builder, constraint, has_valid_witness_assignments);
    }

    // These are set and modified whenever we encounter a recursion opcode
    //
    // These should not be set by the caller
    // TODO: Check if this is always the case. ie I won't receive a proof that will set the first
    // TODO input_aggregation_object to be non-zero.
    // TODO: if not, we can add input_aggregation_object to the proof too for all recursive proofs
    // TODO: This might be the case for proof trees where the proofs are created on different machines
    std::array<uint32_t, RecursionConstraint::AGGREGATION_OBJECT_SIZE> current_input_aggregation_object = {
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    };
    std::array<uint32_t, RecursionConstraint::AGGREGATION_OBJECT_SIZE> current_output_aggregation_object = {
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    };

    // Add recursion constraints
    for (size_t i = 0; i < constraint_system.recursion_constraints.size(); ++i) {
        auto& constraint = constraint_system.recursion_constraints[i];
        current_output_aggregation_object = create_recursion_constraints(builder,
                                                                         constraint,
                                                                         current_input_aggregation_object,
                                                                         constraint.nested_aggregation_object,
                                                                         has_valid_witness_assignments);
    }

    // Now that the circuit has been completely built, we add the output aggregation as public
    // inputs and we ensure that they are first in the public inputs vector, so that we can truncate
    // them off of the proof by trimming the first 16 * 32 bytes of the proof.
    if (!constraint_system.recursion_constraints.empty()) {

        // First add the output aggregation object as public inputs
        // Set the indices as public inputs because they are no longer being
        // created in ACIR
        for (const auto& idx : current_output_aggregation_object) {
            builder.set_public_input(idx);
        }

        // Make sure the verification key records the public input indices of the
        // final recursion output.
        std::vector<uint32_t> proof_output_witness_indices(current_output_aggregation_object.begin(),
                                                           current_output_aggregation_object.end());
        builder.set_recursive_proof(proof_output_witness_indices);
    }
}

void create_circuit(Builder& builder, acir_format const& constraint_system)
{
    if (constraint_system.public_inputs.size() > constraint_system.varnum) {
        info("create_circuit: too many public inputs!");
    }

    add_public_vars(builder, constraint_system);
    build_constraints(builder, constraint_system, false);
}

Builder create_circuit(const acir_format& constraint_system, size_t size_hint)
{
    Builder builder(size_hint);
    create_circuit(builder, constraint_system);
    return builder;
}

Builder create_circuit_with_witness(acir_format const& constraint_system,
                                    WitnessVector const& witness,
                                    size_t size_hint)
{
    Builder builder(size_hint);
    create_circuit_with_witness(builder, constraint_system, witness);
    return builder;
}

void create_circuit_with_witness(Builder& builder, acir_format const& constraint_system, WitnessVector const& witness)
{
    if (constraint_system.public_inputs.size() > constraint_system.varnum) {
        info("create_circuit_with_witness: too many public inputs!");
    }

    add_public_vars(builder, constraint_system);
    read_witness(builder, witness);
    build_constraints(builder, constraint_system, true);
}

} // namespace acir_format
