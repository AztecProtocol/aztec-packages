#pragma once

#include "barretenberg/flavor/flavor_concepts.hpp"
#include <cstdint>

namespace bb {

/**
 * We collect the constants pertaining to Protogalaxy
 *
 */

// Number of instances to be folded
static constexpr std::size_t NUM_INSTANCES = 2;

// Number of coefficients whose calculation is to be skipped in the calculation of the combiner
static constexpr std::size_t SKIP_COUNT = NUM_INSTANCES - 1;

/**
 * Write \f$\omega_0, \dots, \omega_k\f$, for a series of prover instances. Each instance is given by
 * \f$\omega_i = (p_{1,i}, \dots, p_{M,i}, \alpha_{1,i}, \dots, \alpha_{N,i}, \theta_{1,i}, \dots, \theta_{6,i})\f$,
 * where \f$p_{j,i}\f$ are the prover polynomials, \f$\alpha_{j,i}\f$ are the batching challenges, and
 * \f$\theta_{j,i}\f$ are the relation parameters.
 *
 * To fold these instances together we need to compute the combiner polynomial \f$G\f$ as defined in the Protogalaxy
 * paper. This polynomial is defined as
 * \f[
 *  G(X) = \sum_{1}^{2^n} pow(\beta^{\ast}) f_i( \sum_{j=0}^k L_j(X) \omega_j )
 * \f]
 * where \f$n\f$ is the dyadic size of the circuit from which the instances are derived. We now compute its
 * degree.
 *
 * If \f$R_1, \dots, R_N\f$ are the polynomials defining all the subrelations that make up the relations listed in
 * Flavor::Relations_, then for a ProverInstance \f$\omega = (p_1, \dots, p_M, \theta_1, \dots, \theta_6, \alpha_1,
 * \dots, \alpha_N)\f$ we have
 * \f[
 *  f_i(\omega) = \sum_{i=1}^{2^n} \alpha_i R_i(p_1, \dots, p_M, \theta_1, \dots, \theta_6)
 * \f]
 *
 * Replacing \f$\omega\f$ with \f$\sum_{j=0}^k L_j(X) \omega_j\f$, we get
 * \f[
 *  f_i(\sum_{j=0}^k L_i(X) \omega_i) = \sum_{i=1}^N
 *          (\sum_{j=0}^k L_j(X) \alpha_{i,j}) * R_i(\sum_{j=0}^k L_j(X) p_{1,j}, \dots, \sum_{j=0}^k L_j(X)
 * \theta_{6,j})
 * \f]
 *
 * The constant Flavor::MAX_TOTAL_RELATION_LENGTH is equal to 1 plus the maximum of the degrees of the \f$R_i\f$'s,
 * where the \f$\theta_i\f$'s are regarded as variables. The polynomials \f$L_j\f$ have degree \f$k\f$. Hence
 * - The maximum degree of a folded subrelation polynomial (with the relation parameters regarded as variables) is
 *   (Flavor::MAX_TOTAL_RELATION_LENGTH - 1) * k
 * - The degree of \f$f_i\f$ is: (Flavor::MAX_TOTAL_RELATION_LENGTH - 1 + k) * k
 *
 * For k = 2 the above formulas become:
 * - EXTENDED_LENGTH = number of evaluations needed to determine a folded subrelation
 *                   = Flavor::MAX_TOTAL_RELATION_LENGTH
 * - BATCHED_EXTENDED_LENGTH = number of evaluations needed to determine the combiner
 *                   = Flavor::MAX_TOTAL_RELATION_LENGTH + 1
 */
template <typename Flavor>
    requires(IsMegaFlavor<Flavor> || IsUltraOrMegaHonk<Flavor>)
static constexpr size_t computed_extended_length()
{
    return Flavor::MAX_TOTAL_RELATION_LENGTH;
}
/**
 * @brief Compute the number of evaluation neeeded to represent the combiner polynomial (\f$G\f$ in the Protogalaxy
 * paper). See the documentation for computed_extended_length() for the calculation.
 *
 * @tparam Flavor
 */
template <typename Flavor>
    requires(IsMegaFlavor<Flavor> || IsUltraOrMegaHonk<Flavor>)
static constexpr size_t computed_batched_extended_length()
{
    return Flavor::MAX_TOTAL_RELATION_LENGTH + 1;
}

} // namespace bb
