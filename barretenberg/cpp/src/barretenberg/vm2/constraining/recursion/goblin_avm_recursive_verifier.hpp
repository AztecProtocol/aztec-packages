#pragma once

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/flavor/mega_avm_flavor.hpp"
#include "barretenberg/flavor/mega_avm_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/goblin_verifier.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_flavor.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_verifier.hpp"

namespace bb::avm2 {

/**
 * @brief Recursive verifier of AVM2 proofs that utilizes the Goblin mechanism for efficient EC operations.
 * @details Recursive verification for AVM2 proofs proceeds in two phases: (1) recursive verification of the AVM2 proof
 * in a Mega-arithmetized circuit C_M, and (2) recursive verification of the proof of C_M in an Ultra-arithmetized
 * circuit C_U. This results in a protocol that overall is more efficient than direct recursive verification of the AVM2
 * proof in an Ultra circuit.
 *
 * The proof of the Mega-arithmetized AVM2 recursive verifier circuit C_M is of the form {\pi_M, \pi_G}, where \pi_M is
 * a MegaHonk proof and \pi_G is a Goblin proof consisting of an ECCVM proof, a Translator proof, and a Merge proof.
 * \pi_M establishes proper verification of the AVM2 proof up to the deferred EC operations, whose correctness is in
 * turn established by \pi_G. Note: the ECCCVM proof (part of \pi_G) contains an IPA proof. Recursive verification of
 * this component will stop short of full verification, resulting in an IPA claim that must be accumulated with other
 * such claims before final verification later on (e.g. at the root). This is analogous to the aggregation of pairing
 * point inputs for proving systems that use KZG, such as Ultra/MegaHonk.
 *
 * The Ultra-arithmetized circuit C_U is responsible for recursive verification of {\pi_M, \pi_G}, i.e. it contains both
 * a Mega and a Goblin recursive verifier. The output of this recursive verification is a pairing check accumulator and
 * an IPA claim accumulator. To ensure proper transfer of the AVM2 verifier inputs {\pi, pub_inputs, VK}_{AVM2} between
 * the Mega and Ultra circuits, we utilize a hash consistency check. The representation of these inputs in C_M is hashed
 * and the result h_M is propagated via the public inputs (i.e. it will be contained in \pi_M.pub_inputs). Then, C_U
 * computes the hash h_U of its own representation of the same data and performs the check h_U = \pi_M.pub_inputs.h_M.
 *
 * @note The Mega circuit must be constrained to be a genuine AVM2 verifier circuit. This is done by fixing the VK(s)
 * corresponding to proofs {\pi_M, \pi_G} to be circuit constants in C_U.
 *
 */
class AvmGoblinRecursiveVerifier {
  public:
    using UltraPairingPoints = bb::stdlib::recursion::PairingPoints<stdlib::bn254<UltraCircuitBuilder>>;
    using MegaPairingPoints = bb::stdlib::recursion::PairingPoints<stdlib::bn254<MegaCircuitBuilder>>;

    using UltraFF = stdlib::field_t<UltraCircuitBuilder>;
    using MegaFF = stdlib::field_t<MegaCircuitBuilder>;

    // The structure of the final output of the goblinized AVM2 recursive verifier. The IPA data comes from recursive
    // verification of the ECCVM proof as part of Goblin recursive verification.
    using RecursiveAvmGoblinOutput = stdlib::recursion::honk::UltraRecursiveVerifierOutput<UltraCircuitBuilder>;

    // Output of prover for inner Mega-arithmetized AVM recursive verifier circuit; input to the outer verifier
    struct InnerProverOutput {
        HonkProof mega_proof;                                    // \pi_M
        GoblinProof goblin_proof;                                // \pi_G
        std::shared_ptr<MegaAvmFlavor::VerificationKey> mega_vk; // VK_M
    };

  private:
    static constexpr size_t NUM_CHALLENGES =
        AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED + AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH;
    UltraCircuitBuilder* builder;

  public:
    explicit AvmGoblinRecursiveVerifier(UltraCircuitBuilder& builder)
        : builder(&builder) {};

    template <typename Builder>
    static stdlib::field_t<Builder> compute_commitment_to_public_inputs_and_proof(
        const stdlib::Proof<Builder>& stdlib_proof,
        const std::vector<std::vector<stdlib::field_t<Builder>>>& public_inputs,
        const stdlib::field_t<Builder>& challenge)
    {
        using FF = stdlib::field_t<Builder>;

        // Compute the required powers of the challenge
        std::vector<FF> powers_of_challenge = { FF(1) };
        powers_of_challenge.reserve(NUM_CHALLENGES);
        for (size_t idx = 0; idx < NUM_CHALLENGES - 1; idx++) {
            powers_of_challenge.emplace_back(powers_of_challenge.back() * challenge);
        }

        // Evaluate the polynomial whose coefficients are given by the elements in the proof and the elements in the
        // public inputs
        FF evaluation(0);
        size_t challenge_idx = 0;
        for (const auto& proof_element : stdlib_proof) {
            // CAN WE REMOVE THIS? Needed for now because the proof is a free witness in the inner circuit and it is not
            // modified by the verifier
            if (proof_element.tag.is_free_witness()) {
                proof_element.unset_free_witness_tag();
            }
            evaluation += powers_of_challenge[challenge_idx++] * proof_element;
        }
        for (const auto& public_input_column : public_inputs) {
            for (const auto& public_input : public_input_column) {
                evaluation += powers_of_challenge[challenge_idx++] * public_input;
            }
        }

        return evaluation;
    };

    /**
     * @brief Recursively verify an AVM proof using Goblin and two layers of recursive verification.
     * @details First, construct an inner Mega-arithmetized AVM recursive verifier circuit and a corresponding proof
     * {\pi_M, \pi_G}. Then, construct an outer Ultra-arithmetized Mega/Goblin recursive verifier circuit.
     *
     * @param stdlib_proof AVM proof
     * @param public_inputs AVM public inputs
     * @param input_points_accumulator
     * @return RecursiveAvmGoblinOutput {ipa_proof, ipa_claim, points_accumulator}
     */
    [[nodiscard("IPA claim and Pairing points should be accumulated")]] RecursiveAvmGoblinOutput verify_proof(
        const stdlib::Proof<UltraCircuitBuilder>& stdlib_proof,
        const std::vector<std::vector<UltraFF>>& public_inputs) const
    {
        // Construct and prove the inner Mega-arithmetized AVM recursive verifier circuit; proof is {\pi_M, \pi_G}
        InnerProverOutput inner_output =
            construct_and_prove_inner_recursive_verification_circuit(stdlib_proof, public_inputs);

        // Construct the outer Ultra-arithmetized Mega/Goblin recursive verifier circuit
        RecursiveAvmGoblinOutput result =
            construct_outer_recursive_verification_circuit(stdlib_proof, public_inputs, inner_output);

        // Return ipa proof, ipa claim and output aggregation object produced from verifying the Mega + Goblin proofs
        return result;
    }

    /**
     * @brief Construct the outer circuit which recursively verifies a Mega proof and a Goblin proof.
     *
     * @param stdlib_proof AVM proof
     * @param public_inputs AVM public inputs
     * @param inner_output Output of the prover of the inner circuit {\pi_M, \pi_G}, {VK_M, VK_G}
     * @return RecursiveAvmGoblinOutput
     */
    [[nodiscard("IPA claim and Pairing points should be accumulated")]] RecursiveAvmGoblinOutput
    construct_outer_recursive_verification_circuit(const stdlib::Proof<UltraCircuitBuilder>& stdlib_proof,
                                                   const std::vector<std::vector<UltraFF>>& public_inputs,
                                                   const InnerProverOutput& inner_output) const
    {
        // Types for MegaHonk and Goblin recursive verifiers arithmetized with Ultra
        using MegaAvmRecursiveFlavor = MegaAvmRecursiveFlavor_<UltraCircuitBuilder>;
        using MegaRecursiveVKAndHash = MegaAvmRecursiveFlavor::VKAndHash;
        using GoblinRecursiveVerifier = bb::GoblinRecursiveVerifier;
        using MergeCommitments = GoblinRecursiveVerifier::MergeCommitments;
        using FF = MegaAvmRecursiveFlavor::FF;
        using IO = stdlib::recursion::honk::GoblinAvmIO<UltraCircuitBuilder>;
        using MegaRecursiveVerifier = UltraVerifier_<MegaAvmRecursiveFlavor, IO>;

        // Recursively verify the Mega proof \pi_M in the Ultra circuit
        // All verifier components share a single transcript
        auto transcript = std::make_shared<MegaAvmRecursiveFlavor::Transcript>();
        auto mega_vk_and_hash = std::make_shared<MegaRecursiveVKAndHash>(*builder, inner_output.mega_vk);
        // Fix the inner mega vk and vk hash to be constants in the outer circuit.
        mega_vk_and_hash->vk->fix_witness();
        mega_vk_and_hash->hash.fix_witness();

        MegaRecursiveVerifier mega_verifier(mega_vk_and_hash, transcript);
        stdlib::Proof<UltraCircuitBuilder> mega_proof(*builder, inner_output.mega_proof);
        auto mega_verifier_output = mega_verifier.verify_proof(mega_proof);

        // Recursively verify the goblin proof\pi_G in the Ultra circuit
        MergeCommitments merge_commitments{
            .t_commitments = mega_verifier.get_verifier_instance()->witness_commitments.get_ecc_op_wires().get_copy(),
            .T_prev_commitments = stdlib::recursion::honk::empty_ecc_op_tables(
                *builder) // Empty ecc op tables because there is only one layer of Goblin
        };
        GoblinStdlibProof stdlib_goblin_proof(*builder, inner_output.goblin_proof);
        GoblinRecursiveVerifier goblin_verifier{
            transcript, stdlib_goblin_proof, merge_commitments, MergeSettings::PREPEND
        };
        GoblinRecursiveVerifier::ReductionResult goblin_verifier_output =
            goblin_verifier.reduce_to_pairing_check_and_ipa_opening();

        // Batch aggregate all pairing points: Mega + Merge + Translator
        // Edge case handling disabled: Safe because all points are verifier-computed (deterministic, won't collide)
        // and the random challenges maintain binding. Saves significant circuit gates.
        std::vector<UltraPairingPoints> all_pairing_points;
        all_pairing_points.reserve(3);
        all_pairing_points.push_back(mega_verifier_output.points_accumulator);
        all_pairing_points.push_back(std::move(goblin_verifier_output.merge_pairing_points));
        all_pairing_points.push_back(std::move(goblin_verifier_output.translator_pairing_points));

        constexpr bool handle_edge_cases = false;
        UltraPairingPoints aggregated_pairing_points =
            UltraPairingPoints::aggregate_multiple(all_pairing_points, handle_edge_cases);

        // Validate the consistency of the AVM2 verifier inputs {\pi, pub_inputs, VK}_{AVM2} between the inner (Mega)
        // circuit and the outer (Ultra) by asserting equality on the independently computed hashes of this data.
        const FF challenge = mega_verifier_output.challenge;
        const FF claimed_evaluation = mega_verifier_output.evaluation;
        const FF computed_evaluation = AvmGoblinRecursiveVerifier::compute_commitment_to_public_inputs_and_proof(
            stdlib_proof, public_inputs, challenge);
        claimed_evaluation.assert_equal(computed_evaluation);

        // Return ipa proof, ipa claim and output aggregation object produced from verifying the Mega + Goblin proofs
        RecursiveAvmGoblinOutput output;
        output.points_accumulator = std::move(aggregated_pairing_points);
        output.ipa_claim = goblin_verifier_output.ipa_claim;
        output.ipa_proof = goblin_verifier_output.ipa_proof;
        return output;
    }

    /**
     * @brief Construct and prove the inner Mega-arithmetized AVM recursive verifier circuit.
     *
     * @param stdlib_proof AVM proof
     * @param public_inputs AVM public inputs
     * @return InnerCircuitOutput proof and verification key for Mega + Goblin; {\pi_M, \pi_G}, {VK_M, VK_G}
     */
    InnerProverOutput construct_and_prove_inner_recursive_verification_circuit(
        const stdlib::Proof<UltraCircuitBuilder>& stdlib_proof,
        const std::vector<std::vector<UltraFF>>& public_inputs) const
    {
        using IO = stdlib::recursion::honk::GoblinAvmIO<MegaCircuitBuilder>;
        using MegaAvmProverInstance = ProverInstance_<MegaAvmFlavor>;
        using MegaAvmVerificationKey = MegaAvmFlavor::VerificationKey;
        using MegaAvmProver = UltraProver_<MegaAvmFlavor>;

        // Instantiate Mega builder for the inner circuit (AVM2 proof recursive verifier)
        Goblin goblin;
        goblin.avm_mode = true;
        MegaCircuitBuilder mega_builder(goblin.op_queue);
        goblin.ensure_well_formed_op_queue_for_avm(mega_builder);

        // Convert the AVM proof, public inputs, and VK to stdlib Mega representations and add them to the hash buffer.
        stdlib::Proof<MegaCircuitBuilder> mega_stdlib_proof(mega_builder, stdlib_proof.get_value());
        std::vector<std::vector<MegaFF>> mega_public_inputs;
        mega_public_inputs.reserve(AVM_NUM_PUBLIC_INPUT_COLUMNS);
        for (const auto& public_input_column : public_inputs) {
            std::vector<MegaFF> mega_public_input_column;
            mega_public_input_column.reserve(AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);
            for (const auto& public_input : public_input_column) {
                mega_public_input_column.push_back(MegaFF::from_witness(&mega_builder, public_input.get_value()));
            }
            mega_public_inputs.push_back(mega_public_input_column);
        }

        // Construct a Mega-arithmetized AVM2 recursive verifier circuit
        AvmRecursiveVerifier recursive_verifier{ mega_builder };
        MegaPairingPoints points_accumulator = recursive_verifier.verify_proof(mega_stdlib_proof, mega_public_inputs);

        // Generate the challenges
        MegaFF challenge = recursive_verifier.transcript->get_challenge<MegaFF>("Consistency challenge");
        MegaFF evaluation = AvmGoblinRecursiveVerifier::compute_commitment_to_public_inputs_and_proof(
            mega_stdlib_proof, mega_public_inputs, challenge);

        // Public inputs
        IO inputs;
        inputs.evaluation = evaluation;
        inputs.challenge = challenge;
        inputs.pairing_inputs = points_accumulator;
        inputs.set_public();

        // All prover components share a single transcript
        std::shared_ptr<Goblin::Transcript> transcript = std::make_shared<Goblin::Transcript>();
        // Construct Mega proof \pi_M of the AVM recursive verifier circuit
        auto mega_proving_key = std::make_shared<MegaAvmProverInstance>(mega_builder);
        // Detect when MEGA_AVM_LOG_N needs to be bumped.
        BB_ASSERT_LTE(
            mega_proving_key->log_dyadic_size(),
            MEGA_AVM_LOG_N,
            "AVMRecursiveVerifier: circuit size exceeded current upper bound. If expected, bump MEGA_AVM_LOG_N");
        auto mega_vk = std::make_shared<MegaAvmVerificationKey>(mega_proving_key->get_precomputed());
        MegaAvmProver mega_prover(mega_proving_key, mega_vk, transcript);
        HonkProof mega_proof = mega_prover.construct_proof();
        goblin.transcript = transcript;
        goblin.avm_mode = true;

        // Construct corresponding Goblin proof \pi_G (includes Merge, ECCVM, and Translator proofs)
        GoblinProof goblin_proof = goblin.prove();

        return {
            .mega_proof = mega_proof,
            .goblin_proof = goblin_proof,
            .mega_vk = mega_vk,
        };
    }
};

} // namespace bb::avm2
