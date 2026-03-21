#pragma once

#include "barretenberg/chonk/split/eccvm_ec_circuit.hpp"
#include "barretenberg/chonk/split/mega_field_circuit.hpp"
#include "barretenberg/chonk/split/merge_field_circuit.hpp"
#include "barretenberg/chonk/split/shared_translator_witness.hpp"
#include "barretenberg/chonk/split/translator_field_circuit.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/goblin/types.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

namespace bb {

/**
 * @brief Combined BN254 circuit for all field verifications + ECCVM EC verification (Chonk_B).
 *
 * @details Contains 4 sub-circuit verifications in a single UltraCircuitBuilder:
 *   1. MegaZK recursive field verification (MegaFieldCircuit)
 *   2. Merge recursive field verification (MergeFieldCircuit)
 *   3. Translator recursive field verification (TranslatorFieldCircuit)
 *   4. ECCVM EC verification via cycle_group (ECCVMECCircuit)
 *
 * Inter-proof data flow:
 *   MegaZK → ecc_op_tables → Merge (as T_prev_commitments)
 *   Merge → merged_commitments → Translator (as op_queue_wire_commitments)
 *   ECCVM → TranslatorInputData → Translator (eval_challenge_x, batching_v, accumulated_result)
 *
 * Polynomial equivalence: single Poseidon2 hash + Horner evaluation over concatenated
 * 128-bit chunks from all 4 sub-proof shared witnesses.
 *
 * @note Phase 4b (ECCVMFieldCircuit) is pending — ECCVM field work in Chonk_G uses raw gates.
 * This does NOT affect Chonk_B, which handles ECCVM EC (the cycle_group MSMs).
 */
class ChonkBCircuit {
  public:
    using Builder = UltraCircuitBuilder;
    using FF = stdlib::field_t<Builder>;
    using BF = stdlib::bigfield<Builder, bb::Bn254FqParams>;

    /**
     * @brief All native data needed to build the combined Chonk_B circuit.
     * @details Extracted from native verification of all 4 sub-proofs.
     */
    struct InputData {
        // MegaZK
        HonkProof mega_proof;
        std::shared_ptr<MegaZKFlavor::VerificationKey> mega_vk;
        BatchOpeningClaim<curve::BN254> mega_claim;
        g1::affine_element mega_W;

        // Merge
        HonkProof merge_proof;
        MergeVerifier::InputCommitments merge_input_commitments;
        MergeSettings merge_settings;
        BatchOpeningClaim<curve::BN254> merge_claim;
        g1::affine_element merge_W;
        MergeVerifier::TableCommitments merged_commitments;

        // Translator
        HonkProof translator_proof;
        bb::fq evaluation_challenge_x;
        bb::fq batching_challenge_v;
        bb::fq accumulated_result;
        std::array<g1::affine_element, 4> op_queue_wire_commitments;
        BatchOpeningClaim<curve::BN254> translator_claim;
        g1::affine_element translator_W;

        // ECCVM EC
        ECCVMVerifier::FlatECResult eccvm_flat_ec;
    };

    struct PolyEquivData {
        bb::fr h_b;
        bb::fq alpha;
        bb::fq r_b;
    };

    ChonkBCircuit(Builder& builder, const InputData& input, const bb::fq& alpha)
        : builder_(builder)
        , input_(input)
        , alpha_(alpha)
    {}

    /**
     * @brief Build the combined circuit.
     */
    void build_circuit()
    {
        // Sub-circuit 1: MegaZK recursive field verification
        MegaFieldCircuit mega_circuit(builder_, input_.mega_proof, input_.mega_vk, alpha_);
        mega_circuit.build_circuit();

        // Sub-circuit 2: Merge recursive field verification
        MergeFieldCircuit merge_circuit(
            builder_, input_.merge_proof, input_.merge_input_commitments, input_.merge_settings, alpha_);
        merge_circuit.build_circuit();

        // Sub-circuit 3: Translator recursive field verification
        TranslatorFieldCircuit translator_circuit(builder_,
                                                   input_.translator_proof,
                                                   input_.evaluation_challenge_x,
                                                   input_.batching_challenge_v,
                                                   input_.accumulated_result,
                                                   input_.op_queue_wire_commitments,
                                                   alpha_);
        translator_circuit.build_circuit();

        // Sub-circuit 4: ECCVM EC verification (Grumpkin MSMs via cycle_group)
        ECCVMECCircuit eccvm_ec_circuit(builder_, input_.eccvm_flat_ec, alpha_);
        eccvm_ec_circuit.build_circuit();

        // Collect all shared witness chunks for combined polynomial equivalence
        auto mega_chunks = SharedTranslatorWitness::from_claim(input_.mega_claim, input_.mega_W).to_chunks();
        auto merge_chunks = SharedTranslatorWitness::from_claim(input_.merge_claim, input_.merge_W).to_chunks();
        auto translator_chunks =
            SharedTranslatorWitness::from_claim(input_.translator_claim, input_.translator_W).to_chunks();
        auto eccvm_chunks = SharedECCVMWitness::from_claim(input_.eccvm_flat_ec.batch_claim,
                                                            grumpkin::g1::affine_element::one())
                                .to_chunks();

        all_chunks_ = concatenate_chunks({ mega_chunks, merge_chunks, translator_chunks, eccvm_chunks });

        // Build combined polynomial equivalence
        build_combined_poly_equiv();
    }

    PolyEquivData get_poly_equiv_data() const { return poly_equiv_data_; }
    const std::vector<uint256_t>& get_all_chunks() const { return all_chunks_; }

  private:
    void build_combined_poly_equiv()
    {
        std::vector<BF> chunks_bf;
        std::vector<FF> chunks_fr;
        chunks_bf.reserve(all_chunks_.size());
        chunks_fr.reserve(all_chunks_.size());

        for (const auto& chunk : all_chunks_) {
            auto chunk_bf = BF::from_witness(&builder_, bb::fq(chunk));
            chunk_bf.set_origin_tag(OriginTag());
            chunks_fr.push_back(FF(chunk_bf.prime_basis_limb));
            chunks_bf.push_back(std::move(chunk_bf));
        }

        // h_b = Poseidon2(all_chunks_as_fr)
        auto h_b = stdlib::poseidon2<Builder>::hash(chunks_fr);
        h_b.set_public();

        // Alpha as bigfield public input
        auto alpha_bf = BF::from_witness(&builder_, alpha_);
        alpha_bf.set_origin_tag(OriginTag());
        alpha_bf.set_public();

        // P(alpha) via Horner
        BF r_b = chunks_bf.back();
        for (size_t ii = chunks_bf.size() - 1; ii > 0; ii--) {
            r_b = r_b * alpha_bf + chunks_bf[ii - 1];
        }
        r_b.set_public();

        poly_equiv_data_ = PolyEquivData{
            .h_b = h_b.get_value(),
            .alpha = alpha_,
            .r_b = bb::fq(r_b.get_value()),
        };
    }

    Builder& builder_;
    InputData input_;
    bb::fq alpha_;

    std::vector<uint256_t> all_chunks_;
    PolyEquivData poly_equiv_data_;
};

} // namespace bb
