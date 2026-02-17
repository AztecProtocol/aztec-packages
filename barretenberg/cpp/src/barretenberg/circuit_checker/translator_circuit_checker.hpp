#pragma once
#include "barretenberg/translator_vm/translator_proving_key.hpp"
namespace bb {
class TranslatorCircuitChecker {
    using Fr = bb::fr;
    using Fq = bb::fq;
    using Flavor = TranslatorFlavor;
    using ProvingKey = TranslatorProvingKey;

    // Number of limbs used to decompose a 254-bit value for modular arithmetic
    static constexpr size_t NUM_BINARY_LIMBS = ProvingKey::NUM_BINARY_LIMBS;

    static constexpr size_t RESULT_ROW = Flavor::RESULT_ROW;

  public:
    struct RelationInputs {
        std::array<Fr, NUM_BINARY_LIMBS> x_limbs;
        std::array<Fr, NUM_BINARY_LIMBS> v_limbs;
        std::array<Fr, NUM_BINARY_LIMBS> v_squared_limbs = { 0 };
        std::array<Fr, NUM_BINARY_LIMBS> v_cubed_limbs = { 0 };
        std::array<Fr, NUM_BINARY_LIMBS> v_quarted_limbs = { 0 };
    };
    TranslatorCircuitChecker() = default;

    /**
     * @brief Get the result of accumulation, stored as 4 binary limbs in the first row of the proving key.
     *
     */
    static Fq get_computation_result(const ProvingKey& proving_key)
    {
        const auto& polys = proving_key.proving_key->polynomials;
        return Fq(polys.accumulators_binary_limbs_0[RESULT_ROW] +
                  polys.accumulators_binary_limbs_1[RESULT_ROW] * ProvingKey::SHIFT_1 +
                  polys.accumulators_binary_limbs_2[RESULT_ROW] * ProvingKey::SHIFT_2 +
                  polys.accumulators_binary_limbs_3[RESULT_ROW] * ProvingKey::SHIFT_3);
    }

    /**
     * @brief Create limb representations of x and powers of v that are needed to compute the witness or check
     * circuit correctness
     *
     * @param evaluation_input_x The point at which the polynomials are being evaluated
     * @param batching_challenge_v The batching challenge
     * @return RelationInputs
     */
    static RelationInputs compute_relation_inputs_limbs(const Fq& batching_challenge_v, const Fq& evaluation_input_x);

    /**
     * @brief Check the witness satisifies the circuit
     *
     * @details Goes through each gate and checks the correctness of accumulation
     *
     * @return true
     * @return false
     */

    static bool check(const ProvingKey& proving_key);
};
} // namespace bb
