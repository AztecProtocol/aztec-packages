#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include <array>
#include <optional>
#include <vector>

namespace bb {

/**
 * @brief Contains the evaluations of multilinear polynomials \f$ P_1, \ldots, P_N\f$ at the challenge point \f$\vec u
 * =(u_0,\ldots, u_{d-1})\f$. These are computed by \ref bb::SumcheckProver< Flavor > "Sumcheck Prover" and need to be
 * checked using Shplemini.
 */
// template <typename Flavor, typename = void> struct SumcheckOutput {
//     using FF = typename Flavor::FF;
//     using ClaimedEvaluations = typename Flavor::AllValues;
//     // \f$ \vec u = (u_0, ..., u_{d-1}) \f$
//     std::vector<FF> challenge;
//     // Evaluations at \f$ \vec u \f$ of the polynomials used in Sumcheck
//     ClaimedEvaluations claimed_evaluations;
//     // Whether or not the evaluations of multilinear polynomials \f$ P_1, \ldots, P_N \f$  and final Sumcheck
//     evaluation
//     // have been confirmed
//     std::optional<bool> verified = false; // optional b/c this struct is shared by the Prover/Verifier
// };
/**
 * @brief A modification of SumcheckOutput required by ZK Flavors where a vector of evaluations of Libra univariates is
 * included.
 *
 * @tparam Flavor
 */
template <typename Flavor> struct SumcheckOutput {
    using FF = typename Flavor::FF;
    using ClaimedEvaluations = typename Flavor::AllValues;
    // \f$ \vec u = (u_0, ..., u_{d-1}) \f$
    std::vector<FF> challenge;
    // Evaluations at \f$ \vec u \f$ of the polynomials used in Sumcheck
    ClaimedEvaluations claimed_evaluations;
    // For ZK Flavors: the sum of the Libra constant term and Libra univariates evaluated at Sumcheck challenges
    FF claimed_libra_evaluation = 0;
    // Whether or not the evaluations of multilinear polynomials \f$ P_1, \ldots, P_N \f$  and final Sumcheck evaluation
    // have been confirmed
    std::optional<bool> verified = false; // Optional b/c this struct is shared by the Prover/Verifier
};
} // namespace bb
