#pragma once

#include "barretenberg/chonk/split/shared_translator_witness.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"

namespace bb {

/**
 * @brief BN254 circuit that wraps the recursive Translator field verification and adds polynomial equivalence.
 *
 * @details Part A: Runs TranslatorRecursiveVerifier::compute_field_verification() inside a UltraCircuitBuilder,
 * producing a constrained BatchOpeningClaim. Also reads the KZG quotient commitment W from the transcript.
 *
 * Part B: Adds polynomial equivalence sub-protocol:
 *   1. Derives 128-bit chunks from the BatchOpeningClaim + W (native values)
 *   2. Adds chunks as bigfield (fq) witnesses; extracts prime_basis_limb for fr representation
 *   3. Computes h_b = Poseidon2(chunks_as_fr) — native fr hash, fully constrained
 *   4. Accepts alpha as bigfield public input
 *   5. Evaluates P(alpha) = chunk_0 + chunk_1*alpha + ... using bigfield Horner's method
 *   6. Exposes h_b (fr), alpha (4 limbs), r_b (4 limbs) as public inputs
 *
 * Public input layout:
 *   [0]   h_b          (1 fr value — Poseidon2 hash of chunks)
 *   [1-4] alpha limbs  (4 fr values — bigfield binary basis limbs of alpha)
 *   [5-8] r_b limbs    (4 fr values — bigfield binary basis limbs of P(alpha))
 */
class TranslatorFieldCircuit {
  public:
    using Builder = UltraCircuitBuilder;
    using RecursiveFlavor = TranslatorRecursiveFlavor;
    using NativeFlavor = TranslatorFlavor;
    using FF = RecursiveFlavor::FF;         // stdlib::field_t<UCB>
    using BF = RecursiveFlavor::BF;         // stdlib::bigfield<UCB, fq_params>
    using Commitment = RecursiveFlavor::Commitment;
    using RecTranscript = RecursiveFlavor::Transcript;

    static constexpr size_t NUM_LIMB_BITS = 68;
    static constexpr size_t NUM_PUBLIC_INPUTS = 9; // 1 (h_b) + 4 (alpha) + 4 (r_b)

    /**
     * @brief Polynomial equivalence data (native values) produced by the circuit.
     */
    struct PolyEquivData {
        bb::fr h_b;   // Witness hash (native fr, from Poseidon2)
        bb::fq alpha; // Challenge (native fq)
        bb::fq r_b;   // Polynomial evaluation P(alpha) (native fq)
    };

    /**
     * @brief Construct the field circuit.
     *
     * @param builder UltraCircuitBuilder to add constraints to
     * @param translator_proof The native Translator proof
     * @param evaluation_challenge_x Challenge from ECCVM (fq)
     * @param batching_challenge_v Challenge from ECCVM (fq)
     * @param accumulated_result Accumulated result from ECCVM (fq)
     * @param native_op_queue_commitments Op queue wire commitments from merge protocol
     * @param alpha Polynomial equivalence challenge (derived by external verifier)
     */
    /**
     * @param external_transcript Optional external transcript for shared Fiat-Shamir state.
     *        If nullptr, creates a new transcript from the proof data.
     */
    TranslatorFieldCircuit(
        Builder& builder,
        const HonkProof& translator_proof,
        const bb::fq& evaluation_challenge_x,
        const bb::fq& batching_challenge_v,
        const bb::fq& accumulated_result,
        const std::array<g1::affine_element, NativeFlavor::NUM_OP_QUEUE_WIRES>& native_op_queue_commitments,
        const bb::fq& alpha,
        const std::shared_ptr<RecTranscript>& external_transcript = nullptr)
        : builder_(builder)
        , translator_proof_(translator_proof)
        , evaluation_challenge_x_(evaluation_challenge_x)
        , batching_challenge_v_(batching_challenge_v)
        , accumulated_result_(accumulated_result)
        , native_op_queue_commitments_(native_op_queue_commitments)
        , alpha_(alpha)
        , external_transcript_(external_transcript)
    {}

    /**
     * @brief Build the circuit: recursive field verification + polynomial equivalence.
     */
    void build_circuit()
    {
        // Part A: Recursive Translator field verification
        auto [batch_opening_claim, W_native] = build_field_verification();

        // Part B: Polynomial equivalence
        build_poly_equiv(batch_opening_claim, W_native);
    }

    PolyEquivData get_poly_equiv_data() const { return poly_equiv_data_; }

    /**
     * @brief Extract polynomial equivalence data from public input values.
     * @param public_input_values Native fr values of the public inputs (from proof verification)
     */
    static PolyEquivData extract_from_public_inputs(const std::vector<bb::fr>& public_input_values)
    {
        BB_ASSERT(public_input_values.size() >= NUM_PUBLIC_INPUTS);

        // h_b is the first public input
        bb::fr h_b = public_input_values[0];

        // alpha from 4 limbs (indices 1-4)
        bb::fq alpha = reconstruct_fq_from_limbs(
            public_input_values[1], public_input_values[2], public_input_values[3], public_input_values[4]);

        // r_b from 4 limbs (indices 5-8)
        bb::fq r_b = reconstruct_fq_from_limbs(
            public_input_values[5], public_input_values[6], public_input_values[7], public_input_values[8]);

        return PolyEquivData{ .h_b = h_b, .alpha = alpha, .r_b = r_b };
    }

    /**
     * @brief Reconstruct an fq value from 4 × 68-bit binary basis limbs stored as fr values.
     */
    static bb::fq reconstruct_fq_from_limbs(bb::fr limb0, bb::fr limb1, bb::fr limb2, bb::fr limb3)
    {
        return bb::fq(uint256_t(limb0) + (uint256_t(limb1) << NUM_LIMB_BITS) +
                       (uint256_t(limb2) << (2 * NUM_LIMB_BITS)) + (uint256_t(limb3) << (3 * NUM_LIMB_BITS)));
    }

  private:
    /**
     * @brief Run recursive Translator field verification and read W from transcript.
     * @return Pair of (native BatchOpeningClaim, native W)
     */
    std::pair<BatchOpeningClaim<curve::BN254>, g1::affine_element> build_field_verification()
    {
        // Create stdlib proof from native proof
        stdlib::Proof<Builder> stdlib_proof(builder_, translator_proof_);
        // Use external transcript if provided (for shared Fiat-Shamir state), else create new
        auto transcript = external_transcript_ ? external_transcript_ : std::make_shared<RecTranscript>(stdlib_proof);

        // Convert native inputs to circuit witnesses.
        // OriginTag: these values originate from ECCVM verifier (different protocol phase).
        // Use a non-free, non-constant tag to avoid origin tag false positives.
        auto eccvm_origin = OriginTag(/*parent_tag=*/0, /*child_tag=*/0, /*is_submitted=*/true);

        auto accumulated_result_bf = BF::from_witness(&builder_, accumulated_result_);
        accumulated_result_bf.set_origin_tag(eccvm_origin);

        auto eval_x_bf = BF::from_witness(&builder_, evaluation_challenge_x_);
        auto batch_v_bf = BF::from_witness(&builder_, batching_challenge_v_);
        eval_x_bf.set_origin_tag(eccvm_origin);
        batch_v_bf.set_origin_tag(eccvm_origin);

        // Convert op queue commitments to stdlib witnesses
        std::array<Commitment, NativeFlavor::NUM_OP_QUEUE_WIRES> stdlib_op_queue_commitments;
        for (size_t i = 0; i < NativeFlavor::NUM_OP_QUEUE_WIRES; i++) {
            stdlib_op_queue_commitments[i] =
                Commitment::from_witness(&builder_, native_op_queue_commitments_[i]);
            stdlib_op_queue_commitments[i].set_origin_tag(eccvm_origin);
        }

        // Create and run recursive verifier (field verification only)
        stdlib::Proof<Builder> stdlib_proof_for_verifier(builder_, translator_proof_);
        TranslatorRecursiveVerifier verifier{ transcript,
                                              stdlib_proof_for_verifier,
                                              eval_x_bf,
                                              batch_v_bf,
                                              accumulated_result_bf,
                                              stdlib_op_queue_commitments };
        auto field_result = verifier.compute_field_verification();

        // Read W from transcript (constrained by Fiat-Shamir)
        auto W_stdlib = transcript->template receive_from_prover<Commitment>("KZG:W");
        auto W_native = W_stdlib.get_value();

        // Extract native BatchOpeningClaim values
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

        return { native_claim, W_native };
    }

    /**
     * @brief Add polynomial equivalence constraints.
     * @details Chunks are added as bigfield witnesses. The prime_basis_limb of each bigfield gives
     * the fr representation (valid since chunks < 2^128 < min(fr_mod, fq_mod)).
     * h_b = Poseidon2(chunks_as_fr), r_b = P(alpha) using bigfield Horner's method.
     */
    void build_poly_equiv(const BatchOpeningClaim<curve::BN254>& native_claim,
                          const g1::affine_element& W_native)
    {
        // Derive 128-bit chunks from native data
        auto witness = SharedTranslatorWitness::from_claim(native_claim, W_native);
        auto chunks = witness.to_chunks();

        // Add chunks as bigfield witnesses (constrained with range checks on limbs)
        // and extract prime_basis_limb as fr representation for hashing
        std::vector<BF> chunks_bf;
        std::vector<FF> chunks_fr;
        chunks_bf.reserve(chunks.size());
        chunks_fr.reserve(chunks.size());

        for (const auto& chunk : chunks) {
            auto chunk_bf = BF::from_witness(&builder_, bb::fq(chunk));
            chunk_bf.set_origin_tag(OriginTag());
            auto chunk_fr = FF(chunk_bf.prime_basis_limb);
            chunk_fr.set_origin_tag(OriginTag());
            chunks_fr.push_back(chunk_fr);
            chunks_bf.push_back(std::move(chunk_bf));
        }

        // Compute h_b = Poseidon2 hash of all chunks (native fr Poseidon2)
        // Clear origin tags to avoid conflicts between free witnesses and transcript-derived values
        for (auto& cf : chunks_fr) {
            cf.set_origin_tag(OriginTag());
        }
        auto h_b = stdlib::poseidon2<Builder>::hash(chunks_fr);
        h_b.set_origin_tag(OriginTag());
        h_b.set_public();
        bb::fr h_b_native = h_b.get_value();

        // Alpha as bigfield public input
        auto alpha_bf = BF::from_witness(&builder_, alpha_);
        alpha_bf.set_origin_tag(OriginTag());
        alpha_bf.set_public(); // 4 limbs as public inputs

        // Evaluate P(alpha) = chunk_0 + chunk_1*alpha + chunk_2*alpha^2 + ...
        // Using Horner's method: P(alpha) = c_0 + alpha*(c_1 + alpha*(c_2 + ... + alpha*c_{n-1}))
        BF r_b = chunks_bf.back();
        for (size_t ii = chunks_bf.size() - 1; ii > 0; ii--) {
            r_b = r_b * alpha_bf + chunks_bf[ii - 1];
        }
        r_b.set_public(); // 4 limbs as public inputs

        // Store results
        poly_equiv_data_ = PolyEquivData{
            .h_b = h_b_native,
            .alpha = alpha_,
            .r_b = bb::fq(r_b.get_value()),
        };
    }

    Builder& builder_;
    HonkProof translator_proof_;
    bb::fq evaluation_challenge_x_;
    bb::fq batching_challenge_v_;
    bb::fq accumulated_result_;
    std::array<g1::affine_element, NativeFlavor::NUM_OP_QUEUE_WIRES> native_op_queue_commitments_;
    bb::fq alpha_;
    std::shared_ptr<RecTranscript> external_transcript_;

    PolyEquivData poly_equiv_data_;
};

} // namespace bb
