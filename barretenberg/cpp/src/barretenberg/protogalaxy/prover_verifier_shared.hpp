// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include <vector>
namespace bb {

/**
 * @brief Compute the gate challenges used in the combiner calculation.
 * @details This is Step 8 of the protocol as written in the paper.
 */
template <typename FF>
std::vector<FF> update_gate_challenges(const FF& perturbator_challenge,
                                       const std::vector<FF>& gate_challenges,
                                       const std::vector<FF>& init_challenges)
{
    BB_ASSERT_EQ(
        gate_challenges.size(), init_challenges.size(), "gate_challenges and init_challenges must have same size");
    const size_t num_challenges = gate_challenges.size();
    std::vector<FF> next_gate_challenges(num_challenges);

    for (size_t idx = 0; idx < num_challenges; idx++) {
        next_gate_challenges[idx] = gate_challenges[idx] + perturbator_challenge * init_challenges[idx];
    }
    return next_gate_challenges;
}

/**
 * @brief Evaluates the perturbator at a  given scalar, in a sequential manner for the recursive setting.
 *
 * @details This method is equivalent to the one in the Polynomial class for evaluating a polynomial, represented by
 * coefficients in monomial basis, at a given point. The Polynomial class is used in the native verifier for
 * constructing and computing the perturbator. We implement this separate functionality here in the recursive
 * folding verifier to avoid instantiating the entire Polynomial class on stdlib::bn254. Furthermore, the evaluation
 * needs to be done sequentially as we don't support a parallel_for in circuits.
 *
 */
template <typename FF> static FF evaluate_perturbator(std::vector<FF> coeffs, FF point)
{
    FF point_acc = FF(1);
    FF result = FF(0);
    for (size_t i = 0; i < coeffs.size(); i++) {
        result += coeffs[i] * point_acc;
        if (i < coeffs.size() - 1) {
            point_acc *= point;
        }
    }
    return result;
};
} // namespace bb
