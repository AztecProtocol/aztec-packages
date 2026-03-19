// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 54146acfe3568e22f80648f4092e10cb2c8702c2}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/chonk/batched_honk_translator/batched_honk_translator_prover.hpp"
#include "barretenberg/chonk/batched_honk_translator/batched_honk_translator_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/flavor/mega_avm_flavor.hpp"
#include "barretenberg/flavor/mega_avm_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/goblin_avm/goblin_avm.hpp"
#include "barretenberg/goblin_avm/goblin_avm_verifier.hpp"
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
 * The proof of the Mega-arithmetized AVM2 recursive verifier circuit C_M consists of three components:
 *   - \pi_oink: the Mega Oink proof (witness and permutation commitments),
 *   - \pi_ECCVM: an ECCVM proof establishing correctness of the deferred EC operations (with an IPA proof),
 *   - \pi_joint: a joint proof covering Translator Oink + a single batched sumcheck + a single PCS reduction
 *     over both the Mega circuit and the Translator circuit polynomials.
 *
 * The batched prover uses a single shared transcript and runs one joint sumcheck of JOINT_LOG_N rounds over the
 * combined Mega and Translator relations, followed by a single Shplemini/KZG opening proof. This replaces what would
 * otherwise be two separate sumcheck + PCS invocations. The ECCVM proof establishes correctness of the Goblin EC
 * operations deferred by C_M; its recursive verification yields an IPA claim that must be accumulated with other such
 * claims before final verification (e.g. at the root).
 *
 * The Ultra-arithmetized circuit C_U is responsible for recursive verification of {\pi_oink, \pi_ECCVM, \pi_joint},
 * i.e. it contains both a batched Mega/Translator recursive verifier and a GoblinAvm ECCVM recursive verifier.
 * The output of this recursive verification is a pairing check accumulator and an IPA claim accumulator. To ensure
 * proper transfer of the AVM2 verifier inputs {\pi, pub_inputs}_{AVM2} between the Mega and Ultra circuits, we
 * utilize a hash consistency check. The transcript of the AVM recursive verifier is used to generate a challenge h_M
 * after the end of the verification algorithm. This challenge records the final state of the transcript, which hashed
 * the proof and public inputs {\pi, pub_inputs}_{AVM2} used in C_M. The challenge h_M is propagated via the public
 * inputs. Then, C_U computes the same challenge h_U independently and performs the check h_U = \pi_M.pub_inputs.h_M.
 *
 * @note The Mega circuit must be constrained to be a genuine AVM2 verifier circuit. This is done by fixing the VK
 * corresponding to the inner circuit to be a circuit constant in C_U.
 *
 */
class TwoLayerAvmRecursiveVerifier {
  public:
    using MegaPairingPoints = bb::stdlib::recursion::PairingPoints<stdlib::bn254<MegaCircuitBuilder>>;

    using UltraFF = stdlib::field_t<UltraCircuitBuilder>;
    using MegaFF = stdlib::field_t<MegaCircuitBuilder>;

    // The output of the goblinized AVM2 recursive verifier
    using TwoLayerAvmRecursiveVerifierOutput =
        stdlib::recursion::honk::UltraRecursiveVerifierOutput<UltraCircuitBuilder>;

    // Output of the inner prover: three proof components plus the Mega VK.
    //   - mega_oink_proof: Mega circuit Oink phase (witness + permutation commitments)
    //   - joint_proof: Translator Oink + joint sumcheck + joint PCS over Mega and Translator
    //   - goblin_proof: ECCVM proof + IPA proof (Translator is handled by the batched joint proof)
    struct InnerProverOutput {
        HonkProof mega_oink_proof;
        HonkProof joint_proof;
        GoblinAvmProof goblin_proof;
        std::shared_ptr<MegaAvmFlavor::VerificationKey> mega_vk;
    };

  private:
    UltraCircuitBuilder* outer_builder;

  public:
    explicit TwoLayerAvmRecursiveVerifier(UltraCircuitBuilder& builder)
        : outer_builder(&builder) {};
    /**
     * @brief Recursively verify an AVM proof using Goblin and two layers of recursive verification.
     * @details First, construct an inner Mega-arithmetized AVM recursive verifier circuit and produce a batched proof
     * {\pi_oink, \pi_ECCVM, \pi_joint} where \pi_joint covers Translator Oink + a single joint sumcheck + PCS over
     * both the Mega and Translator polynomials. Then, construct an outer Ultra-arithmetized circuit that recursively
     * verifies these proof components.
     *
     * @param stdlib_proof AVM proof
     * @param public_inputs AVM public inputs
     * @return TwoLayerAvmRecursiveVerifierOutput {ipa_proof, ipa_claim, points_accumulator}
     */
    [[nodiscard("IPA claim and Pairing points should be accumulated")]] TwoLayerAvmRecursiveVerifierOutput verify_proof(
        const stdlib::Proof<UltraCircuitBuilder>& stdlib_proof,
        const std::vector<std::vector<UltraFF>>& public_inputs) const
    {
        // Construct and prove the inner Mega-arithmetized AVM recursive verifier circuit; proof components are
        // {\pi_oink, \pi_ECCVM, \pi_joint} where \pi_joint is a batched Mega+Translator sumcheck+PCS proof
        InnerProverOutput inner_output =
            construct_and_prove_inner_recursive_verification_circuit(stdlib_proof, public_inputs);

        // Construct the outer Ultra-arithmetized recursive verifier circuit for the batched proof
        TwoLayerAvmRecursiveVerifierOutput result =
            construct_outer_recursive_verification_circuit(stdlib_proof, public_inputs, inner_output);

        // Return ipa proof, ipa claim and output aggregation object produced from verifying the Mega + Goblin proofs
        return result;
    }

    /**
     * @brief Construct the outer circuit which recursively verifies the batched Mega+Translator proof and the ECCVM
     * proof.
     * @details The batched verifier handles Mega Oink, Translator Oink, a single joint sumcheck, and a single joint
     * PCS over both the Mega and Translator circuit polynomials. The ECCVM verifier handles the deferred EC operations.
     *
     * @param stdlib_proof AVM proof
     * @param public_inputs AVM public inputs
     * @param inner_output Output of the inner prover {\pi_oink, \pi_ECCVM, \pi_joint, VK_M}
     * @return Output
     */
    [[nodiscard("IPA claim and Pairing points should be accumulated")]] TwoLayerAvmRecursiveVerifierOutput
    construct_outer_recursive_verification_circuit(const stdlib::Proof<UltraCircuitBuilder>& stdlib_proof,
                                                   const std::vector<std::vector<UltraFF>>& public_inputs,
                                                   const InnerProverOutput& inner_output) const
    {
        // Types for MegaRecursiveVerifier specialized for the AVM
        using MegaAvmRecursiveFlavor = MegaAvmRecursiveFlavor_<UltraCircuitBuilder>;
        using MegaRecursiveVKAndHash = MegaAvmRecursiveFlavor::VKAndHash;
        using IO = stdlib::recursion::honk::GoblinAvmIO<UltraCircuitBuilder>;

        auto transcript = std::make_shared<MegaAvmRecursiveFlavor::Transcript>();
        auto mega_vk_and_hash = std::make_shared<MegaRecursiveVKAndHash>(*outer_builder, inner_output.mega_vk);

        // The vk of the inner Mega arithmetized AVM recursive verifier circuit must be fixed to ensure that the outer
        // circuit verifies the validity of the intended inner circuit.
        mega_vk_and_hash->vk->fix_witness();
        mega_vk_and_hash->hash.fix_witness();

        // Recursive verification of the batched Mega+Translator proof (single joint sumcheck + PCS)
        BatchedAvmRecursiveVerifier batched_verifier(mega_vk_and_hash, transcript);

        stdlib::Proof<UltraCircuitBuilder> mega_oink_proof(*outer_builder, inner_output.mega_oink_proof);
        stdlib::Proof<UltraCircuitBuilder> joint_proof(*outer_builder, inner_output.joint_proof);
        GoblinAvmStdlibProof stdlib_goblin_proof(*outer_builder, inner_output.goblin_proof);

        // Phase 1: Recursive verification of the Mega Oink proof
        auto oink_result = batched_verifier.verify_mega_oink(mega_oink_proof);
        IO io;
        io.reconstruct_from_public(oink_result.public_inputs);

        // Phase 2: Recursive verification of ECCVM proof
        typename GoblinAvmRecursiveVerifier::ECCVMVerifier eccvm_verifier{ transcript,
                                                                           stdlib_goblin_proof.eccvm_proof };
        auto eccvm_result = eccvm_verifier.reduce_to_ipa_opening();
        auto translator_input = eccvm_verifier.get_translator_input_data();

        // Phase 3: Translator Oink + single joint sumcheck + single joint PCS over Mega and Translator
        auto batched_result = batched_verifier.verify(joint_proof,
                                                      translator_input.evaluation_challenge_x,
                                                      translator_input.batching_challenge_v,
                                                      translator_input.accumulated_result,
                                                      oink_result.ecc_op_wires);

        // Phase 4: Validate the consistency of the AVM2 verifier inputs {\pi, pub_inputs}_{AVM2} between the inner
        // (Mega) circuit and the outer (Ultra) by asserting equality on the independently computed hashes
        const UltraFF computed_transcript_hash =
            AvmRecursiveFlavor::UltraTranscript::hash_avm_transcript(*outer_builder, stdlib_proof, public_inputs);
        io.transcript_hash.assert_equal(computed_transcript_hash);

        // Phase 5: Accumulate the pairing points from verifying the batched Mega+Translator proof
        batched_result.pairing_points.aggregate(io.pairing_inputs);

        // Return ipa proof, ipa claim and output aggregation object produced from verifying the batched proof
        TwoLayerAvmRecursiveVerifierOutput output;
        output.points_accumulator = std::move(batched_result.pairing_points);
        output.ipa_claim = eccvm_result.ipa_claim;
        output.ipa_proof = stdlib_goblin_proof.ipa_proof;
        return output;
    }

    /**
     * @brief Construct and prove the inner Mega-arithmetized AVM recursive verifier circuit.
     * @details Uses the batched prover to produce a single joint sumcheck + PCS over both the Mega circuit and the
     * Translator circuit. The proof consists of: Mega Oink, ECCVM proof (with IPA), and the joint proof covering
     * Translator Oink + batched sumcheck + batched PCS.
     *
     * @param stdlib_proof AVM proof
     * @param public_inputs AVM public inputs
     * @return InnerProverOutput {\pi_oink, \pi_ECCVM, \pi_joint, VK_M}
     */
    static InnerProverOutput construct_and_prove_inner_recursive_verification_circuit(
        const stdlib::Proof<UltraCircuitBuilder>& stdlib_proof, const std::vector<std::vector<UltraFF>>& public_inputs)
    {
        using MegaAvmProverInstance = ProverInstance_<MegaAvmFlavor>;
        using MegaAvmVerificationKey = MegaAvmFlavor::VerificationKey;

        // Instantiate Mega builder for the inner circuit (AVM2 proof recursive verifier)
        MegaCircuitBuilder inner_builder;
        GoblinAvm goblin(inner_builder);

        // Construct the inner recursive verification circuit
        construct_inner_recursive_verification_circuit(inner_builder, stdlib_proof, public_inputs);

        // Single shared transcript used by the batched prover across all phases:
        // Mega Oink → ECCVM → Translator Oink → joint sumcheck → joint PCS
        auto transcript = std::make_shared<NativeTranscript>();
        goblin.transcript = transcript;

        // Construct the Mega proving key and VK for the AVM recursive verifier circuit
        auto mega_proving_key = std::make_shared<MegaAvmProverInstance>(inner_builder);

        // Detect when MEGA_AVM_LOG_N needs to be bumped.
        BB_ASSERT_LTE(
            mega_proving_key->log_dyadic_size(),
            MEGA_AVM_LOG_N,
            "AVMRecursiveVerifier: circuit size exceeded current upper bound. If expected, bump MEGA_AVM_LOG_N");
        auto mega_vk = std::make_shared<MegaAvmVerificationKey>(mega_proving_key->get_precomputed());

        // Batched prover: proves Mega and Translator with a single joint sumcheck + PCS
        BatchedAvmProver batched_prover(mega_proving_key, mega_vk, transcript);

        // Phase 1: Oink proof for the Mega circuit
        auto mega_oink_proof = batched_prover.prove_mega_oink();

        // Phase 2: Merge table operations
        goblin.op_queue->merge();

        // Phase 3: ECCVM proof on the shared transcript.
        goblin.prove_eccvm();

        // Phase 4: Build translator proving key from ECCVM-derived challenges.
        TranslatorCircuitBuilder translator_builder(
            goblin.translation_batching_challenge_v, goblin.evaluation_challenge_x, goblin.op_queue, /*avm_mode=*/true);
        auto translator_key = std::make_shared<TranslatorProvingKey>(translator_builder);

        // Phase 5: Translator Oink + single joint sumcheck + single joint PCS over both Mega and Translator.
        auto joint_proof = batched_prover.prove(translator_key);

        GoblinAvmProof goblin_proof;
        goblin_proof.eccvm_proof = goblin.goblin_proof.eccvm_proof;
        goblin_proof.ipa_proof = goblin.goblin_proof.ipa_proof;

        return {
            .mega_oink_proof = mega_oink_proof,
            .joint_proof = joint_proof,
            .goblin_proof = goblin_proof,
            .mega_vk = mega_vk,
        };
    }

    /**
     * @brief Construct the inner recursive verification circuit for the AVM2 recursive verifier.
     *
     */
    static void construct_inner_recursive_verification_circuit(MegaCircuitBuilder& inner_builder,
                                                               const stdlib::Proof<UltraCircuitBuilder>& stdlib_proof,
                                                               const std::vector<std::vector<UltraFF>>& public_inputs)
    {
        using IO = stdlib::recursion::honk::GoblinAvmIO<MegaCircuitBuilder>;

        // Create free witnesses representing the AVM proof and public inputs in the inner circuit.
        // The honest prover sets these values to match the values of the proof and public inputs in the outer circuit.
        // Consistency between these witnesses and the ones in the outer circuit is enforced via a hash check.
        stdlib::Proof<MegaCircuitBuilder> inner_stdlib_proof(inner_builder, stdlib_proof.get_value());
        std::vector<std::vector<MegaFF>> inner_public_inputs;
        inner_public_inputs.reserve(AVM_NUM_PUBLIC_INPUT_COLUMNS);
        for (const auto& public_input_column : public_inputs) {
            std::vector<MegaFF> inner_public_input_column;
            inner_public_input_column.reserve(AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);
            for (const auto& public_input : public_input_column) {
                inner_public_input_column.push_back(MegaFF::from_witness(&inner_builder, public_input.get_value()));
            }
            inner_public_inputs.push_back(std::move(inner_public_input_column));
        }

        // Construct a Mega-arithmetized AVM2 recursive verifier circuit
        // The constructor of AvmRecursiveVerifier hard-codes the VK and the VK hash of the AVM2 by copying the values
        // into the selectors.
        AvmRecursiveVerifier recursive_verifier{ inner_builder };
        MegaPairingPoints points_accumulator = recursive_verifier.verify_proof(inner_stdlib_proof, inner_public_inputs);

        // Append to the transcript the padding values of the proof (if any) and generate a challenge to record the
        // final state of the transcript of the AVM recursive verifier
        const MegaFF transcript_hash = recursive_verifier.hash_avm_transcript(inner_stdlib_proof);

        // Public inputs
        IO inputs;
        inputs.transcript_hash = transcript_hash;
        inputs.pairing_inputs = points_accumulator;
        inputs.set_public();
    }
};

} // namespace bb::avm2
