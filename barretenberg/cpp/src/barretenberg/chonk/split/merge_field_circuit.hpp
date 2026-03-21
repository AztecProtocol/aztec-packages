#pragma once

#include "barretenberg/chonk/split/shared_translator_witness.hpp"
#include "barretenberg/goblin/merge_verifier.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

namespace bb {

/**
 * @brief BN254 circuit that wraps the recursive Merge field verification and adds polynomial equivalence.
 *
 * @details Part A: Runs MergeRecursiveVerifier::compute_field_verification() inside a UltraCircuitBuilder,
 * producing a constrained BatchOpeningClaim and merged table commitments.
 * Also reads the KZG quotient commitment W from the transcript.
 *
 * Part B: Adds polynomial equivalence sub-protocol:
 *   1. Derives 128-bit chunks from the BatchOpeningClaim + W (native values)
 *   2. Adds chunks as bigfield (fq) witnesses
 *   3. Computes h_b = Poseidon2(chunks_as_fr)
 *   4. Accepts alpha as bigfield public input
 *   5. Evaluates P(alpha) using bigfield Horner's method
 *   6. Exposes h_b (fr), alpha (4 limbs), r_b (4 limbs) as public inputs
 *
 * Also exposes merged_commitments (needed as Translator input in the combined Chonk_B circuit).
 */
class MergeFieldCircuit {
  public:
    using Builder = UltraCircuitBuilder;
    using RecursiveCurve = stdlib::bn254<Builder>;
    using RecursiveMergeVerifier = MergeVerifier_<RecursiveCurve>;
    using NativeMergeVerifier = MergeVerifier_<curve::BN254>;
    using FF = stdlib::field_t<Builder>;
    using BF = stdlib::bigfield<Builder, bb::Bn254FqParams>;
    using RecCommitment = RecursiveCurve::AffineElement;
    using RecTranscript = RecursiveMergeVerifier::Transcript;
    using NativeCommitment = curve::BN254::AffineElement;
    using InputCommitments = RecursiveMergeVerifier::InputCommitments;
    using NativeInputCommitments = NativeMergeVerifier::InputCommitments;
    using TableCommitments = NativeMergeVerifier::TableCommitments;

    static constexpr size_t NUM_LIMB_BITS = 68;
    static constexpr size_t POLY_EQUIV_PUBLIC_INPUTS = 9; // 1 (h_b) + 4 (alpha) + 4 (r_b)
    static constexpr size_t NUM_WIRES = RecursiveMergeVerifier::NUM_WIRES;

    struct PolyEquivData {
        bb::fr h_b;
        bb::fq alpha;
        bb::fq r_b;
    };

    /**
     * @brief Native data extracted from the recursive Merge verification.
     */
    struct MergeVerificationData {
        BatchOpeningClaim<curve::BN254> batch_opening_claim;
        g1::affine_element W;              // KZG quotient commitment
        TableCommitments merged_commitments; // Needed as Translator input
    };

    /**
     * @brief Construct the Merge field circuit.
     * @param native_input_commitments Native input commitments for the merge protocol
     * @param merge_settings Merge settings (PREPEND or APPEND)
     */
    /**
     * @brief Construct the Merge field circuit.
     * @param external_transcript Optional external transcript for shared Fiat-Shamir state.
     *        If nullptr, creates a new transcript from the proof data.
     */
    MergeFieldCircuit(Builder& builder,
                      const HonkProof& merge_proof,
                      const NativeInputCommitments& native_input_commitments,
                      MergeSettings settings,
                      const bb::fq& alpha,
                      const std::shared_ptr<RecTranscript>& external_transcript = nullptr)
        : builder_(builder)
        , merge_proof_(merge_proof)
        , native_input_commitments_(native_input_commitments)
        , settings_(settings)
        , alpha_(alpha)
        , external_transcript_(external_transcript)
    {}

    void build_circuit()
    {
        merge_data_ = build_field_verification();
        build_poly_equiv(merge_data_.batch_opening_claim, merge_data_.W);
    }

    PolyEquivData get_poly_equiv_data() const { return poly_equiv_data_; }
    const MergeVerificationData& get_merge_data() const { return merge_data_; }

    static PolyEquivData extract_from_public_inputs(const std::vector<bb::fr>& public_input_values,
                                                    size_t poly_equiv_offset)
    {
        BB_ASSERT(public_input_values.size() >= poly_equiv_offset + POLY_EQUIV_PUBLIC_INPUTS);

        bb::fr h_b = public_input_values[poly_equiv_offset];

        bb::fq alpha_val = bb::fq(uint256_t(public_input_values[poly_equiv_offset + 1]) +
                                   (uint256_t(public_input_values[poly_equiv_offset + 2]) << NUM_LIMB_BITS) +
                                   (uint256_t(public_input_values[poly_equiv_offset + 3]) << (2 * NUM_LIMB_BITS)) +
                                   (uint256_t(public_input_values[poly_equiv_offset + 4]) << (3 * NUM_LIMB_BITS)));

        bb::fq r_b = bb::fq(uint256_t(public_input_values[poly_equiv_offset + 5]) +
                              (uint256_t(public_input_values[poly_equiv_offset + 6]) << NUM_LIMB_BITS) +
                              (uint256_t(public_input_values[poly_equiv_offset + 7]) << (2 * NUM_LIMB_BITS)) +
                              (uint256_t(public_input_values[poly_equiv_offset + 8]) << (3 * NUM_LIMB_BITS)));

        return PolyEquivData{ .h_b = h_b, .alpha = alpha_val, .r_b = r_b };
    }

  private:
    MergeVerificationData build_field_verification()
    {
        // Convert native proof to stdlib proof
        stdlib::Proof<Builder> stdlib_proof(builder_, merge_proof_);

        // Convert native input commitments to recursive (stdlib) commitments
        InputCommitments recursive_input_commitments;
        for (size_t idx = 0; idx < NUM_WIRES; idx++) {
            recursive_input_commitments.t_commitments[idx] =
                RecCommitment::from_witness(&builder_, native_input_commitments_.t_commitments[idx]);
            recursive_input_commitments.t_commitments[idx].set_origin_tag(OriginTag());
            recursive_input_commitments.T_prev_commitments[idx] =
                RecCommitment::from_witness(&builder_, native_input_commitments_.T_prev_commitments[idx]);
            recursive_input_commitments.T_prev_commitments[idx].set_origin_tag(OriginTag());
        }

        // Use external transcript if provided (for shared Fiat-Shamir state), else create new
        auto transcript = external_transcript_ ? external_transcript_ : std::make_shared<RecTranscript>();
        RecursiveMergeVerifier verifier(settings_, transcript);

        // Run field verification
        auto field_result = verifier.compute_field_verification(stdlib_proof, recursive_input_commitments);

        // Read W from transcript (KZG quotient commitment)
        auto W_stdlib = transcript->template receive_from_prover<RecCommitment>("KZG:W");
        auto W_native = W_stdlib.get_value();

        // Extract native BatchOpeningClaim
        BatchOpeningClaim<curve::BN254> native_claim;
        native_claim.commitments.reserve(field_result.batch_opening_claim.commitments.size());
        for (const auto& c : field_result.batch_opening_claim.commitments) {
            native_claim.commitments.push_back(c.get_value());
        }
        native_claim.scalars.reserve(field_result.batch_opening_claim.scalars.size());
        for (const auto& s : field_result.batch_opening_claim.scalars) {
            native_claim.scalars.push_back(s.get_value());
        }
        native_claim.evaluation_point = field_result.batch_opening_claim.evaluation_point.get_value();

        // Extract native merged commitments
        TableCommitments native_merged;
        for (size_t idx = 0; idx < NUM_WIRES; idx++) {
            native_merged[idx] = field_result.merged_commitments[idx].get_value();
        }

        return MergeVerificationData{
            .batch_opening_claim = std::move(native_claim),
            .W = W_native,
            .merged_commitments = native_merged,
        };
    }

    void build_poly_equiv(const BatchOpeningClaim<curve::BN254>& native_claim,
                          const g1::affine_element& W_native)
    {
        auto witness = SharedTranslatorWitness::from_claim(native_claim, W_native);
        auto chunks = witness.to_chunks();

        std::vector<BF> chunks_bf;
        std::vector<FF> chunks_fr;
        chunks_bf.reserve(chunks.size());
        chunks_fr.reserve(chunks.size());

        for (const auto& chunk : chunks) {
            auto chunk_bf = BF::from_witness(&builder_, bb::fq(chunk));
            chunk_bf.set_origin_tag(OriginTag());
            chunks_fr.push_back(FF(chunk_bf.prime_basis_limb));
            chunks_bf.push_back(std::move(chunk_bf));
        }

        auto h_b = stdlib::poseidon2<Builder>::hash(chunks_fr);
        h_b.set_public();
        bb::fr h_b_native = h_b.get_value();

        auto alpha_bf = BF::from_witness(&builder_, alpha_);
        alpha_bf.set_origin_tag(OriginTag());
        alpha_bf.set_public();

        BF r_b = chunks_bf.back();
        for (size_t ii = chunks_bf.size() - 1; ii > 0; ii--) {
            r_b = r_b * alpha_bf + chunks_bf[ii - 1];
        }
        r_b.set_public();

        poly_equiv_data_ = PolyEquivData{
            .h_b = h_b_native,
            .alpha = alpha_,
            .r_b = bb::fq(r_b.get_value()),
        };
    }

    Builder& builder_;
    HonkProof merge_proof_;
    NativeInputCommitments native_input_commitments_;
    MergeSettings settings_;
    bb::fq alpha_;
    std::shared_ptr<RecTranscript> external_transcript_;

    MergeVerificationData merge_data_;
    PolyEquivData poly_equiv_data_;
};

} // namespace bb
