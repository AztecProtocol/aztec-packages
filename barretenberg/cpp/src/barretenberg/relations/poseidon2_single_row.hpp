#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "relation_types.hpp"

// s0 s1 s2 s3
// s0' = s0^5 + s0.c0 + s0 + s1 + s2 + s3
// s1' = s0^5 + s1.c1 + s0 + s1 + s2 + s3
// s2' = s0^5 + s2.c2 + s0 + s1 + s2 + s3
// s3' = s0^5 + s3.c3 + s0 + s1 + s2 + s3

// s0'' = s0'^5 + s0'.c0 + s0' + s1' + s2' + s3' = s0'^5 + c0.s0' + 4*(s0^5 +s0 + s1 + s2 + s3) + s0.c0 + s1.c1 + s2.c2 + s3.c3
// s1'' = s0'^5 + s1'.c1 + s0' + s1' + s2' + s3' = s0'^5 + c1.(s0^5 + s1.c1 + s0 + s1 + s2 + s3) + 4*(s0^5 +s0 + s1 + s2 + s3) + s0.c0 + s1.c1 + s2.c2 + s3.c3
// s2'' = s0'^5 + s2'.c2 + s0' + s1' + s2' + s3' = s0'^5 + c2.(s0^5 + s2.c2 + s0 + s1 + s2 + s3) + 4*(s0^5 +s0 + s1 + s2 + s3) + s0.c0 + s1.c1 + s2.c2 + s3.c3
// s3'' = s0'^5 + s3'.c3 + s0' + s1' + s2' + s3' = s0'^5 + c3.(s0^5 + s3.c3 + s0 + s1 + s2 + s3) + 4*(s0^5 +s0 + s1 + s2 + s3) + s0.c0 + s1.c1 + s2.c2 + s3.c3

// s0''' = s0''^5 + s0''.c0 + s1'' + s2'' + s3''
// s1''' = s0''^5 + s0''.c0 + s1'' + s2'' + s3''
// s2''' = s0''^5 + s0''.c0 + s1'' + s2'' + s3''
// s3''' = s0''^5 + s0''.c0 + s1'' + s2'' + s3''
namespace bb {

/**
 * @brief Evaluates the ENTIRE Poseidon2 permutation in a single row.
 *
 * @details Uses 88 witness columns:
 *   - External rounds (8 total): 4 columns each for x^5 S-box outputs = 32
 *   - Internal rounds (56 total): 1 column each for x^5 S-box output (element 0) = 56
 *   Total: 88 poseidon2_state columns.
 *
 * Column layout (all columns store x^5 S-box output, BEFORE matrix multiply):
 *   poseidon2_state[0..3]:   x^5 outputs for external round 0
 *   poseidon2_state[4..7]:   x^5 outputs for external round 1
 *   poseidon2_state[8..11]:  x^5 outputs for external round 2
 *   poseidon2_state[12..15]: x^5 outputs for external round 3
 *   poseidon2_state[16]:     x^5 output for internal round 4 (element 0 only)
 *   ...
 *   poseidon2_state[71]:     x^5 output for internal round 59
 *   poseidon2_state[72..75]: x^5 outputs for external round 60
 *   ...
 *   poseidon2_state[84..87]: x^5 outputs for external round 63
 *
 * CoefficientAccumulator optimization: state variables s0..s3 are kept in monomial basis
 * (CoefficientAccumulator, length 2) throughout. The matrix multiplies (M_E, M_I) are
 * computed on degree-1 column values in CoefficientAccumulator. Conversion to evaluation
 * basis (Accumulator, length 6) only happens for the x^5 S-box constraint.
 *
 * All 88 subrelations have uniform partial length 6 (degree 5 constraint * degree 1 selector).
 */
template <typename FF_> class Poseidon2SingleRowRelationImpl {
  public:
    using FF = FF_;
    using Params = crypto::Poseidon2Bn254ScalarFieldParams;
    using Perm = crypto::Poseidon2Permutation<Params>;

    static constexpr size_t T = 4;
    static constexpr size_t ROUNDS_F_HALF = 4;
    static constexpr size_t ROUNDS_P = 56;
    static constexpr size_t NUM_ROUNDS = 64;

    static constexpr size_t NUM_WITNESS = 88;

    // 4 subrelations per external round (8 rounds) + 1 per internal round (56 rounds)
    static constexpr size_t NUM_SUBRELATIONS = ROUNDS_F_HALF * 2 * T + ROUNDS_P; // 32 + 56 = 88

    static constexpr auto SUBRELATION_PARTIAL_LENGTHS = [] {
        std::array<size_t, NUM_SUBRELATIONS> result{};
        for (auto& x : result) {
            x = 6;
        }
        return result;
    }();

    static constexpr auto D_MINUS_1 = Params::internal_matrix_diagonal_minus_one;

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.q_poseidon2_single_row.is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           const Parameters&,
                           const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        const auto q_poseidon2_m = CoefficientAccumulator(in.q_poseidon2_single_row);

        // ====== Initial M_E (CoefficientAccumulator, all degree-1 ops) ======
        // State variables kept in CoefficientAccumulator (monomial basis, length 2) throughout.
        auto inp0 = CoefficientAccumulator(in.w_l);
        auto inp1 = CoefficientAccumulator(in.w_r);
        auto inp2 = CoefficientAccumulator(in.w_o);
        auto inp3 = CoefficientAccumulator(in.w_4);

        auto t0 = inp0 + inp1;
        auto t1 = inp2 + inp3;
        auto t2 = inp1 + inp1;
        t2 += t1;
        auto t3 = inp3 + inp3;
        t3 += t0;
        auto s3 = t1 + t1; // me4
        s3 += s3;
        s3 += t3;
        auto s1 = t0 + t0; // me2
        s1 += s1;
        s1 += t2;
        auto s0 = t3 + s1; // me1
        auto s2 = t2 + s3; // me3

        // ====== External round helper ======
        // Columns store x^5 S-box outputs (BEFORE M_E). M_E is computed algebraically
        // on degree-1 CoefficientAccumulator column values.
        auto process_external_round = [&]<size_t R, size_t BASE>() {
            // S-box inputs (CoefficientAccumulator, degree 1)
            auto si0 = s0 + q_poseidon2_m * FF(Params::round_constants[R][0]);
            auto si1 = s1 + q_poseidon2_m * FF(Params::round_constants[R][1]);
            auto si2 = s2 + q_poseidon2_m * FF(Params::round_constants[R][2]);
            auto si3 = s3 + q_poseidon2_m * FF(Params::round_constants[R][3]);

            // si^2 in CoefficientAccumulator (cheap length-2 → length-3)
            auto si0_sqr = si0.sqr();
            auto si1_sqr = si1.sqr();
            auto si2_sqr = si2.sqr();
            auto si3_sqr = si3.sqr();

            // Read column values (x^5 outputs, CoefficientAccumulator, degree 1)
            auto u0 = CoefficientAccumulator(in.poseidon2_state[BASE]);
            auto u1 = CoefficientAccumulator(in.poseidon2_state[BASE + 1]);
            auto u2 = CoefficientAccumulator(in.poseidon2_state[BASE + 2]);
            auto u3 = CoefficientAccumulator(in.poseidon2_state[BASE + 3]);

            // Constrain: scaling_factor * (u_i - si_i^5) = 0
            // Split: u_i * sf (CA degree 1) - si_i^4 * (si_i * sf) (Acc degree 5)
            // scaling_factor folded into one si factor and u via CA × FF (cheap, no extra Acc muls)
            std::get<BASE>(evals) +=
                Accumulator(u0 * scaling_factor) - Accumulator(si0_sqr).sqr() * Accumulator(si0 * scaling_factor);
            std::get<BASE + 1>(evals) +=
                Accumulator(u1 * scaling_factor) - Accumulator(si1_sqr).sqr() * Accumulator(si1 * scaling_factor);
            std::get<BASE + 2>(evals) +=
                Accumulator(u2 * scaling_factor) - Accumulator(si2_sqr).sqr() * Accumulator(si2 * scaling_factor);
            std::get<BASE + 3>(evals) +=
                Accumulator(u3 * scaling_factor) - Accumulator(si3_sqr).sqr() * Accumulator(si3 * scaling_factor);

            // M_E on degree-1 column values (CoefficientAccumulator, all length-2 ops)
            auto a0 = u0 + u1;
            auto a1 = u2 + u3;
            auto a2 = u1 + u1;
            a2 += a1;
            auto a3 = u3 + u3;
            a3 += a0;
            auto v4 = a1 + a1;
            v4 += v4;
            v4 += a3;
            auto v2 = a0 + a0;
            v2 += v2;
            v2 += a2;

            s0 = a3 + v2; // v1
            s1 = v2;
            s2 = a2 + v4; // v3
            s3 = v4;
        };

        // ====== Internal round helper ======
        // Column stores x^5 S-box output (element 0 only, BEFORE M_I).
        auto process_internal_round = [&]<size_t R, size_t BASE>() {
            // S-box input (CoefficientAccumulator, degree 1)
            auto si = s0 + q_poseidon2_m * FF(Params::round_constants[R][0]);

            // si^2 in CoefficientAccumulator
            auto si_sqr = si.sqr();

            // Read column value (CoefficientAccumulator, degree 1)
            auto u0 = CoefficientAccumulator(in.poseidon2_state[BASE]);

            // Constrain: scaling_factor * (u0 - si^5) = 0
            std::get<BASE>(evals) +=
                Accumulator(u0 * scaling_factor) - Accumulator(si_sqr).sqr() * Accumulator(si * scaling_factor);

            // M_I: v[j] = D_MINUS_1[j] * x[j] + sum(x), all CoefficientAccumulator
            auto sum_val = u0 + s1 + s2 + s3;

            s0 = u0 * FF(D_MINUS_1[0]) + sum_val;
            s1 = s1 * FF(D_MINUS_1[1]) + sum_val;
            s2 = s2 * FF(D_MINUS_1[2]) + sum_val;
            s3 = s3 * FF(D_MINUS_1[3]) + sum_val;
        };

        // ====== Unroll first 4 external rounds (rounds 0-3) ======
        process_external_round.template operator()<0, 0>();
        process_external_round.template operator()<1, 4>();
        process_external_round.template operator()<2, 8>();
        process_external_round.template operator()<3, 12>();

        // ====== Unroll 56 internal rounds (rounds 4-59) ======
        [&]<size_t... Is>(std::index_sequence<Is...>) {
            (process_internal_round.template operator()<Is + ROUNDS_F_HALF, Is + ROUNDS_F_HALF * T>(), ...);
        }(std::make_index_sequence<ROUNDS_P>{});

        // ====== Unroll last 4 external rounds (rounds 60-63) ======
        process_external_round.template operator()<60, 72>();
        process_external_round.template operator()<61, 76>();
        process_external_round.template operator()<62, 80>();
        process_external_round.template operator()<63, 84>();
    };
};

template <typename FF> using Poseidon2SingleRowRelation = Relation<Poseidon2SingleRowRelationImpl<FF>>;
} // namespace bb
