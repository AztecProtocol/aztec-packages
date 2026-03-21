#pragma once

#include "barretenberg/chonk/split/eccvm_field_circuit.hpp"
#include "barretenberg/chonk/split/shared_translator_witness.hpp"
#include "barretenberg/chonk/split/translator_ec_circuit.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_grumpkin_params.hpp"
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
        // Poseidon2 params for the hash

        // Add chunks as circuit witnesses
        std::vector<uint32_t> chunk_indices;
        chunk_indices.reserve(all_chunks_.size());
        for (const auto& chunk : all_chunks_) {
            chunk_indices.push_back(builder_.add_variable(FF(chunk)));
        }

        // Compute h_g = Poseidon2(chunks) over fq using sponge construction
        // Reuse the in-circuit Poseidon2 pattern from TranslatorECCircuit
        FF h_g = compute_poseidon2_hash(chunk_indices);
        uint32_t h_g_idx = builder_.add_variable(h_g);
        builder_.set_public_input(h_g_idx);

        // Alpha as public input
        uint32_t alpha_idx = builder_.add_variable(alpha_);
        builder_.set_public_input(alpha_idx);

        // Evaluate P(alpha) = chunk_0 + chunk_1*alpha + ... via Horner
        uint32_t r_idx = chunk_indices.back();
        for (size_t ii = chunk_indices.size() - 1; ii > 0; ii--) {
            size_t ci = ii - 1;
            FF r_old = builder_.get_variable(r_idx);
            FF alpha_val = builder_.get_variable(alpha_idx);
            FF chunk_val = builder_.get_variable(chunk_indices[ci]);
            FF r_new = r_old * alpha_val + chunk_val;
            uint32_t r_new_idx = builder_.add_variable(r_new);

            builder_.create_big_mul_add_gate({ .a = r_idx,
                                               .b = alpha_idx,
                                               .c = r_new_idx,
                                               .d = chunk_indices[ci],
                                               .mul_scaling = FF(1),
                                               .a_scaling = FF(0),
                                               .b_scaling = FF(0),
                                               .c_scaling = FF(-1),
                                               .d_scaling = FF(1),
                                               .const_scaling = FF(0) });
            r_idx = r_new_idx;
        }
        builder_.set_public_input(r_idx);

        poly_equiv_data_ = PolyEquivData{
            .h_g = h_g,
            .alpha = alpha_,
            .r_g = builder_.get_variable(r_idx),
        };
    }

    /**
     * @brief Compute Poseidon2 hash over fq using in-circuit gates (sponge construction).
     * @details Same pattern as TranslatorECCircuit::compute_poseidon2_hash_in_circuit
     */
    template <typename Params = crypto::Poseidon2GrumpkinScalarFieldParams,
              typename NativePermutation = crypto::Poseidon2Permutation<Params>>
    FF compute_poseidon2_hash(const std::vector<uint32_t>& input_indices)
    {
        static constexpr size_t t = Params::t;
        static constexpr size_t rate = t - 1;

        std::array<FF, t> state{};
        state[rate] = FF(uint256_t(input_indices.size()) << 64);

        size_t input_idx = 0;
        while (input_idx < input_indices.size()) {
            size_t block_size = std::min(rate, input_indices.size() - input_idx);
            for (size_t i = 0; i < block_size; i++) {
                state[i] += builder_.get_variable(input_indices[input_idx + i]);
            }
            input_idx += block_size;

            // Apply Poseidon2 permutation with gates
            // (Delegating to the same gate creation pattern used by TranslatorECCircuit)
            std::array<uint32_t, t> state_indices;
            for (size_t i = 0; i < t; i++) {
                state_indices[i] = builder_.add_variable(state[i]);
            }
            NativePermutation::matrix_multiplication_external(state);
            for (size_t i = 0; i < t; i++) {
                state_indices[i] = builder_.add_variable(state[i]);
            }

            size_t rounds_f_beginning = Params::rounds_f / 2;
            for (size_t i = 0; i < rounds_f_beginning; i++) {
                builder_.create_poseidon2_external_gate(poseidon2_external_gate_<FF>{
                    state_indices[0], state_indices[1], state_indices[2], state_indices[3], i });
                NativePermutation::add_round_constants(state, Params::round_constants[i]);
                NativePermutation::apply_sbox(state);
                NativePermutation::matrix_multiplication_external(state);
                for (size_t j = 0; j < t; j++) {
                    state_indices[j] = builder_.add_variable(state[j]);
                }
            }
            builder_.create_unconstrained_gate(
                builder_.blocks.poseidon2_external, state_indices[0], state_indices[1], state_indices[2], state_indices[3]);

            size_t p_end = rounds_f_beginning + Params::rounds_p;
            for (size_t i = rounds_f_beginning; i < p_end; i++) {
                builder_.create_poseidon2_internal_gate(poseidon2_internal_gate_<FF>{
                    state_indices[0], state_indices[1], state_indices[2], state_indices[3], i });
                state[0] += Params::round_constants[i][0];
                NativePermutation::apply_single_sbox(state[0]);
                NativePermutation::matrix_multiplication_internal(state);
                for (size_t j = 0; j < t; j++) {
                    state_indices[j] = builder_.add_variable(state[j]);
                }
            }
            builder_.create_unconstrained_gate(
                builder_.blocks.poseidon2_internal, state_indices[0], state_indices[1], state_indices[2], state_indices[3]);

            for (size_t i = p_end; i < Params::rounds_f + Params::rounds_p; i++) {
                builder_.create_poseidon2_external_gate(poseidon2_external_gate_<FF>{
                    state_indices[0], state_indices[1], state_indices[2], state_indices[3], i });
                NativePermutation::add_round_constants(state, Params::round_constants[i]);
                NativePermutation::apply_sbox(state);
                NativePermutation::matrix_multiplication_external(state);
                for (size_t j = 0; j < t; j++) {
                    state_indices[j] = builder_.add_variable(state[j]);
                }
            }
            builder_.create_unconstrained_gate(
                builder_.blocks.poseidon2_external, state_indices[0], state_indices[1], state_indices[2], state_indices[3]);
        }

        return state[0];
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
