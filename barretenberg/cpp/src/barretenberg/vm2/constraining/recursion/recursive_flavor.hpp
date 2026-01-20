// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
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
     * @brief In-circuit representation of the verification key of the AVM. It is reconstructed by precomputed values
     * and fixed as a constant of the circuit when the AVM verifier is constructed. The vk commitments are stored in the
     * selectors of the circuit that contains an AVM verifier.
     *
     * @note While the base class has a pub_inputs_offset field, this is not used in the AVM verification algorithm, so
     * we leave it default initialized to zero and don't copy this value in the selectors.
     */
    class VerificationKey : public StdlibVerificationKey_<CircuitBuilder,
                                                          NativeFlavor::PrecomputedEntities<Commitment>,
                                                          NativeVerificationKey,
                                                          VKSerializationMode::NO_METADATA> {
      public:
        VerificationKey(CircuitBuilder* builder, const std::shared_ptr<NativeVerificationKey>& native_key)
        {
            log_circuit_size = FF::from_witness(builder, bb::fr(MAX_AVM_TRACE_LOG_SIZE));
            num_public_inputs = FF::from_witness(builder, bb::fr(AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH));
            for (auto [native_comm, comm] : zip_view(native_key->get_all(), this->get_all())) {
                comm = Commitment::from_witness(builder, native_comm);
            }
        }

        /**
         * @brief Deserialize a verification key from a vector of field elements
         *
         * @param builder
         * @param elements
         */
        VerificationKey(std::span<const FF> elements)
        {
            using Codec = stdlib::StdlibCodec<FF>;

            log_circuit_size = FF(MAX_AVM_TRACE_LOG_SIZE);
            num_public_inputs = FF(AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH);

            size_t num_frs_read = 0;

            for (Commitment& comm : this->get_all()) {
                comm = Codec::template deserialize_from_fields<Commitment>(
                    elements.subspan(num_frs_read, NativeFlavor::NUM_FRS_COM));
                num_frs_read += NativeFlavor::NUM_FRS_COM;
            }
        }

        FF hash_with_origin_tagging([[maybe_unused]] const OriginTag& tag) const override
        {
            throw_or_abort("Not intended to be used because vk is hardcoded in circuit.");
        }

        /**
         * @brief Fixes witnesses of VK to be constants.
         *
         */
        void fix_witness()
        {
            log_circuit_size.fix_witness();
            num_public_inputs.fix_witness();

            for (Commitment& commitment : this->get_all()) {
                commitment.fix_witness();
            }
        }
    };
    template <typename Builder> class TemplatedTranscript : public StdlibTranscript<Builder> {
        using Base = StdlibTranscript<Builder>;
        using FF = stdlib::field_t<Builder>;

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

            auto native_vk = std::make_shared<NativeVerificationKey>(constraining::AvmFixedVKCommitments::get_all());
            auto native_vk_hash = native_vk->hash();
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

            size_t proof_idx = 0;
            std::span<const stdlib::field_t<Builder>> proof_span = stdlib_proof;

            constexpr size_t num_frs_comm = NativeFlavor::NUM_FRS_COM;
            for (const auto& wire_label : challenges.get_wires_labels()) {
                transcript->add_element_frs_to_hash_buffer(wire_label, proof_span.subspan(proof_idx, num_frs_comm));
                proof_idx += num_frs_comm;
            }

            [[maybe_unused]] auto [_beta, _gamma] =
                transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });

            for (const auto& derived_label : challenges.get_derived_labels()) {
                transcript->add_element_frs_to_hash_buffer(derived_label, proof_span.subspan(proof_idx, num_frs_comm));
                proof_idx += num_frs_comm;
            }

            [[maybe_unused]] const FF _alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

            [[maybe_unused]] const FF _initial_gate_challenge =
                transcript->template get_challenge<FF>("Sumcheck:gate_challenge");

            for (size_t i = 0; i < native_vk->log_circuit_size; i++) {
                std::string round_univariate_label = "Sumcheck:univariate_" + std::to_string(i);
                transcript->add_element_frs_to_hash_buffer(
                    round_univariate_label, proof_span.subspan(proof_idx, AvmFlavor::BATCHED_RELATION_PARTIAL_LENGTH));
                proof_idx += AvmFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
                [[maybe_unused]] FF _round_challenge =
                    transcript->template get_challenge<FF>("Sumcheck:u_" + std::to_string(i));
            }

            transcript->add_element_frs_to_hash_buffer("Sumcheck:evaluations",
                                                       proof_span.subspan(proof_idx, NUM_ALL_ENTITIES));
            proof_idx += NUM_ALL_ENTITIES;

            [[maybe_unused]] auto _unshifted_challenges =
                transcript->template get_challenges<FF>(challenges.get_unshifted_labels());

            [[maybe_unused]] const FF _gemini_batching_challenge = transcript->template get_challenge<FF>("rho");

            for (size_t i = 1; i < native_vk->log_circuit_size; ++i) {
                transcript->add_element_frs_to_hash_buffer("Gemini:FOLD_" + std::to_string(i),
                                                           proof_span.subspan(proof_idx, num_frs_comm));
                proof_idx += num_frs_comm;
            }

            [[maybe_unused]] const FF _gemini_evaluation_challenge = transcript->template get_challenge<FF>("Gemini:r");

            for (size_t i = 1; i <= native_vk->log_circuit_size; ++i) {
                transcript->add_to_hash_buffer("Gemini:a_" + std::to_string(i), proof_span[proof_idx++]);
            }

            [[maybe_unused]] const FF _shplonk_batching_challenge =
                transcript->template get_challenge<FF>("Shplonk:nu");

            transcript->add_element_frs_to_hash_buffer("Shplonk:Q", proof_span.subspan(proof_idx, num_frs_comm));
            proof_idx += num_frs_comm;

            [[maybe_unused]] const FF _shplonk_evaluation_challenge =
                transcript->template get_challenge<FF>("Shplonk:z");

            transcript->add_element_frs_to_hash_buffer("KZG:W", proof_span.subspan(proof_idx, num_frs_comm));
            proof_idx += num_frs_comm;

            [[maybe_unused]] const FF _masking_challenge =
                transcript->template get_challenge<FF>("KZG:masking_challenge");

            return transcript;
        };

        /**
         * @brief Hash a transcript that has recorded the operations performed during AVM proof verification.
         *
         * @details Before hashing, if the proof is padded, add to the transcript the padding values.
         *
         */
        static stdlib::field_t<Builder> pad_and_hash_avm_transcript(
            const std::shared_ptr<TemplatedTranscript<Builder>>& transcript, const stdlib::Proof<Builder>& stdlib_proof)
        {
            if (stdlib_proof.size() == AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED) {
                // If the proof is padded, we need to add the padding values to the transcript because recursive
                // verification doesn't do that
                transcript->add_element_frs_to_hash_buffer(
                    "proof_padding",
                    std::span(stdlib_proof)
                        .subspan(AvmFlavor::COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS,
                                 AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED -
                                     AvmFlavor::COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS));
            }
            return transcript->template get_challenge<stdlib::field_t<Builder>>("final_transcript_state");
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
            return pad_and_hash_avm_transcript(transcript, stdlib_proof);
        }

        /**
         * @brief Hash the AVM verifier transcript after having performed proof verification. Then, hash the transcript
         * to obtain the final state.
         *
         */
        static stdlib::field_t<Builder> hash_avm_transcript(
            const std::shared_ptr<TemplatedTranscript<Builder>>& transcript, const stdlib::Proof<Builder>& stdlib_proof)
        {
            return pad_and_hash_avm_transcript(transcript, stdlib_proof);
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

            return { pad_and_hash_avm_transcript(transcript, stdlib_proof), transcript };
        }
    };

    using Transcript = TemplatedTranscript<CircuitBuilder>;
    using UltraTranscript = TemplatedTranscript<UltraCircuitBuilder>;
    using WitnessCommitments = NativeFlavor::WitnessEntities<Commitment>;
    using VerifierCommitments = NativeFlavor::VerifierCommitments_<Commitment, VerificationKey>;
};

} // namespace bb::avm2
