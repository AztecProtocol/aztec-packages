#include "acir_format.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/dsl/acir_format/pedersen.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"

namespace acir_format {

template <typename Builder>
void construct_variables_and_public_inputs(Builder& builder,
                                           WitnessVector const& witness,
                                           acir_format const& constraint_system)
{
    // WORKTODO(ZEROINDEX): When the noir PR removing the +1 goes in, this correction goes away
    std::vector<uint32_t> corrected_public_inputs;
    for (const auto& index : constraint_system.public_inputs) {
        corrected_public_inputs.emplace_back(index - 1);
    }

    for (size_t idx = 0; idx < witness.size(); ++idx) {
        if (std::find(corrected_public_inputs.begin(), corrected_public_inputs.end(), idx) !=
            corrected_public_inputs.end()) {
            builder.add_public_variable(witness[idx]);
        } else {
            builder.add_variable(witness[idx]);
        }
    }
}

template <typename Builder> void read_witness(Builder& builder, WitnessVector const& witness)
{
    builder.variables[0] = 0; // WORKTODO(ZEROINDEX): what's this? is this the constant 0 hacked in?
    // WORKTODO: is the structure demonstrated in this loop the reason to populate the builder constraints twice?
    // Prob not, kinda doesn't make sense, big hack to avoid resizing...
    for (size_t i = 0; i < witness.size(); ++i) {
        // WORKTODO(ZEROINDEX): the i+1 accounts for the fact that 0 is added as a constant in variables in the UCB
        // constructor. "witness" only contains the values that came directly from acir.
        builder.variables[i + 1] = witness[i];
    }
}

// WORKTODO: this function does two things: 1) emplaces back varnum-many 0s into builder.variables (.. dumb), and
// (2) populates builder.public_inputs with the correct indices into the variables vector (which at this stage will
// be populated with zeros). The actual entries of the variables vector are populated in "read_witness"
template <typename Builder> void add_public_vars(Builder& builder, acir_format const& constraint_system)
{
    // WORKTODO(ZEROINDEX): i = 1 acounting for const 0 in first position?
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

template <typename Builder>
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

    // Add recursion constraints
    // WORKTODO: disable these for both UH and UGH for now for consistency
    // if constexpr (!IsGoblinBuilder<Builder>) {
    //     for (size_t i = 0; i < constraint_system.recursion_constraints.size(); ++i) {
    //         auto& constraint = constraint_system.recursion_constraints[i];
    //         create_recursion_constraints(builder, constraint, has_valid_witness_assignments);

    //         // make sure the verification key records the public input indices of the final recursion output
    //         // (N.B. up to the ACIR description to make sure that the final output aggregation object wires are
    //         public
    //         // inputs!)
    //         if (i == constraint_system.recursion_constraints.size() - 1) {
    //             std::vector<uint32_t> proof_output_witness_indices(constraint.output_aggregation_object.begin(),
    //                                                                constraint.output_aggregation_object.end());
    //             builder.set_recursive_proof(proof_output_witness_indices);
    //         }
    //     }
    // }
    // WORKTODO(NEW_CONSTRAINTS): add new constraint types here
    // WORKTODO(NEW_CONSTRAINTS): this gets called twice? understand why.
}

template <typename Builder> void create_circuit(Builder& builder, acir_format const& constraint_system)
{
    if (constraint_system.public_inputs.size() > constraint_system.varnum) {
        info("create_circuit: too many public inputs!");
    }

    add_public_vars(builder, constraint_system);
    build_constraints(builder, constraint_system, false);
}

template <typename Builder> Builder create_circuit(const acir_format& constraint_system, size_t size_hint)
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

template <typename Builder>
void create_circuit_with_witness(Builder& builder, acir_format const& constraint_system, WitnessVector const& witness)
{
    if (constraint_system.public_inputs.size() > constraint_system.varnum) {
        info("create_circuit_with_witness: too many public inputs!");
    }

    // add_public_vars(builder, constraint_system);
    // read_witness(builder, witness);
    construct_variables_and_public_inputs(builder, witness, constraint_system);

    build_constraints(builder, constraint_system, true);
}

template UltraCircuitBuilder create_circuit<UltraCircuitBuilder>(const acir_format& constraint_system,
                                                                 size_t size_hint);
template void create_circuit_with_witness<GoblinUltraCircuitBuilder>(GoblinUltraCircuitBuilder& builder,
                                                                     acir_format const& constraint_system,
                                                                     WitnessVector const& witness);

} // namespace acir_format
