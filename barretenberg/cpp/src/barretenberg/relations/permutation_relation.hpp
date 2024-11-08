#pragma once
#include "barretenberg/relations/relation_types.hpp"
#include <atomic>
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
        \left(Z_{\text{perm, shifted}}(\vec X) + L_{2^d-1}(\vec X) \cdot \delta_{\text{pub}} \right)  \cdot
        \left[ (w_1(\vec X) + \sigma_1(\vec X) \cdot \beta + \gamma) \cdot (w_2(\vec X) + \sigma_2(\vec X) \cdot \beta +
 \gamma) \cdot (w_3(\vec X) + \sigma_3 (\vec X) \cdot \beta + \gamma) \cdot (w_4 (\vec X) + \sigma_4(\vec X) \cdot \beta
 + \gamma)\right] &\ = 0 \f} and \f{align}{ L_{2^d-1}(\vec X)\cdot Z_{\text{perm, shifted}}(\vec X)   = 0 \f}

    Here, \f$ \vec X = (X_0,\ldots, X_{d-1})\f$, where \f$ d \f$ is the log of the circuit size.


 * @tparam FF_
 */
template <typename FF_> class UltraPermutationRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        6, // grand product construction sub-relation
        3  // left-shiftable polynomial sub-relation
    };

    static constexpr std::array<size_t, 2> TOTAL_LENGTH_ADJUSTMENTS{
        5, // grand product construction sub-relation
        0  // left-shiftable polynomial sub-relation
    };

    /**
     * @brief For ZK-Flavors: The degrees of subrelations considered as polynomials only in witness polynomials,
     * i.e. all selectors and public polynomials are treated as constants.
     *
     */
    static constexpr std::array<size_t, 2> SUBRELATION_WITNESS_DEGREES{
        5, // grand product construction sub-relation
        1  // left-shiftable polynomial sub-relation
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
    // 0x000000000000000000000000000000000000000000000000c000000000000000
    // 0x30644e72e131a029b85045b68181571da92cbfcf419ffeb1d9192544cc247a81
    // 0x30644e72e131a029b85045b68181571da92cbfcf419ffeb1d9192544cc247a8d
    template <typename Accumulator, typename AllEntities, typename Parameters>
    inline static Accumulator compute_grand_product_numerator(const AllEntities& in, const Parameters& params)
    {
        // static std::mutex g_pages_mutex;
        using View = typename Accumulator::View;
        using MonomialAccumulator = typename Accumulator::MonomialAccumulator;
        using ParameterView = GetParameterView<Parameters, View>;

        //  std::lock_guard<std::mutex> guard(g_pages_mutex);
        //  if constexpr (std::same_as<decltype(r), bool>) {
        //      if (!r) {
        //          std::cout << result << " vs " << expected << std::endl;
        //      }
        //      ASSERT(r);
        //  } else {
        //      ASSERT(r.get_value());
        //  }
        //      std::cout << "baz " << baz << std::endl;

        using ParameterMonomialAccumulator = typename ParameterView::MonomialAccumulator;
        MonomialAccumulator w_1_m(in.w_l);
        MonomialAccumulator w_2_m(in.w_r);
        MonomialAccumulator w_3_m(in.w_o);
        MonomialAccumulator w_4_m(in.w_4);
        MonomialAccumulator id_1_m(in.id_1);
        MonomialAccumulator id_2_m(in.id_2);
        MonomialAccumulator id_3_m(in.id_3);
        MonomialAccumulator id_4_m(in.id_4);

        ParameterMonomialAccumulator gamma_m(params.gamma);
        ParameterMonomialAccumulator beta_m(params.beta);

        auto t0_m = (id_1_m * beta_m);
        t0_m += (w_1_m + gamma_m);
        auto t1_m = (id_2_m * beta_m);
        t1_m += (w_2_m + gamma_m);
        auto t2_m = (id_3_m * beta_m);
        t2_m += (w_3_m + gamma_m);
        auto t3_m = (id_4_m * beta_m);
        t3_m += (w_4_m + gamma_m);

        Accumulator t0(t0_m);
        Accumulator t1(t1_m);
        Accumulator t2(t2_m);
        Accumulator t3(t3_m);

        return t0 * t1 * t2 * t3;
        // (1 - X)a0 +
        // auto expected_2_a = (w_1 + id_1 * beta + gamma) * (w_2 + id_2 * beta + gamma) * (w_3 + id_3 * beta + gamma) *
        //                     (w_4 + id_4 * beta + gamma);
        // View expected_2(expected_2_a);
        // // witness degree 4; full degree 8
        // auto result_2_a = t0 * t1 * t2 * t3;
        // View result_2(result_2_a);
        // std::lock_guard<std::mutex> guard(g_pages_mutex);
        // auto r = result_2 == expected_2;
        // if constexpr (std::same_as<decltype(r), bool>) {
        //     if (!r) {
        //         if constexpr (!std::same_as<decltype(w_1), FF>) {
        //             std::cout << "diff = " << in.w_l.evaluations[1] - in.w_l.evaluations[0] << std::endl;
        //         }
        //         // auto foo = (id_1_m * beta_m);
        //         Accumulator id1a(id_1_m);
        //         auto foo = id_1_m.test(beta_m);
        //         std::cout << "beta_m = " << beta_m << std::endl;
        //         std::cout << "id1_m in monomial form " << id_1_m << std::endl;
        //         std::cout << "mul result in monomial form " << foo << std::endl;
        //         Accumulator bar(foo);
        //         std::cout << "mul result in acc form " << bar << std::endl;
        //         std::cout << "versus " << (id_1 * beta) << std::endl;
        //         std::cout << "id_1 m" << id1a << std::endl;
        //         std::cout << "versus " << id_1 << std::endl;
        //         // std::cout << "mul result " << baz << std::endl;
        //         // std::cout << "versus " << (id_1 * beta) << std::endl;
        //         // std::cout << "alternate mform = " << bar << std::endl;
        //         // (1 - X)beta + Xbeta
        //         // 0 = beta
        //         // 1 = beta
        //         // beta + (beta - beta)X
        //         //
        //         // std::cout << "term result " << t0 << std::endl;
        //         // std::cout << "vs " << (w_1 + id_1 * beta + gamma) << std::endl;
        //         // std::cout << "w_1 =   " << in.w_l << std::endl;
        //         // std::cout << "w_1_m =   " << w_1_m << std::endl;
        //         // std::cout << "params gamma   " << params.gamma << std::endl;
        //         // std::cout << "params gamma_m " << gamma_m << std::endl;
        //         // std::cout << result_2 << " vs " << expected_2 << std::endl;
        //     }
        //     ASSERT(r);
        // } else {
        //     ASSERT(r.get_value());
        // }

        // return result_2_a;
    }

    template <typename Accumulator, typename AllEntities, typename Parameters>
    inline static Accumulator compute_grand_product_denominator(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;
        using MonomialAccumulator = typename Accumulator::MonomialAccumulator;
        using ParameterView = GetParameterView<Parameters, View>;
        using ParameterMonomialAccumulator = typename ParameterView::MonomialAccumulator;
        MonomialAccumulator w_1_m(in.w_l);
        MonomialAccumulator w_2_m(in.w_r);
        MonomialAccumulator w_3_m(in.w_o);
        MonomialAccumulator w_4_m(in.w_4);
        MonomialAccumulator sigma_1_m(in.sigma_1);
        MonomialAccumulator sigma_2_m(in.sigma_2);
        MonomialAccumulator sigma_3_m(in.sigma_3);
        MonomialAccumulator sigma_4_m(in.sigma_4);

        ParameterMonomialAccumulator gamma_m(params.gamma);
        ParameterMonomialAccumulator beta_m(params.beta);

        auto t0_m = (sigma_1_m * beta_m);
        t0_m += (w_1_m + gamma_m);
        auto t1_m = (sigma_2_m * beta_m);
        t1_m += (w_2_m + gamma_m);
        auto t2_m = (sigma_3_m * beta_m);
        t2_m += (w_3_m + gamma_m);
        auto t3_m = (sigma_4_m * beta_m);
        t3_m += (w_4_m + gamma_m);

        Accumulator t0(t0_m);
        Accumulator t1(t1_m);
        Accumulator t2(t2_m);
        Accumulator t3(t3_m);

        return t0 * t1 * t2 * t3;
        // using View = typename Accumulator::View;
        // using ParameterView = GetParameterView<Parameters, View>;
        // // TODO. to use UnivariateMonomial... we want something that does not require us to propagate the type across
        // // ContainerOverSubrelations

        // auto w_1 = View(in.w_l);
        // auto w_2 = View(in.w_r);
        // auto w_3 = View(in.w_o);
        // auto w_4 = View(in.w_4);

        // auto sigma_1 = View(in.sigma_1);
        // auto sigma_2 = View(in.sigma_2);
        // auto sigma_3 = View(in.sigma_3);
        // auto sigma_4 = View(in.sigma_4);

        // const auto& beta = ParameterView(params.beta);
        // const auto& gamma = ParameterView(params.gamma);

        // // witness degree 4; full degree 8
        // return (w_1 + sigma_1 * beta + gamma) * (w_2 + sigma_2 * beta + gamma) * (w_3 + sigma_3 * beta + gamma) *
        //        (w_4 + sigma_4 * beta + gamma);
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
     computing point-wise evaluations of the sub-relations. \todo Protogalaxy Accumulation
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
        PROFILE_THIS_NAME("Permutation::accumulate");
        // Contribution (1)
        [&]() {
            using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
            using View = typename Accumulator::View;
            using MonomialAccumulator = typename Accumulator::MonomialAccumulator;
            using ParameterView = GetParameterView<Parameters, View>;
            using ParameterMonomialAccumulator = typename ParameterView::MonomialAccumulator;

            const MonomialAccumulator w_1_m(in.w_l);
            const MonomialAccumulator w_2_m(in.w_r);
            const MonomialAccumulator w_3_m(in.w_o);
            const MonomialAccumulator w_4_m(in.w_4);
            const MonomialAccumulator id_1_m(in.id_1);
            const MonomialAccumulator id_2_m(in.id_2);
            const MonomialAccumulator id_3_m(in.id_3);
            const MonomialAccumulator id_4_m(in.id_4);
            const MonomialAccumulator sigma_1_m(in.sigma_1);
            const MonomialAccumulator sigma_2_m(in.sigma_2);
            const MonomialAccumulator sigma_3_m(in.sigma_3);
            const MonomialAccumulator sigma_4_m(in.sigma_4);

            const ParameterMonomialAccumulator gamma_m(params.gamma);
            const ParameterMonomialAccumulator beta_m(params.beta);

            const auto w_1_plus_gamma = w_1_m + gamma_m;
            const auto w_2_plus_gamma = w_2_m + gamma_m;
            const auto w_3_plus_gamma = w_3_m + gamma_m;
            const auto w_4_plus_gamma = w_4_m + gamma_m;

            // improvements... when multiplying, `(a0 + a1) * (b0 + b1)` can be done without additions
            // because a0 + a1 is equivalent to `evaluations[1]` of an Accumlulator or View object
            // would save 32 additions

            // 24 adds
            // karatsuba = 2 * 8 = 16 adds
            // converting 14 entities into monomial accs = 14 adds
            // 54 adds
            // equiv of 5 degree-11 adds
            // previously we had 16 degree-11 adds

            // we convert 8 acumulators
            // each accumulator conversion requires degree * 2 adds which is 22 adds
            // equivalent to 16 degree-11 adds

            // so in terms of additions we're down by 5 degree-11 adds
            // previously we had 8 degree-11 muls
            // new version we have 8 karatsuba muls which is 3 * 8 = 24 muls
            // 8 * 11 = 88 (actually 80). diff = 56 muls

            // however we no longer need to construct accumulators out of sigmas and ids. 8 polynomials = 8 degree-11
            // adds however we do these automatically atm? in theory we could remove about 80 additions-
            auto t1 = id_1_m * beta_m;
            auto t2 = id_2_m * beta_m;
            auto t3 = id_3_m * beta_m;
            auto t4 = id_4_m * beta_m;

            auto t5 = sigma_1_m * beta_m;
            auto t6 = sigma_2_m * beta_m;
            auto t7 = sigma_3_m * beta_m;
            auto t8 = sigma_4_m * beta_m;

            const Accumulator numerator_1((t1) + w_1_plus_gamma);
            const Accumulator numerator_2((t2) + w_2_plus_gamma);
            const Accumulator numerator_3((t3) + w_3_plus_gamma);
            const Accumulator numerator_4((t4) + w_4_plus_gamma);

            const Accumulator denominator_1((t5) + w_1_plus_gamma);
            const Accumulator denominator_2((t6) + w_2_plus_gamma);
            const Accumulator denominator_3((t7) + w_3_plus_gamma);
            const Accumulator denominator_4((t8) + w_4_plus_gamma);

            const auto numerator = numerator_1 * numerator_2 * numerator_3 * numerator_4;
            const auto denominator = denominator_1 * denominator_2 * denominator_3 * denominator_4;

            const ParameterMonomialAccumulator public_input_delta_m(params.public_input_delta);
            const auto z_perm = View(in.z_perm);
            const MonomialAccumulator z_perm_shift_m(in.z_perm_shift);
            const auto lagrange_first = View(in.lagrange_first);
            const MonomialAccumulator lagrange_last_m(in.lagrange_last);

            auto public_input_term_m = lagrange_last_m * public_input_delta_m;
            public_input_term_m += z_perm_shift_m;
            const Accumulator public_input_term(public_input_term_m);
            // witness degree: deg 5 - deg 5 = deg 5
            // total degree: deg 9 - deg 10 = deg 10
            std::get<0>(accumulators) +=
                (((z_perm + lagrange_first) * numerator) - (public_input_term * denominator)) * scaling_factor;
        }();

        // Contribution (2)
        [&]() {
            using Accumulator = std::tuple_element_t<1, ContainerOverSubrelations>;
            using View = typename Accumulator::View;
            auto z_perm_shift = View(in.z_perm_shift);
            auto lagrange_last = View(in.lagrange_last);

            std::get<1>(accumulators) += (lagrange_last * z_perm_shift) * scaling_factor;
        }();
    };
};

template <typename FF> using UltraPermutationRelation = Relation<UltraPermutationRelationImpl<FF>>;

} // namespace bb