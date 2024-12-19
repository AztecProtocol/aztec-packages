#include "acir_format.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/ivc_recursion_constraint.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "proof_surgeon.hpp"
#include <cstddef>
#include <cstdint>

namespace acir_format {

using namespace bb;

template class DSLBigInts<UltraCircuitBuilder>;
template class DSLBigInts<MegaCircuitBuilder>;

template <typename Builder> struct HonkRecursionConstraintsOutput {
    PairingPointAccumulatorIndices agg_obj_indices;
    OpeningClaim<stdlib::grumpkin<Builder>> ipa_claim;
    HonkProof ipa_proof;
};

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
    for (size_t i = 0; i < constraint_system.poly_triple_constraints.size(); ++i) {
        const auto& constraint = constraint_system.poly_triple_constraints.at(i);
        builder.create_poly_gate(constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.poly_triple_constraints.at(i));
    }

    for (size_t i = 0; i < constraint_system.quad_constraints.size(); ++i) {
        const auto& constraint = constraint_system.quad_constraints.at(i);
        builder.create_big_mul_gate(constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.quad_constraints.at(i));
    }
    // Oversize gates are a vector of mul_quad gates.
    for (size_t i = 0; i < constraint_system.big_quad_constraints.size(); ++i) {
        auto& big_constraint = constraint_system.big_quad_constraints.at(i);
        fr next_w4_wire_value = fr(0);
        // Define the 4th wire of these mul_quad gates, which is implicitly used by the previous gate.
        for (size_t j = 0; j < big_constraint.size() - 1; ++j) {
            if (j == 0) {
                next_w4_wire_value = builder.get_variable(big_constraint[0].d);
            } else {
                uint32_t next_w4_wire = builder.add_variable(next_w4_wire_value);
                big_constraint[j].d = next_w4_wire;
                big_constraint[j].d_scaling = fr(-1);
            }
            builder.create_big_mul_add_gate(big_constraint[j], true);
            next_w4_wire_value = builder.get_variable(big_constraint[j].a) * builder.get_variable(big_constraint[j].b) *
                                     big_constraint[j].mul_scaling +
                                 builder.get_variable(big_constraint[j].a) * big_constraint[j].a_scaling +
                                 builder.get_variable(big_constraint[j].b) * big_constraint[j].b_scaling +
                                 builder.get_variable(big_constraint[j].c) * big_constraint[j].c_scaling +
                                 next_w4_wire_value * big_constraint[j].d_scaling + big_constraint[j].const_scaling;
            next_w4_wire_value = -next_w4_wire_value;
        }
        uint32_t next_w4_wire = builder.add_variable(next_w4_wire_value);
        big_constraint.back().d = next_w4_wire;
        big_constraint.back().d_scaling = fr(-1);
        builder.create_big_mul_add_gate(big_constraint.back(), false);
    }

    // Add logic constraint
    for (size_t i = 0; i < constraint_system.logic_constraints.size(); ++i) {
        const auto& constraint = constraint_system.logic_constraints.at(i);
        create_logic_gate(
            builder, constraint.a, constraint.b, constraint.result, constraint.num_bits, constraint.is_xor_gate);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.logic_constraints.at(i));
    }

    // Add range constraint
    for (size_t i = 0; i < constraint_system.range_constraints.size(); ++i) {
        const auto& constraint = constraint_system.range_constraints.at(i);
        uint32_t range = constraint.num_bits;
        if (constraint_system.minimal_range.contains(constraint.witness)) {
            range = constraint_system.minimal_range[constraint.witness];
        }
        builder.create_range_constraint(constraint.witness, range, "");
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.range_constraints.at(i));
    }

    // Add aes128 constraints
    for (size_t i = 0; i < constraint_system.aes128_constraints.size(); ++i) {
        const auto& constraint = constraint_system.aes128_constraints.at(i);
        create_aes128_constraints(builder, constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.aes128_constraints.at(i));
    }

    // Add sha256 constraints
    for (size_t i = 0; i < constraint_system.sha256_compression.size(); ++i) {
        const auto& constraint = constraint_system.sha256_compression[i];
        create_sha256_compression_constraints(builder, constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.sha256_compression[i]);
    }

    // Add ECDSA k1 constraints
    for (size_t i = 0; i < constraint_system.ecdsa_k1_constraints.size(); ++i) {
        const auto& constraint = constraint_system.ecdsa_k1_constraints.at(i);
        create_ecdsa_k1_verify_constraints(builder, constraint, has_valid_witness_assignments);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.ecdsa_k1_constraints.at(i));
    }

    // Add ECDSA r1 constraints
    for (size_t i = 0; i < constraint_system.ecdsa_r1_constraints.size(); ++i) {
        const auto& constraint = constraint_system.ecdsa_r1_constraints.at(i);
        create_ecdsa_r1_verify_constraints(builder, constraint, has_valid_witness_assignments);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.ecdsa_r1_constraints.at(i));
    }

    // Add blake2s constraints
    for (size_t i = 0; i < constraint_system.blake2s_constraints.size(); ++i) {
        const auto& constraint = constraint_system.blake2s_constraints.at(i);
        create_blake2s_constraints(builder, constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.blake2s_constraints.at(i));
    }

    // Add blake3 constraints
    for (size_t i = 0; i < constraint_system.blake3_constraints.size(); ++i) {
        const auto& constraint = constraint_system.blake3_constraints.at(i);
        create_blake3_constraints(builder, constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.blake3_constraints.at(i));
    }

    // Add keccak permutations
    for (size_t i = 0; i < constraint_system.keccak_permutations.size(); ++i) {
        const auto& constraint = constraint_system.keccak_permutations[i];
        create_keccak_permutations(builder, constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.keccak_permutations[i]);
    }

    for (size_t i = 0; i < constraint_system.poseidon2_constraints.size(); ++i) {
        const auto& constraint = constraint_system.poseidon2_constraints.at(i);
        create_poseidon2_permutations(builder, constraint);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.poseidon2_constraints.at(i));
    }

    // Add multi scalar mul constraints
    for (size_t i = 0; i < constraint_system.multi_scalar_mul_constraints.size(); ++i) {
        const auto& constraint = constraint_system.multi_scalar_mul_constraints.at(i);
        create_multi_scalar_mul_constraint(builder, constraint, has_valid_witness_assignments);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.multi_scalar_mul_constraints.at(i));
    }

    // Add ec add constraints
    for (size_t i = 0; i < constraint_system.ec_add_constraints.size(); ++i) {
        const auto& constraint = constraint_system.ec_add_constraints.at(i);
        create_ec_add_constraint(builder, constraint, has_valid_witness_assignments);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.ec_add_constraints.at(i));
    }

    // Add block constraints
    for (size_t i = 0; i < constraint_system.block_constraints.size(); ++i) {
        const auto& constraint = constraint_system.block_constraints.at(i);
        create_block_constraints(builder, constraint, has_valid_witness_assignments);
        if (collect_gates_per_opcode) {
            size_t avg_gates_per_opcode =
                gate_counter.compute_diff() / constraint_system.original_opcode_indices.block_constraints.at(i).size();
            for (size_t opcode_index : constraint_system.original_opcode_indices.block_constraints.at(i)) {
                constraint_system.gates_per_opcode[opcode_index] = avg_gates_per_opcode;
            }
        }
    }

    // Add big_int constraints
    DSLBigInts<Builder> dsl_bigints;
    dsl_bigints.set_builder(&builder);
    for (size_t i = 0; i < constraint_system.bigint_from_le_bytes_constraints.size(); ++i) {
        const auto& constraint = constraint_system.bigint_from_le_bytes_constraints.at(i);
        create_bigint_from_le_bytes_constraint(builder, constraint, dsl_bigints);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.bigint_from_le_bytes_constraints.at(i));
    }

    for (size_t i = 0; i < constraint_system.bigint_operations.size(); ++i) {
        const auto& constraint = constraint_system.bigint_operations[i];
        create_bigint_operations_constraint<Builder>(constraint, dsl_bigints, has_valid_witness_assignments);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.bigint_operations[i]);
    }

    for (size_t i = 0; i < constraint_system.bigint_to_le_bytes_constraints.size(); ++i) {
        const auto& constraint = constraint_system.bigint_to_le_bytes_constraints.at(i);
        create_bigint_to_le_bytes_constraint(builder, constraint, dsl_bigints);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.bigint_to_le_bytes_constraints.at(i));
    }

    // assert equals
    for (size_t i = 0; i < constraint_system.assert_equalities.size(); ++i) {
        const auto& constraint = constraint_system.assert_equalities.at(i);
        builder.assert_equal(constraint.a, constraint.b);
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.assert_equalities.at(i));
    }

    // RecursionConstraints
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/817): disable these for MegaHonk for now since we're
    // not yet dealing with proper recursion
    if constexpr (IsMegaBuilder<Builder>) {
        if (!constraint_system.recursion_constraints.empty()) {
            info("WARNING: this circuit contains unhandled recursion_constraints!");
        }
        if (!constraint_system.honk_recursion_constraints.empty()) {
            info("WARNING: this circuit contains unhandled honk_recursion_constraints!");
        }
        if (!constraint_system.avm_recursion_constraints.empty()) {
            info("WARNING: this circuit contains unhandled avm_recursion_constraints!");
        }
        if (!constraint_system.ivc_recursion_constraints.empty()) {
            process_ivc_recursion_constraints(builder, constraint_system, metadata.ivc, has_valid_witness_assignments);
        }
    } else {
        process_plonk_recursion_constraints(builder, constraint_system, has_valid_witness_assignments, gate_counter);
        PairingPointAccumulatorIndices current_aggregation_object =
            stdlib::recursion::init_default_agg_obj_indices<Builder>(builder);
        HonkRecursionConstraintsOutput<Builder> output =
            process_honk_recursion_constraints(builder,
                                               constraint_system,
                                               has_valid_witness_assignments,
                                               gate_counter,
                                               current_aggregation_object,
                                               metadata.honk_recursion);
        current_aggregation_object = output.agg_obj_indices;

#ifndef DISABLE_AZTEC_VM
        current_aggregation_object = process_avm_recursion_constraints(
            builder, constraint_system, has_valid_witness_assignments, gate_counter, current_aggregation_object);
#endif
        // If the circuit has either honk or avm recursion constraints, add the aggregation object. Otherwise, add a
        // default one if the circuit is recursive and honk_recursion is true.
        if (!constraint_system.honk_recursion_constraints.empty() ||
            !constraint_system.avm_recursion_constraints.empty()) {
            ASSERT(metadata.honk_recursion != 0);
            builder.add_pairing_point_accumulator(current_aggregation_object);
        } else if (metadata.honk_recursion != 0 && builder.is_recursive_circuit) {
            // Make sure the verification key records the public input indices of the
            // final recursion output.
            builder.add_pairing_point_accumulator(current_aggregation_object);
        }
        ASSERT((metadata.honk_recursion == 2) == (output.ipa_proof.size() > 0));
        if (metadata.honk_recursion == 2) {
            builder.add_ipa_claim(output.ipa_claim.get_witness_indices());
            builder.ipa_proof = output.ipa_proof;
        }
    }
}

void process_plonk_recursion_constraints(Builder& builder,
                                         AcirFormat& constraint_system,
                                         bool has_valid_witness_assignments,
                                         GateCounter<Builder>& gate_counter)
{

    // These are set and modified whenever we encounter a recursion opcode
    //
    // These should not be set by the caller
    // TODO(maxim): Check if this is always the case. ie I won't receive a proof that will set the first
    // TODO(maxim): input_aggregation_object to be non-zero.
    // TODO(maxim): if not, we can add input_aggregation_object to the proof too for all recursive proofs
    // TODO(maxim): This might be the case for proof trees where the proofs are created on different machines
    PairingPointAccumulatorIndices current_input_aggregation_object = {
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    };
    PairingPointAccumulatorIndices current_output_aggregation_object = {
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    };

    // Get the size of proof with no public inputs prepended to it
    // This is used while processing recursion constraints to determine whether
    // the proof we are verifying contains a recursive proof itself
    auto proof_size_no_pub_inputs = recursion_proof_size_without_public_inputs();

    // Add recursion constraints
    for (size_t constraint_idx = 0; constraint_idx < constraint_system.recursion_constraints.size(); ++constraint_idx) {
        auto constraint = constraint_system.recursion_constraints[constraint_idx];

        // A proof passed into the constraint should be stripped of its public inputs, except in
        // the case where a proof contains an aggregation object itself. We refer to this as the
        // `nested_aggregation_object`. The verifier circuit requires that the indices to a
        // nested proof aggregation state are a circuit constant. The user tells us they how
        // they want these constants set by keeping the nested aggregation object attached to
        // the proof as public inputs. As this is the only object that can prepended to the
        // proof if the proof is above the expected size (with public inputs stripped)
        PairingPointAccumulatorPubInputIndices nested_aggregation_object = {};
        // If the proof has public inputs attached to it, we should handle setting the nested
        // aggregation object
        if (constraint.proof.size() > proof_size_no_pub_inputs) {
            // The public inputs attached to a proof should match the aggregation object in size
            if (constraint.proof.size() - proof_size_no_pub_inputs != bb::PAIRING_POINT_ACCUMULATOR_SIZE) {
                auto error_string = format("Public inputs are always stripped from proofs "
                                           "unless we have a recursive proof.\n"
                                           "Thus, public inputs attached to a proof must match "
                                           "the recursive aggregation object in size "
                                           "which is ",
                                           bb::PAIRING_POINT_ACCUMULATOR_SIZE);
                throw_or_abort(error_string);
            }
            for (size_t i = 0; i < bb::PAIRING_POINT_ACCUMULATOR_SIZE; ++i) {
                // Set the nested aggregation object indices to the current size of the public
                // inputs This way we know that the nested aggregation object indices will
                // always be the last indices of the public inputs
                nested_aggregation_object[i] = static_cast<uint32_t>(constraint.public_inputs.size());
                // Attach the nested aggregation object to the end of the public inputs to fill
                // in the slot where the nested aggregation object index will point into
                constraint.public_inputs.emplace_back(constraint.proof[i]);
            }
            // Remove the aggregation object so that they can be handled as normal public inputs
            // in the way that the recursion constraint expects
            constraint.proof.erase(constraint.proof.begin(),
                                   constraint.proof.begin() +
                                       static_cast<std::ptrdiff_t>(bb::PAIRING_POINT_ACCUMULATOR_SIZE));
        }

        current_output_aggregation_object = create_recursion_constraints(builder,
                                                                         constraint,
                                                                         current_input_aggregation_object,
                                                                         nested_aggregation_object,
                                                                         has_valid_witness_assignments);
        current_input_aggregation_object = current_output_aggregation_object;
        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.recursion_constraints[constraint_idx]);
    }

    // Now that the circuit has been completely built, we add the output aggregation as public
    // inputs.
    if (!constraint_system.recursion_constraints.empty()) {

        // Make sure the verification key records the public input indices of the
        // final recursion output.
        builder.add_pairing_point_accumulator(current_output_aggregation_object);
    }
}

HonkRecursionConstraintsOutput<Builder> process_honk_recursion_constraints(
    Builder& builder,
    AcirFormat& constraint_system,
    bool has_valid_witness_assignments,
    GateCounter<Builder>& gate_counter,
    PairingPointAccumulatorIndices current_aggregation_object,
    uint32_t honk_recursion)
{
    HonkRecursionConstraintsOutput<Builder> output;
    // Add recursion constraints
    size_t idx = 0;
    std::vector<OpeningClaim<stdlib::grumpkin<Builder>>> nested_ipa_claims;
    std::vector<StdlibProof<Builder>> nested_ipa_proofs;
    for (auto& constraint : constraint_system.honk_recursion_constraints) {
        if (constraint.proof_type == HONK) {
            auto [next_aggregation_object, _ipa_claim, _ipa_proof] =
                create_honk_recursion_constraints<UltraRecursiveFlavor_<Builder>>(
                    builder, constraint, current_aggregation_object, has_valid_witness_assignments);
            current_aggregation_object = next_aggregation_object;
        } else if (constraint.proof_type == ROLLUP_HONK || constraint.proof_type == ROLLUP_ROOT_HONK) {
            auto [next_aggregation_object, ipa_claim, ipa_proof] =
                create_honk_recursion_constraints<UltraRollupRecursiveFlavor_<Builder>>(
                    builder, constraint, current_aggregation_object, has_valid_witness_assignments);
            current_aggregation_object = next_aggregation_object;

            nested_ipa_claims.push_back(ipa_claim);
            nested_ipa_proofs.push_back(ipa_proof);
        } else {
            throw_or_abort("Invalid Honk proof type");
        }

        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.honk_recursion_constraints.at(idx++));
    }
    // Accumulate the claims
    if (nested_ipa_claims.size() == 2) {
        // init Grumpkin CRS
        auto commitment_key = std::make_shared<CommitmentKey<curve::Grumpkin>>(1 << CONST_ECCVM_LOG_N);
        using StdlibTranscript = bb::stdlib::recursion::honk::UltraStdlibTranscript;

        auto ipa_transcript_1 = std::make_shared<StdlibTranscript>(nested_ipa_proofs[0]);
        auto ipa_transcript_2 = std::make_shared<StdlibTranscript>(nested_ipa_proofs[1]);
        auto [ipa_claim, ipa_proof] = IPA<stdlib::grumpkin<Builder>>::accumulate(
            commitment_key, ipa_transcript_1, nested_ipa_claims[0], ipa_transcript_2, nested_ipa_claims[1]);
        output.ipa_claim = ipa_claim;
        output.ipa_proof = ipa_proof;
    } else if (nested_ipa_claims.size() == 1) {
        output.ipa_claim = nested_ipa_claims[0];
        // This conversion looks suspicious but there's no need to make this an output of the circuit since its a proof
        // that will be checked anyway.
        output.ipa_proof = convert_stdlib_proof_to_native(nested_ipa_proofs[0]);
    } else if (nested_ipa_claims.size() > 2) {
        throw_or_abort("Too many nested IPA claims to accumulate");
    } else {
        if (honk_recursion == 2) {
            info("Proving with UltraRollupHonk but no IPA claims exist.");
            // just create some fake IPA claim and proof
            using NativeCurve = curve::Grumpkin;
            using Curve = stdlib::grumpkin<Builder>;
            auto ipa_transcript = std::make_shared<NativeTranscript>();
            auto ipa_commitment_key = std::make_shared<CommitmentKey<NativeCurve>>(1 << CONST_ECCVM_LOG_N);
            size_t n = 4;
            auto poly = Polynomial<fq>(n);
            for (size_t i = 0; i < n; i++) {
                poly.at(i) = fq::random_element();
            }
            fq x = fq::random_element();
            fq eval = poly.evaluate(x);
            auto commitment = ipa_commitment_key->commit(poly);
            const OpeningPair<NativeCurve> opening_pair = { x, eval };
            IPA<NativeCurve>::compute_opening_proof(ipa_commitment_key, { poly, opening_pair }, ipa_transcript);

            auto stdlib_comm = Curve::Group::from_witness(&builder, commitment);
            auto stdlib_x = Curve::ScalarField::from_witness(&builder, x);
            auto stdlib_eval = Curve::ScalarField::from_witness(&builder, eval);
            OpeningClaim<Curve> stdlib_opening_claim{ { stdlib_x, stdlib_eval }, stdlib_comm };
            output.ipa_claim = stdlib_opening_claim;
            output.ipa_proof = ipa_transcript->export_proof();
        }
    }
    output.agg_obj_indices = current_aggregation_object;
    return output;
}

void process_ivc_recursion_constraints(MegaCircuitBuilder& builder,
                                       AcirFormat& constraints,
                                       const std::shared_ptr<ClientIVC>& ivc,
                                       bool has_valid_witness_assignments)
{
    using StdlibVerificationKey = ClientIVC::RecursiveVerificationKey;

    // We expect the length of the internal verification queue to match the number of ivc recursion constraints
    if (constraints.ivc_recursion_constraints.size() != ivc->verification_queue.size()) {
        info("WARNING: Mismatch in number of recursive verifications during kernel creation!");
        ASSERT(false);
    }

    // If no witness is provided, populate the VK and public inputs in the recursion constraint with dummy values so
    // that the present kernel circuit is constructed correctly. (Used for constructing VKs without witnesses).
    if (!has_valid_witness_assignments) {
        // Create stdlib representations of each {proof, vkey} pair to be recursively verified
        for (auto [constraint, queue_entry] :
             zip_view(constraints.ivc_recursion_constraints, ivc->verification_queue)) {
            populate_dummy_vk_in_constraint(builder, queue_entry.honk_verification_key, constraint.key);
        }
    }

    // Construct a stdlib verification key for each constraint based on the verification key witness indices therein
    std::vector<std::shared_ptr<StdlibVerificationKey>> stdlib_verification_keys;
    stdlib_verification_keys.reserve(constraints.ivc_recursion_constraints.size());
    for (const auto& constraint : constraints.ivc_recursion_constraints) {
        stdlib_verification_keys.push_back(std::make_shared<StdlibVerificationKey>(
            StdlibVerificationKey::from_witness_indices(builder, constraint.key)));
    }
    // Create stdlib representations of each {proof, vkey} pair to be recursively verified
    ivc->instantiate_stdlib_verification_queue(builder, stdlib_verification_keys);

    // Connect the public_input witnesses in each constraint to the corresponding public input witnesses in the internal
    // verification queue. This ensures that the witnesses utlized in constraints generated based on acir are properly
    // connected to the constraints generated herein via the ivc scheme (e.g. recursive verifications).
    for (auto [constraint, queue_entry] :
         zip_view(constraints.ivc_recursion_constraints, ivc->stdlib_verification_queue)) {

        // Get the witness indices for the public inputs contained within the proof in the verification queue
        std::vector<uint32_t> public_input_indices = ProofSurgeon::get_public_inputs_witness_indices_from_proof(
            queue_entry.proof, constraint.public_inputs.size());

        // Assert equality between the internal public input witness indices and those in the acir constraint
        for (auto [witness_idx, constraint_witness_idx] : zip_view(public_input_indices, constraint.public_inputs)) {
            builder.assert_equal(witness_idx, constraint_witness_idx);
        }
    }

    // Complete the kernel circuit with all required recursive verifications, databus consistency checks etc.
    ivc->complete_kernel_circuit_logic(builder);
}

#ifndef DISABLE_AZTEC_VM
PairingPointAccumulatorIndices process_avm_recursion_constraints(
    Builder& builder,
    AcirFormat& constraint_system,
    bool has_valid_witness_assignments,
    GateCounter<Builder>& gate_counter,
    PairingPointAccumulatorIndices current_aggregation_object)
{
    // Add recursion constraints
    size_t idx = 0;
    for (auto& constraint : constraint_system.avm_recursion_constraints) {
        current_aggregation_object = create_avm_recursion_constraints(
            builder, constraint, current_aggregation_object, has_valid_witness_assignments);

        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.avm_recursion_constraints.at(idx++));
    }
    return current_aggregation_object;
}
#endif // DISABLE_AZTEC_VM

/**
 * @brief Specialization for creating an Ultra circuit from an acir program
 *
 * @param program constraints and optionally a witness
 * @param metadata additional data needed to construct the circuit
 */
template <> UltraCircuitBuilder create_circuit(AcirProgram& program, const ProgramMetadata& metadata)
{
    AcirFormat& constraints = program.constraints;
    WitnessVector& witness = program.witness;

    Builder builder{ metadata.size_hint, witness, constraints.public_inputs, constraints.varnum, metadata.recursive };

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
    AcirFormat& constraints = program.constraints;
    WitnessVector& witness = program.witness;

    auto op_queue = (metadata.ivc == nullptr) ? std::make_shared<ECCOpQueue>() : metadata.ivc->goblin.op_queue;

    // Construct a builder using the witness and public input data from acir and with the goblin-owned op_queue
    auto builder = MegaCircuitBuilder{ op_queue, witness, constraints.public_inputs, constraints.varnum };

    // Populate constraints in the builder via the data in constraint_system
    build_constraints(builder, program, metadata);

    return builder;
};

/**
 * @brief Specialization for creating Ultra circuit from acir constraints and optionally a witness
 *
 * @tparam Builder
 * @param constraint_system
 * @param size_hint
 * @param witness
 * @return Builder
 */
template <>
UltraCircuitBuilder create_circuit(AcirFormat& constraint_system,
                                   bool recursive,
                                   const size_t size_hint,
                                   const WitnessVector& witness,
                                   uint32_t honk_recursion,
                                   [[maybe_unused]] std::shared_ptr<ECCOpQueue>,
                                   bool collect_gates_per_opcode)
{
    Builder builder{ size_hint, witness, constraint_system.public_inputs, constraint_system.varnum, recursive };

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .recursive = recursive,
                                    .honk_recursion = honk_recursion,
                                    .collect_gates_per_opcode = collect_gates_per_opcode,
                                    .size_hint = size_hint };
    build_constraints(builder, program, metadata);

    vinfo("created circuit");

    return builder;
};

template void build_constraints<MegaCircuitBuilder>(MegaCircuitBuilder&, AcirProgram&, const ProgramMetadata&);

} // namespace acir_format
