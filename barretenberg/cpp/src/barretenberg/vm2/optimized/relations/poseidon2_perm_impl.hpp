#pragma once

#include "barretenberg/vm2/optimized/relations/poseidon2_perm.hpp"

#include <array>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"

namespace bb::avm2 {

template <typename FF_>
template <typename ContainerOverSubrelations, typename AllEntities>
void optimized_poseidon2_permImpl<FF_>::accumulate(ContainerOverSubrelations& evals,
                                                   const AllEntities& in,
                                                   [[maybe_unused]] const RelationParameters<FF_>&,
                                                   [[maybe_unused]] const FF_& scaling_factor)
{
    using Poseidon2Params = crypto::Poseidon2Bn254ScalarFieldParams;
    using C = ColumnAndShifts;

    // Note this vector is arranged in *subrelation* order NOT in state order
    // Refer to generated/poseidon2_perm_impl.hpp for the order of subrelations in each round
    std::array<std::array<C, 4>, 64> round_cols = { {
        //=========================================
        // Initial Full Round Columns
        //=========================================
        { C::poseidon2_perm_T_0_4, C::poseidon2_perm_T_0_5, C::poseidon2_perm_T_0_6, C::poseidon2_perm_T_0_7 },
        { C::poseidon2_perm_T_1_4, C::poseidon2_perm_T_1_5, C::poseidon2_perm_T_1_6, C::poseidon2_perm_T_1_7 },
        { C::poseidon2_perm_T_2_4, C::poseidon2_perm_T_2_5, C::poseidon2_perm_T_2_6, C::poseidon2_perm_T_2_7 },
        { C::poseidon2_perm_T_3_4, C::poseidon2_perm_T_3_5, C::poseidon2_perm_T_3_6, C::poseidon2_perm_T_3_7 },
        //=========================================
        // Partial Round Columns
        //=========================================
        { C::poseidon2_perm_B_4_0, C::poseidon2_perm_B_4_1, C::poseidon2_perm_B_4_2, C::poseidon2_perm_B_4_3 },
        { C::poseidon2_perm_B_5_0, C::poseidon2_perm_B_5_1, C::poseidon2_perm_B_5_2, C::poseidon2_perm_B_5_3 },
        { C::poseidon2_perm_B_6_0, C::poseidon2_perm_B_6_1, C::poseidon2_perm_B_6_2, C::poseidon2_perm_B_6_3 },
        { C::poseidon2_perm_B_7_0, C::poseidon2_perm_B_7_1, C::poseidon2_perm_B_7_2, C::poseidon2_perm_B_7_3 },
        { C::poseidon2_perm_B_8_0, C::poseidon2_perm_B_8_1, C::poseidon2_perm_B_8_2, C::poseidon2_perm_B_8_3 },
        { C::poseidon2_perm_B_9_0, C::poseidon2_perm_B_9_1, C::poseidon2_perm_B_9_2, C::poseidon2_perm_B_9_3 },
        { C::poseidon2_perm_B_10_0, C::poseidon2_perm_B_10_1, C::poseidon2_perm_B_10_2, C::poseidon2_perm_B_10_3 },
        { C::poseidon2_perm_B_11_0, C::poseidon2_perm_B_11_1, C::poseidon2_perm_B_11_2, C::poseidon2_perm_B_11_3 },
        { C::poseidon2_perm_B_12_0, C::poseidon2_perm_B_12_1, C::poseidon2_perm_B_12_2, C::poseidon2_perm_B_12_3 },
        { C::poseidon2_perm_B_13_0, C::poseidon2_perm_B_13_1, C::poseidon2_perm_B_13_2, C::poseidon2_perm_B_13_3 },
        { C::poseidon2_perm_B_14_0, C::poseidon2_perm_B_14_1, C::poseidon2_perm_B_14_2, C::poseidon2_perm_B_14_3 },
        { C::poseidon2_perm_B_15_0, C::poseidon2_perm_B_15_1, C::poseidon2_perm_B_15_2, C::poseidon2_perm_B_15_3 },
        { C::poseidon2_perm_B_16_0, C::poseidon2_perm_B_16_1, C::poseidon2_perm_B_16_2, C::poseidon2_perm_B_16_3 },
        { C::poseidon2_perm_B_17_0, C::poseidon2_perm_B_17_1, C::poseidon2_perm_B_17_2, C::poseidon2_perm_B_17_3 },
        { C::poseidon2_perm_B_18_0, C::poseidon2_perm_B_18_1, C::poseidon2_perm_B_18_2, C::poseidon2_perm_B_18_3 },
        { C::poseidon2_perm_B_19_0, C::poseidon2_perm_B_19_1, C::poseidon2_perm_B_19_2, C::poseidon2_perm_B_19_3 },
        { C::poseidon2_perm_B_20_0, C::poseidon2_perm_B_20_1, C::poseidon2_perm_B_20_2, C::poseidon2_perm_B_20_3 },
        { C::poseidon2_perm_B_21_0, C::poseidon2_perm_B_21_1, C::poseidon2_perm_B_21_2, C::poseidon2_perm_B_21_3 },
        { C::poseidon2_perm_B_22_0, C::poseidon2_perm_B_22_1, C::poseidon2_perm_B_22_2, C::poseidon2_perm_B_22_3 },
        { C::poseidon2_perm_B_23_0, C::poseidon2_perm_B_23_1, C::poseidon2_perm_B_23_2, C::poseidon2_perm_B_23_3 },
        { C::poseidon2_perm_B_24_0, C::poseidon2_perm_B_24_1, C::poseidon2_perm_B_24_2, C::poseidon2_perm_B_24_3 },
        { C::poseidon2_perm_B_25_0, C::poseidon2_perm_B_25_1, C::poseidon2_perm_B_25_2, C::poseidon2_perm_B_25_3 },
        { C::poseidon2_perm_B_26_0, C::poseidon2_perm_B_26_1, C::poseidon2_perm_B_26_2, C::poseidon2_perm_B_26_3 },
        { C::poseidon2_perm_B_27_0, C::poseidon2_perm_B_27_1, C::poseidon2_perm_B_27_2, C::poseidon2_perm_B_27_3 },
        { C::poseidon2_perm_B_28_0, C::poseidon2_perm_B_28_1, C::poseidon2_perm_B_28_2, C::poseidon2_perm_B_28_3 },
        { C::poseidon2_perm_B_29_0, C::poseidon2_perm_B_29_1, C::poseidon2_perm_B_29_2, C::poseidon2_perm_B_29_3 },
        { C::poseidon2_perm_B_30_0, C::poseidon2_perm_B_30_1, C::poseidon2_perm_B_30_2, C::poseidon2_perm_B_30_3 },
        { C::poseidon2_perm_B_31_0, C::poseidon2_perm_B_31_1, C::poseidon2_perm_B_31_2, C::poseidon2_perm_B_31_3 },
        { C::poseidon2_perm_B_32_0, C::poseidon2_perm_B_32_1, C::poseidon2_perm_B_32_2, C::poseidon2_perm_B_32_3 },
        { C::poseidon2_perm_B_33_0, C::poseidon2_perm_B_33_1, C::poseidon2_perm_B_33_2, C::poseidon2_perm_B_33_3 },
        { C::poseidon2_perm_B_34_0, C::poseidon2_perm_B_34_1, C::poseidon2_perm_B_34_2, C::poseidon2_perm_B_34_3 },
        { C::poseidon2_perm_B_35_0, C::poseidon2_perm_B_35_1, C::poseidon2_perm_B_35_2, C::poseidon2_perm_B_35_3 },
        { C::poseidon2_perm_B_36_0, C::poseidon2_perm_B_36_1, C::poseidon2_perm_B_36_2, C::poseidon2_perm_B_36_3 },
        { C::poseidon2_perm_B_37_0, C::poseidon2_perm_B_37_1, C::poseidon2_perm_B_37_2, C::poseidon2_perm_B_37_3 },
        { C::poseidon2_perm_B_38_0, C::poseidon2_perm_B_38_1, C::poseidon2_perm_B_38_2, C::poseidon2_perm_B_38_3 },
        { C::poseidon2_perm_B_39_0, C::poseidon2_perm_B_39_1, C::poseidon2_perm_B_39_2, C::poseidon2_perm_B_39_3 },
        { C::poseidon2_perm_B_40_0, C::poseidon2_perm_B_40_1, C::poseidon2_perm_B_40_2, C::poseidon2_perm_B_40_3 },
        { C::poseidon2_perm_B_41_0, C::poseidon2_perm_B_41_1, C::poseidon2_perm_B_41_2, C::poseidon2_perm_B_41_3 },
        { C::poseidon2_perm_B_42_0, C::poseidon2_perm_B_42_1, C::poseidon2_perm_B_42_2, C::poseidon2_perm_B_42_3 },
        { C::poseidon2_perm_B_43_0, C::poseidon2_perm_B_43_1, C::poseidon2_perm_B_43_2, C::poseidon2_perm_B_43_3 },
        { C::poseidon2_perm_B_44_0, C::poseidon2_perm_B_44_1, C::poseidon2_perm_B_44_2, C::poseidon2_perm_B_44_3 },
        { C::poseidon2_perm_B_45_0, C::poseidon2_perm_B_45_1, C::poseidon2_perm_B_45_2, C::poseidon2_perm_B_45_3 },
        { C::poseidon2_perm_B_46_0, C::poseidon2_perm_B_46_1, C::poseidon2_perm_B_46_2, C::poseidon2_perm_B_46_3 },
        { C::poseidon2_perm_B_47_0, C::poseidon2_perm_B_47_1, C::poseidon2_perm_B_47_2, C::poseidon2_perm_B_47_3 },
        { C::poseidon2_perm_B_48_0, C::poseidon2_perm_B_48_1, C::poseidon2_perm_B_48_2, C::poseidon2_perm_B_48_3 },
        { C::poseidon2_perm_B_49_0, C::poseidon2_perm_B_49_1, C::poseidon2_perm_B_49_2, C::poseidon2_perm_B_49_3 },
        { C::poseidon2_perm_B_50_0, C::poseidon2_perm_B_50_1, C::poseidon2_perm_B_50_2, C::poseidon2_perm_B_50_3 },
        { C::poseidon2_perm_B_51_0, C::poseidon2_perm_B_51_1, C::poseidon2_perm_B_51_2, C::poseidon2_perm_B_51_3 },
        { C::poseidon2_perm_B_52_0, C::poseidon2_perm_B_52_1, C::poseidon2_perm_B_52_2, C::poseidon2_perm_B_52_3 },
        { C::poseidon2_perm_B_53_0, C::poseidon2_perm_B_53_1, C::poseidon2_perm_B_53_2, C::poseidon2_perm_B_53_3 },
        { C::poseidon2_perm_B_54_0, C::poseidon2_perm_B_54_1, C::poseidon2_perm_B_54_2, C::poseidon2_perm_B_54_3 },
        { C::poseidon2_perm_B_55_0, C::poseidon2_perm_B_55_1, C::poseidon2_perm_B_55_2, C::poseidon2_perm_B_55_3 },
        { C::poseidon2_perm_B_56_0, C::poseidon2_perm_B_56_1, C::poseidon2_perm_B_56_2, C::poseidon2_perm_B_56_3 },
        { C::poseidon2_perm_B_57_0, C::poseidon2_perm_B_57_1, C::poseidon2_perm_B_57_2, C::poseidon2_perm_B_57_3 },
        { C::poseidon2_perm_B_58_0, C::poseidon2_perm_B_58_1, C::poseidon2_perm_B_58_2, C::poseidon2_perm_B_58_3 },
        { C::poseidon2_perm_B_59_0, C::poseidon2_perm_B_59_1, C::poseidon2_perm_B_59_2, C::poseidon2_perm_B_59_3 },
        //=========================================
        // Final Full Round Columns
        //=========================================
        { C::poseidon2_perm_T_60_4, C::poseidon2_perm_T_60_5, C::poseidon2_perm_T_60_6, C::poseidon2_perm_T_60_7 },
        { C::poseidon2_perm_T_61_4, C::poseidon2_perm_T_61_5, C::poseidon2_perm_T_61_6, C::poseidon2_perm_T_61_7 },
        { C::poseidon2_perm_T_62_4, C::poseidon2_perm_T_62_5, C::poseidon2_perm_T_62_6, C::poseidon2_perm_T_62_7 },
        { C::poseidon2_perm_T_63_4, C::poseidon2_perm_T_63_5, C::poseidon2_perm_T_63_6, C::poseidon2_perm_T_63_7 },
    } };

    //=========================================
    // HELPER FUNCTIONS
    //=========================================
    const auto full_round_add_constant = []<typename T, typename U>(std::array<T, 4>& state,
                                                                    const std::array<U, 4>& rc) {
        state[0] += rc[0];
        state[1] += rc[1];
        state[2] += rc[2];
        state[3] += rc[3];
    };

    const auto full_round_s_box = []<typename T>(std::array<T, 4>& state) {
        // For t = 4, the s-box is A^5, B^5, C^5, D^5
        state[0] = state[0] * state[0] * state[0] * state[0] * state[0]; // A^5
        state[1] = state[1] * state[1] * state[1] * state[1] * state[1]; // B^5
        state[2] = state[2] * state[2] * state[2] * state[2] * state[2]; // C^5
        state[3] = state[3] * state[3] * state[3] * state[3] * state[3]; // D^5
    };

    const auto external_matrix_mul = []<typename T>(std::array<T, 4>& state) {
        // Taken from poseidon2 paper - Appendix B
        auto t0 = state[0] + state[1];
        auto t1 = state[2] + state[3];
        auto t2 = FF(2) * state[1] + t1;
        auto t3 = FF(2) * state[3] + t0;
        auto t4 = FF(4) * t1 + t3;
        auto t5 = FF(4) * t0 + t2;
        auto t6 = t3 + t5;
        auto t7 = t2 + t4;
        state[0] = t6;
        state[1] = t5;
        state[2] = t7;
        state[3] = t4;
    };

    // In partial round only the first state is updated
    const auto partial_round_add_constant = []<typename T, typename U>(std::array<T, 4>& state, const U& rc) {
        state[0] += rc;
    };

    // In partial round only the first state is updated
    const auto partial_round_s_box = []<typename T>(std::array<T, 4>& state) {
        state[0] = state[0] * state[0] * state[0] * state[0] * state[0]; // A^5
    };

    // The partial round uses the internal matrix diagonal values
    const auto internal_matrix_mul = []<typename T, typename U>(std::array<T, 4>& state,
                                                                const std::array<U, 4>& internal_matrix_diagonal) {
        auto sum = state[0] + state[1] + state[2] + state[3];
        for (size_t i = 0; i < 4; ++i) {
            state[i] = state[i] * internal_matrix_diagonal[i] + sum;
        }
    };

    //=========================================
    // Start Accumulation Relations
    //=========================================
    {
        using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
        auto tmp = in.get(C::poseidon2_perm_sel) * (FF(1) - in.get(C::poseidon2_perm_sel));
        tmp *= scaling_factor;
        std::get<0>(evals) += typename Accumulator::View(tmp);
    }

    // Initial state is the input
    auto state = std::array{
        in.get(C::poseidon2_perm_a_0),
        in.get(C::poseidon2_perm_a_1),
        in.get(C::poseidon2_perm_a_2),
        in.get(C::poseidon2_perm_a_3),
    };

    //=========================================
    // Start Permutation Algorithm
    //=========================================
    // The poseidon2 permutation algorithm consists of:
    // 1) Initial External Matrix Multiplication
    // 2) 4x Initial Full Rounds
    // 3) 56x Partial Rounds
    // 4) 4x Final Full Rounds

    external_matrix_mul(state);
    // Set the columns after the external matrix multiplication
    {
        using Accumulator = typename std::tuple_element_t<1, ContainerOverSubrelations>;
        auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(C::poseidon2_perm_EXT_LAYER_4) - state[3]);
        tmp *= scaling_factor;
        std::get<1>(evals) += typename Accumulator::View(tmp);
    }
    {
        using Accumulator = typename std::tuple_element_t<2, ContainerOverSubrelations>;
        auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(C::poseidon2_perm_EXT_LAYER_5) - state[1]);
        tmp *= scaling_factor;
        std::get<2>(evals) += typename Accumulator::View(tmp);
    }
    {
        using Accumulator = typename std::tuple_element_t<3, ContainerOverSubrelations>;
        auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(C::poseidon2_perm_EXT_LAYER_6) - state[0]);
        tmp *= scaling_factor;
        std::get<3>(evals) += typename Accumulator::View(tmp);
    }
    {
        using Accumulator = typename std::tuple_element_t<4, ContainerOverSubrelations>;
        auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(C::poseidon2_perm_EXT_LAYER_7) - state[2]);
        tmp *= scaling_factor;
        std::get<4>(evals) += typename Accumulator::View(tmp);
    }

    // The permutation rounds start at subrelation index 5
    constexpr size_t START_RELATION_OF_PERM = 5;
    // We need to populate each state round with by retrieving the witness rather than mutating the state
    // in place. Otherwise we do not end up with the correct subrelation length.
    state = std::array{
        in.get(C::poseidon2_perm_EXT_LAYER_6),
        in.get(C::poseidon2_perm_EXT_LAYER_5),
        in.get(C::poseidon2_perm_EXT_LAYER_7),
        in.get(C::poseidon2_perm_EXT_LAYER_4),
    };

    // Start of the 4 Initial Full Rounds
    constexpr_for<0, 4, 1>([&]<size_t i>() {
        constexpr size_t relation_offset = START_RELATION_OF_PERM + (i * 4);
        full_round_add_constant(state, Poseidon2Params::round_constants[i]);
        full_round_s_box(state);
        external_matrix_mul(state);
        // Set state 0
        {
            using Accumulator = typename std::tuple_element_t<relation_offset, ContainerOverSubrelations>;
            auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(round_cols[i][0]) - state[3]);
            tmp *= scaling_factor;
            std::get<relation_offset>(evals) += typename Accumulator::View(tmp);
        }
        // Set state 1
        {
            using Accumulator = typename std::tuple_element_t<relation_offset + 1, ContainerOverSubrelations>;
            auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(round_cols[i][1]) - state[1]);
            tmp *= scaling_factor;
            std::get<relation_offset + 1>(evals) += typename Accumulator::View(tmp);
        }
        // Set state 3
        {
            using Accumulator = typename std::tuple_element_t<relation_offset + 2, ContainerOverSubrelations>;
            auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(round_cols[i][2]) - state[0]);
            tmp *= scaling_factor;
            std::get<relation_offset + 2>(evals) += typename Accumulator::View(tmp);
        }
        // Set state 4
        {
            using Accumulator = typename std::tuple_element_t<relation_offset + 3, ContainerOverSubrelations>;
            auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(round_cols[i][3]) - state[2]);
            tmp *= scaling_factor;
            std::get<relation_offset + 3>(evals) += typename Accumulator::View(tmp);
        }

        // Set the state to be used in next round, this step helps to ensure subrelation length is correct
        state = std::array{
            in.get(round_cols[i][2]),
            in.get(round_cols[i][1]),
            in.get(round_cols[i][3]),
            in.get(round_cols[i][0]),
        };
    });

    // 56 Partial Rounds, from round 4 to round 60. (Note: This starts at relation 21)
    constexpr_for<4, 60, 1>([&]<size_t i>() {
        constexpr size_t relation_offset = START_RELATION_OF_PERM + (i * 4);
        partial_round_add_constant(state, Poseidon2Params::round_constants[i][0]);
        partial_round_s_box(state);
        internal_matrix_mul(state, Poseidon2Params::internal_matrix_diagonal);
        // Set the state 0
        {
            using Accumulator = typename std::tuple_element_t<relation_offset, ContainerOverSubrelations>;
            auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(round_cols[i][0]) - state[0]);
            tmp *= scaling_factor;
            std::get<relation_offset>(evals) += typename Accumulator::View(tmp);
        }
        // Set the state 1
        {
            using Accumulator = typename std::tuple_element_t<relation_offset + 1, ContainerOverSubrelations>;
            auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(round_cols[i][1]) - state[1]);
            tmp *= scaling_factor;
            std::get<relation_offset + 1>(evals) += typename Accumulator::View(tmp);
        }
        // Set the state 2
        {
            using Accumulator = typename std::tuple_element_t<relation_offset + 2, ContainerOverSubrelations>;
            auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(round_cols[i][2]) - state[2]);
            tmp *= scaling_factor;
            std::get<relation_offset + 2>(evals) += typename Accumulator::View(tmp);
        }
        // Set the state 3
        {
            using Accumulator = typename std::tuple_element_t<relation_offset + 3, ContainerOverSubrelations>;
            auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(round_cols[i][3]) - state[3]);
            tmp *= scaling_factor;
            std::get<relation_offset + 3>(evals) += typename Accumulator::View(tmp);
        }

        // Set the state to be used in next round, this step helps to ensure subrelation length is correct
        state = std::array{
            in.get(round_cols[i][0]),
            in.get(round_cols[i][1]),
            in.get(round_cols[i][2]),
            in.get(round_cols[i][3]),
        };
    });

    // 4 Full Rounds, from round 60 to round 64. (Note: This starts at relation 245)
    constexpr_for<60, 64, 1>([&]<size_t i>() {
        constexpr size_t relation_offset = START_RELATION_OF_PERM + (i * 4);
        full_round_add_constant(state, Poseidon2Params::round_constants[i]);
        full_round_s_box(state);
        external_matrix_mul(state);
        // Set the state 0
        {
            using Accumulator = typename std::tuple_element_t<relation_offset, ContainerOverSubrelations>;
            auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(round_cols[i][0]) - state[3]);
            tmp *= scaling_factor;
            std::get<relation_offset>(evals) += typename Accumulator::View(tmp);
        }
        // Set the state 1
        {
            using Accumulator = typename std::tuple_element_t<relation_offset + 1, ContainerOverSubrelations>;
            auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(round_cols[i][1]) - state[1]);
            tmp *= scaling_factor;
            std::get<relation_offset + 1>(evals) += typename Accumulator::View(tmp);
        }
        // Set the state 2
        {
            using Accumulator = typename std::tuple_element_t<relation_offset + 2, ContainerOverSubrelations>;
            auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(round_cols[i][2]) - state[0]);
            tmp *= scaling_factor;
            std::get<relation_offset + 2>(evals) += typename Accumulator::View(tmp);
        }
        // Set the state 3
        {
            using Accumulator = typename std::tuple_element_t<relation_offset + 3, ContainerOverSubrelations>;
            auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(round_cols[i][3]) - state[2]);
            tmp *= scaling_factor;
            std::get<relation_offset + 3>(evals) += typename Accumulator::View(tmp);
        }

        // Set the state to be used in next round, this step helps to ensure subrelation length is correct
        state = std::array{
            in.get(round_cols[i][2]),
            in.get(round_cols[i][1]),
            in.get(round_cols[i][3]),
            in.get(round_cols[i][0]),
        };
    });

    // Write to outputs
    {
        using Accumulator = typename std::tuple_element_t<261, ContainerOverSubrelations>;
        auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(C::poseidon2_perm_b_0) - in.get(C::poseidon2_perm_T_63_6));
        tmp *= scaling_factor;
        std::get<261>(evals) += typename Accumulator::View(tmp);
    }
    {
        using Accumulator = typename std::tuple_element_t<262, ContainerOverSubrelations>;
        auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(C::poseidon2_perm_b_1) - in.get(C::poseidon2_perm_T_63_5));
        tmp *= scaling_factor;
        std::get<262>(evals) += typename Accumulator::View(tmp);
    }
    {
        using Accumulator = typename std::tuple_element_t<263, ContainerOverSubrelations>;
        auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(C::poseidon2_perm_b_2) - in.get(C::poseidon2_perm_T_63_7));
        tmp *= scaling_factor;
        std::get<263>(evals) += typename Accumulator::View(tmp);
    }
    {
        using Accumulator = typename std::tuple_element_t<264, ContainerOverSubrelations>;
        auto tmp = in.get(C::poseidon2_perm_sel) * (in.get(C::poseidon2_perm_b_3) - in.get(C::poseidon2_perm_T_63_4));
        tmp *= scaling_factor;
        std::get<264>(evals) += typename Accumulator::View(tmp);
    }
}

} // namespace bb::avm2
