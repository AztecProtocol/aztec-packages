// Hand-tuned implementation of the poseidon2_perm relation to make compile times tolerable
//
// Replaces the auto-generated `generated/relations/poseidon2_perm_impl.hpp`.
//
// Subrelation layout:
//   0        boolean selector
//   1..4     initial external-matrix layer on the input state
//   5..20    4 initial full rounds (4 subrelations each)
//   21..79   56 partial rounds, quad-compressed (see poseidon2_quad_params.hpp)
//   80..95   4 final full rounds (4 subrelations each)
//   96..99   outputs
//
// Note on reading constants
// Round constants and the internal-matrix diagonal D_i are read directly as native `bb::fr` from the
// shared `constexpr` tables in `poseidon2_params.hpp` / `poseidon2_quad_params.hpp`.
//
// While the underlying fields are the same, the proving build uses `FF == bb::fr` and the recursive build uses `FF ==
// stdlib::field_t`. This difference in c++ type can subtly cause the recursive build to fail to compile if a native
// constant is on the left of a multiply, because `bb::fr * stdlib::field_t` has no overload (field_t has no conversion
// operator to bb::fr but there is an implicit conversion the other way).
//
// This really only impacts the Poseidon2QuadBn254Params multiplications since the standard round constants are used
// additively. But this does mean we have to be careful to keep the native-loaded constants on the right of multiplies,
// otherwise we get a compile error in the recursive build.
#pragma once

#include <array>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_quad_params.hpp"
#include "barretenberg/vm2/constraining/relations/relation_macros.hpp"
#include "barretenberg/vm2/optimized/relations/poseidon2_perm.hpp"

namespace bb::avm2 {

template <typename FF_>
template <typename ContainerOverSubrelations, typename AllEntities>
void optimized_poseidon2_permImpl<FF_>::accumulate(ContainerOverSubrelations& evals,
                                                   const AllEntities& in,
                                                   [[maybe_unused]] const RelationParameters<FF_>&,
                                                   [[maybe_unused]] const FF_& scaling_factor)
{
    // Read constants natively; see the file header for the operand-order rule that keeps the diagonal
    // multiplies compiling under the recursive flavor.
    using PParams = bb::crypto::Poseidon2Bn254ScalarFieldParams;
    using PQuad = bb::crypto::Poseidon2QuadBn254Params;
    using C = ColumnAndShifts;

    //=========================================
    // Helpers (state-update + constraint emission)
    //=========================================
    // Add the round constants to every lane.
    const auto add_round_constant = []<typename T, typename U>(std::array<T, 4>& state, const std::array<U, 4>& rc) {
        for (size_t k = 0; k < 4; ++k) {
            state[k] += rc[k];
        }
    };

    const auto power_of_5 = []<typename T>(const T& x) {
        auto acc = x.sqr();
        acc = acc.sqr();
        return acc * x;
    };

    // Full-round S-box: x -> x^5 on every lane.
    const auto s_box = [&]<typename T>(std::array<T, 4>& state) {
        for (auto& x : state) {
            x = power_of_5(x);
        }
    };

    // External (MDS) matrix layer applied to `input`, constrained against the four witness output
    // columns `out` at subrelations [Index, Index + 4). Computes the four Poseidon2 MDS outputs
    // (t4..t7) from the input lanes and pins each witness output column to its value.
    const auto constrain_external_matrix = [&]<size_t Index, typename T>(const std::array<T, 4>& input,
                                                                         const std::array<C, 4>& out) {
        const auto t0 = input[0] + input[1];
        const auto t1 = input[2] + input[3];
        const auto t2 = FF(2) * input[1] + t1;
        const auto t3 = FF(2) * input[3] + t0;
        const auto t4 = FF(4) * t1 + t3;
        const auto t5 = FF(4) * t0 + t2;
        const auto t6 = t3 + t5;
        const auto t7 = t2 + t4;
        {
            using View = typename std::tuple_element_t<Index + 0, ContainerOverSubrelations>::View;
            auto tmp =
                static_cast<View>(in.get(C::poseidon2_perm_sel)) * (static_cast<View>(in.get(out[0])) - CView(t4));
            std::get<Index + 0>(evals) += (tmp * scaling_factor);
        }
        {
            using View = typename std::tuple_element_t<Index + 1, ContainerOverSubrelations>::View;
            auto tmp =
                static_cast<View>(in.get(C::poseidon2_perm_sel)) * (static_cast<View>(in.get(out[1])) - CView(t5));
            std::get<Index + 1>(evals) += (tmp * scaling_factor);
        }
        {
            using View = typename std::tuple_element_t<Index + 2, ContainerOverSubrelations>::View;
            auto tmp =
                static_cast<View>(in.get(C::poseidon2_perm_sel)) * (static_cast<View>(in.get(out[2])) - CView(t6));
            std::get<Index + 2>(evals) += (tmp * scaling_factor);
        }
        {
            using View = typename std::tuple_element_t<Index + 3, ContainerOverSubrelations>::View;
            auto tmp =
                static_cast<View>(in.get(C::poseidon2_perm_sel)) * (static_cast<View>(in.get(out[3])) - CView(t7));
            std::get<Index + 3>(evals) += (tmp * scaling_factor);
        }
    };

    //=========================================
    // Subrelation 0: selector booleanity
    //=========================================
    {
        using View = typename std::tuple_element_t<0, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (FF(1) - static_cast<View>(in.get(C::poseidon2_perm_sel)));
        std::get<0>(evals) += (tmp * scaling_factor);
    }

    //=========================================
    // Subrelations 1..4: initial external matrix on the input state
    //=========================================
    {
        // Initial state is the input
        const std::array input = {
            in.get(C::poseidon2_perm_a_0),
            in.get(C::poseidon2_perm_a_1),
            in.get(C::poseidon2_perm_a_2),
            in.get(C::poseidon2_perm_a_3),
        };
        constexpr std::array<C, 4> out = {
            C::poseidon2_perm_EXT_LAYER_4,
            C::poseidon2_perm_EXT_LAYER_5,
            C::poseidon2_perm_EXT_LAYER_6,
            C::poseidon2_perm_EXT_LAYER_7,
        };
        // 1 here is the index offset of the first subrelation in this block (the initial external-matrix layer is
        // subrelations 1..4).
        constrain_external_matrix.template operator()<1>(input, out);
    }

    //=========================================
    // Subrelations 5..20: 4 initial full rounds
    //=========================================
    // The permutation rounds start at subrelation index 5
    constexpr size_t START_RELATION_OF_PERM = 5;
    // The initial 4 full rounds input and output columns
    constexpr std::array<std::array<C, 4>, 4> initial_input_cols = { {
        { C::poseidon2_perm_EXT_LAYER_6,
          C::poseidon2_perm_EXT_LAYER_5,
          C::poseidon2_perm_EXT_LAYER_7,
          C::poseidon2_perm_EXT_LAYER_4 },
        { C::poseidon2_perm_T_0_6, C::poseidon2_perm_T_0_5, C::poseidon2_perm_T_0_7, C::poseidon2_perm_T_0_4 },
        { C::poseidon2_perm_T_1_6, C::poseidon2_perm_T_1_5, C::poseidon2_perm_T_1_7, C::poseidon2_perm_T_1_4 },
        { C::poseidon2_perm_T_2_6, C::poseidon2_perm_T_2_5, C::poseidon2_perm_T_2_7, C::poseidon2_perm_T_2_4 },
    } };
    constexpr std::array<std::array<C, 4>, 4> initial_out_cols = { {
        { C::poseidon2_perm_T_0_4, C::poseidon2_perm_T_0_5, C::poseidon2_perm_T_0_6, C::poseidon2_perm_T_0_7 },
        { C::poseidon2_perm_T_1_4, C::poseidon2_perm_T_1_5, C::poseidon2_perm_T_1_6, C::poseidon2_perm_T_1_7 },
        { C::poseidon2_perm_T_2_4, C::poseidon2_perm_T_2_5, C::poseidon2_perm_T_2_6, C::poseidon2_perm_T_2_7 },
        { C::poseidon2_perm_T_3_4, C::poseidon2_perm_T_3_5, C::poseidon2_perm_T_3_6, C::poseidon2_perm_T_3_7 },
    } };
    // Execute the full rounds: ARK -> S-box -> external matrix.
    bb::constexpr_for<0, 4, 1>([&]<size_t I>() {
        constexpr size_t sub_index_offset = START_RELATION_OF_PERM + (4 * I);
        std::array state = {
            in.get(initial_input_cols[I][0]),
            in.get(initial_input_cols[I][1]),
            in.get(initial_input_cols[I][2]),
            in.get(initial_input_cols[I][3]),
        };
        add_round_constant(state, PParams::round_constants[I]);
        s_box(state);
        constrain_external_matrix.template operator()<sub_index_offset>(state, initial_out_cols[I]);
    });

    //=========================================
    // Subrelations 21..79: 56 partial rounds (K=4 quad-compressed chain)
    //=========================================
    // The 56 internal rounds constrain witnesses on state[0] only; the other three lanes evolve linearly so are
    // handled by intermediate polys. We unroll the S-boxed lane into ALPHA and carry the three linear lanes as (X, Y,
    // Z), so a single chain reproduces all 56 rounds. The diagonal coefficients are D_1..D_4 from the quad params.
    //
    // The chain follows: ARK_n = B_{n-1}_0 + C_n_0; ALPHA_n = ARK_n^5; (X, Y, Z) update.
    // Stored as arrays with ALPHA[i] := ALPHA_{i+1}, X[i] := X_{i+1}, Y[i] := Y_{i+1}, Z[i] := Z_{i+1}.
    // Read from the previous full round output
    const auto poseidon2_perm_B_3_0 = in.get(C::poseidon2_perm_T_3_6);
    const auto poseidon2_perm_B_3_1 = in.get(C::poseidon2_perm_T_3_5);
    const auto poseidon2_perm_B_3_2 = in.get(C::poseidon2_perm_T_3_7);
    const auto poseidon2_perm_B_3_3 = in.get(C::poseidon2_perm_T_3_4);
    constexpr std::array<C, 56> B_partial_cols = {
        C::poseidon2_perm_B_4_0,  C::poseidon2_perm_B_5_0,  C::poseidon2_perm_B_6_0,  C::poseidon2_perm_B_7_0,
        C::poseidon2_perm_B_8_0,  C::poseidon2_perm_B_9_0,  C::poseidon2_perm_B_10_0, C::poseidon2_perm_B_11_0,
        C::poseidon2_perm_B_12_0, C::poseidon2_perm_B_13_0, C::poseidon2_perm_B_14_0, C::poseidon2_perm_B_15_0,
        C::poseidon2_perm_B_16_0, C::poseidon2_perm_B_17_0, C::poseidon2_perm_B_18_0, C::poseidon2_perm_B_19_0,
        C::poseidon2_perm_B_20_0, C::poseidon2_perm_B_21_0, C::poseidon2_perm_B_22_0, C::poseidon2_perm_B_23_0,
        C::poseidon2_perm_B_24_0, C::poseidon2_perm_B_25_0, C::poseidon2_perm_B_26_0, C::poseidon2_perm_B_27_0,
        C::poseidon2_perm_B_28_0, C::poseidon2_perm_B_29_0, C::poseidon2_perm_B_30_0, C::poseidon2_perm_B_31_0,
        C::poseidon2_perm_B_32_0, C::poseidon2_perm_B_33_0, C::poseidon2_perm_B_34_0, C::poseidon2_perm_B_35_0,
        C::poseidon2_perm_B_36_0, C::poseidon2_perm_B_37_0, C::poseidon2_perm_B_38_0, C::poseidon2_perm_B_39_0,
        C::poseidon2_perm_B_40_0, C::poseidon2_perm_B_41_0, C::poseidon2_perm_B_42_0, C::poseidon2_perm_B_43_0,
        C::poseidon2_perm_B_44_0, C::poseidon2_perm_B_45_0, C::poseidon2_perm_B_46_0, C::poseidon2_perm_B_47_0,
        C::poseidon2_perm_B_48_0, C::poseidon2_perm_B_49_0, C::poseidon2_perm_B_50_0, C::poseidon2_perm_B_51_0,
        C::poseidon2_perm_B_52_0, C::poseidon2_perm_B_53_0, C::poseidon2_perm_B_54_0, C::poseidon2_perm_B_55_0,
        C::poseidon2_perm_B_56_0, C::poseidon2_perm_B_57_0, C::poseidon2_perm_B_58_0, C::poseidon2_perm_B_59_0
    };
    // This is the type of the element that is "chained" through the 56 partial rounds.
    // Its type is the result of a univariate (for the prover) or an FF (for the verifier) multiplied by the
    // diagonal constant D_2.
    using ChainElem = std::decay_t<decltype(in.get(C::poseidon2_perm_T_3_5) * PQuad::D2)>;
    std::array<ChainElem, 56> alphas_arr{};
    std::array<ChainElem, 55> xs_arrs{};
    std::array<ChainElem, 55> ys_arrs{};
    std::array<ChainElem, 55> zs_arrs{};
    // The first partial round reads the previous full round's output (B_3_0..3) and computes the first ALPHA/X/Y/Z.
    {
        const auto ark = poseidon2_perm_B_3_0 + PParams::round_constants[4][0];
        alphas_arr[0] = power_of_5(ark);
        xs_arrs[0] = poseidon2_perm_B_3_1 * PQuad::D2 + poseidon2_perm_B_3_2 + poseidon2_perm_B_3_3 + alphas_arr[0];
        ys_arrs[0] = poseidon2_perm_B_3_1 + poseidon2_perm_B_3_2 * PQuad::D3 + poseidon2_perm_B_3_3 + alphas_arr[0];
        zs_arrs[0] = poseidon2_perm_B_3_1 + poseidon2_perm_B_3_2 + poseidon2_perm_B_3_3 * PQuad::D4 + alphas_arr[0];
    }
    // Compute the remaining 55 partial rounds in a single chain.
    bb::constexpr_for<1, 56, 1>([&]<size_t i>() {
        const auto ark = in.get(B_partial_cols[i - 1]) + PParams::round_constants[i + 4][0];
        alphas_arr[i] = power_of_5(ark);
        if constexpr (i < 55) {
            xs_arrs[i] = xs_arrs[i - 1] * PQuad::D2 + ys_arrs[i - 1] + zs_arrs[i - 1] + alphas_arr[i];
            ys_arrs[i] = xs_arrs[i - 1] + ys_arrs[i - 1] * PQuad::D3 + zs_arrs[i - 1] + alphas_arr[i];
            zs_arrs[i] = xs_arrs[i - 1] + ys_arrs[i - 1] + zs_arrs[i - 1] * PQuad::D4 + alphas_arr[i];
        }
    });
    // Assign the witnesses to the subrelations in order, using the pre-computed ALPHA/X/Y/Z arrays.
    // Subrelations 21..76: each partial round sets each B_n_0 column to D_1 * ALPHA + (carried lanes).
    bb::constexpr_for<0, 56, 1>([&]<size_t i>() {
        constexpr size_t PARTIAL_ROUND_SUB_INDEX = 21 + i;
        using View = typename std::tuple_element_t<PARTIAL_ROUND_SUB_INDEX, ContainerOverSubrelations>::View;
        if constexpr (i == 0) {
            auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                       (static_cast<View>(in.get(B_partial_cols[i])) -
                        (CView(PQuad::D1) * CView(alphas_arr[i]) + CView(poseidon2_perm_B_3_1) +
                         CView(poseidon2_perm_B_3_2) + CView(poseidon2_perm_B_3_3)));
            std::get<PARTIAL_ROUND_SUB_INDEX>(evals) += (tmp * scaling_factor);
        } else {
            auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                       (static_cast<View>(in.get(B_partial_cols[i])) -
                        (CView(PQuad::D1) * CView(alphas_arr[i]) + CView(xs_arrs[i - 1]) + CView(ys_arrs[i - 1]) +
                         CView(zs_arrs[i - 1])));
            std::get<PARTIAL_ROUND_SUB_INDEX>(evals) += (tmp * scaling_factor);
        }
    });
    // Subrelations 77..79: sets the remaining three lanes of the final partial state (B_59_1/2/3).
    {
        using View = typename std::tuple_element_t<77, ContainerOverSubrelations>::View;
        auto tmp =
            static_cast<View>(in.get(C::poseidon2_perm_sel)) *
            (static_cast<View>(in.get(C::poseidon2_perm_B_59_1)) -
             (CView(PQuad::D2) * CView(xs_arrs[54]) + CView(ys_arrs[54]) + CView(zs_arrs[54]) + CView(alphas_arr[55])));
        std::get<77>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<78, ContainerOverSubrelations>::View;
        auto tmp =
            static_cast<View>(in.get(C::poseidon2_perm_sel)) *
            (static_cast<View>(in.get(C::poseidon2_perm_B_59_2)) -
             (CView(xs_arrs[54]) + CView(PQuad::D3) * CView(ys_arrs[54]) + CView(zs_arrs[54]) + CView(alphas_arr[55])));
        std::get<78>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<79, ContainerOverSubrelations>::View;
        auto tmp =
            static_cast<View>(in.get(C::poseidon2_perm_sel)) *
            (static_cast<View>(in.get(C::poseidon2_perm_B_59_3)) -
             (CView(xs_arrs[54]) + CView(ys_arrs[54]) + CView(PQuad::D4) * CView(zs_arrs[54]) + CView(alphas_arr[55])));
        std::get<79>(evals) += (tmp * scaling_factor);
    }

    //=========================================
    // Subrelations 80..95: 4 final full rounds
    //=========================================
    // Round 60 reads the partial chain's terminal state {B_59_0..3} in order; rounds 61..63 read the
    // previous round's outputs permuted as {out_2, out_1, out_3, out_0}.
    constexpr std::array<std::array<C, 4>, 4> final_in_state = { {
        { C::poseidon2_perm_B_59_0, C::poseidon2_perm_B_59_1, C::poseidon2_perm_B_59_2, C::poseidon2_perm_B_59_3 },
        { C::poseidon2_perm_T_60_6, C::poseidon2_perm_T_60_5, C::poseidon2_perm_T_60_7, C::poseidon2_perm_T_60_4 },
        { C::poseidon2_perm_T_61_6, C::poseidon2_perm_T_61_5, C::poseidon2_perm_T_61_7, C::poseidon2_perm_T_61_4 },
        { C::poseidon2_perm_T_62_6, C::poseidon2_perm_T_62_5, C::poseidon2_perm_T_62_7, C::poseidon2_perm_T_62_4 },
    } };
    constexpr std::array<std::array<C, 4>, 4> final_out = { {
        { C::poseidon2_perm_T_60_4, C::poseidon2_perm_T_60_5, C::poseidon2_perm_T_60_6, C::poseidon2_perm_T_60_7 },
        { C::poseidon2_perm_T_61_4, C::poseidon2_perm_T_61_5, C::poseidon2_perm_T_61_6, C::poseidon2_perm_T_61_7 },
        { C::poseidon2_perm_T_62_4, C::poseidon2_perm_T_62_5, C::poseidon2_perm_T_62_6, C::poseidon2_perm_T_62_7 },
        { C::poseidon2_perm_T_63_4, C::poseidon2_perm_T_63_5, C::poseidon2_perm_T_63_6, C::poseidon2_perm_T_63_7 },
    } };
    bb::constexpr_for<0, 4, 1>([&]<size_t I>() {
        constexpr size_t base = 80 + (4 * I);
        std::array state = {
            in.get(final_in_state[I][0]),
            in.get(final_in_state[I][1]),
            in.get(final_in_state[I][2]),
            in.get(final_in_state[I][3]),
        };
        add_round_constant(state, PParams::round_constants[60 + I]);
        s_box(state);
        constrain_external_matrix.template operator()<base>(state, final_out[I]);
    });

    //=========================================
    // Subrelations 96..99: outputs
    //=========================================
    // The output b_k equals the final permuted state {T_63_6, T_63_5, T_63_7, T_63_4}.
    constexpr std::array<C, 4> output_cols = {
        C::poseidon2_perm_b_0,
        C::poseidon2_perm_b_1,
        C::poseidon2_perm_b_2,
        C::poseidon2_perm_b_3,
    };
    constexpr std::array<C, 4> final_state_cols = {
        C::poseidon2_perm_T_63_6,
        C::poseidon2_perm_T_63_5,
        C::poseidon2_perm_T_63_7,
        C::poseidon2_perm_T_63_4,
    };
    bb::constexpr_for<0, 4, 1>([&]<size_t I>() {
        constexpr size_t sub_idx = 96 + I;
        using View = typename std::tuple_element_t<sub_idx, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(output_cols[I])) - static_cast<View>(in.get(final_state_cols[I])));
        std::get<sub_idx>(evals) += (tmp * scaling_factor);
    });
}

} // namespace bb::avm2
