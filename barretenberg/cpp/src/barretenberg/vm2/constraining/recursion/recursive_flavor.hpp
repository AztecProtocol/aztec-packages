// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 0e37cb8}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include <cstdint>

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/vm2/constraining/avm_fixed_vk.hpp"
#include "barretenberg/vm2/constraining/flavor.hpp"

namespace bb::avm2 {

class AvmRecursiveFlavor {
  public:
    using CircuitBuilder = MegaCircuitBuilder;
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = Curve::Element;
    using Commitment = Curve::AffineElement;
    using FF = Curve::ScalarField;
    using BF = Curve::BaseField;

    using NativeFlavor = avm2::AvmFlavor;
    using NativeVerificationKey = NativeFlavor::VerificationKey;

    // Native one is used!
    using VerifierCommitmentKey = NativeFlavor::VerifierCommitmentKey;

    using Relations = NativeFlavor::Relations_<FF>;

    static constexpr size_t NUM_ALL_ENTITIES = NativeFlavor::NUM_ALL_ENTITIES;
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr size_t NUM_SUBRELATIONS = NativeFlavor::NUM_SUBRELATIONS;
    using SubrelationSeparators = std::array<FF, NUM_SUBRELATIONS - 1>;

    // This flavor would not be used with ZK Sumcheck
    static constexpr bool HasZK = false;

    // To achieve fixed proof size so that the recursive verifier circuit is constant, we are using padding in Sumcheck
    // and Shplemini
    static constexpr bool USE_PADDING = true;

    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials
     * evaluated at one point.
     */
    class AllValues : public NativeFlavor::AllEntities<FF> {
      public:
        using Base = NativeFlavor::AllEntities<FF>;
        using Base::Base;
    };

    /**
     * @brief In-circuit representation of the verification key of the AVM. It is reconstructed from precomputed values
     * and fixed as a constant of the circuit when the AVM verifier is constructed. The vk commitments and vk hash are
     * stored in the selectors of the circuit that contains an AVM verifier.
     *
     */
    using VerificationKey =
        FixedStdlibVKAndHash_<CircuitBuilder, AvmFlavor::PrecomputedEntities<Commitment>, NativeVerificationKey>;

    template <typename Builder> class TemplatedTranscript : public StdlibTranscript<Builder> {
        using Base = StdlibTranscript<Builder>;
        using FF = stdlib::field_t<Builder>;
        using StdlibCurve = stdlib::bn254<Builder>;
        using StdlibCommitment = typename StdlibCurve::AffineElement;

      private:
        /**
         * @brief Replicate the operations performed on the AVM transcript during proof verification
         *
         * @details The transcript used during the verification of an AVM proof hashes both the public inputs and the
         * AVM proof being verified. For this reason, its final state can be used as a hash of the public inputs and
         * proof that have been verified. This method replicates the operations performed on the transcript during AVM
         * verification. It is used by hash_avm_transcript below, which in turn is used in the outer circuit of the Two
         * Layer AVM Recursive verification.
         *
         */
        static std::shared_ptr<TemplatedTranscript<Builder>> perform_avm_transcript_operations(
            Builder& builder,
            const stdlib::Proof<Builder>& stdlib_proof,
            const std::vector<std::vector<stdlib::field_t<Builder>>>& public_inputs,
            const bool enable_manifest = false)
        {
            // Container for challenges used in the PCS. Also used to get correct labels for transcript hashing.
            using Challenges = AllValues;
            Challenges challenges;

            auto native_vk = std::make_shared<NativeVerificationKey>();
            NativeFlavor::FF native_vk_hash = native_vk->get_hash();
            FF vk_hash = FF::from_witness(&builder, native_vk_hash);
            vk_hash.fix_witness();

            auto transcript = std::make_shared<TemplatedTranscript<Builder>>();
            if (enable_manifest) {
                transcript->enable_manifest();
            }

            transcript->load_proof(stdlib_proof);

            transcript->add_to_hash_buffer("avm_vk_hash", vk_hash);

            for (size_t i = 0; i < AVM_NUM_PUBLIC_INPUT_COLUMNS; i++) {
                for (size_t j = 0; j < public_inputs[i].size(); j++) {
                    transcript->add_to_hash_buffer("public_input_" + std::to_string(i) + "_" + std::to_string(j),
                                                   public_inputs[i][j]);
                }
            }

            for (const auto& wire_label : challenges.get_wires_labels()) {
                [[maybe_unused]] auto _ = transcript->template receive_from_prover<StdlibCommitment>(wire_label);
            }

            [[maybe_unused]] auto [_beta, _gamma] =
                transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });

            for (const auto& derived_label : challenges.get_derived_labels()) {
                [[maybe_unused]] auto _ = transcript->template receive_from_prover<StdlibCommitment>(derived_label);
            }

            [[maybe_unused]] const FF _alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

            [[maybe_unused]] const FF _initial_gate_challenge =
                transcript->template get_challenge<FF>("Sumcheck:gate_challenge");

            using SumcheckUnivariate = std::array<FF, BATCHED_RELATION_PARTIAL_LENGTH>;
            for (size_t i = 0; i < MAX_AVM_TRACE_LOG_SIZE; i++) {
                std::string round_univariate_label = "Sumcheck:univariate_" + std::to_string(i);
                [[maybe_unused]] auto _ =
                    transcript->template receive_from_prover<SumcheckUnivariate>(round_univariate_label);
                [[maybe_unused]] FF _round_challenge =
                    transcript->template get_challenge<FF>("Sumcheck:u_" + std::to_string(i));
            }

            [[maybe_unused]] auto _evals =
                transcript->template receive_from_prover<std::array<FF, NUM_ALL_ENTITIES>>("Sumcheck:evaluations");

            [[maybe_unused]] auto _unshifted_challenges =
                transcript->template get_short_challenges<FF>(challenges.get_unshifted_labels());

            [[maybe_unused]] const FF _gemini_batching_challenge = transcript->template get_challenge<FF>("rho");

            for (size_t i = 1; i < MAX_AVM_TRACE_LOG_SIZE; ++i) {
                [[maybe_unused]] auto _ =
                    transcript->template receive_from_prover<StdlibCommitment>("Gemini:FOLD_" + std::to_string(i));
            }

            [[maybe_unused]] const FF _gemini_evaluation_challenge = transcript->template get_challenge<FF>("Gemini:r");

            for (size_t i = 1; i <= MAX_AVM_TRACE_LOG_SIZE; ++i) {
                [[maybe_unused]] auto _ = transcript->template receive_from_prover<FF>("Gemini:a_" + std::to_string(i));
            }

            [[maybe_unused]] const FF _shplonk_batching_challenge =
                transcript->template get_challenge<FF>("Shplonk:nu");

            [[maybe_unused]] auto _shplonk_q = transcript->template receive_from_prover<StdlibCommitment>("Shplonk:Q");

            [[maybe_unused]] const FF _shplonk_evaluation_challenge =
                transcript->template get_challenge<FF>("Shplonk:z");

            [[maybe_unused]] auto _kzg_w = transcript->template receive_from_prover<StdlibCommitment>("KZG:W");

            return transcript;
        };

      public:
        /**
         * @brief Construct a transcript replicating the operations performed on the AVM transcript during
         * proof verification. Then, hash the transcript to obtain the final state.
         *
         */
        static stdlib::field_t<Builder> hash_avm_transcript(
            Builder& builder,
            const stdlib::Proof<Builder>& stdlib_proof,
            const std::vector<std::vector<stdlib::field_t<Builder>>>& public_inputs)
        {
            auto transcript = perform_avm_transcript_operations(builder, stdlib_proof, public_inputs);
            // Finalise AVM transcript
            return transcript->template get_challenge<stdlib::field_t<Builder>>("final_transcript_state");
        }

        /**
         * @brief Testing method to hash the transcript after having replicated the operations performed on the AVM
         * transcript during proof verification and return both the final state and the transcript.
         *
         */
        static std::pair<stdlib::field_t<Builder>, std::shared_ptr<TemplatedTranscript<Builder>>>
        hash_avm_transcript_for_testing(Builder& builder,
                                        const stdlib::Proof<Builder>& stdlib_proof,
                                        const std::vector<std::vector<stdlib::field_t<Builder>>>& public_inputs)
        {
            auto transcript = perform_avm_transcript_operations(builder, stdlib_proof, public_inputs, true);

            // Finalise AVM transcript
            return { transcript->template get_challenge<stdlib::field_t<Builder>>("final_transcript_state"),
                     transcript };
        }
    };

    using Transcript = TemplatedTranscript<CircuitBuilder>;
    using UltraTranscript = TemplatedTranscript<UltraCircuitBuilder>;
    using WitnessCommitments = NativeFlavor::WitnessEntities<Commitment>;
    using VerifierCommitments = NativeFlavor::VerifierCommitments_<Commitment, VerificationKey>;
};

} // namespace bb::avm2
