// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/relations/relation_types.hpp"
namespace bb {
/**
 * @brief Ultra Permutation Relation
 *
 * @details  The Ultra Permutation Relation is given by the equation
    \f{align}{
        \left( Z_{\text{perm}}(\vec X) + L_{0}(\vec X) \right)  \cdot
        \left[ (w_1(\vec X) + id_1(\vec X) \cdot \beta + \gamma) \cdot (w_2(\vec X) + id_2(\vec X) \cdot \beta + \gamma)
 \cdot (w_3(\vec X) + id_3(\vec X) \cdot \beta + \gamma) \cdot  (w_4(\vec X) + id_4(\vec X) \cdot \beta + \gamma)\right]
 &\
         - \\
        \left(Z_{\text{perm, shifted}}(\vec X) + L_{\text{last}}(\vec X) \cdot \delta_{\text{pub}} \right)  \cdot
        \left[ (w_1(\vec X) + \sigma_1(\vec X) \cdot \beta + \gamma) \cdot (w_2(\vec X) + \sigma_2(\vec X) \cdot \beta +
 \gamma) \cdot (w_3(\vec X) + \sigma_3 (\vec X) \cdot \beta + \gamma) \cdot (w_4 (\vec X) + \sigma_4(\vec X) \cdot \beta
 + \gamma)\right] &\ = 0 \f} and \f{align}{ L_{\text{last}}(\vec X)\cdot Z_{\text{perm, shifted}}(\vec X)   = 0 \f}
 and \f{align}{ L_{0}(\vec X)\cdot Z_{\text{perm}}(\vec X)   = 0 \f}

    Here, \f$ \vec X = (X_0,\ldots, X_{d-1})\f$, and \f$L_{\text{last}}\f$ is "Lagrange last", i.e., the indicator
 function on the boolean hypercube which is 1 at the point whose corresponding index is the last row of the
 circuit where the wire polynomails (`w_l`, `w_r`, `w_o`, and `w_4`) take non-zero values.

    The third sub-relation enforces that \f$Z_{\text{perm}}\f$ is zero at the first row. The grand product
 construction relies on this: the term \f$(Z_{\text{perm}} + L_0)\f$ evaluates to \f$1\f$ at the first row only
 when \f$Z_{\text{perm}}(0) = 0\f$.

 * @tparam FF_
 * @note `z_perm[1] == 1`. if `idx` is the unique index such that `lagrange_last[idx] == 1`, then `z_perm[y] == 0` for
 all `y>idx` (up to the size of the Boolean hypercube).
 * @note This is the only relation in Ultra that requires `lagrange_last`.
 */
template <typename FF_> class UltraPermutationRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 3> SUBRELATION_PARTIAL_LENGTHS{
        6, // grand product construction sub-relation
        3, // left-shiftable polynomial sub-relation
        3  // z_perm initialization sub-relation
    };

    /**
     * @brief Returns true if the contribution from all subrelations for the provided inputs is identically zero
     *
     */
    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        // If z_perm == z_perm_shift, this implies that none of the wire values for the present input are involved in
        // non-trivial copy constraints.
        return (in.z_perm - in.z_perm_shift).is_zero();
    }

    inline static auto& get_grand_product_polynomial(auto& in) { return in.z_perm; }
    inline static auto& get_shifted_grand_product_polynomial(auto& in) { return in.z_perm_shift; }

    template <typename Accumulator, typename AllEntities, typename Parameters>
    inline static Accumulator compute_grand_product_numerator(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;
        using ParameterView = Parameters::DataType;

        auto w_1 = View(in.w_l);
        auto w_2 = View(in.w_r);
        auto w_3 = View(in.w_o);
        auto w_4 = View(in.w_4);
        auto id_1 = View(in.id_1);
        auto id_2 = View(in.id_2);
        auto id_3 = View(in.id_3);
        auto id_4 = View(in.id_4);

        const auto& beta = ParameterView(params.beta);
        const auto& gamma = ParameterView(params.gamma);

        // witness degree 4
        return (w_1 + id_1 * beta + gamma) * (w_2 + id_2 * beta + gamma) * (w_3 + id_3 * beta + gamma) *
               (w_4 + id_4 * beta + gamma);
    }

    template <typename Accumulator, typename AllEntities, typename Parameters>
    inline static Accumulator compute_grand_product_denominator(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;
        using ParameterView = Parameters::DataType;

        auto w_1 = View(in.w_l);
        auto w_2 = View(in.w_r);
        auto w_3 = View(in.w_o);
        auto w_4 = View(in.w_4);

        auto sigma_1 = View(in.sigma_1);
        auto sigma_2 = View(in.sigma_2);
        auto sigma_3 = View(in.sigma_3);
        auto sigma_4 = View(in.sigma_4);

        const auto& beta = ParameterView(params.beta);
        const auto& gamma = ParameterView(params.gamma);

        // witness degree 4
        return (w_1 + sigma_1 * beta + gamma) * (w_2 + sigma_2 * beta + gamma) * (w_3 + sigma_3 * beta + gamma) *
               (w_4 + sigma_4 * beta + gamma);
    }

    /**
     * @brief Compute contribution of the permutation relation for a given edge (internal function)
     *
     * @details This relation confirms faithful calculation of the grand
     * product polynomial \f$ Z_{\text{perm}}\f$.
     * In Sumcheck Prover Round, this method adds to accumulators evaluations of subrelations at the point
     \f$(u_0,\ldots, u_{i-1}, k, \vec\ell)\f$ for \f$ k=0,\ldots, D\f$, where \f$ \vec \ell\f$ is a point  on the
     Boolean hypercube \f$\{0,1\}^{d-1-i}\f$ and \f$ D \f$ is specified by the calling class. It does so by taking as
     input an array of Prover Polynomials partially evaluated at the points \f$(u_0,\ldots, u_{i-1}, k, \vec\ell)\f$ and
     computing point-wise evaluations of the sub-relations.
     *
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    inline static void accumulate(ContainerOverSubrelations& accumulators,
                                  const AllEntities& in,
                                  const Parameters& params,
                                  const FF& scaling_factor)
    {
        // Contribution (1)
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;
        using ParameterView = Parameters::DataType;
        using ParameterCoefficientAccumulator = typename ParameterView::CoefficientAccumulator;

        const CoefficientAccumulator w_1_m(in.w_l);
        const CoefficientAccumulator w_2_m(in.w_r);
        const CoefficientAccumulator w_3_m(in.w_o);
        const CoefficientAccumulator w_4_m(in.w_4);
        const CoefficientAccumulator id_1_m(in.id_1);
        const CoefficientAccumulator id_2_m(in.id_2);
        const CoefficientAccumulator id_3_m(in.id_3);
        const CoefficientAccumulator id_4_m(in.id_4);
        const CoefficientAccumulator sigma_1_m(in.sigma_1);
        const CoefficientAccumulator sigma_2_m(in.sigma_2);
        const CoefficientAccumulator sigma_3_m(in.sigma_3);
        const CoefficientAccumulator sigma_4_m(in.sigma_4);

        const ParameterCoefficientAccumulator gamma_m(params.gamma);
        const ParameterCoefficientAccumulator beta_m(params.beta);

        const auto w_1_plus_gamma = w_1_m + gamma_m;
        const auto w_2_plus_gamma = w_2_m + gamma_m;
        const auto w_3_plus_gamma = w_3_m + gamma_m;
        const auto w_4_plus_gamma = w_4_m + gamma_m;

        auto t1 = (id_1_m * beta_m);
        t1 += w_1_plus_gamma;
        t1 *= scaling_factor;
        auto t2 = id_2_m * beta_m;
        t2 += w_2_plus_gamma;
        auto t3 = id_3_m * beta_m;
        t3 += w_3_plus_gamma;
        auto t4 = id_4_m * beta_m;
        t4 += w_4_plus_gamma;

        auto t5 = sigma_1_m * beta_m;
        t5 += w_1_plus_gamma;
        t5 *= scaling_factor;
        auto t6 = sigma_2_m * beta_m;
        t6 += w_2_plus_gamma;
        auto t7 = sigma_3_m * beta_m;
        t7 += w_3_plus_gamma;
        auto t8 = sigma_4_m * beta_m;
        t8 += w_4_plus_gamma;

        // numerator/denominator are products of four degree-1 factors (degree 4).
        Accumulator numerator;
        Accumulator denominator;
        if constexpr (std::is_same_v<Accumulator, FF>) {
            // Verifier path: the relation is evaluated at a single point, so everything is scalar.
            numerator = (t1 * t2) * (t3 * t4);
            denominator = (t5 * t6) * (t7 * t8);
        } else {
            // Prover path: in the evaluation (Lagrange) basis a degree-d product needs only d+1 points, and a
            // pointwise multiply at d+1 points is the minimum number of field muls. Build each product via a
            // balanced subproduct tree, doing the degree-1 x degree-1 sub-products at the minimal length (3)
            // before extending to the accumulator length, instead of carrying every multiply out at the full
            // length: 3 + 3 + 6 muls per product versus 3 * 6 for the left-deep full-length chain.
            auto n_12 = Univariate<FF, 3>(t1) * Univariate<FF, 3>(t2); // deg 2
            auto n_34 = Univariate<FF, 3>(t3) * Univariate<FF, 3>(t4); // deg 2
            numerator = n_12.template extend_to<6>() * n_34.template extend_to<6>();

            auto d_56 = Univariate<FF, 3>(t5) * Univariate<FF, 3>(t6); // deg 2
            auto d_78 = Univariate<FF, 3>(t7) * Univariate<FF, 3>(t8); // deg 2
            denominator = d_56.template extend_to<6>() * d_78.template extend_to<6>();
        }

        const ParameterCoefficientAccumulator public_input_delta_m(params.public_input_delta);
        const auto z_perm_m = CoefficientAccumulator(in.z_perm);
        const auto z_perm_shift_m = CoefficientAccumulator(in.z_perm_shift);
        const auto lagrange_first_m = CoefficientAccumulator(in.lagrange_first);
        const auto lagrange_last_m = CoefficientAccumulator(in.lagrange_last);

        auto public_input_term_m = lagrange_last_m * public_input_delta_m;
        public_input_term_m += z_perm_shift_m;
        const Accumulator public_input_term(public_input_term_m);
        // witness degree: deg 5 - deg 5 = deg 5
        std::get<0>(accumulators) +=
            ((Accumulator(z_perm_m + lagrange_first_m) * numerator) - (public_input_term * denominator));

        // Contribution (2): lagrange_last is nonzero only on the final row, so on the prover this contribution is
        // identically zero on every edge that does not touch it; skip the per-edge product there. The verifier
        // evaluates a single point (the recursive verifier does so in-circuit, where branching on witness values
        // is not permitted), so it must always compute.
        using ShortAccumulator = std::tuple_element_t<1, ContainerOverSubrelations>;
        if constexpr (std::is_same_v<Accumulator, FF>) {
            std::get<1>(accumulators) += ShortAccumulator((lagrange_last_m * z_perm_shift_m) * scaling_factor);
        } else if (!in.lagrange_last.is_zero()) {
            std::get<1>(accumulators) += ShortAccumulator((lagrange_last_m * z_perm_shift_m) * scaling_factor);
        }

        // Contribution (3): Enforce z_perm starts at 0. The grand product initialization relies on
        // z_perm[0] = 0 so that (z_perm + L_first) evaluates to 1 at the first row.
        // Without this constraint, a cheating prover could set z_perm[0] to a non-zero value.
        // lagrange_first is nonzero only on the first row; the prover skips it elsewhere, the verifier always computes.
        using InitAccumulator = std::tuple_element_t<2, ContainerOverSubrelations>;
        if constexpr (std::is_same_v<Accumulator, FF>) {
            std::get<2>(accumulators) += InitAccumulator((lagrange_first_m * z_perm_m) * scaling_factor);
        } else if (!in.lagrange_first.is_zero()) {
            std::get<2>(accumulators) += InitAccumulator((lagrange_first_m * z_perm_m) * scaling_factor);
        }
    };
};

template <typename FF> using UltraPermutationRelation = Relation<UltraPermutationRelationImpl<FF>>;

} // namespace bb
