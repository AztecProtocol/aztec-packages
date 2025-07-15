// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "acir_format.hpp"

#include "barretenberg/common/log.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/honk_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/ivc_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/honk/proving_key_inspector.hpp"
#include "barretenberg/stdlib/eccvm_verifier/verifier_commitment_key.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <cstddef>
#include <cstdint>
#include <memory>

namespace acir_format {

using namespace bb;

template class DSLBigInts<UltraCircuitBuilder>;
template class DSLBigInts<MegaCircuitBuilder>;

template <typename Builder>
void handle_IPA_accumulation(Builder& builder,
                             const std::vector<OpeningClaim<stdlib::grumpkin<Builder>>>& nested_ipa_claims,
                             const std::vector<stdlib::Proof<Builder>>& nested_ipa_proofs,
                             bool is_root_rollup);

template <typename Builder> struct HonkRecursionConstraintsOutput {
    using PairingPoints = stdlib::recursion::PairingPoints<Builder>;
    PairingPoints points_accumulator;
    std::vector<OpeningClaim<stdlib::grumpkin<Builder>>> nested_ipa_claims;
    std::vector<stdlib::Proof<Builder>> nested_ipa_proofs;
    bool is_root_rollup = false;
};

template <typename Builder>
void build_constraints(Builder& builder, AcirProgram& program, const ProgramMetadata& metadata)
{
    using PairingPoints = stdlib::recursion::PairingPoints<Builder>;
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
    if constexpr (IsMegaBuilder<Builder>) {
        if (!constraint_system.honk_recursion_constraints.empty()) {
            HonkRecursionConstraintsOutput<Builder> output = process_honk_recursion_constraints(
                builder, constraint_system, has_valid_witness_assignments, gate_counter);
            output.points_accumulator.set_public();
        }
        if (!constraint_system.avm_recursion_constraints.empty()) {
            info("WARNING: this circuit contains unhandled avm_recursion_constraints!");
        }
        if (!constraint_system.ivc_recursion_constraints.empty()) {
            process_ivc_recursion_constraints(
                builder, constraint_system, metadata.ivc, has_valid_witness_assignments, gate_counter);
        }

        // We shouldn't have both honk recursion constraints and ivc recursion constraints.
        ASSERT((constraint_system.honk_recursion_constraints.empty() ||
                constraint_system.ivc_recursion_constraints.empty()) &&
               "Invalid circuit: both honk and ivc recursion constraints present.");
        // If its an app circuit that has no recursion constraints, add default pairing points to public inputs.
        if (constraint_system.honk_recursion_constraints.empty() &&
            constraint_system.ivc_recursion_constraints.empty()) {
            PairingPoints::add_default_to_public_inputs(builder);
        }
    } else {
        HonkRecursionConstraintsOutput<Builder> honk_output =
            process_honk_recursion_constraints(builder, constraint_system, has_valid_witness_assignments, gate_counter);

#ifndef DISABLE_AZTEC_VM
        HonkRecursionConstraintsOutput<Builder> avm_output =
            process_avm_recursion_constraints(builder, constraint_system, has_valid_witness_assignments, gate_counter);

        // This is a little annoying, but we should probably be explicit about these things so that its obvious how the
        // pairing points are being aggregated.
        if (honk_output.points_accumulator.has_data) {
            if (avm_output.points_accumulator.has_data) {
                honk_output.points_accumulator.aggregate(avm_output.points_accumulator);
            }
        } else {
            if (avm_output.points_accumulator.has_data) {
                honk_output.points_accumulator = avm_output.points_accumulator;
            }
        }
        // Append the (potentially 0) ipa claims and proofs to honk_output
        honk_output.nested_ipa_claims.insert(honk_output.nested_ipa_claims.end(),
                                             avm_output.nested_ipa_claims.begin(),
                                             avm_output.nested_ipa_claims.end());
        honk_output.nested_ipa_proofs.insert(honk_output.nested_ipa_proofs.end(),
                                             avm_output.nested_ipa_proofs.begin(),
                                             avm_output.nested_ipa_proofs.end());
#endif
        // If the circuit has either honk or avm recursion constraints, add the aggregation object. Otherwise, add a
        // default one if the circuit is recursive and honk_recursion is true.
        if (!constraint_system.honk_recursion_constraints.empty() ||
            !constraint_system.avm_recursion_constraints.empty()) {
            ASSERT(metadata.honk_recursion != 0);
            honk_output.points_accumulator.set_public();
        } else if (metadata.honk_recursion != 0) {
            // Make sure the verification key records the public input indices of the
            // final recursion output.
            PairingPoints::add_default_to_public_inputs(builder);
        }

        // Accumulate the IPA claims and set it to be public inputs
        // Either we're proving with RollupHonk (honk_recursion=2) or its the root rollup.
        if (metadata.honk_recursion == 2 || honk_output.is_root_rollup) {
            handle_IPA_accumulation(
                builder, honk_output.nested_ipa_claims, honk_output.nested_ipa_proofs, honk_output.is_root_rollup);
        } else {
            // We shouldn't accidentally have IPA proofs otherwise.
            BB_ASSERT_EQ(
                honk_output.nested_ipa_proofs.size(), static_cast<size_t>(0), "IPA proofs present when not expected.");
        }
    }
}

/**
 * @brief Set the IPA claim and proof.
 *
 * @tparam Builder
 * @param builder
 * @param nested_ipa_claims
 * @param nested_ipa_proofs
 * @param is_root_rollup
 */
template <typename Builder>
void handle_IPA_accumulation(Builder& builder,
                             const std::vector<OpeningClaim<stdlib::grumpkin<Builder>>>& nested_ipa_claims,
                             const std::vector<stdlib::Proof<Builder>>& nested_ipa_proofs,
                             bool is_root_rollup)
{
    BB_ASSERT_EQ(
        nested_ipa_claims.size(), nested_ipa_proofs.size(), "Mismatched number of nested IPA claims and proofs.");
    OpeningClaim<stdlib::grumpkin<Builder>> final_ipa_claim;
    HonkProof final_ipa_proof;
    if (is_root_rollup) {
        ASSERT(nested_ipa_claims.size() == 2 && "Root rollup must have two nested IPA claims.");
    }
    if (nested_ipa_claims.size() == 2) {
        // If we have two claims, accumulate.
        CommitmentKey<curve::Grumpkin> commitment_key(1 << CONST_ECCVM_LOG_N);
        using StdlibTranscript = bb::stdlib::recursion::honk::UltraStdlibTranscript;

        auto ipa_transcript_1 = std::make_shared<StdlibTranscript>();
        ipa_transcript_1->load_proof(nested_ipa_proofs[0]);
        auto ipa_transcript_2 = std::make_shared<StdlibTranscript>();
        ipa_transcript_2->load_proof(nested_ipa_proofs[1]);
        auto [ipa_claim, ipa_proof] = IPA<stdlib::grumpkin<Builder>>::accumulate(
            commitment_key, ipa_transcript_1, nested_ipa_claims[0], ipa_transcript_2, nested_ipa_claims[1]);
        // If this is the root rollup, do full IPA verification
        if (is_root_rollup) {
            VerifierCommitmentKey<stdlib::grumpkin<Builder>> verifier_commitment_key(
                &builder, 1 << CONST_ECCVM_LOG_N, VerifierCommitmentKey<curve::Grumpkin>(1 << CONST_ECCVM_LOG_N));
            // do full IPA verification
            auto accumulated_ipa_transcript = std::make_shared<StdlibTranscript>();
            accumulated_ipa_transcript->load_proof(stdlib::Proof<Builder>(builder, ipa_proof));
            IPA<stdlib::grumpkin<Builder>>::full_verify_recursive(
                verifier_commitment_key, ipa_claim, accumulated_ipa_transcript);
        } else {
            final_ipa_claim = ipa_claim;
            final_ipa_proof = ipa_proof;
        }
    } else if (nested_ipa_claims.size() == 1) {
        // If we have one claim, just forward it along.
        final_ipa_claim = nested_ipa_claims[0];
        // This conversion looks suspicious but there's no need to make this an output of the circuit since
        // its a proof that will be checked anyway.
        final_ipa_proof = nested_ipa_proofs[0].get_value();
    } else if (nested_ipa_claims.size() == 0) {
        // If we don't have any claims, we may need to inject a fake one if we're proving with
        // UltraRollupHonk, indicated by the manual setting of the honk_recursion metadata to 2.
        info("Proving with UltraRollupHonk but no IPA claims exist.");
        auto [stdlib_opening_claim, ipa_proof] =
            IPA<stdlib::grumpkin<Builder>>::create_fake_ipa_claim_and_proof(builder);

        final_ipa_claim = stdlib_opening_claim;
        final_ipa_proof = ipa_proof;
    } else {
        // We don't support and shouldn't expect to support circuits with 3+ IPA recursive verifiers.
        throw_or_abort("Too many nested IPA claims to accumulate");
    }
    // If we aren't in the root rollup, we should have an output IPA proof.
    if (!is_root_rollup) {
        BB_ASSERT_EQ(final_ipa_proof.size(), IPA_PROOF_LENGTH);
        // Propagate the IPA claim via the public inputs of the outer circuit
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1306): Determine the right
        // location/entity to handle this IPA data propagation.
        final_ipa_claim.set_public();
        builder.ipa_proof = final_ipa_proof;
    }
}

template <typename Builder>
[[nodiscard("IPA claim and Pairing points should be accumulated")]] HonkRecursionConstraintsOutput<Builder>
process_honk_recursion_constraints(Builder& builder,
                                   AcirFormat& constraint_system,
                                   bool has_valid_witness_assignments,
                                   GateCounter<Builder>& gate_counter)
{
    HonkRecursionConstraintsOutput<Builder> output;
    // Add recursion constraints
    size_t idx = 0;
    for (auto& constraint : constraint_system.honk_recursion_constraints) {
        if (constraint.proof_type == HONK_ZK) {
            auto [pairing_points, _ipa_claim, _ipa_proof] =
                create_honk_recursion_constraints<UltraZKRecursiveFlavor_<Builder>>(
                    builder, constraint, has_valid_witness_assignments);

            if (output.points_accumulator.has_data) {
                output.points_accumulator.aggregate(pairing_points);
            } else {
                output.points_accumulator = pairing_points;
            }

        } else if (constraint.proof_type == HONK) {
            auto [pairing_points, _ipa_claim, _ipa_proof] =
                create_honk_recursion_constraints<UltraRecursiveFlavor_<Builder>>(
                    builder, constraint, has_valid_witness_assignments);
            if (output.points_accumulator.has_data) {
                output.points_accumulator.aggregate(pairing_points);
            } else {
                output.points_accumulator = pairing_points;
            }
        } else if (constraint.proof_type == ROLLUP_HONK || constraint.proof_type == ROOT_ROLLUP_HONK) {
            if constexpr (!IsUltraBuilder<Builder>) {
                throw_or_abort("Rollup Honk proof type not supported on MegaBuilder");
            } else {
                if (constraint.proof_type == ROOT_ROLLUP_HONK) {
                    output.is_root_rollup = true;
                }
                auto [pairing_points, ipa_claim, ipa_proof] =
                    create_honk_recursion_constraints<UltraRollupRecursiveFlavor_<Builder>>(
                        builder, constraint, has_valid_witness_assignments);
                if (output.points_accumulator.has_data) {
                    output.points_accumulator.aggregate(pairing_points);
                } else {
                    output.points_accumulator = pairing_points;
                }
                output.nested_ipa_claims.push_back(ipa_claim);
                output.nested_ipa_proofs.push_back(ipa_proof);
            }
        } else {
            throw_or_abort("Invalid Honk proof type");
        }

        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.honk_recursion_constraints.at(idx++));
    }
    ASSERT(!(output.is_root_rollup && output.nested_ipa_claims.size() != 2) &&
           "Root rollup must accumulate two IPA proofs.");
    return output;
}

// Only called when we encounter a kernel -__-
void process_ivc_recursion_constraints(MegaCircuitBuilder& builder,
                                       AcirFormat& constraints,
                                       std::shared_ptr<ClientIVC> ivc,
                                       bool has_valid_witness_assignments,
                                       GateCounter<MegaCircuitBuilder>& gate_counter)
{
    using StdlibVerificationKey = ClientIVC::RecursiveVerificationKey;
    using StdlibVKAndHash = ClientIVC::RecursiveVKAndHash;
    using StdlibFF = ClientIVC::RecursiveFlavor::FF;

    // If an ivc instance is not provided, we mock one with the state required to construct the recursion
    // constraints present in the program. This is for when we write_vk.
    if (ivc == nullptr) {
        ivc = create_mock_ivc_from_constraints(constraints.ivc_recursion_constraints, { AZTEC_TRACE_STRUCTURE });
    }

    // We expect the length of the internal verification queue to match the number of ivc recursion constraints
    BB_ASSERT_EQ(constraints.ivc_recursion_constraints.size(),
                 ivc->verification_queue.size(),
                 "WARNING: Mismatch in number of recursive verifications during kernel creation!");

    // If no witness is provided, populate the VK and public inputs in the recursion constraint with dummy values so
    // that the present kernel circuit is constructed correctly. (Used for constructing VKs without witnesses).
    if (!has_valid_witness_assignments) {
        // Create stdlib representations of each {proof, vkey} pair to be recursively verified
        for (auto [constraint, queue_entry] :
             zip_view(constraints.ivc_recursion_constraints, ivc->verification_queue)) {
            populate_dummy_vk_in_constraint(builder, queue_entry.honk_vk, constraint.key);
            builder.set_variable(constraint.key_hash, queue_entry.honk_vk->hash());
        }
    }

    // Construct a stdlib verification key for each constraint based on the verification key witness indices therein
    std::vector<std::shared_ptr<StdlibVKAndHash>> stdlib_vk_and_hashs;
    stdlib_vk_and_hashs.reserve(constraints.ivc_recursion_constraints.size());
    for (const auto& constraint : constraints.ivc_recursion_constraints) {
        stdlib_vk_and_hashs.push_back(
            std::make_shared<StdlibVKAndHash>(std::make_shared<StdlibVerificationKey>(
                                                  StdlibVerificationKey::from_witness_indices(builder, constraint.key)),
                                              StdlibFF::from_witness_index(&builder, constraint.key_hash)));
    }
    // Create stdlib representations of each {proof, vkey} pair to be recursively verified
    ivc->instantiate_stdlib_verification_queue(builder, stdlib_vk_and_hashs);

    // Connect the public_input witnesses in each constraint to the corresponding public input witnesses in the
    // internal verification queue. This ensures that the witnesses utilized in constraints generated based on acir
    // are properly connected to the constraints generated herein via the ivc scheme (e.g. recursive verifications).
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

    // Note: we can't easily track the gate contribution from each individual ivc_recursion_constraint since they
    // are handled simultaneously in the above function call; instead we track the total contribution
    gate_counter.track_diff(constraints.gates_per_opcode,
                            constraints.original_opcode_indices.ivc_recursion_constraints.at(0));
}

#ifndef DISABLE_AZTEC_VM
[[nodiscard("IPA claim and Pairing points should be accumulated")]] HonkRecursionConstraintsOutput<Builder>
process_avm_recursion_constraints(Builder& builder,
                                  AcirFormat& constraint_system,
                                  bool has_valid_witness_assignments,
                                  GateCounter<Builder>& gate_counter)
{
    HonkRecursionConstraintsOutput<Builder> output;
    // Add recursion constraints
    size_t idx = 0;
    for (auto& constraint : constraint_system.avm_recursion_constraints) {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1303): Utilize the version of this method that
        // employs the Goblinized AVM recursive verifier.
        HonkRecursionConstraintOutput<Builder> avm2_recursion_output =
            create_avm2_recursion_constraints_goblin(builder, constraint, has_valid_witness_assignments);
        if (output.points_accumulator.has_data) {
            output.points_accumulator.aggregate(avm2_recursion_output.points_accumulator);
        } else {
            output.points_accumulator = avm2_recursion_output.points_accumulator;
        }
        output.nested_ipa_claims.push_back(avm2_recursion_output.ipa_claim);
        output.nested_ipa_proofs.push_back(avm2_recursion_output.ipa_proof);

        gate_counter.track_diff(constraint_system.gates_per_opcode,
                                constraint_system.original_opcode_indices.avm_recursion_constraints.at(idx++));
    }
    return output;
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
    PROFILE_THIS();
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
    PROFILE_THIS();
    AcirFormat& constraints = program.constraints;
    WitnessVector& witness = program.witness;

    auto op_queue = (metadata.ivc == nullptr) ? std::make_shared<ECCOpQueue>() : metadata.ivc->goblin.op_queue;
    bool is_kernel = !constraints.ivc_recursion_constraints.empty();
    // Construct a builder using the witness and public input data from acir and with the goblin-owned op_queue
    auto builder = MegaCircuitBuilder{ op_queue, witness, constraints.public_inputs, constraints.varnum, is_kernel };

    // Populate constraints in the builder via the data in constraint_system
    build_constraints(builder, program, metadata);

    return builder;
};

template void build_constraints<MegaCircuitBuilder>(MegaCircuitBuilder&, AcirProgram&, const ProgramMetadata&);

} // namespace acir_format
