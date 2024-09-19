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
    const size_t num_challenges = gate_challenges.size();
    std::vector<FF> next_gate_challenges(num_challenges);

    for (size_t idx = 0; idx < num_challenges; idx++) {
        next_gate_challenges[idx] = gate_challenges[idx] + perturbator_challenge * init_challenges[idx];
    }
    return next_gate_challenges;
}
/**
 * @brief Given δ, compute the vector [δ, δ^2,..., δ^num_powers].
 * @details This is Step 2 of the protocol as written in the paper.
 */
template <typename FF> std::vector<FF> compute_round_challenge_pows(const size_t num_powers, const FF& round_challenge)
{
    std::vector<FF> pows(num_powers);
    pows[0] = round_challenge;
    for (size_t i = 1; i < num_powers; i++) {
        pows[i] = pows[i - 1].sqr();
    }
    return pows;
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
        point_acc *= point;
    }
    return result;
};

} // namespace bb
