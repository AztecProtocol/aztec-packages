#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "relation_types.hpp"

namespace bb {

/**
 * @brief Evaluates the ENTIRE Poseidon2 permutation in a single row.
 *
 * @details Uses compile-time indexing (std::get) for all subrelation accumulation,
 * enabling use with both the Sumcheck prover (Univariate containers) and value-based
 * verification (std::array<FF> containers).
 *
 * Witness columns (352 total):
 *   - poseidon2_input[4]: permutation input state
 *   - poseidon2_state[260]: intermediate states (65 stages x 4 elements)
 *   - poseidon2_sq[88]: S-box x^2 intermediates
 *
 * All 348 subrelations use uniform partial length 5 (max degree 4) for a single
 * Accumulator type, simplifying compile-time indexing.
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

    // Inputs come from w_l, w_r, w_o, w_4 (not separate columns)
    static constexpr size_t NUM_STATES = 65 * 4; // 260
    static constexpr size_t NUM_SQ = 8 * 4 + 56; // 88
    static constexpr size_t NUM_WITNESS = NUM_STATES + NUM_SQ; // 348

    static constexpr size_t NUM_SUBRELATIONS = 4 + 8 * 8 + 56 * 5; // 348

    // Uniform partial length 5 for all subrelations (max degree 4).
    // This simplifies the implementation: a single Accumulator type for all subrelations.
    static constexpr auto SUBRELATION_PARTIAL_LENGTHS = [] {
        std::array<size_t, NUM_SUBRELATIONS> result{};
        for (auto& x : result) {
            x = 5;
        }
        return result;
    }();

    static constexpr auto D_MINUS_1 = Params::internal_matrix_diagonal_minus_one;

    static constexpr size_t state_idx(size_t stage, size_t elem) { return stage * 4 + elem; }

    static constexpr size_t sq_idx(size_t round, size_t elem = 0)
    {
        if (round < ROUNDS_F_HALF) {
            return round * 4 + elem;
        }
        if (round < ROUNDS_F_HALF + ROUNDS_P) {
            return 16 + (round - ROUNDS_F_HALF);
        }
        return 72 + (round - ROUNDS_F_HALF - ROUNDS_P) * 4 + elem;
    }

    // Subrelation base index for round R
    static constexpr size_t subrel_base(size_t round)
    {
        if (round < ROUNDS_F_HALF) {
            return 4 + round * 8;
        }
        if (round < ROUNDS_F_HALF + ROUNDS_P) {
            return 4 + ROUNDS_F_HALF * 8 + (round - ROUNDS_F_HALF) * 5;
        }
        return 4 + ROUNDS_F_HALF * 8 + ROUNDS_P * 5 + (round - ROUNDS_F_HALF - ROUNDS_P) * 8;
    }

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

        const auto q_m = CoefficientAccumulator(in.q_poseidon2_single_row);
        const auto q_scaled = Accumulator(q_m * scaling_factor);

        // ====== Initial M_E (subrelations 0-3) ======
        // state[stage=0] = M_E(w_l, w_r, w_o, w_4)
        {
            auto inp_0 = CoefficientAccumulator(in.w_l);
            auto inp_1 = CoefficientAccumulator(in.w_r);
            auto inp_2 = CoefficientAccumulator(in.w_o);
            auto inp_3 = CoefficientAccumulator(in.w_4);
            // M_E multiply (factored form)
            auto t0 = inp_0 + inp_1;
            auto t1 = inp_2 + inp_3;
            auto t2 = inp_1 + inp_1;
            t2 += t1;
            auto t3 = inp_3 + inp_3;
            t3 += t0;
            auto me4 = t1 + t1;
            me4 += me4;
            me4 += t3;
            auto me2 = t0 + t0;
            me2 += me2;
            me2 += t2;
            auto me1 = t3 + me2;
            auto me3 = t2 + me4;

            auto s0 = CoefficientAccumulator(in.poseidon2_state[state_idx(0, 0)]);
            auto s1 = CoefficientAccumulator(in.poseidon2_state[state_idx(0, 1)]);
            auto s2 = CoefficientAccumulator(in.poseidon2_state[state_idx(0, 2)]);
            auto s3 = CoefficientAccumulator(in.poseidon2_state[state_idx(0, 3)]);

            std::get<0>(evals) += q_scaled * Accumulator(s0 - me1);
            std::get<1>(evals) += q_scaled * Accumulator(s1 - me2);
            std::get<2>(evals) += q_scaled * Accumulator(s2 - me3);
            std::get<3>(evals) += q_scaled * Accumulator(s3 - me4);
        }

        // ====== Process rounds via compile-time unrolling ======

        // External round: 8 subrelations (4 sq + 4 output)
        auto process_external_round = [&]<size_t R>() {
            constexpr size_t BASE = subrel_base(R);

            // Read state, sq, and compute sbox_input = state + round_constant
            // Convert to Accumulator for all arithmetic (avoids CoefficientAccumulator type issues)
            auto st0 = Accumulator(CoefficientAccumulator(in.poseidon2_state[state_idx(R, 0)]));
            auto st1 = Accumulator(CoefficientAccumulator(in.poseidon2_state[state_idx(R, 1)]));
            auto st2 = Accumulator(CoefficientAccumulator(in.poseidon2_state[state_idx(R, 2)]));
            auto st3 = Accumulator(CoefficientAccumulator(in.poseidon2_state[state_idx(R, 3)]));
            auto sq0 = Accumulator(CoefficientAccumulator(in.poseidon2_sq[sq_idx(R, 0)]));
            auto sq1 = Accumulator(CoefficientAccumulator(in.poseidon2_sq[sq_idx(R, 1)]));
            auto sq2 = Accumulator(CoefficientAccumulator(in.poseidon2_sq[sq_idx(R, 2)]));
            auto sq3 = Accumulator(CoefficientAccumulator(in.poseidon2_sq[sq_idx(R, 3)]));
            auto si0 = st0 + Params::round_constants[R][0];
            auto si1 = st1 + Params::round_constants[R][1];
            auto si2 = st2 + Params::round_constants[R][2];
            auto si3 = st3 + Params::round_constants[R][3];

            // sq constraints: sq[j] = sbox_input[j]^2
            std::get<BASE + 0>(evals) += q_scaled * (sq0 - si0.sqr());
            std::get<BASE + 1>(evals) += q_scaled * (sq1 - si1.sqr());
            std::get<BASE + 2>(evals) += q_scaled * (sq2 - si2.sqr());
            std::get<BASE + 3>(evals) += q_scaled * (sq3 - si3.sqr());

            // S-box outputs: u[j] = sq[j]^2 * sbox_input[j] = x^5
            auto u0 = sq0.sqr() * si0;
            auto u1 = sq1.sqr() * si1;
            auto u2 = sq2.sqr() * si2;
            auto u3 = sq3.sqr() * si3;

            // M_E matrix multiply on u0..u3
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
            auto v1 = a3 + v2;
            auto v3 = a2 + v4;

            // Output constraints: state[R+1] = M_E(sbox_output)
            auto ns0 = CoefficientAccumulator(in.poseidon2_state[state_idx(R + 1, 0)]);
            auto ns1 = CoefficientAccumulator(in.poseidon2_state[state_idx(R + 1, 1)]);
            auto ns2 = CoefficientAccumulator(in.poseidon2_state[state_idx(R + 1, 2)]);
            auto ns3 = CoefficientAccumulator(in.poseidon2_state[state_idx(R + 1, 3)]);

            std::get<BASE + 4>(evals) += q_scaled * (v1 - Accumulator(ns0));
            std::get<BASE + 5>(evals) += q_scaled * (v2 - Accumulator(ns1));
            std::get<BASE + 6>(evals) += q_scaled * (v3 - Accumulator(ns2));
            std::get<BASE + 7>(evals) += q_scaled * (v4 - Accumulator(ns3));
        };

        // Internal round: 5 subrelations (1 sq + 4 output)
        auto process_internal_round = [&]<size_t R>() {
            constexpr size_t BASE = subrel_base(R);

            auto s0 = Accumulator(CoefficientAccumulator(in.poseidon2_state[state_idx(R, 0)]));
            auto sq = Accumulator(CoefficientAccumulator(in.poseidon2_sq[sq_idx(R)]));
            auto si = s0 + Params::round_constants[R][0];

            // sq constraint: sq = sbox_input^2
            std::get<BASE + 0>(evals) += q_scaled * (sq - si.sqr());

            // S-box output: u0 = sq^2 * sbox_input
            auto u0 = sq.sqr() * si;

            // Other elements unchanged
            auto u1 = Accumulator(CoefficientAccumulator(in.poseidon2_state[state_idx(R, 1)]));
            auto u2 = Accumulator(CoefficientAccumulator(in.poseidon2_state[state_idx(R, 2)]));
            auto u3 = Accumulator(CoefficientAccumulator(in.poseidon2_state[state_idx(R, 3)]));

            // Internal matrix: v[j] = (D[j]-1)*u[j] + sum
            auto sum_val = u0 + u1 + u2 + u3;

            auto v0 = u0 * D_MINUS_1[0] + sum_val;
            auto v1 = u1 * D_MINUS_1[1] + sum_val;
            auto v2 = u2 * D_MINUS_1[2] + sum_val;
            auto v3 = u3 * D_MINUS_1[3] + sum_val;

            auto ns0 = Accumulator(CoefficientAccumulator(in.poseidon2_state[state_idx(R + 1, 0)]));
            auto ns1 = Accumulator(CoefficientAccumulator(in.poseidon2_state[state_idx(R + 1, 1)]));
            auto ns2 = Accumulator(CoefficientAccumulator(in.poseidon2_state[state_idx(R + 1, 2)]));
            auto ns3 = Accumulator(CoefficientAccumulator(in.poseidon2_state[state_idx(R + 1, 3)]));

            std::get<BASE + 1>(evals) += q_scaled * (v0 - ns0);
            std::get<BASE + 2>(evals) += q_scaled * (v1 - ns1);
            std::get<BASE + 3>(evals) += q_scaled * (v2 - ns2);
            std::get<BASE + 4>(evals) += q_scaled * (v3 - ns3);
        };

        // Unroll first 4 external rounds
        process_external_round.template operator()<0>();
        process_external_round.template operator()<1>();
        process_external_round.template operator()<2>();
        process_external_round.template operator()<3>();

        // Unroll 56 internal rounds
        [&]<size_t... Rs>(std::index_sequence<Rs...>) {
            (process_internal_round.template operator()<Rs + ROUNDS_F_HALF>(), ...);
        }(std::make_index_sequence<ROUNDS_P>{});

        // Unroll last 4 external rounds
        process_external_round.template operator()<60>();
        process_external_round.template operator()<61>();
        process_external_round.template operator()<62>();
        process_external_round.template operator()<63>();
    };
};

template <typename FF> using Poseidon2SingleRowRelation = Relation<Poseidon2SingleRowRelationImpl<FF>>;
} // namespace bb
