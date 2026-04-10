#pragma once

#include "barretenberg/chonk/split/eccvm_field_circuit.hpp"
#include "barretenberg/chonk/split/shared_translator_witness.hpp"
#include "barretenberg/chonk/split/translator_ec_circuit.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

namespace bb {

/**
 * @brief Combined Grumpkin circuit for all EC verifications + ECCVM field verification (Chonk_G).
 *
 * @details Contains 4 sub-circuit verifications in a single GrumpkinUltraCircuitBuilder:
 *   1. MegaZK EC verification (TranslatorECCircuit with MegaZK claim)
 *   2. Merge EC verification (TranslatorECCircuit with Merge claim)
 *   3. Translator EC verification (TranslatorECCircuit with Translator claim)
 *   4. ECCVM field verification (ECCVMFieldCircuit — sumcheck + Shplemini)
 *
 * All BN254 MSMs use bn254_cycle_group (native in Grumpkin circuit).
 * All ECCVM field arithmetic uses native grumpkin::fr (= bn254::fq).
 *
 * Outputs:
 *   - 3 PairingPoints<BN254> (MegaZK, Merge, Translator) as public inputs
 *   - ECCVM accumulated_result for Translator binding
 *   - h_g, alpha, r_g for polynomial equivalence
 */
class ChonkGCircuit {
  public:
    using Builder = GrumpkinUltraCircuitBuilder;
    using FF = Builder::FF; // grumpkin::fr = bn254::fq

    /**
     * @brief All native data needed to build the combined Chonk_G circuit.
     */
    struct InputData {
        // MegaZK EC data (BatchOpeningClaim + W from MegaZK field verification)
        BatchOpeningClaim<curve::BN254> mega_claim;
        g1::affine_element mega_W;

        // Merge EC data
        BatchOpeningClaim<curve::BN254> merge_claim;
        g1::affine_element merge_W;

        // Translator EC data
        BatchOpeningClaim<curve::BN254> translator_claim;
        g1::affine_element translator_W;

        // ECCVM field data
        ECCVMFieldCircuit::InputData eccvm_field_data;
    };

    struct PolyEquivData {
        FF h_g;   // Witness hash (Poseidon2 over fq)
        FF alpha; // Challenge point
        FF r_g;   // Polynomial evaluation result
    };

    ChonkGCircuit(Builder& builder, const InputData& input, const FF& alpha)
        : builder_(builder)
        , input_(input)
        , alpha_(alpha)
    {}

    void build_circuit()
    {
        // Sub-circuit 1: MegaZK EC verification (BN254 MSM via bn254_cycle_group)
        TranslatorECCircuit mega_ec(builder_, input_.mega_claim, input_.mega_W);
        mega_ec.build_circuit();
        mega_pairing_points_ = mega_ec.get_pairing_points();

        // Sub-circuit 2: Merge EC verification
        TranslatorECCircuit merge_ec(builder_, input_.merge_claim, input_.merge_W);
        merge_ec.build_circuit();
        merge_pairing_points_ = merge_ec.get_pairing_points();

        // Sub-circuit 3: Translator EC verification
        TranslatorECCircuit translator_ec(builder_, input_.translator_claim, input_.translator_W);
        translator_ec.build_circuit();
        translator_pairing_points_ = translator_ec.get_pairing_points();

        // Sub-circuit 4: ECCVM field verification (native grumpkin::fr arithmetic)
        ECCVMFieldCircuit eccvm_field(builder_, input_.eccvm_field_data);
        eccvm_field.build_circuit();
        eccvm_accumulated_result_ = eccvm_field.get_accumulated_result();

        // Collect all shared witness chunks for polynomial equivalence
        auto mega_chunks = SharedTranslatorWitness::from_claim(input_.mega_claim, input_.mega_W).to_chunks();
        auto merge_chunks = SharedTranslatorWitness::from_claim(input_.merge_claim, input_.merge_W).to_chunks();
        auto translator_chunks =
            SharedTranslatorWitness::from_claim(input_.translator_claim, input_.translator_W).to_chunks();
        // ECCVM field data chunks would go here when fully implemented

        all_chunks_ = concatenate_chunks({ mega_chunks, merge_chunks, translator_chunks });

        // Build polynomial equivalence (Poseidon2 over fq using in-circuit gates)
        build_poly_equiv();
    }

    PairingPoints<curve::BN254> get_mega_pairing_points() const { return mega_pairing_points_; }
    PairingPoints<curve::BN254> get_merge_pairing_points() const { return merge_pairing_points_; }
    PairingPoints<curve::BN254> get_translator_pairing_points() const { return translator_pairing_points_; }
    FF get_eccvm_accumulated_result() const { return eccvm_accumulated_result_; }
    PolyEquivData get_poly_equiv_data() const { return poly_equiv_data_; }

  private:
    void build_poly_equiv()
    {
        using field_ct = stdlib::field_t<Builder>;

        // Add chunks as circuit witnesses
        std::vector<field_ct> chunk_witnesses;
        chunk_witnesses.reserve(all_chunks_.size());
        for (const auto& chunk : all_chunks_) {
            chunk_witnesses.push_back(field_ct::from_witness(&builder_, FF(chunk)));
        }

        // Compute h_g = Poseidon2(chunks) using stdlib (auto-selects GrumpkinScalarFieldParams)
        auto h_g = stdlib::poseidon2<Builder>::hash(chunk_witnesses);
        h_g.set_public();

        // Alpha as public input
        auto alpha_ct = field_ct::from_witness(&builder_, alpha_);
        alpha_ct.set_public();

        // Evaluate P(alpha) = chunk_0 + chunk_1*alpha + ... via Horner
        auto r = chunk_witnesses.back();
        for (size_t ii = chunk_witnesses.size() - 1; ii > 0; ii--) {
            r = r * alpha_ct + chunk_witnesses[ii - 1];
        }
        r.set_public();

        poly_equiv_data_ = PolyEquivData{
            .h_g = h_g.get_value(),
            .alpha = alpha_,
            .r_g = r.get_value(),
        };
    }

    Builder& builder_;
    InputData input_;
    FF alpha_;

    PairingPoints<curve::BN254> mega_pairing_points_;
    PairingPoints<curve::BN254> merge_pairing_points_;
    PairingPoints<curve::BN254> translator_pairing_points_;
    FF eccvm_accumulated_result_ = FF(0);
    std::vector<uint256_t> all_chunks_;
    PolyEquivData poly_equiv_data_;
};

} // namespace bb
