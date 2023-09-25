#pragma once

#include <array>
#include <optional>
#include <vector>
namespace proof_system::honk::sumcheck {

/**
 * @brief Contains the multi-linear evaluations of the polynomials at the challenge point 'u'.
 * These are computed by the prover and need to be checked using a multi-linear PCS like Gemini.
 */
template <typename Flavor> struct SumcheckOutput {
    using FF = typename Flavor::FF;
    using ClaimedEvaluations = typename Flavor::ClaimedEvaluations;
    // u = (u_0, ..., u_{d-1})
    std::vector<FF> challenge_point;
    // Evaluations in `u` of the polynomials used in Sumcheck
    ClaimedEvaluations purported_evaluations;
    // Whether or not the purported multilinear evaluations and final sumcheck evaluation have been confirmed
    std::optional<bool> verified = false;
};
} // namespace proof_system::honk::sumcheck
