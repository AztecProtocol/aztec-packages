#pragma once

#include "barretenberg/chonk/split/shared_translator_witness.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb {

/**
 * @brief BN254 circuit that wraps the recursive MegaZK field verification and adds polynomial equivalence.
 *
 * @details Part A: Runs MegaZKRecursiveVerifier::compute_field_verification() inside a UltraCircuitBuilder,
 * producing a constrained BatchOpeningClaim. Also reads the KZG quotient commitment W from the transcript.
 * Extracts HidingKernelIO data (pairing_inputs, ecc_op_tables, kernel_return_data) from public inputs.
 *
 * Part B: Adds polynomial equivalence sub-protocol (same pattern as TranslatorFieldCircuit):
 *   1. Derives 128-bit chunks from the BatchOpeningClaim + W (native values)
 *   2. Adds chunks as bigfield (fq) witnesses; extracts prime_basis_limb for fr representation
 *   3. Computes h_b = Poseidon2(chunks_as_fr)
 *   4. Accepts alpha as bigfield public input
 *   5. Evaluates P(alpha) using bigfield Horner's method
 *   6. Exposes h_b (fr), alpha (4 limbs), r_b (4 limbs) as public inputs
 *
 * Public input layout (after HidingKernelIO public inputs set by the recursive verifier):
 *   [HidingKernelIO...]   (set by recursive verifier)
 *   [+0]   h_b            (1 fr value — Poseidon2 hash of chunks)
 *   [+1-4] alpha limbs    (4 fr values — bigfield binary basis limbs of alpha)
 *   [+5-8] r_b limbs      (4 fr values — bigfield binary basis limbs of P(alpha))
 */
class MegaFieldCircuit {
  public:
    using Builder = UltraCircuitBuilder;
    using RecursiveFlavor = MegaZKRecursiveFlavor_<Builder>;
    using NativeFlavor = MegaZKFlavor;
    using FF = typename RecursiveFlavor::FF;
    using BF = stdlib::bigfield<Builder, bb::Bn254FqParams>;
    using Commitment = typename RecursiveFlavor::Commitment;
    using RecTranscript = typename RecursiveFlavor::Transcript;
    using NativeVK = typename NativeFlavor::VerificationKey;
    using RecursiveVKAndHash = typename RecursiveFlavor::VKAndHash;
    // IO type for the recursive verifier. DefaultIO for tests, HidingKernelIO for IVC proofs.
    // The IO handler affects how public inputs are extracted but doesn't affect field verification.
    using RecursiveVerifier =
        UltraVerifier_<RecursiveFlavor, stdlib::recursion::honk::DefaultIO<Builder>>;

    static constexpr size_t NUM_LIMB_BITS = 68;
    static constexpr size_t POLY_EQUIV_PUBLIC_INPUTS = 9; // 1 (h_b) + 4 (alpha) + 4 (r_b)

    /**
     * @brief Polynomial equivalence data (native values) produced by the circuit.
     */
    struct PolyEquivData {
        bb::fr h_b;   // Witness hash (native fr, from Poseidon2)
        bb::fq alpha; // Challenge (native fq)
        bb::fq r_b;   // Polynomial evaluation P(alpha) (native fq)
    };

    /**
     * @brief Native data extracted from the recursive MegaZK verification.
     */
    struct MegaVerificationData {
        BatchOpeningClaim<curve::BN254> batch_opening_claim;
        g1::affine_element W; // KZG quotient commitment
    };

    /**
     * @brief Construct the MegaZK field circuit.
     */
    MegaFieldCircuit(Builder& builder,
                     const HonkProof& mega_proof,
                     const std::shared_ptr<NativeVK>& native_vk,
                     const bb::fq& alpha)
        : builder_(builder)
        , mega_proof_(mega_proof)
        , native_vk_(native_vk)
        , alpha_(alpha)
    {}

    /**
     * @brief Build the circuit: recursive MegaZK field verification + polynomial equivalence.
     */
    void build_circuit()
    {
        // Part A: Recursive MegaZK field verification
        mega_data_ = build_field_verification();

        // Part B: Polynomial equivalence
        build_poly_equiv(mega_data_.batch_opening_claim, mega_data_.W);
    }

    PolyEquivData get_poly_equiv_data() const { return poly_equiv_data_; }
    const MegaVerificationData& get_mega_data() const { return mega_data_; }

    /**
     * @brief Extract polynomial equivalence data from public input values.
     * @param public_input_values Native fr values of the public inputs
     * @param poly_equiv_offset Index where poly equiv public inputs start
     */
    static PolyEquivData extract_from_public_inputs(const std::vector<bb::fr>& public_input_values,
                                                    size_t poly_equiv_offset)
    {
        BB_ASSERT(public_input_values.size() >= poly_equiv_offset + POLY_EQUIV_PUBLIC_INPUTS);

        bb::fr h_b = public_input_values[poly_equiv_offset];

        bb::fq alpha = reconstruct_fq_from_limbs(public_input_values[poly_equiv_offset + 1],
                                                  public_input_values[poly_equiv_offset + 2],
                                                  public_input_values[poly_equiv_offset + 3],
                                                  public_input_values[poly_equiv_offset + 4]);

        bb::fq r_b = reconstruct_fq_from_limbs(public_input_values[poly_equiv_offset + 5],
                                                public_input_values[poly_equiv_offset + 6],
                                                public_input_values[poly_equiv_offset + 7],
                                                public_input_values[poly_equiv_offset + 8]);

        return PolyEquivData{ .h_b = h_b, .alpha = alpha, .r_b = r_b };
    }

    static bb::fq reconstruct_fq_from_limbs(bb::fr limb0, bb::fr limb1, bb::fr limb2, bb::fr limb3)
    {
        return bb::fq(uint256_t(limb0) + (uint256_t(limb1) << NUM_LIMB_BITS) +
                       (uint256_t(limb2) << (2 * NUM_LIMB_BITS)) + (uint256_t(limb3) << (3 * NUM_LIMB_BITS)));
    }

  private:
    /**
     * @brief Run recursive MegaZK field verification and read W from transcript.
     */
    MegaVerificationData build_field_verification()
    {
        // Create stdlib proof from native proof
        stdlib::Proof<Builder> stdlib_proof(builder_, mega_proof_);

        // Create recursive VKAndHash from native VK
        auto vk_and_hash = std::make_shared<RecursiveVKAndHash>(builder_, native_vk_);

        // Create recursive transcript and verifier
        auto transcript = std::make_shared<RecTranscript>();
        RecursiveVerifier verifier(vk_and_hash, transcript);

        // Run field verification (Oink → Sumcheck → Shplemini → BatchOpeningClaim)
        bool builder_ok_before = !builder_.failed();
        auto field_result = verifier.compute_field_verification(stdlib_proof);
        bool builder_ok_after = !builder_.failed();
        info("MegaFieldCircuit: recursive field verif result: ", field_result.verified ? "verified" : "FAILED");
        if (builder_ok_before && !builder_ok_after) {
            info("MegaFieldCircuit: builder failed DURING compute_field_verification: ", builder_.err());
        }

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

        return MegaVerificationData{
            .batch_opening_claim = std::move(native_claim),
            .W = W_native,
        };
    }

    /**
     * @brief Add polynomial equivalence constraints (same pattern as TranslatorFieldCircuit).
     */
    void build_poly_equiv(const BatchOpeningClaim<curve::BN254>& native_claim,
                          const g1::affine_element& W_native)
    {
        // Derive 128-bit chunks from native data
        auto witness = SharedTranslatorWitness::from_claim(native_claim, W_native);
        auto chunks = witness.to_chunks();

        // Add chunks as bigfield witnesses and extract prime_basis_limb as fr representation
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

        // Compute h_b = Poseidon2 hash of all chunks (native fr Poseidon2)
        auto h_b = stdlib::poseidon2<Builder>::hash(chunks_fr);
        h_b.set_public();
        bb::fr h_b_native = h_b.get_value();

        // Alpha as bigfield public input
        auto alpha_bf = BF::from_witness(&builder_, alpha_);
        alpha_bf.set_origin_tag(OriginTag());
        alpha_bf.set_public();

        // Evaluate P(alpha) using Horner's method
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
    HonkProof mega_proof_;
    std::shared_ptr<NativeVK> native_vk_;
    bb::fq alpha_;

    MegaVerificationData mega_data_;
    PolyEquivData poly_equiv_data_;
};

} // namespace bb
