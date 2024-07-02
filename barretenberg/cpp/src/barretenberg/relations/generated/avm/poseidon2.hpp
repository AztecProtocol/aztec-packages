
#pragma once
#include "../../relation_parameters.hpp"
#include "../../relation_types.hpp"
#include "./declare_views.hpp"

namespace bb::Avm_vm {

template <typename FF> struct Poseidon2Row {
    FF poseidon2_B_10_0{};
    FF poseidon2_B_10_1{};
    FF poseidon2_B_10_2{};
    FF poseidon2_B_10_3{};
    FF poseidon2_B_11_0{};
    FF poseidon2_B_11_1{};
    FF poseidon2_B_11_2{};
    FF poseidon2_B_11_3{};
    FF poseidon2_B_12_0{};
    FF poseidon2_B_12_1{};
    FF poseidon2_B_12_2{};
    FF poseidon2_B_12_3{};
    FF poseidon2_B_13_0{};
    FF poseidon2_B_13_1{};
    FF poseidon2_B_13_2{};
    FF poseidon2_B_13_3{};
    FF poseidon2_B_14_0{};
    FF poseidon2_B_14_1{};
    FF poseidon2_B_14_2{};
    FF poseidon2_B_14_3{};
    FF poseidon2_B_15_0{};
    FF poseidon2_B_15_1{};
    FF poseidon2_B_15_2{};
    FF poseidon2_B_15_3{};
    FF poseidon2_B_16_0{};
    FF poseidon2_B_16_1{};
    FF poseidon2_B_16_2{};
    FF poseidon2_B_16_3{};
    FF poseidon2_B_17_0{};
    FF poseidon2_B_17_1{};
    FF poseidon2_B_17_2{};
    FF poseidon2_B_17_3{};
    FF poseidon2_B_18_0{};
    FF poseidon2_B_18_1{};
    FF poseidon2_B_18_2{};
    FF poseidon2_B_18_3{};
    FF poseidon2_B_19_0{};
    FF poseidon2_B_19_1{};
    FF poseidon2_B_19_2{};
    FF poseidon2_B_19_3{};
    FF poseidon2_B_20_0{};
    FF poseidon2_B_20_1{};
    FF poseidon2_B_20_2{};
    FF poseidon2_B_20_3{};
    FF poseidon2_B_21_0{};
    FF poseidon2_B_21_1{};
    FF poseidon2_B_21_2{};
    FF poseidon2_B_21_3{};
    FF poseidon2_B_22_0{};
    FF poseidon2_B_22_1{};
    FF poseidon2_B_22_2{};
    FF poseidon2_B_22_3{};
    FF poseidon2_B_23_0{};
    FF poseidon2_B_23_1{};
    FF poseidon2_B_23_2{};
    FF poseidon2_B_23_3{};
    FF poseidon2_B_24_0{};
    FF poseidon2_B_24_1{};
    FF poseidon2_B_24_2{};
    FF poseidon2_B_24_3{};
    FF poseidon2_B_25_0{};
    FF poseidon2_B_25_1{};
    FF poseidon2_B_25_2{};
    FF poseidon2_B_25_3{};
    FF poseidon2_B_26_0{};
    FF poseidon2_B_26_1{};
    FF poseidon2_B_26_2{};
    FF poseidon2_B_26_3{};
    FF poseidon2_B_27_0{};
    FF poseidon2_B_27_1{};
    FF poseidon2_B_27_2{};
    FF poseidon2_B_27_3{};
    FF poseidon2_B_28_0{};
    FF poseidon2_B_28_1{};
    FF poseidon2_B_28_2{};
    FF poseidon2_B_28_3{};
    FF poseidon2_B_29_0{};
    FF poseidon2_B_29_1{};
    FF poseidon2_B_29_2{};
    FF poseidon2_B_29_3{};
    FF poseidon2_B_30_0{};
    FF poseidon2_B_30_1{};
    FF poseidon2_B_30_2{};
    FF poseidon2_B_30_3{};
    FF poseidon2_B_31_0{};
    FF poseidon2_B_31_1{};
    FF poseidon2_B_31_2{};
    FF poseidon2_B_31_3{};
    FF poseidon2_B_32_0{};
    FF poseidon2_B_32_1{};
    FF poseidon2_B_32_2{};
    FF poseidon2_B_32_3{};
    FF poseidon2_B_33_0{};
    FF poseidon2_B_33_1{};
    FF poseidon2_B_33_2{};
    FF poseidon2_B_33_3{};
    FF poseidon2_B_34_0{};
    FF poseidon2_B_34_1{};
    FF poseidon2_B_34_2{};
    FF poseidon2_B_34_3{};
    FF poseidon2_B_35_0{};
    FF poseidon2_B_35_1{};
    FF poseidon2_B_35_2{};
    FF poseidon2_B_35_3{};
    FF poseidon2_B_36_0{};
    FF poseidon2_B_36_1{};
    FF poseidon2_B_36_2{};
    FF poseidon2_B_36_3{};
    FF poseidon2_B_37_0{};
    FF poseidon2_B_37_1{};
    FF poseidon2_B_37_2{};
    FF poseidon2_B_37_3{};
    FF poseidon2_B_38_0{};
    FF poseidon2_B_38_1{};
    FF poseidon2_B_38_2{};
    FF poseidon2_B_38_3{};
    FF poseidon2_B_39_0{};
    FF poseidon2_B_39_1{};
    FF poseidon2_B_39_2{};
    FF poseidon2_B_39_3{};
    FF poseidon2_B_40_0{};
    FF poseidon2_B_40_1{};
    FF poseidon2_B_40_2{};
    FF poseidon2_B_40_3{};
    FF poseidon2_B_41_0{};
    FF poseidon2_B_41_1{};
    FF poseidon2_B_41_2{};
    FF poseidon2_B_41_3{};
    FF poseidon2_B_42_0{};
    FF poseidon2_B_42_1{};
    FF poseidon2_B_42_2{};
    FF poseidon2_B_42_3{};
    FF poseidon2_B_43_0{};
    FF poseidon2_B_43_1{};
    FF poseidon2_B_43_2{};
    FF poseidon2_B_43_3{};
    FF poseidon2_B_44_0{};
    FF poseidon2_B_44_1{};
    FF poseidon2_B_44_2{};
    FF poseidon2_B_44_3{};
    FF poseidon2_B_45_0{};
    FF poseidon2_B_45_1{};
    FF poseidon2_B_45_2{};
    FF poseidon2_B_45_3{};
    FF poseidon2_B_46_0{};
    FF poseidon2_B_46_1{};
    FF poseidon2_B_46_2{};
    FF poseidon2_B_46_3{};
    FF poseidon2_B_47_0{};
    FF poseidon2_B_47_1{};
    FF poseidon2_B_47_2{};
    FF poseidon2_B_47_3{};
    FF poseidon2_B_48_0{};
    FF poseidon2_B_48_1{};
    FF poseidon2_B_48_2{};
    FF poseidon2_B_48_3{};
    FF poseidon2_B_49_0{};
    FF poseidon2_B_49_1{};
    FF poseidon2_B_49_2{};
    FF poseidon2_B_49_3{};
    FF poseidon2_B_4_0{};
    FF poseidon2_B_4_1{};
    FF poseidon2_B_4_2{};
    FF poseidon2_B_4_3{};
    FF poseidon2_B_50_0{};
    FF poseidon2_B_50_1{};
    FF poseidon2_B_50_2{};
    FF poseidon2_B_50_3{};
    FF poseidon2_B_51_0{};
    FF poseidon2_B_51_1{};
    FF poseidon2_B_51_2{};
    FF poseidon2_B_51_3{};
    FF poseidon2_B_52_0{};
    FF poseidon2_B_52_1{};
    FF poseidon2_B_52_2{};
    FF poseidon2_B_52_3{};
    FF poseidon2_B_53_0{};
    FF poseidon2_B_53_1{};
    FF poseidon2_B_53_2{};
    FF poseidon2_B_53_3{};
    FF poseidon2_B_54_0{};
    FF poseidon2_B_54_1{};
    FF poseidon2_B_54_2{};
    FF poseidon2_B_54_3{};
    FF poseidon2_B_55_0{};
    FF poseidon2_B_55_1{};
    FF poseidon2_B_55_2{};
    FF poseidon2_B_55_3{};
    FF poseidon2_B_56_0{};
    FF poseidon2_B_56_1{};
    FF poseidon2_B_56_2{};
    FF poseidon2_B_56_3{};
    FF poseidon2_B_57_0{};
    FF poseidon2_B_57_1{};
    FF poseidon2_B_57_2{};
    FF poseidon2_B_57_3{};
    FF poseidon2_B_58_0{};
    FF poseidon2_B_58_1{};
    FF poseidon2_B_58_2{};
    FF poseidon2_B_58_3{};
    FF poseidon2_B_59_0{};
    FF poseidon2_B_59_1{};
    FF poseidon2_B_59_2{};
    FF poseidon2_B_59_3{};
    FF poseidon2_B_5_0{};
    FF poseidon2_B_5_1{};
    FF poseidon2_B_5_2{};
    FF poseidon2_B_5_3{};
    FF poseidon2_B_6_0{};
    FF poseidon2_B_6_1{};
    FF poseidon2_B_6_2{};
    FF poseidon2_B_6_3{};
    FF poseidon2_B_7_0{};
    FF poseidon2_B_7_1{};
    FF poseidon2_B_7_2{};
    FF poseidon2_B_7_3{};
    FF poseidon2_B_8_0{};
    FF poseidon2_B_8_1{};
    FF poseidon2_B_8_2{};
    FF poseidon2_B_8_3{};
    FF poseidon2_B_9_0{};
    FF poseidon2_B_9_1{};
    FF poseidon2_B_9_2{};
    FF poseidon2_B_9_3{};
    FF poseidon2_EXT_LAYER_4{};
    FF poseidon2_EXT_LAYER_5{};
    FF poseidon2_EXT_LAYER_6{};
    FF poseidon2_EXT_LAYER_7{};
    FF poseidon2_T_0_4{};
    FF poseidon2_T_0_5{};
    FF poseidon2_T_0_6{};
    FF poseidon2_T_0_7{};
    FF poseidon2_T_1_4{};
    FF poseidon2_T_1_5{};
    FF poseidon2_T_1_6{};
    FF poseidon2_T_1_7{};
    FF poseidon2_T_2_4{};
    FF poseidon2_T_2_5{};
    FF poseidon2_T_2_6{};
    FF poseidon2_T_2_7{};
    FF poseidon2_T_3_4{};
    FF poseidon2_T_3_5{};
    FF poseidon2_T_3_6{};
    FF poseidon2_T_3_7{};
    FF poseidon2_T_60_4{};
    FF poseidon2_T_60_5{};
    FF poseidon2_T_60_6{};
    FF poseidon2_T_60_7{};
    FF poseidon2_T_61_4{};
    FF poseidon2_T_61_5{};
    FF poseidon2_T_61_6{};
    FF poseidon2_T_61_7{};
    FF poseidon2_T_62_4{};
    FF poseidon2_T_62_5{};
    FF poseidon2_T_62_6{};
    FF poseidon2_T_62_7{};
    FF poseidon2_T_63_4{};
    FF poseidon2_T_63_5{};
    FF poseidon2_T_63_6{};
    FF poseidon2_T_63_7{};
    FF poseidon2_a_0{};
    FF poseidon2_a_0_shift{};
    FF poseidon2_a_1{};
    FF poseidon2_a_1_shift{};
    FF poseidon2_a_2{};
    FF poseidon2_a_2_shift{};
    FF poseidon2_a_3{};
    FF poseidon2_a_3_shift{};
    FF poseidon2_input_addr{};
    FF poseidon2_mem_addr_a{};
    FF poseidon2_mem_addr_b{};
    FF poseidon2_mem_addr_c{};
    FF poseidon2_mem_addr_d{};
    FF poseidon2_mem_op{};
    FF poseidon2_output_addr{};
    FF poseidon2_r_in_tag{};
    FF poseidon2_read_line{};
    FF poseidon2_sel_poseidon_perm{};
    FF poseidon2_w_in_tag{};
    FF poseidon2_write_line{};
    FF poseidon2_write_line_shift{};

    [[maybe_unused]] static std::vector<std::string> names();
};

inline std::string get_relation_label_poseidon2(int index)
{
    switch (index) {}
    return std::to_string(index);
}

template <typename FF_> class poseidon2Impl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 276> SUBRELATION_PARTIAL_LENGTHS{
        3, 3, 3, 2, 2, 2, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 7, 7,
        7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7,
        7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8,
        7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7,
        8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7,
        7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7,
        7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8,
        7, 7, 7, 8, 7, 7, 7, 8, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 3, 3, 3, 3,
    };

    template <typename ContainerOverSubrelations, typename AllEntities>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& new_term,
                           [[maybe_unused]] const RelationParameters<FF>&,
                           [[maybe_unused]] const FF& scaling_factor)
    {

        // Contribution 0
        {
            Avm_DECLARE_VIEWS(0);

            auto tmp = (poseidon2_sel_poseidon_perm * (-poseidon2_sel_poseidon_perm + FF(1)));
            tmp *= scaling_factor;
            std::get<0>(evals) += tmp;
        }
        // Contribution 1
        {
            Avm_DECLARE_VIEWS(1);

            auto tmp = (poseidon2_read_line * (-poseidon2_read_line + FF(1)));
            tmp *= scaling_factor;
            std::get<1>(evals) += tmp;
        }
        // Contribution 2
        {
            Avm_DECLARE_VIEWS(2);

            auto tmp = (poseidon2_write_line * (-poseidon2_write_line + FF(1)));
            tmp *= scaling_factor;
            std::get<2>(evals) += tmp;
        }
        // Contribution 3
        {
            Avm_DECLARE_VIEWS(3);

            auto tmp = (poseidon2_read_line - poseidon2_sel_poseidon_perm);
            tmp *= scaling_factor;
            std::get<3>(evals) += tmp;
        }
        // Contribution 4
        {
            Avm_DECLARE_VIEWS(4);

            auto tmp = (poseidon2_write_line_shift - poseidon2_sel_poseidon_perm);
            tmp *= scaling_factor;
            std::get<4>(evals) += tmp;
        }
        // Contribution 5
        {
            Avm_DECLARE_VIEWS(5);

            auto tmp = (poseidon2_mem_op - (poseidon2_read_line + poseidon2_write_line));
            tmp *= scaling_factor;
            std::get<5>(evals) += tmp;
        }
        // Contribution 6
        {
            Avm_DECLARE_VIEWS(6);

            auto tmp = (poseidon2_read_line * (poseidon2_r_in_tag - FF(6)));
            tmp *= scaling_factor;
            std::get<6>(evals) += tmp;
        }
        // Contribution 7
        {
            Avm_DECLARE_VIEWS(7);

            auto tmp = (poseidon2_write_line * (poseidon2_w_in_tag - FF(6)));
            tmp *= scaling_factor;
            std::get<7>(evals) += tmp;
        }
        // Contribution 8
        {
            Avm_DECLARE_VIEWS(8);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_mem_addr_a - ((poseidon2_read_line * poseidon2_input_addr) +
                                                 (poseidon2_write_line * poseidon2_output_addr))));
            tmp *= scaling_factor;
            std::get<8>(evals) += tmp;
        }
        // Contribution 9
        {
            Avm_DECLARE_VIEWS(9);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_mem_addr_b -
                  (((poseidon2_read_line * poseidon2_input_addr) + (poseidon2_write_line * poseidon2_output_addr)) +
                   FF(1))));
            tmp *= scaling_factor;
            std::get<9>(evals) += tmp;
        }
        // Contribution 10
        {
            Avm_DECLARE_VIEWS(10);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_mem_addr_c -
                  (((poseidon2_read_line * poseidon2_input_addr) + (poseidon2_write_line * poseidon2_output_addr)) +
                   FF(2))));
            tmp *= scaling_factor;
            std::get<10>(evals) += tmp;
        }
        // Contribution 11
        {
            Avm_DECLARE_VIEWS(11);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_mem_addr_d -
                  (((poseidon2_read_line * poseidon2_input_addr) + (poseidon2_write_line * poseidon2_output_addr)) +
                   FF(3))));
            tmp *= scaling_factor;
            std::get<11>(evals) += tmp;
        }
        // Contribution 12
        {
            Avm_DECLARE_VIEWS(12);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_EXT_LAYER_4 - (((poseidon2_a_2 + poseidon2_a_3) * FF(4)) +
                                                  ((poseidon2_a_3 * FF(2)) + (poseidon2_a_0 + poseidon2_a_1)))));
            tmp *= scaling_factor;
            std::get<12>(evals) += tmp;
        }
        // Contribution 13
        {
            Avm_DECLARE_VIEWS(13);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_EXT_LAYER_5 - (((poseidon2_a_0 + poseidon2_a_1) * FF(4)) +
                                                  ((poseidon2_a_1 * FF(2)) + (poseidon2_a_2 + poseidon2_a_3)))));
            tmp *= scaling_factor;
            std::get<13>(evals) += tmp;
        }
        // Contribution 14
        {
            Avm_DECLARE_VIEWS(14);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_EXT_LAYER_6 -
                         (((poseidon2_a_3 * FF(2)) + (poseidon2_a_0 + poseidon2_a_1)) + poseidon2_EXT_LAYER_5)));
            tmp *= scaling_factor;
            std::get<14>(evals) += tmp;
        }
        // Contribution 15
        {
            Avm_DECLARE_VIEWS(15);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_EXT_LAYER_7 -
                         (((poseidon2_a_1 * FF(2)) + (poseidon2_a_2 + poseidon2_a_3)) + poseidon2_EXT_LAYER_4)));
            tmp *= scaling_factor;
            std::get<15>(evals) += tmp;
        }
        // Contribution 16
        {
            Avm_DECLARE_VIEWS(16);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_0_4 - ((((((((poseidon2_EXT_LAYER_7 + FF(uint256_t{ 4466505105966356650UL,
                                                                                         4686185096558265002UL,
                                                                                         16210260819355521378UL,
                                                                                         1844031548168280073UL })) *
                                                  (poseidon2_EXT_LAYER_7 + FF(uint256_t{ 4466505105966356650UL,
                                                                                         4686185096558265002UL,
                                                                                         16210260819355521378UL,
                                                                                         1844031548168280073UL }))) *
                                                 (poseidon2_EXT_LAYER_7 + FF(uint256_t{ 4466505105966356650UL,
                                                                                        4686185096558265002UL,
                                                                                        16210260819355521378UL,
                                                                                        1844031548168280073UL }))) *
                                                (poseidon2_EXT_LAYER_7 + FF(uint256_t{ 4466505105966356650UL,
                                                                                       4686185096558265002UL,
                                                                                       16210260819355521378UL,
                                                                                       1844031548168280073UL }))) *
                                               (poseidon2_EXT_LAYER_7 + FF(uint256_t{ 4466505105966356650UL,
                                                                                      4686185096558265002UL,
                                                                                      16210260819355521378UL,
                                                                                      1844031548168280073UL }))) +
                                              (((((poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                         5581154705073500415UL,
                                                                                         1229208533183169201UL,
                                                                                         1549225070791782920UL })) *
                                                  (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                         5581154705073500415UL,
                                                                                         1229208533183169201UL,
                                                                                         1549225070791782920UL }))) *
                                                 (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                        5581154705073500415UL,
                                                                                        1229208533183169201UL,
                                                                                        1549225070791782920UL }))) *
                                                (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                       5581154705073500415UL,
                                                                                       1229208533183169201UL,
                                                                                       1549225070791782920UL }))) *
                                               (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                      5581154705073500415UL,
                                                                                      1229208533183169201UL,
                                                                                      1549225070791782920UL })))) *
                                             FF(4)) +
                                            (((((((poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                         5581154705073500415UL,
                                                                                         1229208533183169201UL,
                                                                                         1549225070791782920UL })) *
                                                  (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                         5581154705073500415UL,
                                                                                         1229208533183169201UL,
                                                                                         1549225070791782920UL }))) *
                                                 (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                        5581154705073500415UL,
                                                                                        1229208533183169201UL,
                                                                                        1549225070791782920UL }))) *
                                                (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                       5581154705073500415UL,
                                                                                       1229208533183169201UL,
                                                                                       1549225070791782920UL }))) *
                                               (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                      5581154705073500415UL,
                                                                                      1229208533183169201UL,
                                                                                      1549225070791782920UL }))) *
                                              FF(2)) +
                                             ((((((poseidon2_EXT_LAYER_6 + FF(uint256_t{ 10018390284920759269UL,
                                                                                         196898842818127395UL,
                                                                                         5249540449481148995UL,
                                                                                         1853312570062057576UL })) *
                                                  (poseidon2_EXT_LAYER_6 + FF(uint256_t{ 10018390284920759269UL,
                                                                                         196898842818127395UL,
                                                                                         5249540449481148995UL,
                                                                                         1853312570062057576UL }))) *
                                                 (poseidon2_EXT_LAYER_6 + FF(uint256_t{ 10018390284920759269UL,
                                                                                        196898842818127395UL,
                                                                                        5249540449481148995UL,
                                                                                        1853312570062057576UL }))) *
                                                (poseidon2_EXT_LAYER_6 + FF(uint256_t{ 10018390284920759269UL,
                                                                                       196898842818127395UL,
                                                                                       5249540449481148995UL,
                                                                                       1853312570062057576UL }))) *
                                               (poseidon2_EXT_LAYER_6 + FF(uint256_t{ 10018390284920759269UL,
                                                                                      196898842818127395UL,
                                                                                      5249540449481148995UL,
                                                                                      1853312570062057576UL }))) +
                                              (((((poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                         2372038863109147677UL,
                                                                                         8230667498854222355UL,
                                                                                         2764611904404804029UL })) *
                                                  (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                         2372038863109147677UL,
                                                                                         8230667498854222355UL,
                                                                                         2764611904404804029UL }))) *
                                                 (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                        2372038863109147677UL,
                                                                                        8230667498854222355UL,
                                                                                        2764611904404804029UL }))) *
                                                (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                       2372038863109147677UL,
                                                                                       8230667498854222355UL,
                                                                                       2764611904404804029UL }))) *
                                               (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                      2372038863109147677UL,
                                                                                      8230667498854222355UL,
                                                                                      2764611904404804029UL }))))))));
            tmp *= scaling_factor;
            std::get<16>(evals) += tmp;
        }
        // Contribution 17
        {
            Avm_DECLARE_VIEWS(17);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_0_5 - ((((((((poseidon2_EXT_LAYER_6 + FF(uint256_t{ 10018390284920759269UL,
                                                                                         196898842818127395UL,
                                                                                         5249540449481148995UL,
                                                                                         1853312570062057576UL })) *
                                                  (poseidon2_EXT_LAYER_6 + FF(uint256_t{ 10018390284920759269UL,
                                                                                         196898842818127395UL,
                                                                                         5249540449481148995UL,
                                                                                         1853312570062057576UL }))) *
                                                 (poseidon2_EXT_LAYER_6 + FF(uint256_t{ 10018390284920759269UL,
                                                                                        196898842818127395UL,
                                                                                        5249540449481148995UL,
                                                                                        1853312570062057576UL }))) *
                                                (poseidon2_EXT_LAYER_6 + FF(uint256_t{ 10018390284920759269UL,
                                                                                       196898842818127395UL,
                                                                                       5249540449481148995UL,
                                                                                       1853312570062057576UL }))) *
                                               (poseidon2_EXT_LAYER_6 + FF(uint256_t{ 10018390284920759269UL,
                                                                                      196898842818127395UL,
                                                                                      5249540449481148995UL,
                                                                                      1853312570062057576UL }))) +
                                              (((((poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                         2372038863109147677UL,
                                                                                         8230667498854222355UL,
                                                                                         2764611904404804029UL })) *
                                                  (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                         2372038863109147677UL,
                                                                                         8230667498854222355UL,
                                                                                         2764611904404804029UL }))) *
                                                 (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                        2372038863109147677UL,
                                                                                        8230667498854222355UL,
                                                                                        2764611904404804029UL }))) *
                                                (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                       2372038863109147677UL,
                                                                                       8230667498854222355UL,
                                                                                       2764611904404804029UL }))) *
                                               (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                      2372038863109147677UL,
                                                                                      8230667498854222355UL,
                                                                                      2764611904404804029UL })))) *
                                             FF(4)) +
                                            (((((((poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                         2372038863109147677UL,
                                                                                         8230667498854222355UL,
                                                                                         2764611904404804029UL })) *
                                                  (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                         2372038863109147677UL,
                                                                                         8230667498854222355UL,
                                                                                         2764611904404804029UL }))) *
                                                 (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                        2372038863109147677UL,
                                                                                        8230667498854222355UL,
                                                                                        2764611904404804029UL }))) *
                                                (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                       2372038863109147677UL,
                                                                                       8230667498854222355UL,
                                                                                       2764611904404804029UL }))) *
                                               (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                      2372038863109147677UL,
                                                                                      8230667498854222355UL,
                                                                                      2764611904404804029UL }))) *
                                              FF(2)) +
                                             ((((((poseidon2_EXT_LAYER_7 + FF(uint256_t{ 4466505105966356650UL,
                                                                                         4686185096558265002UL,
                                                                                         16210260819355521378UL,
                                                                                         1844031548168280073UL })) *
                                                  (poseidon2_EXT_LAYER_7 + FF(uint256_t{ 4466505105966356650UL,
                                                                                         4686185096558265002UL,
                                                                                         16210260819355521378UL,
                                                                                         1844031548168280073UL }))) *
                                                 (poseidon2_EXT_LAYER_7 + FF(uint256_t{ 4466505105966356650UL,
                                                                                        4686185096558265002UL,
                                                                                        16210260819355521378UL,
                                                                                        1844031548168280073UL }))) *
                                                (poseidon2_EXT_LAYER_7 + FF(uint256_t{ 4466505105966356650UL,
                                                                                       4686185096558265002UL,
                                                                                       16210260819355521378UL,
                                                                                       1844031548168280073UL }))) *
                                               (poseidon2_EXT_LAYER_7 + FF(uint256_t{ 4466505105966356650UL,
                                                                                      4686185096558265002UL,
                                                                                      16210260819355521378UL,
                                                                                      1844031548168280073UL }))) +
                                              (((((poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                         5581154705073500415UL,
                                                                                         1229208533183169201UL,
                                                                                         1549225070791782920UL })) *
                                                  (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                         5581154705073500415UL,
                                                                                         1229208533183169201UL,
                                                                                         1549225070791782920UL }))) *
                                                 (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                        5581154705073500415UL,
                                                                                        1229208533183169201UL,
                                                                                        1549225070791782920UL }))) *
                                                (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                       5581154705073500415UL,
                                                                                       1229208533183169201UL,
                                                                                       1549225070791782920UL }))) *
                                               (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                      5581154705073500415UL,
                                                                                      1229208533183169201UL,
                                                                                      1549225070791782920UL }))))))));
            tmp *= scaling_factor;
            std::get<17>(evals) += tmp;
        }
        // Contribution 18
        {
            Avm_DECLARE_VIEWS(18);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_0_6 - ((((((((poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                         5581154705073500415UL,
                                                                                         1229208533183169201UL,
                                                                                         1549225070791782920UL })) *
                                                  (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                         5581154705073500415UL,
                                                                                         1229208533183169201UL,
                                                                                         1549225070791782920UL }))) *
                                                 (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                        5581154705073500415UL,
                                                                                        1229208533183169201UL,
                                                                                        1549225070791782920UL }))) *
                                                (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                       5581154705073500415UL,
                                                                                       1229208533183169201UL,
                                                                                       1549225070791782920UL }))) *
                                               (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                      5581154705073500415UL,
                                                                                      1229208533183169201UL,
                                                                                      1549225070791782920UL }))) *
                                              FF(2)) +
                                             ((((((poseidon2_EXT_LAYER_6 + FF(uint256_t{ 10018390284920759269UL,
                                                                                         196898842818127395UL,
                                                                                         5249540449481148995UL,
                                                                                         1853312570062057576UL })) *
                                                  (poseidon2_EXT_LAYER_6 + FF(uint256_t{ 10018390284920759269UL,
                                                                                         196898842818127395UL,
                                                                                         5249540449481148995UL,
                                                                                         1853312570062057576UL }))) *
                                                 (poseidon2_EXT_LAYER_6 + FF(uint256_t{ 10018390284920759269UL,
                                                                                        196898842818127395UL,
                                                                                        5249540449481148995UL,
                                                                                        1853312570062057576UL }))) *
                                                (poseidon2_EXT_LAYER_6 + FF(uint256_t{ 10018390284920759269UL,
                                                                                       196898842818127395UL,
                                                                                       5249540449481148995UL,
                                                                                       1853312570062057576UL }))) *
                                               (poseidon2_EXT_LAYER_6 + FF(uint256_t{ 10018390284920759269UL,
                                                                                      196898842818127395UL,
                                                                                      5249540449481148995UL,
                                                                                      1853312570062057576UL }))) +
                                              (((((poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                         2372038863109147677UL,
                                                                                         8230667498854222355UL,
                                                                                         2764611904404804029UL })) *
                                                  (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                         2372038863109147677UL,
                                                                                         8230667498854222355UL,
                                                                                         2764611904404804029UL }))) *
                                                 (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                        2372038863109147677UL,
                                                                                        8230667498854222355UL,
                                                                                        2764611904404804029UL }))) *
                                                (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                       2372038863109147677UL,
                                                                                       8230667498854222355UL,
                                                                                       2764611904404804029UL }))) *
                                               (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                      2372038863109147677UL,
                                                                                      8230667498854222355UL,
                                                                                      2764611904404804029UL }))))) +
                                            poseidon2_T_0_5)));
            tmp *= scaling_factor;
            std::get<18>(evals) += tmp;
        }
        // Contribution 19
        {
            Avm_DECLARE_VIEWS(19);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_0_7 - ((((((((poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                         2372038863109147677UL,
                                                                                         8230667498854222355UL,
                                                                                         2764611904404804029UL })) *
                                                  (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                         2372038863109147677UL,
                                                                                         8230667498854222355UL,
                                                                                         2764611904404804029UL }))) *
                                                 (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                        2372038863109147677UL,
                                                                                        8230667498854222355UL,
                                                                                        2764611904404804029UL }))) *
                                                (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                       2372038863109147677UL,
                                                                                       8230667498854222355UL,
                                                                                       2764611904404804029UL }))) *
                                               (poseidon2_EXT_LAYER_5 + FF(uint256_t{ 12486221224710452438UL,
                                                                                      2372038863109147677UL,
                                                                                      8230667498854222355UL,
                                                                                      2764611904404804029UL }))) *
                                              FF(2)) +
                                             ((((((poseidon2_EXT_LAYER_7 + FF(uint256_t{ 4466505105966356650UL,
                                                                                         4686185096558265002UL,
                                                                                         16210260819355521378UL,
                                                                                         1844031548168280073UL })) *
                                                  (poseidon2_EXT_LAYER_7 + FF(uint256_t{ 4466505105966356650UL,
                                                                                         4686185096558265002UL,
                                                                                         16210260819355521378UL,
                                                                                         1844031548168280073UL }))) *
                                                 (poseidon2_EXT_LAYER_7 + FF(uint256_t{ 4466505105966356650UL,
                                                                                        4686185096558265002UL,
                                                                                        16210260819355521378UL,
                                                                                        1844031548168280073UL }))) *
                                                (poseidon2_EXT_LAYER_7 + FF(uint256_t{ 4466505105966356650UL,
                                                                                       4686185096558265002UL,
                                                                                       16210260819355521378UL,
                                                                                       1844031548168280073UL }))) *
                                               (poseidon2_EXT_LAYER_7 + FF(uint256_t{ 4466505105966356650UL,
                                                                                      4686185096558265002UL,
                                                                                      16210260819355521378UL,
                                                                                      1844031548168280073UL }))) +
                                              (((((poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                         5581154705073500415UL,
                                                                                         1229208533183169201UL,
                                                                                         1549225070791782920UL })) *
                                                  (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                         5581154705073500415UL,
                                                                                         1229208533183169201UL,
                                                                                         1549225070791782920UL }))) *
                                                 (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                        5581154705073500415UL,
                                                                                        1229208533183169201UL,
                                                                                        1549225070791782920UL }))) *
                                                (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                       5581154705073500415UL,
                                                                                       1229208533183169201UL,
                                                                                       1549225070791782920UL }))) *
                                               (poseidon2_EXT_LAYER_4 + FF(uint256_t{ 15002325471271702008UL,
                                                                                      5581154705073500415UL,
                                                                                      1229208533183169201UL,
                                                                                      1549225070791782920UL }))))) +
                                            poseidon2_T_0_4)));
            tmp *= scaling_factor;
            std::get<19>(evals) += tmp;
        }
        // Contribution 20
        {
            Avm_DECLARE_VIEWS(20);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_1_4 - ((((((((poseidon2_T_0_7 + FF(uint256_t{ 14339023814126516630UL,
                                                                                   12239068001133297662UL,
                                                                                   428134084092645147UL,
                                                                                   2673682960814460689UL })) *
                                                  (poseidon2_T_0_7 + FF(uint256_t{ 14339023814126516630UL,
                                                                                   12239068001133297662UL,
                                                                                   428134084092645147UL,
                                                                                   2673682960814460689UL }))) *
                                                 (poseidon2_T_0_7 + FF(uint256_t{ 14339023814126516630UL,
                                                                                  12239068001133297662UL,
                                                                                  428134084092645147UL,
                                                                                  2673682960814460689UL }))) *
                                                (poseidon2_T_0_7 + FF(uint256_t{ 14339023814126516630UL,
                                                                                 12239068001133297662UL,
                                                                                 428134084092645147UL,
                                                                                 2673682960814460689UL }))) *
                                               (poseidon2_T_0_7 + FF(uint256_t{ 14339023814126516630UL,
                                                                                12239068001133297662UL,
                                                                                428134084092645147UL,
                                                                                2673682960814460689UL }))) +
                                              (((((poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                   17923963059035301363UL,
                                                                                   10985380589240272449UL,
                                                                                   1430464474809378870UL })) *
                                                  (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                   17923963059035301363UL,
                                                                                   10985380589240272449UL,
                                                                                   1430464474809378870UL }))) *
                                                 (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                  17923963059035301363UL,
                                                                                  10985380589240272449UL,
                                                                                  1430464474809378870UL }))) *
                                                (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                 17923963059035301363UL,
                                                                                 10985380589240272449UL,
                                                                                 1430464474809378870UL }))) *
                                               (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                17923963059035301363UL,
                                                                                10985380589240272449UL,
                                                                                1430464474809378870UL })))) *
                                             FF(4)) +
                                            (((((((poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                   17923963059035301363UL,
                                                                                   10985380589240272449UL,
                                                                                   1430464474809378870UL })) *
                                                  (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                   17923963059035301363UL,
                                                                                   10985380589240272449UL,
                                                                                   1430464474809378870UL }))) *
                                                 (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                  17923963059035301363UL,
                                                                                  10985380589240272449UL,
                                                                                  1430464474809378870UL }))) *
                                                (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                 17923963059035301363UL,
                                                                                 10985380589240272449UL,
                                                                                 1430464474809378870UL }))) *
                                               (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                17923963059035301363UL,
                                                                                10985380589240272449UL,
                                                                                1430464474809378870UL }))) *
                                              FF(2)) +
                                             ((((((poseidon2_T_0_6 + FF(uint256_t{ 18309653156114024706UL,
                                                                                   798761732958817262UL,
                                                                                   6904962453156279281UL,
                                                                                   3335412762186210716UL })) *
                                                  (poseidon2_T_0_6 + FF(uint256_t{ 18309653156114024706UL,
                                                                                   798761732958817262UL,
                                                                                   6904962453156279281UL,
                                                                                   3335412762186210716UL }))) *
                                                 (poseidon2_T_0_6 + FF(uint256_t{ 18309653156114024706UL,
                                                                                  798761732958817262UL,
                                                                                  6904962453156279281UL,
                                                                                  3335412762186210716UL }))) *
                                                (poseidon2_T_0_6 + FF(uint256_t{ 18309653156114024706UL,
                                                                                 798761732958817262UL,
                                                                                 6904962453156279281UL,
                                                                                 3335412762186210716UL }))) *
                                               (poseidon2_T_0_6 + FF(uint256_t{ 18309653156114024706UL,
                                                                                798761732958817262UL,
                                                                                6904962453156279281UL,
                                                                                3335412762186210716UL }))) +
                                              (((((poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                   14640933461146357672UL,
                                                                                   957840840567621315UL,
                                                                                   1024001058677493842UL })) *
                                                  (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                   14640933461146357672UL,
                                                                                   957840840567621315UL,
                                                                                   1024001058677493842UL }))) *
                                                 (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                  14640933461146357672UL,
                                                                                  957840840567621315UL,
                                                                                  1024001058677493842UL }))) *
                                                (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                 14640933461146357672UL,
                                                                                 957840840567621315UL,
                                                                                 1024001058677493842UL }))) *
                                               (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                14640933461146357672UL,
                                                                                957840840567621315UL,
                                                                                1024001058677493842UL }))))))));
            tmp *= scaling_factor;
            std::get<20>(evals) += tmp;
        }
        // Contribution 21
        {
            Avm_DECLARE_VIEWS(21);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_1_5 - ((((((((poseidon2_T_0_6 + FF(uint256_t{ 18309653156114024706UL,
                                                                                   798761732958817262UL,
                                                                                   6904962453156279281UL,
                                                                                   3335412762186210716UL })) *
                                                  (poseidon2_T_0_6 + FF(uint256_t{ 18309653156114024706UL,
                                                                                   798761732958817262UL,
                                                                                   6904962453156279281UL,
                                                                                   3335412762186210716UL }))) *
                                                 (poseidon2_T_0_6 + FF(uint256_t{ 18309653156114024706UL,
                                                                                  798761732958817262UL,
                                                                                  6904962453156279281UL,
                                                                                  3335412762186210716UL }))) *
                                                (poseidon2_T_0_6 + FF(uint256_t{ 18309653156114024706UL,
                                                                                 798761732958817262UL,
                                                                                 6904962453156279281UL,
                                                                                 3335412762186210716UL }))) *
                                               (poseidon2_T_0_6 + FF(uint256_t{ 18309653156114024706UL,
                                                                                798761732958817262UL,
                                                                                6904962453156279281UL,
                                                                                3335412762186210716UL }))) +
                                              (((((poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                   14640933461146357672UL,
                                                                                   957840840567621315UL,
                                                                                   1024001058677493842UL })) *
                                                  (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                   14640933461146357672UL,
                                                                                   957840840567621315UL,
                                                                                   1024001058677493842UL }))) *
                                                 (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                  14640933461146357672UL,
                                                                                  957840840567621315UL,
                                                                                  1024001058677493842UL }))) *
                                                (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                 14640933461146357672UL,
                                                                                 957840840567621315UL,
                                                                                 1024001058677493842UL }))) *
                                               (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                14640933461146357672UL,
                                                                                957840840567621315UL,
                                                                                1024001058677493842UL })))) *
                                             FF(4)) +
                                            (((((((poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                   14640933461146357672UL,
                                                                                   957840840567621315UL,
                                                                                   1024001058677493842UL })) *
                                                  (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                   14640933461146357672UL,
                                                                                   957840840567621315UL,
                                                                                   1024001058677493842UL }))) *
                                                 (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                  14640933461146357672UL,
                                                                                  957840840567621315UL,
                                                                                  1024001058677493842UL }))) *
                                                (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                 14640933461146357672UL,
                                                                                 957840840567621315UL,
                                                                                 1024001058677493842UL }))) *
                                               (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                14640933461146357672UL,
                                                                                957840840567621315UL,
                                                                                1024001058677493842UL }))) *
                                              FF(2)) +
                                             ((((((poseidon2_T_0_7 + FF(uint256_t{ 14339023814126516630UL,
                                                                                   12239068001133297662UL,
                                                                                   428134084092645147UL,
                                                                                   2673682960814460689UL })) *
                                                  (poseidon2_T_0_7 + FF(uint256_t{ 14339023814126516630UL,
                                                                                   12239068001133297662UL,
                                                                                   428134084092645147UL,
                                                                                   2673682960814460689UL }))) *
                                                 (poseidon2_T_0_7 + FF(uint256_t{ 14339023814126516630UL,
                                                                                  12239068001133297662UL,
                                                                                  428134084092645147UL,
                                                                                  2673682960814460689UL }))) *
                                                (poseidon2_T_0_7 + FF(uint256_t{ 14339023814126516630UL,
                                                                                 12239068001133297662UL,
                                                                                 428134084092645147UL,
                                                                                 2673682960814460689UL }))) *
                                               (poseidon2_T_0_7 + FF(uint256_t{ 14339023814126516630UL,
                                                                                12239068001133297662UL,
                                                                                428134084092645147UL,
                                                                                2673682960814460689UL }))) +
                                              (((((poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                   17923963059035301363UL,
                                                                                   10985380589240272449UL,
                                                                                   1430464474809378870UL })) *
                                                  (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                   17923963059035301363UL,
                                                                                   10985380589240272449UL,
                                                                                   1430464474809378870UL }))) *
                                                 (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                  17923963059035301363UL,
                                                                                  10985380589240272449UL,
                                                                                  1430464474809378870UL }))) *
                                                (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                 17923963059035301363UL,
                                                                                 10985380589240272449UL,
                                                                                 1430464474809378870UL }))) *
                                               (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                17923963059035301363UL,
                                                                                10985380589240272449UL,
                                                                                1430464474809378870UL }))))))));
            tmp *= scaling_factor;
            std::get<21>(evals) += tmp;
        }
        // Contribution 22
        {
            Avm_DECLARE_VIEWS(22);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_1_6 - ((((((((poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                   17923963059035301363UL,
                                                                                   10985380589240272449UL,
                                                                                   1430464474809378870UL })) *
                                                  (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                   17923963059035301363UL,
                                                                                   10985380589240272449UL,
                                                                                   1430464474809378870UL }))) *
                                                 (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                  17923963059035301363UL,
                                                                                  10985380589240272449UL,
                                                                                  1430464474809378870UL }))) *
                                                (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                 17923963059035301363UL,
                                                                                 10985380589240272449UL,
                                                                                 1430464474809378870UL }))) *
                                               (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                17923963059035301363UL,
                                                                                10985380589240272449UL,
                                                                                1430464474809378870UL }))) *
                                              FF(2)) +
                                             ((((((poseidon2_T_0_6 + FF(uint256_t{ 18309653156114024706UL,
                                                                                   798761732958817262UL,
                                                                                   6904962453156279281UL,
                                                                                   3335412762186210716UL })) *
                                                  (poseidon2_T_0_6 + FF(uint256_t{ 18309653156114024706UL,
                                                                                   798761732958817262UL,
                                                                                   6904962453156279281UL,
                                                                                   3335412762186210716UL }))) *
                                                 (poseidon2_T_0_6 + FF(uint256_t{ 18309653156114024706UL,
                                                                                  798761732958817262UL,
                                                                                  6904962453156279281UL,
                                                                                  3335412762186210716UL }))) *
                                                (poseidon2_T_0_6 + FF(uint256_t{ 18309653156114024706UL,
                                                                                 798761732958817262UL,
                                                                                 6904962453156279281UL,
                                                                                 3335412762186210716UL }))) *
                                               (poseidon2_T_0_6 + FF(uint256_t{ 18309653156114024706UL,
                                                                                798761732958817262UL,
                                                                                6904962453156279281UL,
                                                                                3335412762186210716UL }))) +
                                              (((((poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                   14640933461146357672UL,
                                                                                   957840840567621315UL,
                                                                                   1024001058677493842UL })) *
                                                  (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                   14640933461146357672UL,
                                                                                   957840840567621315UL,
                                                                                   1024001058677493842UL }))) *
                                                 (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                  14640933461146357672UL,
                                                                                  957840840567621315UL,
                                                                                  1024001058677493842UL }))) *
                                                (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                 14640933461146357672UL,
                                                                                 957840840567621315UL,
                                                                                 1024001058677493842UL }))) *
                                               (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                14640933461146357672UL,
                                                                                957840840567621315UL,
                                                                                1024001058677493842UL }))))) +
                                            poseidon2_T_1_5)));
            tmp *= scaling_factor;
            std::get<22>(evals) += tmp;
        }
        // Contribution 23
        {
            Avm_DECLARE_VIEWS(23);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_1_7 - ((((((((poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                   14640933461146357672UL,
                                                                                   957840840567621315UL,
                                                                                   1024001058677493842UL })) *
                                                  (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                   14640933461146357672UL,
                                                                                   957840840567621315UL,
                                                                                   1024001058677493842UL }))) *
                                                 (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                  14640933461146357672UL,
                                                                                  957840840567621315UL,
                                                                                  1024001058677493842UL }))) *
                                                (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                 14640933461146357672UL,
                                                                                 957840840567621315UL,
                                                                                 1024001058677493842UL }))) *
                                               (poseidon2_T_0_5 + FF(uint256_t{ 2824096028161810206UL,
                                                                                14640933461146357672UL,
                                                                                957840840567621315UL,
                                                                                1024001058677493842UL }))) *
                                              FF(2)) +
                                             ((((((poseidon2_T_0_7 + FF(uint256_t{ 14339023814126516630UL,
                                                                                   12239068001133297662UL,
                                                                                   428134084092645147UL,
                                                                                   2673682960814460689UL })) *
                                                  (poseidon2_T_0_7 + FF(uint256_t{ 14339023814126516630UL,
                                                                                   12239068001133297662UL,
                                                                                   428134084092645147UL,
                                                                                   2673682960814460689UL }))) *
                                                 (poseidon2_T_0_7 + FF(uint256_t{ 14339023814126516630UL,
                                                                                  12239068001133297662UL,
                                                                                  428134084092645147UL,
                                                                                  2673682960814460689UL }))) *
                                                (poseidon2_T_0_7 + FF(uint256_t{ 14339023814126516630UL,
                                                                                 12239068001133297662UL,
                                                                                 428134084092645147UL,
                                                                                 2673682960814460689UL }))) *
                                               (poseidon2_T_0_7 + FF(uint256_t{ 14339023814126516630UL,
                                                                                12239068001133297662UL,
                                                                                428134084092645147UL,
                                                                                2673682960814460689UL }))) +
                                              (((((poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                   17923963059035301363UL,
                                                                                   10985380589240272449UL,
                                                                                   1430464474809378870UL })) *
                                                  (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                   17923963059035301363UL,
                                                                                   10985380589240272449UL,
                                                                                   1430464474809378870UL }))) *
                                                 (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                  17923963059035301363UL,
                                                                                  10985380589240272449UL,
                                                                                  1430464474809378870UL }))) *
                                                (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                 17923963059035301363UL,
                                                                                 10985380589240272449UL,
                                                                                 1430464474809378870UL }))) *
                                               (poseidon2_T_0_4 + FF(uint256_t{ 6214865908119297870UL,
                                                                                17923963059035301363UL,
                                                                                10985380589240272449UL,
                                                                                1430464474809378870UL }))))) +
                                            poseidon2_T_1_4)));
            tmp *= scaling_factor;
            std::get<23>(evals) += tmp;
        }
        // Contribution 24
        {
            Avm_DECLARE_VIEWS(24);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_2_4 - ((((((((poseidon2_T_1_7 + FF(uint256_t{ 9646436663147525449UL,
                                                                                   3404572679246369876UL,
                                                                                   2350204275212843361UL,
                                                                                   1069216089054537871UL })) *
                                                  (poseidon2_T_1_7 + FF(uint256_t{ 9646436663147525449UL,
                                                                                   3404572679246369876UL,
                                                                                   2350204275212843361UL,
                                                                                   1069216089054537871UL }))) *
                                                 (poseidon2_T_1_7 + FF(uint256_t{ 9646436663147525449UL,
                                                                                  3404572679246369876UL,
                                                                                  2350204275212843361UL,
                                                                                  1069216089054537871UL }))) *
                                                (poseidon2_T_1_7 + FF(uint256_t{ 9646436663147525449UL,
                                                                                 3404572679246369876UL,
                                                                                 2350204275212843361UL,
                                                                                 1069216089054537871UL }))) *
                                               (poseidon2_T_1_7 + FF(uint256_t{ 9646436663147525449UL,
                                                                                3404572679246369876UL,
                                                                                2350204275212843361UL,
                                                                                1069216089054537871UL }))) +
                                              (((((poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                                                   4245857056683447103UL,
                                                                                   2426504795124362174UL,
                                                                                   350059533408463330UL })) *
                                                  (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                                                   4245857056683447103UL,
                                                                                   2426504795124362174UL,
                                                                                   350059533408463330UL }))) *
                                                 (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                                                  4245857056683447103UL,
                                                                                  2426504795124362174UL,
                                                                                  350059533408463330UL }))) *
                                                (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                                                 4245857056683447103UL,
                                                                                 2426504795124362174UL,
                                                                                 350059533408463330UL }))) *
                                               (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                                                4245857056683447103UL,
                                                                                2426504795124362174UL,
                                                                                350059533408463330UL })))) *
                                             FF(4)) +
                                            (((((((poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                                                   4245857056683447103UL,
                                                                                   2426504795124362174UL,
                                                                                   350059533408463330UL })) *
                                                  (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                                                   4245857056683447103UL,
                                                                                   2426504795124362174UL,
                                                                                   350059533408463330UL }))) *
                                                 (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                                                  4245857056683447103UL,
                                                                                  2426504795124362174UL,
                                                                                  350059533408463330UL }))) *
                                                (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                                                 4245857056683447103UL,
                                                                                 2426504795124362174UL,
                                                                                 350059533408463330UL }))) *
                                               (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                                                4245857056683447103UL,
                                                                                2426504795124362174UL,
                                                                                350059533408463330UL }))) *
                                              FF(2)) +
                                             ((((((poseidon2_T_1_6 + FF(uint256_t{ 5109255232332580664UL,
                                                                                   11913027714091798733UL,
                                                                                   4449570166290740355UL,
                                                                                   864862123557185234UL })) *
                                                  (poseidon2_T_1_6 + FF(uint256_t{ 5109255232332580664UL,
                                                                                   11913027714091798733UL,
                                                                                   4449570166290740355UL,
                                                                                   864862123557185234UL }))) *
                                                 (poseidon2_T_1_6 + FF(uint256_t{ 5109255232332580664UL,
                                                                                  11913027714091798733UL,
                                                                                  4449570166290740355UL,
                                                                                  864862123557185234UL }))) *
                                                (poseidon2_T_1_6 + FF(uint256_t{ 5109255232332580664UL,
                                                                                 11913027714091798733UL,
                                                                                 4449570166290740355UL,
                                                                                 864862123557185234UL }))) *
                                               (poseidon2_T_1_6 + FF(uint256_t{ 5109255232332580664UL,
                                                                                11913027714091798733UL,
                                                                                4449570166290740355UL,
                                                                                864862123557185234UL }))) +
                                              (((((poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                                                   354488099726909104UL,
                                                                                   115174089281514891UL,
                                                                                   80808271106704719UL })) *
                                                  (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                                                   354488099726909104UL,
                                                                                   115174089281514891UL,
                                                                                   80808271106704719UL }))) *
                                                 (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                                                  354488099726909104UL,
                                                                                  115174089281514891UL,
                                                                                  80808271106704719UL }))) *
                                                (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                                                 354488099726909104UL,
                                                                                 115174089281514891UL,
                                                                                 80808271106704719UL }))) *
                                               (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                                                354488099726909104UL,
                                                                                115174089281514891UL,
                                                                                80808271106704719UL }))))))));
            tmp *= scaling_factor;
            std::get<24>(evals) += tmp;
        }
        // Contribution 25
        {
            Avm_DECLARE_VIEWS(25);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_T_2_5 -
                  ((((((((poseidon2_T_1_6 + FF(uint256_t{ 5109255232332580664UL,
                                                          11913027714091798733UL,
                                                          4449570166290740355UL,
                                                          864862123557185234UL })) *
                         (poseidon2_T_1_6 + FF(uint256_t{ 5109255232332580664UL,
                                                          11913027714091798733UL,
                                                          4449570166290740355UL,
                                                          864862123557185234UL }))) *
                        (poseidon2_T_1_6 + FF(uint256_t{ 5109255232332580664UL,
                                                         11913027714091798733UL,
                                                         4449570166290740355UL,
                                                         864862123557185234UL }))) *
                       (poseidon2_T_1_6 + FF(uint256_t{ 5109255232332580664UL,
                                                        11913027714091798733UL,
                                                        4449570166290740355UL,
                                                        864862123557185234UL }))) *
                      (poseidon2_T_1_6 + FF(uint256_t{ 5109255232332580664UL,
                                                       11913027714091798733UL,
                                                       4449570166290740355UL,
                                                       864862123557185234UL }))) +
                     (((((poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                          354488099726909104UL,
                                                          115174089281514891UL,
                                                          80808271106704719UL })) *
                         (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                          354488099726909104UL,
                                                          115174089281514891UL,
                                                          80808271106704719UL }))) *
                        (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                         354488099726909104UL,
                                                         115174089281514891UL,
                                                         80808271106704719UL }))) *
                       (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                        354488099726909104UL,
                                                        115174089281514891UL,
                                                        80808271106704719UL }))) *
                      (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                       354488099726909104UL,
                                                       115174089281514891UL,
                                                       80808271106704719UL })))) *
                    FF(4)) +
                   (((((((poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                          354488099726909104UL,
                                                          115174089281514891UL,
                                                          80808271106704719UL })) *
                         (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                          354488099726909104UL,
                                                          115174089281514891UL,
                                                          80808271106704719UL }))) *
                        (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                         354488099726909104UL,
                                                         115174089281514891UL,
                                                         80808271106704719UL }))) *
                       (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                        354488099726909104UL,
                                                        115174089281514891UL,
                                                        80808271106704719UL }))) *
                      (poseidon2_T_1_5 +
                       FF(uint256_t{
                           2323272968957708806UL, 354488099726909104UL, 115174089281514891UL, 80808271106704719UL }))) *
                     FF(2)) +
                    ((((((poseidon2_T_1_7 + FF(uint256_t{ 9646436663147525449UL,
                                                          3404572679246369876UL,
                                                          2350204275212843361UL,
                                                          1069216089054537871UL })) *
                         (poseidon2_T_1_7 + FF(uint256_t{ 9646436663147525449UL,
                                                          3404572679246369876UL,
                                                          2350204275212843361UL,
                                                          1069216089054537871UL }))) *
                        (poseidon2_T_1_7 + FF(uint256_t{ 9646436663147525449UL,
                                                         3404572679246369876UL,
                                                         2350204275212843361UL,
                                                         1069216089054537871UL }))) *
                       (poseidon2_T_1_7 + FF(uint256_t{ 9646436663147525449UL,
                                                        3404572679246369876UL,
                                                        2350204275212843361UL,
                                                        1069216089054537871UL }))) *
                      (poseidon2_T_1_7 + FF(uint256_t{ 9646436663147525449UL,
                                                       3404572679246369876UL,
                                                       2350204275212843361UL,
                                                       1069216089054537871UL }))) +
                     (((((poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                          4245857056683447103UL,
                                                          2426504795124362174UL,
                                                          350059533408463330UL })) *
                         (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                          4245857056683447103UL,
                                                          2426504795124362174UL,
                                                          350059533408463330UL }))) *
                        (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                         4245857056683447103UL,
                                                         2426504795124362174UL,
                                                         350059533408463330UL }))) *
                       (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                        4245857056683447103UL,
                                                        2426504795124362174UL,
                                                        350059533408463330UL }))) *
                      (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                       4245857056683447103UL,
                                                       2426504795124362174UL,
                                                       350059533408463330UL }))))))));
            tmp *= scaling_factor;
            std::get<25>(evals) += tmp;
        }
        // Contribution 26
        {
            Avm_DECLARE_VIEWS(26);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_2_6 - ((((((((poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                                                   4245857056683447103UL,
                                                                                   2426504795124362174UL,
                                                                                   350059533408463330UL })) *
                                                  (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                                                   4245857056683447103UL,
                                                                                   2426504795124362174UL,
                                                                                   350059533408463330UL }))) *
                                                 (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                                                  4245857056683447103UL,
                                                                                  2426504795124362174UL,
                                                                                  350059533408463330UL }))) *
                                                (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                                                 4245857056683447103UL,
                                                                                 2426504795124362174UL,
                                                                                 350059533408463330UL }))) *
                                               (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                                                4245857056683447103UL,
                                                                                2426504795124362174UL,
                                                                                350059533408463330UL }))) *
                                              FF(2)) +
                                             ((((((poseidon2_T_1_6 + FF(uint256_t{ 5109255232332580664UL,
                                                                                   11913027714091798733UL,
                                                                                   4449570166290740355UL,
                                                                                   864862123557185234UL })) *
                                                  (poseidon2_T_1_6 + FF(uint256_t{ 5109255232332580664UL,
                                                                                   11913027714091798733UL,
                                                                                   4449570166290740355UL,
                                                                                   864862123557185234UL }))) *
                                                 (poseidon2_T_1_6 + FF(uint256_t{ 5109255232332580664UL,
                                                                                  11913027714091798733UL,
                                                                                  4449570166290740355UL,
                                                                                  864862123557185234UL }))) *
                                                (poseidon2_T_1_6 + FF(uint256_t{ 5109255232332580664UL,
                                                                                 11913027714091798733UL,
                                                                                 4449570166290740355UL,
                                                                                 864862123557185234UL }))) *
                                               (poseidon2_T_1_6 + FF(uint256_t{ 5109255232332580664UL,
                                                                                11913027714091798733UL,
                                                                                4449570166290740355UL,
                                                                                864862123557185234UL }))) +
                                              (((((poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                                                   354488099726909104UL,
                                                                                   115174089281514891UL,
                                                                                   80808271106704719UL })) *
                                                  (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                                                   354488099726909104UL,
                                                                                   115174089281514891UL,
                                                                                   80808271106704719UL }))) *
                                                 (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                                                  354488099726909104UL,
                                                                                  115174089281514891UL,
                                                                                  80808271106704719UL }))) *
                                                (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                                                 354488099726909104UL,
                                                                                 115174089281514891UL,
                                                                                 80808271106704719UL }))) *
                                               (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                                                354488099726909104UL,
                                                                                115174089281514891UL,
                                                                                80808271106704719UL }))))) +
                                            poseidon2_T_2_5)));
            tmp *= scaling_factor;
            std::get<26>(evals) += tmp;
        }
        // Contribution 27
        {
            Avm_DECLARE_VIEWS(27);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_T_2_7 -
                  ((((((((poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                          354488099726909104UL,
                                                          115174089281514891UL,
                                                          80808271106704719UL })) *
                         (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                          354488099726909104UL,
                                                          115174089281514891UL,
                                                          80808271106704719UL }))) *
                        (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                         354488099726909104UL,
                                                         115174089281514891UL,
                                                         80808271106704719UL }))) *
                       (poseidon2_T_1_5 + FF(uint256_t{ 2323272968957708806UL,
                                                        354488099726909104UL,
                                                        115174089281514891UL,
                                                        80808271106704719UL }))) *
                      (poseidon2_T_1_5 +
                       FF(uint256_t{
                           2323272968957708806UL, 354488099726909104UL, 115174089281514891UL, 80808271106704719UL }))) *
                     FF(2)) +
                    ((((((poseidon2_T_1_7 + FF(uint256_t{ 9646436663147525449UL,
                                                          3404572679246369876UL,
                                                          2350204275212843361UL,
                                                          1069216089054537871UL })) *
                         (poseidon2_T_1_7 + FF(uint256_t{ 9646436663147525449UL,
                                                          3404572679246369876UL,
                                                          2350204275212843361UL,
                                                          1069216089054537871UL }))) *
                        (poseidon2_T_1_7 + FF(uint256_t{ 9646436663147525449UL,
                                                         3404572679246369876UL,
                                                         2350204275212843361UL,
                                                         1069216089054537871UL }))) *
                       (poseidon2_T_1_7 + FF(uint256_t{ 9646436663147525449UL,
                                                        3404572679246369876UL,
                                                        2350204275212843361UL,
                                                        1069216089054537871UL }))) *
                      (poseidon2_T_1_7 + FF(uint256_t{ 9646436663147525449UL,
                                                       3404572679246369876UL,
                                                       2350204275212843361UL,
                                                       1069216089054537871UL }))) +
                     (((((poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                          4245857056683447103UL,
                                                          2426504795124362174UL,
                                                          350059533408463330UL })) *
                         (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                          4245857056683447103UL,
                                                          2426504795124362174UL,
                                                          350059533408463330UL }))) *
                        (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                         4245857056683447103UL,
                                                         2426504795124362174UL,
                                                         350059533408463330UL }))) *
                       (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                        4245857056683447103UL,
                                                        2426504795124362174UL,
                                                        350059533408463330UL }))) *
                      (poseidon2_T_1_4 + FF(uint256_t{ 5059356740217174171UL,
                                                       4245857056683447103UL,
                                                       2426504795124362174UL,
                                                       350059533408463330UL }))))) +
                   poseidon2_T_2_4)));
            tmp *= scaling_factor;
            std::get<27>(evals) += tmp;
        }
        // Contribution 28
        {
            Avm_DECLARE_VIEWS(28);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_3_4 - ((((((((poseidon2_T_2_7 + FF(uint256_t{ 8805379462752425633UL,
                                                                                   8594508728147436821UL,
                                                                                   15629690186821248127UL,
                                                                                   2936193411053712582UL })) *
                                                  (poseidon2_T_2_7 + FF(uint256_t{ 8805379462752425633UL,
                                                                                   8594508728147436821UL,
                                                                                   15629690186821248127UL,
                                                                                   2936193411053712582UL }))) *
                                                 (poseidon2_T_2_7 + FF(uint256_t{ 8805379462752425633UL,
                                                                                  8594508728147436821UL,
                                                                                  15629690186821248127UL,
                                                                                  2936193411053712582UL }))) *
                                                (poseidon2_T_2_7 + FF(uint256_t{ 8805379462752425633UL,
                                                                                 8594508728147436821UL,
                                                                                 15629690186821248127UL,
                                                                                 2936193411053712582UL }))) *
                                               (poseidon2_T_2_7 + FF(uint256_t{ 8805379462752425633UL,
                                                                                8594508728147436821UL,
                                                                                15629690186821248127UL,
                                                                                2936193411053712582UL }))) +
                                              (((((poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                   14086280776151114414UL,
                                                                                   2804088968006330580UL,
                                                                                   728643340397380469UL })) *
                                                  (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                   14086280776151114414UL,
                                                                                   2804088968006330580UL,
                                                                                   728643340397380469UL }))) *
                                                 (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                  14086280776151114414UL,
                                                                                  2804088968006330580UL,
                                                                                  728643340397380469UL }))) *
                                                (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                 14086280776151114414UL,
                                                                                 2804088968006330580UL,
                                                                                 728643340397380469UL }))) *
                                               (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                14086280776151114414UL,
                                                                                2804088968006330580UL,
                                                                                728643340397380469UL })))) *
                                             FF(4)) +
                                            (((((((poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                   14086280776151114414UL,
                                                                                   2804088968006330580UL,
                                                                                   728643340397380469UL })) *
                                                  (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                   14086280776151114414UL,
                                                                                   2804088968006330580UL,
                                                                                   728643340397380469UL }))) *
                                                 (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                  14086280776151114414UL,
                                                                                  2804088968006330580UL,
                                                                                  728643340397380469UL }))) *
                                                (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                 14086280776151114414UL,
                                                                                 2804088968006330580UL,
                                                                                 728643340397380469UL }))) *
                                               (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                14086280776151114414UL,
                                                                                2804088968006330580UL,
                                                                                728643340397380469UL }))) *
                                              FF(2)) +
                                             ((((((poseidon2_T_2_6 + FF(uint256_t{ 14876286709841668328UL,
                                                                                   6932857857384975351UL,
                                                                                   7976037835777844091UL,
                                                                                   738350885205242785UL })) *
                                                  (poseidon2_T_2_6 + FF(uint256_t{ 14876286709841668328UL,
                                                                                   6932857857384975351UL,
                                                                                   7976037835777844091UL,
                                                                                   738350885205242785UL }))) *
                                                 (poseidon2_T_2_6 + FF(uint256_t{ 14876286709841668328UL,
                                                                                  6932857857384975351UL,
                                                                                  7976037835777844091UL,
                                                                                  738350885205242785UL }))) *
                                                (poseidon2_T_2_6 + FF(uint256_t{ 14876286709841668328UL,
                                                                                 6932857857384975351UL,
                                                                                 7976037835777844091UL,
                                                                                 738350885205242785UL }))) *
                                               (poseidon2_T_2_6 + FF(uint256_t{ 14876286709841668328UL,
                                                                                6932857857384975351UL,
                                                                                7976037835777844091UL,
                                                                                738350885205242785UL }))) +
                                              (((((poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                   4157368317794149558UL,
                                                                                   10343110624935622906UL,
                                                                                   2709590753056582169UL })) *
                                                  (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                   4157368317794149558UL,
                                                                                   10343110624935622906UL,
                                                                                   2709590753056582169UL }))) *
                                                 (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                  4157368317794149558UL,
                                                                                  10343110624935622906UL,
                                                                                  2709590753056582169UL }))) *
                                                (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                 4157368317794149558UL,
                                                                                 10343110624935622906UL,
                                                                                 2709590753056582169UL }))) *
                                               (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                4157368317794149558UL,
                                                                                10343110624935622906UL,
                                                                                2709590753056582169UL }))))))));
            tmp *= scaling_factor;
            std::get<28>(evals) += tmp;
        }
        // Contribution 29
        {
            Avm_DECLARE_VIEWS(29);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_3_5 - ((((((((poseidon2_T_2_6 + FF(uint256_t{ 14876286709841668328UL,
                                                                                   6932857857384975351UL,
                                                                                   7976037835777844091UL,
                                                                                   738350885205242785UL })) *
                                                  (poseidon2_T_2_6 + FF(uint256_t{ 14876286709841668328UL,
                                                                                   6932857857384975351UL,
                                                                                   7976037835777844091UL,
                                                                                   738350885205242785UL }))) *
                                                 (poseidon2_T_2_6 + FF(uint256_t{ 14876286709841668328UL,
                                                                                  6932857857384975351UL,
                                                                                  7976037835777844091UL,
                                                                                  738350885205242785UL }))) *
                                                (poseidon2_T_2_6 + FF(uint256_t{ 14876286709841668328UL,
                                                                                 6932857857384975351UL,
                                                                                 7976037835777844091UL,
                                                                                 738350885205242785UL }))) *
                                               (poseidon2_T_2_6 + FF(uint256_t{ 14876286709841668328UL,
                                                                                6932857857384975351UL,
                                                                                7976037835777844091UL,
                                                                                738350885205242785UL }))) +
                                              (((((poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                   4157368317794149558UL,
                                                                                   10343110624935622906UL,
                                                                                   2709590753056582169UL })) *
                                                  (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                   4157368317794149558UL,
                                                                                   10343110624935622906UL,
                                                                                   2709590753056582169UL }))) *
                                                 (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                  4157368317794149558UL,
                                                                                  10343110624935622906UL,
                                                                                  2709590753056582169UL }))) *
                                                (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                 4157368317794149558UL,
                                                                                 10343110624935622906UL,
                                                                                 2709590753056582169UL }))) *
                                               (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                4157368317794149558UL,
                                                                                10343110624935622906UL,
                                                                                2709590753056582169UL })))) *
                                             FF(4)) +
                                            (((((((poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                   4157368317794149558UL,
                                                                                   10343110624935622906UL,
                                                                                   2709590753056582169UL })) *
                                                  (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                   4157368317794149558UL,
                                                                                   10343110624935622906UL,
                                                                                   2709590753056582169UL }))) *
                                                 (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                  4157368317794149558UL,
                                                                                  10343110624935622906UL,
                                                                                  2709590753056582169UL }))) *
                                                (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                 4157368317794149558UL,
                                                                                 10343110624935622906UL,
                                                                                 2709590753056582169UL }))) *
                                               (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                4157368317794149558UL,
                                                                                10343110624935622906UL,
                                                                                2709590753056582169UL }))) *
                                              FF(2)) +
                                             ((((((poseidon2_T_2_7 + FF(uint256_t{ 8805379462752425633UL,
                                                                                   8594508728147436821UL,
                                                                                   15629690186821248127UL,
                                                                                   2936193411053712582UL })) *
                                                  (poseidon2_T_2_7 + FF(uint256_t{ 8805379462752425633UL,
                                                                                   8594508728147436821UL,
                                                                                   15629690186821248127UL,
                                                                                   2936193411053712582UL }))) *
                                                 (poseidon2_T_2_7 + FF(uint256_t{ 8805379462752425633UL,
                                                                                  8594508728147436821UL,
                                                                                  15629690186821248127UL,
                                                                                  2936193411053712582UL }))) *
                                                (poseidon2_T_2_7 + FF(uint256_t{ 8805379462752425633UL,
                                                                                 8594508728147436821UL,
                                                                                 15629690186821248127UL,
                                                                                 2936193411053712582UL }))) *
                                               (poseidon2_T_2_7 + FF(uint256_t{ 8805379462752425633UL,
                                                                                8594508728147436821UL,
                                                                                15629690186821248127UL,
                                                                                2936193411053712582UL }))) +
                                              (((((poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                   14086280776151114414UL,
                                                                                   2804088968006330580UL,
                                                                                   728643340397380469UL })) *
                                                  (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                   14086280776151114414UL,
                                                                                   2804088968006330580UL,
                                                                                   728643340397380469UL }))) *
                                                 (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                  14086280776151114414UL,
                                                                                  2804088968006330580UL,
                                                                                  728643340397380469UL }))) *
                                                (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                 14086280776151114414UL,
                                                                                 2804088968006330580UL,
                                                                                 728643340397380469UL }))) *
                                               (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                14086280776151114414UL,
                                                                                2804088968006330580UL,
                                                                                728643340397380469UL }))))))));
            tmp *= scaling_factor;
            std::get<29>(evals) += tmp;
        }
        // Contribution 30
        {
            Avm_DECLARE_VIEWS(30);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_3_6 - ((((((((poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                   14086280776151114414UL,
                                                                                   2804088968006330580UL,
                                                                                   728643340397380469UL })) *
                                                  (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                   14086280776151114414UL,
                                                                                   2804088968006330580UL,
                                                                                   728643340397380469UL }))) *
                                                 (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                  14086280776151114414UL,
                                                                                  2804088968006330580UL,
                                                                                  728643340397380469UL }))) *
                                                (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                 14086280776151114414UL,
                                                                                 2804088968006330580UL,
                                                                                 728643340397380469UL }))) *
                                               (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                14086280776151114414UL,
                                                                                2804088968006330580UL,
                                                                                728643340397380469UL }))) *
                                              FF(2)) +
                                             ((((((poseidon2_T_2_6 + FF(uint256_t{ 14876286709841668328UL,
                                                                                   6932857857384975351UL,
                                                                                   7976037835777844091UL,
                                                                                   738350885205242785UL })) *
                                                  (poseidon2_T_2_6 + FF(uint256_t{ 14876286709841668328UL,
                                                                                   6932857857384975351UL,
                                                                                   7976037835777844091UL,
                                                                                   738350885205242785UL }))) *
                                                 (poseidon2_T_2_6 + FF(uint256_t{ 14876286709841668328UL,
                                                                                  6932857857384975351UL,
                                                                                  7976037835777844091UL,
                                                                                  738350885205242785UL }))) *
                                                (poseidon2_T_2_6 + FF(uint256_t{ 14876286709841668328UL,
                                                                                 6932857857384975351UL,
                                                                                 7976037835777844091UL,
                                                                                 738350885205242785UL }))) *
                                               (poseidon2_T_2_6 + FF(uint256_t{ 14876286709841668328UL,
                                                                                6932857857384975351UL,
                                                                                7976037835777844091UL,
                                                                                738350885205242785UL }))) +
                                              (((((poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                   4157368317794149558UL,
                                                                                   10343110624935622906UL,
                                                                                   2709590753056582169UL })) *
                                                  (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                   4157368317794149558UL,
                                                                                   10343110624935622906UL,
                                                                                   2709590753056582169UL }))) *
                                                 (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                  4157368317794149558UL,
                                                                                  10343110624935622906UL,
                                                                                  2709590753056582169UL }))) *
                                                (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                 4157368317794149558UL,
                                                                                 10343110624935622906UL,
                                                                                 2709590753056582169UL }))) *
                                               (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                4157368317794149558UL,
                                                                                10343110624935622906UL,
                                                                                2709590753056582169UL }))))) +
                                            poseidon2_T_3_5)));
            tmp *= scaling_factor;
            std::get<30>(evals) += tmp;
        }
        // Contribution 31
        {
            Avm_DECLARE_VIEWS(31);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_3_7 - ((((((((poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                   4157368317794149558UL,
                                                                                   10343110624935622906UL,
                                                                                   2709590753056582169UL })) *
                                                  (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                   4157368317794149558UL,
                                                                                   10343110624935622906UL,
                                                                                   2709590753056582169UL }))) *
                                                 (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                  4157368317794149558UL,
                                                                                  10343110624935622906UL,
                                                                                  2709590753056582169UL }))) *
                                                (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                 4157368317794149558UL,
                                                                                 10343110624935622906UL,
                                                                                 2709590753056582169UL }))) *
                                               (poseidon2_T_2_5 + FF(uint256_t{ 16522097747524989503UL,
                                                                                4157368317794149558UL,
                                                                                10343110624935622906UL,
                                                                                2709590753056582169UL }))) *
                                              FF(2)) +
                                             ((((((poseidon2_T_2_7 + FF(uint256_t{ 8805379462752425633UL,
                                                                                   8594508728147436821UL,
                                                                                   15629690186821248127UL,
                                                                                   2936193411053712582UL })) *
                                                  (poseidon2_T_2_7 + FF(uint256_t{ 8805379462752425633UL,
                                                                                   8594508728147436821UL,
                                                                                   15629690186821248127UL,
                                                                                   2936193411053712582UL }))) *
                                                 (poseidon2_T_2_7 + FF(uint256_t{ 8805379462752425633UL,
                                                                                  8594508728147436821UL,
                                                                                  15629690186821248127UL,
                                                                                  2936193411053712582UL }))) *
                                                (poseidon2_T_2_7 + FF(uint256_t{ 8805379462752425633UL,
                                                                                 8594508728147436821UL,
                                                                                 15629690186821248127UL,
                                                                                 2936193411053712582UL }))) *
                                               (poseidon2_T_2_7 + FF(uint256_t{ 8805379462752425633UL,
                                                                                8594508728147436821UL,
                                                                                15629690186821248127UL,
                                                                                2936193411053712582UL }))) +
                                              (((((poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                   14086280776151114414UL,
                                                                                   2804088968006330580UL,
                                                                                   728643340397380469UL })) *
                                                  (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                   14086280776151114414UL,
                                                                                   2804088968006330580UL,
                                                                                   728643340397380469UL }))) *
                                                 (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                  14086280776151114414UL,
                                                                                  2804088968006330580UL,
                                                                                  728643340397380469UL }))) *
                                                (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                 14086280776151114414UL,
                                                                                 2804088968006330580UL,
                                                                                 728643340397380469UL }))) *
                                               (poseidon2_T_2_4 + FF(uint256_t{ 17046614324338172999UL,
                                                                                14086280776151114414UL,
                                                                                2804088968006330580UL,
                                                                                728643340397380469UL }))))) +
                                            poseidon2_T_3_4)));
            tmp *= scaling_factor;
            std::get<31>(evals) += tmp;
        }
        // Contribution 32
        {
            Avm_DECLARE_VIEWS(32);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_4_0 -
                  (((((((poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                         6140074342411686364UL,
                                                         6041575944194691717UL,
                                                         896092723329689904UL })) *
                        (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                         6140074342411686364UL,
                                                         6041575944194691717UL,
                                                         896092723329689904UL }))) *
                       (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                        6140074342411686364UL,
                                                        6041575944194691717UL,
                                                        896092723329689904UL }))) *
                      (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                       6140074342411686364UL,
                                                       6041575944194691717UL,
                                                       896092723329689904UL }))) *
                     (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                      6140074342411686364UL,
                                                      6041575944194691717UL,
                                                      896092723329689904UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                           6140074342411686364UL,
                                                           6041575944194691717UL,
                                                           896092723329689904UL })) *
                          (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                           6140074342411686364UL,
                                                           6041575944194691717UL,
                                                           896092723329689904UL }))) *
                         (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                          6140074342411686364UL,
                                                          6041575944194691717UL,
                                                          896092723329689904UL }))) *
                        (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                         6140074342411686364UL,
                                                         6041575944194691717UL,
                                                         896092723329689904UL }))) *
                       (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                        6140074342411686364UL,
                                                        6041575944194691717UL,
                                                        896092723329689904UL }))) +
                      (poseidon2_T_3_5 + FF(0))) +
                     (poseidon2_T_3_7 + FF(0))) +
                    (poseidon2_T_3_4 + FF(0))))));
            tmp *= scaling_factor;
            std::get<32>(evals) += tmp;
        }
        // Contribution 33
        {
            Avm_DECLARE_VIEWS(33);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_4_1 -
                  (((poseidon2_T_3_5 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                           6140074342411686364UL,
                                                           6041575944194691717UL,
                                                           896092723329689904UL })) *
                          (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                           6140074342411686364UL,
                                                           6041575944194691717UL,
                                                           896092723329689904UL }))) *
                         (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                          6140074342411686364UL,
                                                          6041575944194691717UL,
                                                          896092723329689904UL }))) *
                        (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                         6140074342411686364UL,
                                                         6041575944194691717UL,
                                                         896092723329689904UL }))) *
                       (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                        6140074342411686364UL,
                                                        6041575944194691717UL,
                                                        896092723329689904UL }))) +
                      (poseidon2_T_3_5 + FF(0))) +
                     (poseidon2_T_3_7 + FF(0))) +
                    (poseidon2_T_3_4 + FF(0))))));
            tmp *= scaling_factor;
            std::get<33>(evals) += tmp;
        }
        // Contribution 34
        {
            Avm_DECLARE_VIEWS(34);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_4_2 -
                  (((poseidon2_T_3_7 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                           6140074342411686364UL,
                                                           6041575944194691717UL,
                                                           896092723329689904UL })) *
                          (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                           6140074342411686364UL,
                                                           6041575944194691717UL,
                                                           896092723329689904UL }))) *
                         (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                          6140074342411686364UL,
                                                          6041575944194691717UL,
                                                          896092723329689904UL }))) *
                        (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                         6140074342411686364UL,
                                                         6041575944194691717UL,
                                                         896092723329689904UL }))) *
                       (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                        6140074342411686364UL,
                                                        6041575944194691717UL,
                                                        896092723329689904UL }))) +
                      (poseidon2_T_3_5 + FF(0))) +
                     (poseidon2_T_3_7 + FF(0))) +
                    (poseidon2_T_3_4 + FF(0))))));
            tmp *= scaling_factor;
            std::get<34>(evals) += tmp;
        }
        // Contribution 35
        {
            Avm_DECLARE_VIEWS(35);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_4_3 -
                  (((poseidon2_T_3_4 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                           6140074342411686364UL,
                                                           6041575944194691717UL,
                                                           896092723329689904UL })) *
                          (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                           6140074342411686364UL,
                                                           6041575944194691717UL,
                                                           896092723329689904UL }))) *
                         (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                          6140074342411686364UL,
                                                          6041575944194691717UL,
                                                          896092723329689904UL }))) *
                        (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                         6140074342411686364UL,
                                                         6041575944194691717UL,
                                                         896092723329689904UL }))) *
                       (poseidon2_T_3_6 + FF(uint256_t{ 12986735346000814543UL,
                                                        6140074342411686364UL,
                                                        6041575944194691717UL,
                                                        896092723329689904UL }))) +
                      (poseidon2_T_3_5 + FF(0))) +
                     (poseidon2_T_3_7 + FF(0))) +
                    (poseidon2_T_3_4 + FF(0))))));
            tmp *= scaling_factor;
            std::get<35>(evals) += tmp;
        }
        // Contribution 36
        {
            Avm_DECLARE_VIEWS(36);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_5_0 -
                  (((((((poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                         12243211539080976096UL,
                                                         15287161151491266826UL,
                                                         1310836290481124728UL })) *
                        (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                         12243211539080976096UL,
                                                         15287161151491266826UL,
                                                         1310836290481124728UL }))) *
                       (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                        12243211539080976096UL,
                                                        15287161151491266826UL,
                                                        1310836290481124728UL }))) *
                      (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                       12243211539080976096UL,
                                                       15287161151491266826UL,
                                                       1310836290481124728UL }))) *
                     (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                      12243211539080976096UL,
                                                      15287161151491266826UL,
                                                      1310836290481124728UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                           12243211539080976096UL,
                                                           15287161151491266826UL,
                                                           1310836290481124728UL })) *
                          (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                           12243211539080976096UL,
                                                           15287161151491266826UL,
                                                           1310836290481124728UL }))) *
                         (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                          12243211539080976096UL,
                                                          15287161151491266826UL,
                                                          1310836290481124728UL }))) *
                        (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                         12243211539080976096UL,
                                                         15287161151491266826UL,
                                                         1310836290481124728UL }))) *
                       (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                        12243211539080976096UL,
                                                        15287161151491266826UL,
                                                        1310836290481124728UL }))) +
                      (poseidon2_B_4_1 + FF(0))) +
                     (poseidon2_B_4_2 + FF(0))) +
                    (poseidon2_B_4_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<36>(evals) += tmp;
        }
        // Contribution 37
        {
            Avm_DECLARE_VIEWS(37);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_5_1 -
                  (((poseidon2_B_4_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                           12243211539080976096UL,
                                                           15287161151491266826UL,
                                                           1310836290481124728UL })) *
                          (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                           12243211539080976096UL,
                                                           15287161151491266826UL,
                                                           1310836290481124728UL }))) *
                         (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                          12243211539080976096UL,
                                                          15287161151491266826UL,
                                                          1310836290481124728UL }))) *
                        (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                         12243211539080976096UL,
                                                         15287161151491266826UL,
                                                         1310836290481124728UL }))) *
                       (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                        12243211539080976096UL,
                                                        15287161151491266826UL,
                                                        1310836290481124728UL }))) +
                      (poseidon2_B_4_1 + FF(0))) +
                     (poseidon2_B_4_2 + FF(0))) +
                    (poseidon2_B_4_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<37>(evals) += tmp;
        }
        // Contribution 38
        {
            Avm_DECLARE_VIEWS(38);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_5_2 -
                  (((poseidon2_B_4_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                           12243211539080976096UL,
                                                           15287161151491266826UL,
                                                           1310836290481124728UL })) *
                          (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                           12243211539080976096UL,
                                                           15287161151491266826UL,
                                                           1310836290481124728UL }))) *
                         (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                          12243211539080976096UL,
                                                          15287161151491266826UL,
                                                          1310836290481124728UL }))) *
                        (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                         12243211539080976096UL,
                                                         15287161151491266826UL,
                                                         1310836290481124728UL }))) *
                       (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                        12243211539080976096UL,
                                                        15287161151491266826UL,
                                                        1310836290481124728UL }))) +
                      (poseidon2_B_4_1 + FF(0))) +
                     (poseidon2_B_4_2 + FF(0))) +
                    (poseidon2_B_4_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<38>(evals) += tmp;
        }
        // Contribution 39
        {
            Avm_DECLARE_VIEWS(39);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_5_3 -
                  (((poseidon2_B_4_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                           12243211539080976096UL,
                                                           15287161151491266826UL,
                                                           1310836290481124728UL })) *
                          (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                           12243211539080976096UL,
                                                           15287161151491266826UL,
                                                           1310836290481124728UL }))) *
                         (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                          12243211539080976096UL,
                                                          15287161151491266826UL,
                                                          1310836290481124728UL }))) *
                        (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                         12243211539080976096UL,
                                                         15287161151491266826UL,
                                                         1310836290481124728UL }))) *
                       (poseidon2_B_4_0 + FF(uint256_t{ 9573905030842087441UL,
                                                        12243211539080976096UL,
                                                        15287161151491266826UL,
                                                        1310836290481124728UL }))) +
                      (poseidon2_B_4_1 + FF(0))) +
                     (poseidon2_B_4_2 + FF(0))) +
                    (poseidon2_B_4_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<39>(evals) += tmp;
        }
        // Contribution 40
        {
            Avm_DECLARE_VIEWS(40);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_6_0 -
                  (((((((poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                         6813849753829831047UL,
                                                         9066778847678578696UL,
                                                         2801725307463304665UL })) *
                        (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                         6813849753829831047UL,
                                                         9066778847678578696UL,
                                                         2801725307463304665UL }))) *
                       (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                        6813849753829831047UL,
                                                        9066778847678578696UL,
                                                        2801725307463304665UL }))) *
                      (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                       6813849753829831047UL,
                                                       9066778847678578696UL,
                                                       2801725307463304665UL }))) *
                     (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                      6813849753829831047UL,
                                                      9066778847678578696UL,
                                                      2801725307463304665UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                           6813849753829831047UL,
                                                           9066778847678578696UL,
                                                           2801725307463304665UL })) *
                          (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                           6813849753829831047UL,
                                                           9066778847678578696UL,
                                                           2801725307463304665UL }))) *
                         (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                          6813849753829831047UL,
                                                          9066778847678578696UL,
                                                          2801725307463304665UL }))) *
                        (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                         6813849753829831047UL,
                                                         9066778847678578696UL,
                                                         2801725307463304665UL }))) *
                       (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                        6813849753829831047UL,
                                                        9066778847678578696UL,
                                                        2801725307463304665UL }))) +
                      (poseidon2_B_5_1 + FF(0))) +
                     (poseidon2_B_5_2 + FF(0))) +
                    (poseidon2_B_5_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<40>(evals) += tmp;
        }
        // Contribution 41
        {
            Avm_DECLARE_VIEWS(41);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_6_1 -
                  (((poseidon2_B_5_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                           6813849753829831047UL,
                                                           9066778847678578696UL,
                                                           2801725307463304665UL })) *
                          (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                           6813849753829831047UL,
                                                           9066778847678578696UL,
                                                           2801725307463304665UL }))) *
                         (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                          6813849753829831047UL,
                                                          9066778847678578696UL,
                                                          2801725307463304665UL }))) *
                        (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                         6813849753829831047UL,
                                                         9066778847678578696UL,
                                                         2801725307463304665UL }))) *
                       (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                        6813849753829831047UL,
                                                        9066778847678578696UL,
                                                        2801725307463304665UL }))) +
                      (poseidon2_B_5_1 + FF(0))) +
                     (poseidon2_B_5_2 + FF(0))) +
                    (poseidon2_B_5_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<41>(evals) += tmp;
        }
        // Contribution 42
        {
            Avm_DECLARE_VIEWS(42);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_6_2 -
                  (((poseidon2_B_5_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                           6813849753829831047UL,
                                                           9066778847678578696UL,
                                                           2801725307463304665UL })) *
                          (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                           6813849753829831047UL,
                                                           9066778847678578696UL,
                                                           2801725307463304665UL }))) *
                         (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                          6813849753829831047UL,
                                                          9066778847678578696UL,
                                                          2801725307463304665UL }))) *
                        (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                         6813849753829831047UL,
                                                         9066778847678578696UL,
                                                         2801725307463304665UL }))) *
                       (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                        6813849753829831047UL,
                                                        9066778847678578696UL,
                                                        2801725307463304665UL }))) +
                      (poseidon2_B_5_1 + FF(0))) +
                     (poseidon2_B_5_2 + FF(0))) +
                    (poseidon2_B_5_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<42>(evals) += tmp;
        }
        // Contribution 43
        {
            Avm_DECLARE_VIEWS(43);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_6_3 -
                  (((poseidon2_B_5_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                           6813849753829831047UL,
                                                           9066778847678578696UL,
                                                           2801725307463304665UL })) *
                          (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                           6813849753829831047UL,
                                                           9066778847678578696UL,
                                                           2801725307463304665UL }))) *
                         (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                          6813849753829831047UL,
                                                          9066778847678578696UL,
                                                          2801725307463304665UL }))) *
                        (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                         6813849753829831047UL,
                                                         9066778847678578696UL,
                                                         2801725307463304665UL }))) *
                       (poseidon2_B_5_0 + FF(uint256_t{ 8865134002163281525UL,
                                                        6813849753829831047UL,
                                                        9066778847678578696UL,
                                                        2801725307463304665UL }))) +
                      (poseidon2_B_5_1 + FF(0))) +
                     (poseidon2_B_5_2 + FF(0))) +
                    (poseidon2_B_5_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<43>(evals) += tmp;
        }
        // Contribution 44
        {
            Avm_DECLARE_VIEWS(44);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_7_0 -
                  (((((((poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                         13712769805002511750UL,
                                                         1776191062268299644UL,
                                                         2068661504023016414UL })) *
                        (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                         13712769805002511750UL,
                                                         1776191062268299644UL,
                                                         2068661504023016414UL }))) *
                       (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                        13712769805002511750UL,
                                                        1776191062268299644UL,
                                                        2068661504023016414UL }))) *
                      (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                       13712769805002511750UL,
                                                       1776191062268299644UL,
                                                       2068661504023016414UL }))) *
                     (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                      13712769805002511750UL,
                                                      1776191062268299644UL,
                                                      2068661504023016414UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                           13712769805002511750UL,
                                                           1776191062268299644UL,
                                                           2068661504023016414UL })) *
                          (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                           13712769805002511750UL,
                                                           1776191062268299644UL,
                                                           2068661504023016414UL }))) *
                         (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                          13712769805002511750UL,
                                                          1776191062268299644UL,
                                                          2068661504023016414UL }))) *
                        (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                         13712769805002511750UL,
                                                         1776191062268299644UL,
                                                         2068661504023016414UL }))) *
                       (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                        13712769805002511750UL,
                                                        1776191062268299644UL,
                                                        2068661504023016414UL }))) +
                      (poseidon2_B_6_1 + FF(0))) +
                     (poseidon2_B_6_2 + FF(0))) +
                    (poseidon2_B_6_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<44>(evals) += tmp;
        }
        // Contribution 45
        {
            Avm_DECLARE_VIEWS(45);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_7_1 -
                  (((poseidon2_B_6_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                           13712769805002511750UL,
                                                           1776191062268299644UL,
                                                           2068661504023016414UL })) *
                          (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                           13712769805002511750UL,
                                                           1776191062268299644UL,
                                                           2068661504023016414UL }))) *
                         (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                          13712769805002511750UL,
                                                          1776191062268299644UL,
                                                          2068661504023016414UL }))) *
                        (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                         13712769805002511750UL,
                                                         1776191062268299644UL,
                                                         2068661504023016414UL }))) *
                       (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                        13712769805002511750UL,
                                                        1776191062268299644UL,
                                                        2068661504023016414UL }))) +
                      (poseidon2_B_6_1 + FF(0))) +
                     (poseidon2_B_6_2 + FF(0))) +
                    (poseidon2_B_6_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<45>(evals) += tmp;
        }
        // Contribution 46
        {
            Avm_DECLARE_VIEWS(46);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_7_2 -
                  (((poseidon2_B_6_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                           13712769805002511750UL,
                                                           1776191062268299644UL,
                                                           2068661504023016414UL })) *
                          (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                           13712769805002511750UL,
                                                           1776191062268299644UL,
                                                           2068661504023016414UL }))) *
                         (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                          13712769805002511750UL,
                                                          1776191062268299644UL,
                                                          2068661504023016414UL }))) *
                        (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                         13712769805002511750UL,
                                                         1776191062268299644UL,
                                                         2068661504023016414UL }))) *
                       (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                        13712769805002511750UL,
                                                        1776191062268299644UL,
                                                        2068661504023016414UL }))) +
                      (poseidon2_B_6_1 + FF(0))) +
                     (poseidon2_B_6_2 + FF(0))) +
                    (poseidon2_B_6_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<46>(evals) += tmp;
        }
        // Contribution 47
        {
            Avm_DECLARE_VIEWS(47);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_7_3 -
                  (((poseidon2_B_6_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                           13712769805002511750UL,
                                                           1776191062268299644UL,
                                                           2068661504023016414UL })) *
                          (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                           13712769805002511750UL,
                                                           1776191062268299644UL,
                                                           2068661504023016414UL }))) *
                         (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                          13712769805002511750UL,
                                                          1776191062268299644UL,
                                                          2068661504023016414UL }))) *
                        (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                         13712769805002511750UL,
                                                         1776191062268299644UL,
                                                         2068661504023016414UL }))) *
                       (poseidon2_B_6_0 + FF(uint256_t{ 4931814869361681093UL,
                                                        13712769805002511750UL,
                                                        1776191062268299644UL,
                                                        2068661504023016414UL }))) +
                      (poseidon2_B_6_1 + FF(0))) +
                     (poseidon2_B_6_2 + FF(0))) +
                    (poseidon2_B_6_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<47>(evals) += tmp;
        }
        // Contribution 48
        {
            Avm_DECLARE_VIEWS(48);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_8_0 -
                  (((((((poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                         3049786034047984668UL,
                                                         1021328518293651309UL,
                                                         2147500022207188878UL })) *
                        (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                         3049786034047984668UL,
                                                         1021328518293651309UL,
                                                         2147500022207188878UL }))) *
                       (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                        3049786034047984668UL,
                                                        1021328518293651309UL,
                                                        2147500022207188878UL }))) *
                      (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                       3049786034047984668UL,
                                                       1021328518293651309UL,
                                                       2147500022207188878UL }))) *
                     (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                      3049786034047984668UL,
                                                      1021328518293651309UL,
                                                      2147500022207188878UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                           3049786034047984668UL,
                                                           1021328518293651309UL,
                                                           2147500022207188878UL })) *
                          (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                           3049786034047984668UL,
                                                           1021328518293651309UL,
                                                           2147500022207188878UL }))) *
                         (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                          3049786034047984668UL,
                                                          1021328518293651309UL,
                                                          2147500022207188878UL }))) *
                        (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                         3049786034047984668UL,
                                                         1021328518293651309UL,
                                                         2147500022207188878UL }))) *
                       (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                        3049786034047984668UL,
                                                        1021328518293651309UL,
                                                        2147500022207188878UL }))) +
                      (poseidon2_B_7_1 + FF(0))) +
                     (poseidon2_B_7_2 + FF(0))) +
                    (poseidon2_B_7_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<48>(evals) += tmp;
        }
        // Contribution 49
        {
            Avm_DECLARE_VIEWS(49);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_8_1 -
                  (((poseidon2_B_7_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                           3049786034047984668UL,
                                                           1021328518293651309UL,
                                                           2147500022207188878UL })) *
                          (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                           3049786034047984668UL,
                                                           1021328518293651309UL,
                                                           2147500022207188878UL }))) *
                         (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                          3049786034047984668UL,
                                                          1021328518293651309UL,
                                                          2147500022207188878UL }))) *
                        (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                         3049786034047984668UL,
                                                         1021328518293651309UL,
                                                         2147500022207188878UL }))) *
                       (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                        3049786034047984668UL,
                                                        1021328518293651309UL,
                                                        2147500022207188878UL }))) +
                      (poseidon2_B_7_1 + FF(0))) +
                     (poseidon2_B_7_2 + FF(0))) +
                    (poseidon2_B_7_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<49>(evals) += tmp;
        }
        // Contribution 50
        {
            Avm_DECLARE_VIEWS(50);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_8_2 -
                  (((poseidon2_B_7_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                           3049786034047984668UL,
                                                           1021328518293651309UL,
                                                           2147500022207188878UL })) *
                          (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                           3049786034047984668UL,
                                                           1021328518293651309UL,
                                                           2147500022207188878UL }))) *
                         (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                          3049786034047984668UL,
                                                          1021328518293651309UL,
                                                          2147500022207188878UL }))) *
                        (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                         3049786034047984668UL,
                                                         1021328518293651309UL,
                                                         2147500022207188878UL }))) *
                       (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                        3049786034047984668UL,
                                                        1021328518293651309UL,
                                                        2147500022207188878UL }))) +
                      (poseidon2_B_7_1 + FF(0))) +
                     (poseidon2_B_7_2 + FF(0))) +
                    (poseidon2_B_7_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<50>(evals) += tmp;
        }
        // Contribution 51
        {
            Avm_DECLARE_VIEWS(51);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_8_3 -
                  (((poseidon2_B_7_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                           3049786034047984668UL,
                                                           1021328518293651309UL,
                                                           2147500022207188878UL })) *
                          (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                           3049786034047984668UL,
                                                           1021328518293651309UL,
                                                           2147500022207188878UL }))) *
                         (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                          3049786034047984668UL,
                                                          1021328518293651309UL,
                                                          2147500022207188878UL }))) *
                        (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                         3049786034047984668UL,
                                                         1021328518293651309UL,
                                                         2147500022207188878UL }))) *
                       (poseidon2_B_7_0 + FF(uint256_t{ 8161631444256445904UL,
                                                        3049786034047984668UL,
                                                        1021328518293651309UL,
                                                        2147500022207188878UL }))) +
                      (poseidon2_B_7_1 + FF(0))) +
                     (poseidon2_B_7_2 + FF(0))) +
                    (poseidon2_B_7_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<51>(evals) += tmp;
        }
        // Contribution 52
        {
            Avm_DECLARE_VIEWS(52);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_9_0 -
                  (((((((poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                         926098071429114297UL,
                                                         17691598410912255471UL,
                                                         76565467953470566UL })) *
                        (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                         926098071429114297UL,
                                                         17691598410912255471UL,
                                                         76565467953470566UL }))) *
                       (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                        926098071429114297UL,
                                                        17691598410912255471UL,
                                                        76565467953470566UL }))) *
                      (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                       926098071429114297UL,
                                                       17691598410912255471UL,
                                                       76565467953470566UL }))) *
                     (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                      926098071429114297UL,
                                                      17691598410912255471UL,
                                                      76565467953470566UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                           926098071429114297UL,
                                                           17691598410912255471UL,
                                                           76565467953470566UL })) *
                          (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                           926098071429114297UL,
                                                           17691598410912255471UL,
                                                           76565467953470566UL }))) *
                         (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                          926098071429114297UL,
                                                          17691598410912255471UL,
                                                          76565467953470566UL }))) *
                        (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                         926098071429114297UL,
                                                         17691598410912255471UL,
                                                         76565467953470566UL }))) *
                       (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                        926098071429114297UL,
                                                        17691598410912255471UL,
                                                        76565467953470566UL }))) +
                      (poseidon2_B_8_1 + FF(0))) +
                     (poseidon2_B_8_2 + FF(0))) +
                    (poseidon2_B_8_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<52>(evals) += tmp;
        }
        // Contribution 53
        {
            Avm_DECLARE_VIEWS(53);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_9_1 -
                  (((poseidon2_B_8_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                           926098071429114297UL,
                                                           17691598410912255471UL,
                                                           76565467953470566UL })) *
                          (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                           926098071429114297UL,
                                                           17691598410912255471UL,
                                                           76565467953470566UL }))) *
                         (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                          926098071429114297UL,
                                                          17691598410912255471UL,
                                                          76565467953470566UL }))) *
                        (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                         926098071429114297UL,
                                                         17691598410912255471UL,
                                                         76565467953470566UL }))) *
                       (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                        926098071429114297UL,
                                                        17691598410912255471UL,
                                                        76565467953470566UL }))) +
                      (poseidon2_B_8_1 + FF(0))) +
                     (poseidon2_B_8_2 + FF(0))) +
                    (poseidon2_B_8_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<53>(evals) += tmp;
        }
        // Contribution 54
        {
            Avm_DECLARE_VIEWS(54);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_9_2 -
                  (((poseidon2_B_8_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                           926098071429114297UL,
                                                           17691598410912255471UL,
                                                           76565467953470566UL })) *
                          (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                           926098071429114297UL,
                                                           17691598410912255471UL,
                                                           76565467953470566UL }))) *
                         (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                          926098071429114297UL,
                                                          17691598410912255471UL,
                                                          76565467953470566UL }))) *
                        (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                         926098071429114297UL,
                                                         17691598410912255471UL,
                                                         76565467953470566UL }))) *
                       (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                        926098071429114297UL,
                                                        17691598410912255471UL,
                                                        76565467953470566UL }))) +
                      (poseidon2_B_8_1 + FF(0))) +
                     (poseidon2_B_8_2 + FF(0))) +
                    (poseidon2_B_8_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<54>(evals) += tmp;
        }
        // Contribution 55
        {
            Avm_DECLARE_VIEWS(55);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_9_3 -
                  (((poseidon2_B_8_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                           926098071429114297UL,
                                                           17691598410912255471UL,
                                                           76565467953470566UL })) *
                          (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                           926098071429114297UL,
                                                           17691598410912255471UL,
                                                           76565467953470566UL }))) *
                         (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                          926098071429114297UL,
                                                          17691598410912255471UL,
                                                          76565467953470566UL }))) *
                        (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                         926098071429114297UL,
                                                         17691598410912255471UL,
                                                         76565467953470566UL }))) *
                       (poseidon2_B_8_0 + FF(uint256_t{ 12766468767470212468UL,
                                                        926098071429114297UL,
                                                        17691598410912255471UL,
                                                        76565467953470566UL }))) +
                      (poseidon2_B_8_1 + FF(0))) +
                     (poseidon2_B_8_2 + FF(0))) +
                    (poseidon2_B_8_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<55>(evals) += tmp;
        }
        // Contribution 56
        {
            Avm_DECLARE_VIEWS(56);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_10_0 -
                  (((((((poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                         13465733818561903358UL,
                                                         11157089789589945854UL,
                                                         3107062195097242290UL })) *
                        (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                         13465733818561903358UL,
                                                         11157089789589945854UL,
                                                         3107062195097242290UL }))) *
                       (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                        13465733818561903358UL,
                                                        11157089789589945854UL,
                                                        3107062195097242290UL }))) *
                      (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                       13465733818561903358UL,
                                                       11157089789589945854UL,
                                                       3107062195097242290UL }))) *
                     (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                      13465733818561903358UL,
                                                      11157089789589945854UL,
                                                      3107062195097242290UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                           13465733818561903358UL,
                                                           11157089789589945854UL,
                                                           3107062195097242290UL })) *
                          (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                           13465733818561903358UL,
                                                           11157089789589945854UL,
                                                           3107062195097242290UL }))) *
                         (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                          13465733818561903358UL,
                                                          11157089789589945854UL,
                                                          3107062195097242290UL }))) *
                        (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                         13465733818561903358UL,
                                                         11157089789589945854UL,
                                                         3107062195097242290UL }))) *
                       (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                        13465733818561903358UL,
                                                        11157089789589945854UL,
                                                        3107062195097242290UL }))) +
                      (poseidon2_B_9_1 + FF(0))) +
                     (poseidon2_B_9_2 + FF(0))) +
                    (poseidon2_B_9_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<56>(evals) += tmp;
        }
        // Contribution 57
        {
            Avm_DECLARE_VIEWS(57);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_10_1 -
                  (((poseidon2_B_9_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                           13465733818561903358UL,
                                                           11157089789589945854UL,
                                                           3107062195097242290UL })) *
                          (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                           13465733818561903358UL,
                                                           11157089789589945854UL,
                                                           3107062195097242290UL }))) *
                         (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                          13465733818561903358UL,
                                                          11157089789589945854UL,
                                                          3107062195097242290UL }))) *
                        (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                         13465733818561903358UL,
                                                         11157089789589945854UL,
                                                         3107062195097242290UL }))) *
                       (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                        13465733818561903358UL,
                                                        11157089789589945854UL,
                                                        3107062195097242290UL }))) +
                      (poseidon2_B_9_1 + FF(0))) +
                     (poseidon2_B_9_2 + FF(0))) +
                    (poseidon2_B_9_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<57>(evals) += tmp;
        }
        // Contribution 58
        {
            Avm_DECLARE_VIEWS(58);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_10_2 -
                  (((poseidon2_B_9_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                           13465733818561903358UL,
                                                           11157089789589945854UL,
                                                           3107062195097242290UL })) *
                          (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                           13465733818561903358UL,
                                                           11157089789589945854UL,
                                                           3107062195097242290UL }))) *
                         (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                          13465733818561903358UL,
                                                          11157089789589945854UL,
                                                          3107062195097242290UL }))) *
                        (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                         13465733818561903358UL,
                                                         11157089789589945854UL,
                                                         3107062195097242290UL }))) *
                       (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                        13465733818561903358UL,
                                                        11157089789589945854UL,
                                                        3107062195097242290UL }))) +
                      (poseidon2_B_9_1 + FF(0))) +
                     (poseidon2_B_9_2 + FF(0))) +
                    (poseidon2_B_9_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<58>(evals) += tmp;
        }
        // Contribution 59
        {
            Avm_DECLARE_VIEWS(59);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_10_3 -
                  (((poseidon2_B_9_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                           13465733818561903358UL,
                                                           11157089789589945854UL,
                                                           3107062195097242290UL })) *
                          (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                           13465733818561903358UL,
                                                           11157089789589945854UL,
                                                           3107062195097242290UL }))) *
                         (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                          13465733818561903358UL,
                                                          11157089789589945854UL,
                                                          3107062195097242290UL }))) *
                        (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                         13465733818561903358UL,
                                                         11157089789589945854UL,
                                                         3107062195097242290UL }))) *
                       (poseidon2_B_9_0 + FF(uint256_t{ 15547843034426617484UL,
                                                        13465733818561903358UL,
                                                        11157089789589945854UL,
                                                        3107062195097242290UL }))) +
                      (poseidon2_B_9_1 + FF(0))) +
                     (poseidon2_B_9_2 + FF(0))) +
                    (poseidon2_B_9_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<59>(evals) += tmp;
        }
        // Contribution 60
        {
            Avm_DECLARE_VIEWS(60);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_11_0 -
                  (((((((poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                          17264932925429761530UL,
                                                          11508063480483774160UL,
                                                          2682419245684831641UL })) *
                        (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                          17264932925429761530UL,
                                                          11508063480483774160UL,
                                                          2682419245684831641UL }))) *
                       (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                         17264932925429761530UL,
                                                         11508063480483774160UL,
                                                         2682419245684831641UL }))) *
                      (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                        17264932925429761530UL,
                                                        11508063480483774160UL,
                                                        2682419245684831641UL }))) *
                     (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                       17264932925429761530UL,
                                                       11508063480483774160UL,
                                                       2682419245684831641UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                            17264932925429761530UL,
                                                            11508063480483774160UL,
                                                            2682419245684831641UL })) *
                          (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                            17264932925429761530UL,
                                                            11508063480483774160UL,
                                                            2682419245684831641UL }))) *
                         (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                           17264932925429761530UL,
                                                           11508063480483774160UL,
                                                           2682419245684831641UL }))) *
                        (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                          17264932925429761530UL,
                                                          11508063480483774160UL,
                                                          2682419245684831641UL }))) *
                       (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                         17264932925429761530UL,
                                                         11508063480483774160UL,
                                                         2682419245684831641UL }))) +
                      (poseidon2_B_10_1 + FF(0))) +
                     (poseidon2_B_10_2 + FF(0))) +
                    (poseidon2_B_10_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<60>(evals) += tmp;
        }
        // Contribution 61
        {
            Avm_DECLARE_VIEWS(61);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_11_1 -
                  (((poseidon2_B_10_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                            17264932925429761530UL,
                                                            11508063480483774160UL,
                                                            2682419245684831641UL })) *
                          (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                            17264932925429761530UL,
                                                            11508063480483774160UL,
                                                            2682419245684831641UL }))) *
                         (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                           17264932925429761530UL,
                                                           11508063480483774160UL,
                                                           2682419245684831641UL }))) *
                        (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                          17264932925429761530UL,
                                                          11508063480483774160UL,
                                                          2682419245684831641UL }))) *
                       (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                         17264932925429761530UL,
                                                         11508063480483774160UL,
                                                         2682419245684831641UL }))) +
                      (poseidon2_B_10_1 + FF(0))) +
                     (poseidon2_B_10_2 + FF(0))) +
                    (poseidon2_B_10_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<61>(evals) += tmp;
        }
        // Contribution 62
        {
            Avm_DECLARE_VIEWS(62);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_11_2 -
                  (((poseidon2_B_10_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                            17264932925429761530UL,
                                                            11508063480483774160UL,
                                                            2682419245684831641UL })) *
                          (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                            17264932925429761530UL,
                                                            11508063480483774160UL,
                                                            2682419245684831641UL }))) *
                         (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                           17264932925429761530UL,
                                                           11508063480483774160UL,
                                                           2682419245684831641UL }))) *
                        (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                          17264932925429761530UL,
                                                          11508063480483774160UL,
                                                          2682419245684831641UL }))) *
                       (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                         17264932925429761530UL,
                                                         11508063480483774160UL,
                                                         2682419245684831641UL }))) +
                      (poseidon2_B_10_1 + FF(0))) +
                     (poseidon2_B_10_2 + FF(0))) +
                    (poseidon2_B_10_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<62>(evals) += tmp;
        }
        // Contribution 63
        {
            Avm_DECLARE_VIEWS(63);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_11_3 -
                  (((poseidon2_B_10_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                            17264932925429761530UL,
                                                            11508063480483774160UL,
                                                            2682419245684831641UL })) *
                          (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                            17264932925429761530UL,
                                                            11508063480483774160UL,
                                                            2682419245684831641UL }))) *
                         (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                           17264932925429761530UL,
                                                           11508063480483774160UL,
                                                           2682419245684831641UL }))) *
                        (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                          17264932925429761530UL,
                                                          11508063480483774160UL,
                                                          2682419245684831641UL }))) *
                       (poseidon2_B_10_0 + FF(uint256_t{ 16908372174309343397UL,
                                                         17264932925429761530UL,
                                                         11508063480483774160UL,
                                                         2682419245684831641UL }))) +
                      (poseidon2_B_10_1 + FF(0))) +
                     (poseidon2_B_10_2 + FF(0))) +
                    (poseidon2_B_10_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<63>(evals) += tmp;
        }
        // Contribution 64
        {
            Avm_DECLARE_VIEWS(64);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_12_0 -
                  (((((((poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                          17645600130793395310UL,
                                                          2758876031472241166UL,
                                                          874943362207641089UL })) *
                        (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                          17645600130793395310UL,
                                                          2758876031472241166UL,
                                                          874943362207641089UL }))) *
                       (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                         17645600130793395310UL,
                                                         2758876031472241166UL,
                                                         874943362207641089UL }))) *
                      (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                        17645600130793395310UL,
                                                        2758876031472241166UL,
                                                        874943362207641089UL }))) *
                     (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                       17645600130793395310UL,
                                                       2758876031472241166UL,
                                                       874943362207641089UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                            17645600130793395310UL,
                                                            2758876031472241166UL,
                                                            874943362207641089UL })) *
                          (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                            17645600130793395310UL,
                                                            2758876031472241166UL,
                                                            874943362207641089UL }))) *
                         (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                           17645600130793395310UL,
                                                           2758876031472241166UL,
                                                           874943362207641089UL }))) *
                        (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                          17645600130793395310UL,
                                                          2758876031472241166UL,
                                                          874943362207641089UL }))) *
                       (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                         17645600130793395310UL,
                                                         2758876031472241166UL,
                                                         874943362207641089UL }))) +
                      (poseidon2_B_11_1 + FF(0))) +
                     (poseidon2_B_11_2 + FF(0))) +
                    (poseidon2_B_11_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<64>(evals) += tmp;
        }
        // Contribution 65
        {
            Avm_DECLARE_VIEWS(65);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_12_1 -
                  (((poseidon2_B_11_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                            17645600130793395310UL,
                                                            2758876031472241166UL,
                                                            874943362207641089UL })) *
                          (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                            17645600130793395310UL,
                                                            2758876031472241166UL,
                                                            874943362207641089UL }))) *
                         (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                           17645600130793395310UL,
                                                           2758876031472241166UL,
                                                           874943362207641089UL }))) *
                        (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                          17645600130793395310UL,
                                                          2758876031472241166UL,
                                                          874943362207641089UL }))) *
                       (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                         17645600130793395310UL,
                                                         2758876031472241166UL,
                                                         874943362207641089UL }))) +
                      (poseidon2_B_11_1 + FF(0))) +
                     (poseidon2_B_11_2 + FF(0))) +
                    (poseidon2_B_11_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<65>(evals) += tmp;
        }
        // Contribution 66
        {
            Avm_DECLARE_VIEWS(66);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_12_2 -
                  (((poseidon2_B_11_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                            17645600130793395310UL,
                                                            2758876031472241166UL,
                                                            874943362207641089UL })) *
                          (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                            17645600130793395310UL,
                                                            2758876031472241166UL,
                                                            874943362207641089UL }))) *
                         (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                           17645600130793395310UL,
                                                           2758876031472241166UL,
                                                           874943362207641089UL }))) *
                        (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                          17645600130793395310UL,
                                                          2758876031472241166UL,
                                                          874943362207641089UL }))) *
                       (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                         17645600130793395310UL,
                                                         2758876031472241166UL,
                                                         874943362207641089UL }))) +
                      (poseidon2_B_11_1 + FF(0))) +
                     (poseidon2_B_11_2 + FF(0))) +
                    (poseidon2_B_11_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<66>(evals) += tmp;
        }
        // Contribution 67
        {
            Avm_DECLARE_VIEWS(67);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_12_3 -
                  (((poseidon2_B_11_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                            17645600130793395310UL,
                                                            2758876031472241166UL,
                                                            874943362207641089UL })) *
                          (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                            17645600130793395310UL,
                                                            2758876031472241166UL,
                                                            874943362207641089UL }))) *
                         (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                           17645600130793395310UL,
                                                           2758876031472241166UL,
                                                           874943362207641089UL }))) *
                        (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                          17645600130793395310UL,
                                                          2758876031472241166UL,
                                                          874943362207641089UL }))) *
                       (poseidon2_B_11_0 + FF(uint256_t{ 4870692136216401181UL,
                                                         17645600130793395310UL,
                                                         2758876031472241166UL,
                                                         874943362207641089UL }))) +
                      (poseidon2_B_11_1 + FF(0))) +
                     (poseidon2_B_11_2 + FF(0))) +
                    (poseidon2_B_11_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<67>(evals) += tmp;
        }
        // Contribution 68
        {
            Avm_DECLARE_VIEWS(68);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_13_0 -
                  (((((((poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                          13477556963426049071UL,
                                                          6055112305493291757UL,
                                                          1810598527648098537UL })) *
                        (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                          13477556963426049071UL,
                                                          6055112305493291757UL,
                                                          1810598527648098537UL }))) *
                       (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                         13477556963426049071UL,
                                                         6055112305493291757UL,
                                                         1810598527648098537UL }))) *
                      (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                        13477556963426049071UL,
                                                        6055112305493291757UL,
                                                        1810598527648098537UL }))) *
                     (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                       13477556963426049071UL,
                                                       6055112305493291757UL,
                                                       1810598527648098537UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                            13477556963426049071UL,
                                                            6055112305493291757UL,
                                                            1810598527648098537UL })) *
                          (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                            13477556963426049071UL,
                                                            6055112305493291757UL,
                                                            1810598527648098537UL }))) *
                         (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                           13477556963426049071UL,
                                                           6055112305493291757UL,
                                                           1810598527648098537UL }))) *
                        (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                          13477556963426049071UL,
                                                          6055112305493291757UL,
                                                          1810598527648098537UL }))) *
                       (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                         13477556963426049071UL,
                                                         6055112305493291757UL,
                                                         1810598527648098537UL }))) +
                      (poseidon2_B_12_1 + FF(0))) +
                     (poseidon2_B_12_2 + FF(0))) +
                    (poseidon2_B_12_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<68>(evals) += tmp;
        }
        // Contribution 69
        {
            Avm_DECLARE_VIEWS(69);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_13_1 -
                  (((poseidon2_B_12_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                            13477556963426049071UL,
                                                            6055112305493291757UL,
                                                            1810598527648098537UL })) *
                          (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                            13477556963426049071UL,
                                                            6055112305493291757UL,
                                                            1810598527648098537UL }))) *
                         (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                           13477556963426049071UL,
                                                           6055112305493291757UL,
                                                           1810598527648098537UL }))) *
                        (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                          13477556963426049071UL,
                                                          6055112305493291757UL,
                                                          1810598527648098537UL }))) *
                       (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                         13477556963426049071UL,
                                                         6055112305493291757UL,
                                                         1810598527648098537UL }))) +
                      (poseidon2_B_12_1 + FF(0))) +
                     (poseidon2_B_12_2 + FF(0))) +
                    (poseidon2_B_12_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<69>(evals) += tmp;
        }
        // Contribution 70
        {
            Avm_DECLARE_VIEWS(70);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_13_2 -
                  (((poseidon2_B_12_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                            13477556963426049071UL,
                                                            6055112305493291757UL,
                                                            1810598527648098537UL })) *
                          (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                            13477556963426049071UL,
                                                            6055112305493291757UL,
                                                            1810598527648098537UL }))) *
                         (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                           13477556963426049071UL,
                                                           6055112305493291757UL,
                                                           1810598527648098537UL }))) *
                        (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                          13477556963426049071UL,
                                                          6055112305493291757UL,
                                                          1810598527648098537UL }))) *
                       (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                         13477556963426049071UL,
                                                         6055112305493291757UL,
                                                         1810598527648098537UL }))) +
                      (poseidon2_B_12_1 + FF(0))) +
                     (poseidon2_B_12_2 + FF(0))) +
                    (poseidon2_B_12_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<70>(evals) += tmp;
        }
        // Contribution 71
        {
            Avm_DECLARE_VIEWS(71);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_13_3 -
                  (((poseidon2_B_12_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                            13477556963426049071UL,
                                                            6055112305493291757UL,
                                                            1810598527648098537UL })) *
                          (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                            13477556963426049071UL,
                                                            6055112305493291757UL,
                                                            1810598527648098537UL }))) *
                         (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                           13477556963426049071UL,
                                                           6055112305493291757UL,
                                                           1810598527648098537UL }))) *
                        (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                          13477556963426049071UL,
                                                          6055112305493291757UL,
                                                          1810598527648098537UL }))) *
                       (poseidon2_B_12_0 + FF(uint256_t{ 4540479402638267003UL,
                                                         13477556963426049071UL,
                                                         6055112305493291757UL,
                                                         1810598527648098537UL }))) +
                      (poseidon2_B_12_1 + FF(0))) +
                     (poseidon2_B_12_2 + FF(0))) +
                    (poseidon2_B_12_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<71>(evals) += tmp;
        }
        // Contribution 72
        {
            Avm_DECLARE_VIEWS(72);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_14_0 -
                  (((((((poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                          9595210915998428021UL,
                                                          7642295683223718917UL,
                                                          2210716392790471408UL })) *
                        (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                          9595210915998428021UL,
                                                          7642295683223718917UL,
                                                          2210716392790471408UL }))) *
                       (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                         9595210915998428021UL,
                                                         7642295683223718917UL,
                                                         2210716392790471408UL }))) *
                      (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                        9595210915998428021UL,
                                                        7642295683223718917UL,
                                                        2210716392790471408UL }))) *
                     (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                       9595210915998428021UL,
                                                       7642295683223718917UL,
                                                       2210716392790471408UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                            9595210915998428021UL,
                                                            7642295683223718917UL,
                                                            2210716392790471408UL })) *
                          (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                            9595210915998428021UL,
                                                            7642295683223718917UL,
                                                            2210716392790471408UL }))) *
                         (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                           9595210915998428021UL,
                                                           7642295683223718917UL,
                                                           2210716392790471408UL }))) *
                        (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                          9595210915998428021UL,
                                                          7642295683223718917UL,
                                                          2210716392790471408UL }))) *
                       (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                         9595210915998428021UL,
                                                         7642295683223718917UL,
                                                         2210716392790471408UL }))) +
                      (poseidon2_B_13_1 + FF(0))) +
                     (poseidon2_B_13_2 + FF(0))) +
                    (poseidon2_B_13_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<72>(evals) += tmp;
        }
        // Contribution 73
        {
            Avm_DECLARE_VIEWS(73);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_14_1 -
                  (((poseidon2_B_13_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                            9595210915998428021UL,
                                                            7642295683223718917UL,
                                                            2210716392790471408UL })) *
                          (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                            9595210915998428021UL,
                                                            7642295683223718917UL,
                                                            2210716392790471408UL }))) *
                         (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                           9595210915998428021UL,
                                                           7642295683223718917UL,
                                                           2210716392790471408UL }))) *
                        (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                          9595210915998428021UL,
                                                          7642295683223718917UL,
                                                          2210716392790471408UL }))) *
                       (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                         9595210915998428021UL,
                                                         7642295683223718917UL,
                                                         2210716392790471408UL }))) +
                      (poseidon2_B_13_1 + FF(0))) +
                     (poseidon2_B_13_2 + FF(0))) +
                    (poseidon2_B_13_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<73>(evals) += tmp;
        }
        // Contribution 74
        {
            Avm_DECLARE_VIEWS(74);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_14_2 -
                  (((poseidon2_B_13_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                            9595210915998428021UL,
                                                            7642295683223718917UL,
                                                            2210716392790471408UL })) *
                          (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                            9595210915998428021UL,
                                                            7642295683223718917UL,
                                                            2210716392790471408UL }))) *
                         (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                           9595210915998428021UL,
                                                           7642295683223718917UL,
                                                           2210716392790471408UL }))) *
                        (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                          9595210915998428021UL,
                                                          7642295683223718917UL,
                                                          2210716392790471408UL }))) *
                       (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                         9595210915998428021UL,
                                                         7642295683223718917UL,
                                                         2210716392790471408UL }))) +
                      (poseidon2_B_13_1 + FF(0))) +
                     (poseidon2_B_13_2 + FF(0))) +
                    (poseidon2_B_13_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<74>(evals) += tmp;
        }
        // Contribution 75
        {
            Avm_DECLARE_VIEWS(75);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_14_3 -
                  (((poseidon2_B_13_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                            9595210915998428021UL,
                                                            7642295683223718917UL,
                                                            2210716392790471408UL })) *
                          (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                            9595210915998428021UL,
                                                            7642295683223718917UL,
                                                            2210716392790471408UL }))) *
                         (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                           9595210915998428021UL,
                                                           7642295683223718917UL,
                                                           2210716392790471408UL }))) *
                        (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                          9595210915998428021UL,
                                                          7642295683223718917UL,
                                                          2210716392790471408UL }))) *
                       (poseidon2_B_13_0 + FF(uint256_t{ 7894770769272900997UL,
                                                         9595210915998428021UL,
                                                         7642295683223718917UL,
                                                         2210716392790471408UL }))) +
                      (poseidon2_B_13_1 + FF(0))) +
                     (poseidon2_B_13_2 + FF(0))) +
                    (poseidon2_B_13_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<75>(evals) += tmp;
        }
        // Contribution 76
        {
            Avm_DECLARE_VIEWS(76);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_15_0 -
                  (((((((poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                          15811627963917441510UL,
                                                          16460518660187536520UL,
                                                          1698297851221778809UL })) *
                        (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                          15811627963917441510UL,
                                                          16460518660187536520UL,
                                                          1698297851221778809UL }))) *
                       (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                         15811627963917441510UL,
                                                         16460518660187536520UL,
                                                         1698297851221778809UL }))) *
                      (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                        15811627963917441510UL,
                                                        16460518660187536520UL,
                                                        1698297851221778809UL }))) *
                     (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                       15811627963917441510UL,
                                                       16460518660187536520UL,
                                                       1698297851221778809UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                            15811627963917441510UL,
                                                            16460518660187536520UL,
                                                            1698297851221778809UL })) *
                          (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                            15811627963917441510UL,
                                                            16460518660187536520UL,
                                                            1698297851221778809UL }))) *
                         (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                           15811627963917441510UL,
                                                           16460518660187536520UL,
                                                           1698297851221778809UL }))) *
                        (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                          15811627963917441510UL,
                                                          16460518660187536520UL,
                                                          1698297851221778809UL }))) *
                       (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                         15811627963917441510UL,
                                                         16460518660187536520UL,
                                                         1698297851221778809UL }))) +
                      (poseidon2_B_14_1 + FF(0))) +
                     (poseidon2_B_14_2 + FF(0))) +
                    (poseidon2_B_14_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<76>(evals) += tmp;
        }
        // Contribution 77
        {
            Avm_DECLARE_VIEWS(77);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_15_1 -
                  (((poseidon2_B_14_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                            15811627963917441510UL,
                                                            16460518660187536520UL,
                                                            1698297851221778809UL })) *
                          (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                            15811627963917441510UL,
                                                            16460518660187536520UL,
                                                            1698297851221778809UL }))) *
                         (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                           15811627963917441510UL,
                                                           16460518660187536520UL,
                                                           1698297851221778809UL }))) *
                        (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                          15811627963917441510UL,
                                                          16460518660187536520UL,
                                                          1698297851221778809UL }))) *
                       (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                         15811627963917441510UL,
                                                         16460518660187536520UL,
                                                         1698297851221778809UL }))) +
                      (poseidon2_B_14_1 + FF(0))) +
                     (poseidon2_B_14_2 + FF(0))) +
                    (poseidon2_B_14_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<77>(evals) += tmp;
        }
        // Contribution 78
        {
            Avm_DECLARE_VIEWS(78);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_15_2 -
                  (((poseidon2_B_14_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                            15811627963917441510UL,
                                                            16460518660187536520UL,
                                                            1698297851221778809UL })) *
                          (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                            15811627963917441510UL,
                                                            16460518660187536520UL,
                                                            1698297851221778809UL }))) *
                         (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                           15811627963917441510UL,
                                                           16460518660187536520UL,
                                                           1698297851221778809UL }))) *
                        (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                          15811627963917441510UL,
                                                          16460518660187536520UL,
                                                          1698297851221778809UL }))) *
                       (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                         15811627963917441510UL,
                                                         16460518660187536520UL,
                                                         1698297851221778809UL }))) +
                      (poseidon2_B_14_1 + FF(0))) +
                     (poseidon2_B_14_2 + FF(0))) +
                    (poseidon2_B_14_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<78>(evals) += tmp;
        }
        // Contribution 79
        {
            Avm_DECLARE_VIEWS(79);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_15_3 -
                  (((poseidon2_B_14_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                            15811627963917441510UL,
                                                            16460518660187536520UL,
                                                            1698297851221778809UL })) *
                          (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                            15811627963917441510UL,
                                                            16460518660187536520UL,
                                                            1698297851221778809UL }))) *
                         (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                           15811627963917441510UL,
                                                           16460518660187536520UL,
                                                           1698297851221778809UL }))) *
                        (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                          15811627963917441510UL,
                                                          16460518660187536520UL,
                                                          1698297851221778809UL }))) *
                       (poseidon2_B_14_0 + FF(uint256_t{ 10910178561156475899UL,
                                                         15811627963917441510UL,
                                                         16460518660187536520UL,
                                                         1698297851221778809UL }))) +
                      (poseidon2_B_14_1 + FF(0))) +
                     (poseidon2_B_14_2 + FF(0))) +
                    (poseidon2_B_14_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<79>(evals) += tmp;
        }
        // Contribution 80
        {
            Avm_DECLARE_VIEWS(80);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_16_0 -
                  (((((((poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                          1464390598836302271UL,
                                                          8568564606321342514UL,
                                                          3007171090439369509UL })) *
                        (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                          1464390598836302271UL,
                                                          8568564606321342514UL,
                                                          3007171090439369509UL }))) *
                       (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                         1464390598836302271UL,
                                                         8568564606321342514UL,
                                                         3007171090439369509UL }))) *
                      (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                        1464390598836302271UL,
                                                        8568564606321342514UL,
                                                        3007171090439369509UL }))) *
                     (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                       1464390598836302271UL,
                                                       8568564606321342514UL,
                                                       3007171090439369509UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                            1464390598836302271UL,
                                                            8568564606321342514UL,
                                                            3007171090439369509UL })) *
                          (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                            1464390598836302271UL,
                                                            8568564606321342514UL,
                                                            3007171090439369509UL }))) *
                         (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                           1464390598836302271UL,
                                                           8568564606321342514UL,
                                                           3007171090439369509UL }))) *
                        (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                          1464390598836302271UL,
                                                          8568564606321342514UL,
                                                          3007171090439369509UL }))) *
                       (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                         1464390598836302271UL,
                                                         8568564606321342514UL,
                                                         3007171090439369509UL }))) +
                      (poseidon2_B_15_1 + FF(0))) +
                     (poseidon2_B_15_2 + FF(0))) +
                    (poseidon2_B_15_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<80>(evals) += tmp;
        }
        // Contribution 81
        {
            Avm_DECLARE_VIEWS(81);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_16_1 -
                  (((poseidon2_B_15_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                            1464390598836302271UL,
                                                            8568564606321342514UL,
                                                            3007171090439369509UL })) *
                          (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                            1464390598836302271UL,
                                                            8568564606321342514UL,
                                                            3007171090439369509UL }))) *
                         (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                           1464390598836302271UL,
                                                           8568564606321342514UL,
                                                           3007171090439369509UL }))) *
                        (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                          1464390598836302271UL,
                                                          8568564606321342514UL,
                                                          3007171090439369509UL }))) *
                       (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                         1464390598836302271UL,
                                                         8568564606321342514UL,
                                                         3007171090439369509UL }))) +
                      (poseidon2_B_15_1 + FF(0))) +
                     (poseidon2_B_15_2 + FF(0))) +
                    (poseidon2_B_15_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<81>(evals) += tmp;
        }
        // Contribution 82
        {
            Avm_DECLARE_VIEWS(82);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_16_2 -
                  (((poseidon2_B_15_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                            1464390598836302271UL,
                                                            8568564606321342514UL,
                                                            3007171090439369509UL })) *
                          (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                            1464390598836302271UL,
                                                            8568564606321342514UL,
                                                            3007171090439369509UL }))) *
                         (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                           1464390598836302271UL,
                                                           8568564606321342514UL,
                                                           3007171090439369509UL }))) *
                        (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                          1464390598836302271UL,
                                                          8568564606321342514UL,
                                                          3007171090439369509UL }))) *
                       (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                         1464390598836302271UL,
                                                         8568564606321342514UL,
                                                         3007171090439369509UL }))) +
                      (poseidon2_B_15_1 + FF(0))) +
                     (poseidon2_B_15_2 + FF(0))) +
                    (poseidon2_B_15_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<82>(evals) += tmp;
        }
        // Contribution 83
        {
            Avm_DECLARE_VIEWS(83);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_16_3 -
                  (((poseidon2_B_15_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                            1464390598836302271UL,
                                                            8568564606321342514UL,
                                                            3007171090439369509UL })) *
                          (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                            1464390598836302271UL,
                                                            8568564606321342514UL,
                                                            3007171090439369509UL }))) *
                         (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                           1464390598836302271UL,
                                                           8568564606321342514UL,
                                                           3007171090439369509UL }))) *
                        (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                          1464390598836302271UL,
                                                          8568564606321342514UL,
                                                          3007171090439369509UL }))) *
                       (poseidon2_B_15_0 + FF(uint256_t{ 7831732902708890908UL,
                                                         1464390598836302271UL,
                                                         8568564606321342514UL,
                                                         3007171090439369509UL }))) +
                      (poseidon2_B_15_1 + FF(0))) +
                     (poseidon2_B_15_2 + FF(0))) +
                    (poseidon2_B_15_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<83>(evals) += tmp;
        }
        // Contribution 84
        {
            Avm_DECLARE_VIEWS(84);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_17_0 -
                  (((((((poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                          5937193763836963893UL,
                                                          4629415695575460109UL,
                                                          2476198378403296665UL })) *
                        (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                          5937193763836963893UL,
                                                          4629415695575460109UL,
                                                          2476198378403296665UL }))) *
                       (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                         5937193763836963893UL,
                                                         4629415695575460109UL,
                                                         2476198378403296665UL }))) *
                      (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                        5937193763836963893UL,
                                                        4629415695575460109UL,
                                                        2476198378403296665UL }))) *
                     (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                       5937193763836963893UL,
                                                       4629415695575460109UL,
                                                       2476198378403296665UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                            5937193763836963893UL,
                                                            4629415695575460109UL,
                                                            2476198378403296665UL })) *
                          (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                            5937193763836963893UL,
                                                            4629415695575460109UL,
                                                            2476198378403296665UL }))) *
                         (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                           5937193763836963893UL,
                                                           4629415695575460109UL,
                                                           2476198378403296665UL }))) *
                        (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                          5937193763836963893UL,
                                                          4629415695575460109UL,
                                                          2476198378403296665UL }))) *
                       (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                         5937193763836963893UL,
                                                         4629415695575460109UL,
                                                         2476198378403296665UL }))) +
                      (poseidon2_B_16_1 + FF(0))) +
                     (poseidon2_B_16_2 + FF(0))) +
                    (poseidon2_B_16_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<84>(evals) += tmp;
        }
        // Contribution 85
        {
            Avm_DECLARE_VIEWS(85);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_17_1 -
                  (((poseidon2_B_16_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                            5937193763836963893UL,
                                                            4629415695575460109UL,
                                                            2476198378403296665UL })) *
                          (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                            5937193763836963893UL,
                                                            4629415695575460109UL,
                                                            2476198378403296665UL }))) *
                         (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                           5937193763836963893UL,
                                                           4629415695575460109UL,
                                                           2476198378403296665UL }))) *
                        (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                          5937193763836963893UL,
                                                          4629415695575460109UL,
                                                          2476198378403296665UL }))) *
                       (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                         5937193763836963893UL,
                                                         4629415695575460109UL,
                                                         2476198378403296665UL }))) +
                      (poseidon2_B_16_1 + FF(0))) +
                     (poseidon2_B_16_2 + FF(0))) +
                    (poseidon2_B_16_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<85>(evals) += tmp;
        }
        // Contribution 86
        {
            Avm_DECLARE_VIEWS(86);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_17_2 -
                  (((poseidon2_B_16_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                            5937193763836963893UL,
                                                            4629415695575460109UL,
                                                            2476198378403296665UL })) *
                          (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                            5937193763836963893UL,
                                                            4629415695575460109UL,
                                                            2476198378403296665UL }))) *
                         (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                           5937193763836963893UL,
                                                           4629415695575460109UL,
                                                           2476198378403296665UL }))) *
                        (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                          5937193763836963893UL,
                                                          4629415695575460109UL,
                                                          2476198378403296665UL }))) *
                       (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                         5937193763836963893UL,
                                                         4629415695575460109UL,
                                                         2476198378403296665UL }))) +
                      (poseidon2_B_16_1 + FF(0))) +
                     (poseidon2_B_16_2 + FF(0))) +
                    (poseidon2_B_16_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<86>(evals) += tmp;
        }
        // Contribution 87
        {
            Avm_DECLARE_VIEWS(87);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_17_3 -
                  (((poseidon2_B_16_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                            5937193763836963893UL,
                                                            4629415695575460109UL,
                                                            2476198378403296665UL })) *
                          (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                            5937193763836963893UL,
                                                            4629415695575460109UL,
                                                            2476198378403296665UL }))) *
                         (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                           5937193763836963893UL,
                                                           4629415695575460109UL,
                                                           2476198378403296665UL }))) *
                        (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                          5937193763836963893UL,
                                                          4629415695575460109UL,
                                                          2476198378403296665UL }))) *
                       (poseidon2_B_16_0 + FF(uint256_t{ 12758232712903990792UL,
                                                         5937193763836963893UL,
                                                         4629415695575460109UL,
                                                         2476198378403296665UL }))) +
                      (poseidon2_B_16_1 + FF(0))) +
                     (poseidon2_B_16_2 + FF(0))) +
                    (poseidon2_B_16_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<87>(evals) += tmp;
        }
        // Contribution 88
        {
            Avm_DECLARE_VIEWS(88);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_18_0 -
                  (((((((poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                          3161867062328690813UL,
                                                          8447947510117581907UL,
                                                          452436262606194895UL })) *
                        (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                          3161867062328690813UL,
                                                          8447947510117581907UL,
                                                          452436262606194895UL }))) *
                       (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                         3161867062328690813UL,
                                                         8447947510117581907UL,
                                                         452436262606194895UL }))) *
                      (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                        3161867062328690813UL,
                                                        8447947510117581907UL,
                                                        452436262606194895UL }))) *
                     (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                       3161867062328690813UL,
                                                       8447947510117581907UL,
                                                       452436262606194895UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                            3161867062328690813UL,
                                                            8447947510117581907UL,
                                                            452436262606194895UL })) *
                          (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                            3161867062328690813UL,
                                                            8447947510117581907UL,
                                                            452436262606194895UL }))) *
                         (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                           3161867062328690813UL,
                                                           8447947510117581907UL,
                                                           452436262606194895UL }))) *
                        (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                          3161867062328690813UL,
                                                          8447947510117581907UL,
                                                          452436262606194895UL }))) *
                       (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                         3161867062328690813UL,
                                                         8447947510117581907UL,
                                                         452436262606194895UL }))) +
                      (poseidon2_B_17_1 + FF(0))) +
                     (poseidon2_B_17_2 + FF(0))) +
                    (poseidon2_B_17_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<88>(evals) += tmp;
        }
        // Contribution 89
        {
            Avm_DECLARE_VIEWS(89);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_18_1 -
                  (((poseidon2_B_17_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                            3161867062328690813UL,
                                                            8447947510117581907UL,
                                                            452436262606194895UL })) *
                          (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                            3161867062328690813UL,
                                                            8447947510117581907UL,
                                                            452436262606194895UL }))) *
                         (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                           3161867062328690813UL,
                                                           8447947510117581907UL,
                                                           452436262606194895UL }))) *
                        (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                          3161867062328690813UL,
                                                          8447947510117581907UL,
                                                          452436262606194895UL }))) *
                       (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                         3161867062328690813UL,
                                                         8447947510117581907UL,
                                                         452436262606194895UL }))) +
                      (poseidon2_B_17_1 + FF(0))) +
                     (poseidon2_B_17_2 + FF(0))) +
                    (poseidon2_B_17_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<89>(evals) += tmp;
        }
        // Contribution 90
        {
            Avm_DECLARE_VIEWS(90);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_18_2 -
                  (((poseidon2_B_17_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                            3161867062328690813UL,
                                                            8447947510117581907UL,
                                                            452436262606194895UL })) *
                          (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                            3161867062328690813UL,
                                                            8447947510117581907UL,
                                                            452436262606194895UL }))) *
                         (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                           3161867062328690813UL,
                                                           8447947510117581907UL,
                                                           452436262606194895UL }))) *
                        (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                          3161867062328690813UL,
                                                          8447947510117581907UL,
                                                          452436262606194895UL }))) *
                       (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                         3161867062328690813UL,
                                                         8447947510117581907UL,
                                                         452436262606194895UL }))) +
                      (poseidon2_B_17_1 + FF(0))) +
                     (poseidon2_B_17_2 + FF(0))) +
                    (poseidon2_B_17_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<90>(evals) += tmp;
        }
        // Contribution 91
        {
            Avm_DECLARE_VIEWS(91);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_18_3 -
                  (((poseidon2_B_17_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                            3161867062328690813UL,
                                                            8447947510117581907UL,
                                                            452436262606194895UL })) *
                          (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                            3161867062328690813UL,
                                                            8447947510117581907UL,
                                                            452436262606194895UL }))) *
                         (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                           3161867062328690813UL,
                                                           8447947510117581907UL,
                                                           452436262606194895UL }))) *
                        (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                          3161867062328690813UL,
                                                          8447947510117581907UL,
                                                          452436262606194895UL }))) *
                       (poseidon2_B_17_0 + FF(uint256_t{ 16185652584871361881UL,
                                                         3161867062328690813UL,
                                                         8447947510117581907UL,
                                                         452436262606194895UL }))) +
                      (poseidon2_B_17_1 + FF(0))) +
                     (poseidon2_B_17_2 + FF(0))) +
                    (poseidon2_B_17_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<91>(evals) += tmp;
        }
        // Contribution 92
        {
            Avm_DECLARE_VIEWS(92);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_19_0 -
                  (((((((poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                          5577695765815843856UL,
                                                          9164856352050088505UL,
                                                          1205339682110411496UL })) *
                        (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                          5577695765815843856UL,
                                                          9164856352050088505UL,
                                                          1205339682110411496UL }))) *
                       (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                         5577695765815843856UL,
                                                         9164856352050088505UL,
                                                         1205339682110411496UL }))) *
                      (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                        5577695765815843856UL,
                                                        9164856352050088505UL,
                                                        1205339682110411496UL }))) *
                     (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                       5577695765815843856UL,
                                                       9164856352050088505UL,
                                                       1205339682110411496UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                            5577695765815843856UL,
                                                            9164856352050088505UL,
                                                            1205339682110411496UL })) *
                          (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                            5577695765815843856UL,
                                                            9164856352050088505UL,
                                                            1205339682110411496UL }))) *
                         (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                           5577695765815843856UL,
                                                           9164856352050088505UL,
                                                           1205339682110411496UL }))) *
                        (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                          5577695765815843856UL,
                                                          9164856352050088505UL,
                                                          1205339682110411496UL }))) *
                       (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                         5577695765815843856UL,
                                                         9164856352050088505UL,
                                                         1205339682110411496UL }))) +
                      (poseidon2_B_18_1 + FF(0))) +
                     (poseidon2_B_18_2 + FF(0))) +
                    (poseidon2_B_18_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<92>(evals) += tmp;
        }
        // Contribution 93
        {
            Avm_DECLARE_VIEWS(93);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_19_1 -
                  (((poseidon2_B_18_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                            5577695765815843856UL,
                                                            9164856352050088505UL,
                                                            1205339682110411496UL })) *
                          (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                            5577695765815843856UL,
                                                            9164856352050088505UL,
                                                            1205339682110411496UL }))) *
                         (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                           5577695765815843856UL,
                                                           9164856352050088505UL,
                                                           1205339682110411496UL }))) *
                        (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                          5577695765815843856UL,
                                                          9164856352050088505UL,
                                                          1205339682110411496UL }))) *
                       (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                         5577695765815843856UL,
                                                         9164856352050088505UL,
                                                         1205339682110411496UL }))) +
                      (poseidon2_B_18_1 + FF(0))) +
                     (poseidon2_B_18_2 + FF(0))) +
                    (poseidon2_B_18_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<93>(evals) += tmp;
        }
        // Contribution 94
        {
            Avm_DECLARE_VIEWS(94);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_19_2 -
                  (((poseidon2_B_18_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                            5577695765815843856UL,
                                                            9164856352050088505UL,
                                                            1205339682110411496UL })) *
                          (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                            5577695765815843856UL,
                                                            9164856352050088505UL,
                                                            1205339682110411496UL }))) *
                         (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                           5577695765815843856UL,
                                                           9164856352050088505UL,
                                                           1205339682110411496UL }))) *
                        (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                          5577695765815843856UL,
                                                          9164856352050088505UL,
                                                          1205339682110411496UL }))) *
                       (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                         5577695765815843856UL,
                                                         9164856352050088505UL,
                                                         1205339682110411496UL }))) +
                      (poseidon2_B_18_1 + FF(0))) +
                     (poseidon2_B_18_2 + FF(0))) +
                    (poseidon2_B_18_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<94>(evals) += tmp;
        }
        // Contribution 95
        {
            Avm_DECLARE_VIEWS(95);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_19_3 -
                  (((poseidon2_B_18_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                            5577695765815843856UL,
                                                            9164856352050088505UL,
                                                            1205339682110411496UL })) *
                          (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                            5577695765815843856UL,
                                                            9164856352050088505UL,
                                                            1205339682110411496UL }))) *
                         (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                           5577695765815843856UL,
                                                           9164856352050088505UL,
                                                           1205339682110411496UL }))) *
                        (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                          5577695765815843856UL,
                                                          9164856352050088505UL,
                                                          1205339682110411496UL }))) *
                       (poseidon2_B_18_0 + FF(uint256_t{ 10531967515434376071UL,
                                                         5577695765815843856UL,
                                                         9164856352050088505UL,
                                                         1205339682110411496UL }))) +
                      (poseidon2_B_18_1 + FF(0))) +
                     (poseidon2_B_18_2 + FF(0))) +
                    (poseidon2_B_18_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<95>(evals) += tmp;
        }
        // Contribution 96
        {
            Avm_DECLARE_VIEWS(96);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_20_0 -
                  (((((((poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                          14650521577519770525UL,
                                                          5736581618852866049UL,
                                                          1010789789328495026UL })) *
                        (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                          14650521577519770525UL,
                                                          5736581618852866049UL,
                                                          1010789789328495026UL }))) *
                       (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                         14650521577519770525UL,
                                                         5736581618852866049UL,
                                                         1010789789328495026UL }))) *
                      (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                        14650521577519770525UL,
                                                        5736581618852866049UL,
                                                        1010789789328495026UL }))) *
                     (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                       14650521577519770525UL,
                                                       5736581618852866049UL,
                                                       1010789789328495026UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                            14650521577519770525UL,
                                                            5736581618852866049UL,
                                                            1010789789328495026UL })) *
                          (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                            14650521577519770525UL,
                                                            5736581618852866049UL,
                                                            1010789789328495026UL }))) *
                         (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                           14650521577519770525UL,
                                                           5736581618852866049UL,
                                                           1010789789328495026UL }))) *
                        (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                          14650521577519770525UL,
                                                          5736581618852866049UL,
                                                          1010789789328495026UL }))) *
                       (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                         14650521577519770525UL,
                                                         5736581618852866049UL,
                                                         1010789789328495026UL }))) +
                      (poseidon2_B_19_1 + FF(0))) +
                     (poseidon2_B_19_2 + FF(0))) +
                    (poseidon2_B_19_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<96>(evals) += tmp;
        }
        // Contribution 97
        {
            Avm_DECLARE_VIEWS(97);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_20_1 -
                  (((poseidon2_B_19_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                            14650521577519770525UL,
                                                            5736581618852866049UL,
                                                            1010789789328495026UL })) *
                          (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                            14650521577519770525UL,
                                                            5736581618852866049UL,
                                                            1010789789328495026UL }))) *
                         (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                           14650521577519770525UL,
                                                           5736581618852866049UL,
                                                           1010789789328495026UL }))) *
                        (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                          14650521577519770525UL,
                                                          5736581618852866049UL,
                                                          1010789789328495026UL }))) *
                       (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                         14650521577519770525UL,
                                                         5736581618852866049UL,
                                                         1010789789328495026UL }))) +
                      (poseidon2_B_19_1 + FF(0))) +
                     (poseidon2_B_19_2 + FF(0))) +
                    (poseidon2_B_19_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<97>(evals) += tmp;
        }
        // Contribution 98
        {
            Avm_DECLARE_VIEWS(98);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_20_2 -
                  (((poseidon2_B_19_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                            14650521577519770525UL,
                                                            5736581618852866049UL,
                                                            1010789789328495026UL })) *
                          (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                            14650521577519770525UL,
                                                            5736581618852866049UL,
                                                            1010789789328495026UL }))) *
                         (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                           14650521577519770525UL,
                                                           5736581618852866049UL,
                                                           1010789789328495026UL }))) *
                        (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                          14650521577519770525UL,
                                                          5736581618852866049UL,
                                                          1010789789328495026UL }))) *
                       (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                         14650521577519770525UL,
                                                         5736581618852866049UL,
                                                         1010789789328495026UL }))) +
                      (poseidon2_B_19_1 + FF(0))) +
                     (poseidon2_B_19_2 + FF(0))) +
                    (poseidon2_B_19_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<98>(evals) += tmp;
        }
        // Contribution 99
        {
            Avm_DECLARE_VIEWS(99);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_20_3 -
                  (((poseidon2_B_19_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                            14650521577519770525UL,
                                                            5736581618852866049UL,
                                                            1010789789328495026UL })) *
                          (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                            14650521577519770525UL,
                                                            5736581618852866049UL,
                                                            1010789789328495026UL }))) *
                         (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                           14650521577519770525UL,
                                                           5736581618852866049UL,
                                                           1010789789328495026UL }))) *
                        (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                          14650521577519770525UL,
                                                          5736581618852866049UL,
                                                          1010789789328495026UL }))) *
                       (poseidon2_B_19_0 + FF(uint256_t{ 3898841196333713180UL,
                                                         14650521577519770525UL,
                                                         5736581618852866049UL,
                                                         1010789789328495026UL }))) +
                      (poseidon2_B_19_1 + FF(0))) +
                     (poseidon2_B_19_2 + FF(0))) +
                    (poseidon2_B_19_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<99>(evals) += tmp;
        }
        // Contribution 100
        {
            Avm_DECLARE_VIEWS(100);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_21_0 -
                  (((((((poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                          14760208106156268938UL,
                                                          15246749619665902195UL,
                                                          1987439155030896717UL })) *
                        (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                          14760208106156268938UL,
                                                          15246749619665902195UL,
                                                          1987439155030896717UL }))) *
                       (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                         14760208106156268938UL,
                                                         15246749619665902195UL,
                                                         1987439155030896717UL }))) *
                      (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                        14760208106156268938UL,
                                                        15246749619665902195UL,
                                                        1987439155030896717UL }))) *
                     (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                       14760208106156268938UL,
                                                       15246749619665902195UL,
                                                       1987439155030896717UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                            14760208106156268938UL,
                                                            15246749619665902195UL,
                                                            1987439155030896717UL })) *
                          (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                            14760208106156268938UL,
                                                            15246749619665902195UL,
                                                            1987439155030896717UL }))) *
                         (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                           14760208106156268938UL,
                                                           15246749619665902195UL,
                                                           1987439155030896717UL }))) *
                        (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                          14760208106156268938UL,
                                                          15246749619665902195UL,
                                                          1987439155030896717UL }))) *
                       (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                         14760208106156268938UL,
                                                         15246749619665902195UL,
                                                         1987439155030896717UL }))) +
                      (poseidon2_B_20_1 + FF(0))) +
                     (poseidon2_B_20_2 + FF(0))) +
                    (poseidon2_B_20_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<100>(evals) += tmp;
        }
        // Contribution 101
        {
            Avm_DECLARE_VIEWS(101);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_21_1 -
                  (((poseidon2_B_20_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                            14760208106156268938UL,
                                                            15246749619665902195UL,
                                                            1987439155030896717UL })) *
                          (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                            14760208106156268938UL,
                                                            15246749619665902195UL,
                                                            1987439155030896717UL }))) *
                         (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                           14760208106156268938UL,
                                                           15246749619665902195UL,
                                                           1987439155030896717UL }))) *
                        (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                          14760208106156268938UL,
                                                          15246749619665902195UL,
                                                          1987439155030896717UL }))) *
                       (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                         14760208106156268938UL,
                                                         15246749619665902195UL,
                                                         1987439155030896717UL }))) +
                      (poseidon2_B_20_1 + FF(0))) +
                     (poseidon2_B_20_2 + FF(0))) +
                    (poseidon2_B_20_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<101>(evals) += tmp;
        }
        // Contribution 102
        {
            Avm_DECLARE_VIEWS(102);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_21_2 -
                  (((poseidon2_B_20_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                            14760208106156268938UL,
                                                            15246749619665902195UL,
                                                            1987439155030896717UL })) *
                          (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                            14760208106156268938UL,
                                                            15246749619665902195UL,
                                                            1987439155030896717UL }))) *
                         (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                           14760208106156268938UL,
                                                           15246749619665902195UL,
                                                           1987439155030896717UL }))) *
                        (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                          14760208106156268938UL,
                                                          15246749619665902195UL,
                                                          1987439155030896717UL }))) *
                       (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                         14760208106156268938UL,
                                                         15246749619665902195UL,
                                                         1987439155030896717UL }))) +
                      (poseidon2_B_20_1 + FF(0))) +
                     (poseidon2_B_20_2 + FF(0))) +
                    (poseidon2_B_20_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<102>(evals) += tmp;
        }
        // Contribution 103
        {
            Avm_DECLARE_VIEWS(103);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_21_3 -
                  (((poseidon2_B_20_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                            14760208106156268938UL,
                                                            15246749619665902195UL,
                                                            1987439155030896717UL })) *
                          (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                            14760208106156268938UL,
                                                            15246749619665902195UL,
                                                            1987439155030896717UL }))) *
                         (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                           14760208106156268938UL,
                                                           15246749619665902195UL,
                                                           1987439155030896717UL }))) *
                        (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                          14760208106156268938UL,
                                                          15246749619665902195UL,
                                                          1987439155030896717UL }))) *
                       (poseidon2_B_20_0 + FF(uint256_t{ 12103741763020280571UL,
                                                         14760208106156268938UL,
                                                         15246749619665902195UL,
                                                         1987439155030896717UL }))) +
                      (poseidon2_B_20_1 + FF(0))) +
                     (poseidon2_B_20_2 + FF(0))) +
                    (poseidon2_B_20_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<103>(evals) += tmp;
        }
        // Contribution 104
        {
            Avm_DECLARE_VIEWS(104);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_22_0 -
                  (((((((poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                          11335157279655967493UL,
                                                          16233357323017397007UL,
                                                          2124770605461456708UL })) *
                        (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                          11335157279655967493UL,
                                                          16233357323017397007UL,
                                                          2124770605461456708UL }))) *
                       (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                         11335157279655967493UL,
                                                         16233357323017397007UL,
                                                         2124770605461456708UL }))) *
                      (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                        11335157279655967493UL,
                                                        16233357323017397007UL,
                                                        2124770605461456708UL }))) *
                     (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                       11335157279655967493UL,
                                                       16233357323017397007UL,
                                                       2124770605461456708UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                            11335157279655967493UL,
                                                            16233357323017397007UL,
                                                            2124770605461456708UL })) *
                          (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                            11335157279655967493UL,
                                                            16233357323017397007UL,
                                                            2124770605461456708UL }))) *
                         (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                           11335157279655967493UL,
                                                           16233357323017397007UL,
                                                           2124770605461456708UL }))) *
                        (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                          11335157279655967493UL,
                                                          16233357323017397007UL,
                                                          2124770605461456708UL }))) *
                       (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                         11335157279655967493UL,
                                                         16233357323017397007UL,
                                                         2124770605461456708UL }))) +
                      (poseidon2_B_21_1 + FF(0))) +
                     (poseidon2_B_21_2 + FF(0))) +
                    (poseidon2_B_21_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<104>(evals) += tmp;
        }
        // Contribution 105
        {
            Avm_DECLARE_VIEWS(105);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_22_1 -
                  (((poseidon2_B_21_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                            11335157279655967493UL,
                                                            16233357323017397007UL,
                                                            2124770605461456708UL })) *
                          (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                            11335157279655967493UL,
                                                            16233357323017397007UL,
                                                            2124770605461456708UL }))) *
                         (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                           11335157279655967493UL,
                                                           16233357323017397007UL,
                                                           2124770605461456708UL }))) *
                        (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                          11335157279655967493UL,
                                                          16233357323017397007UL,
                                                          2124770605461456708UL }))) *
                       (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                         11335157279655967493UL,
                                                         16233357323017397007UL,
                                                         2124770605461456708UL }))) +
                      (poseidon2_B_21_1 + FF(0))) +
                     (poseidon2_B_21_2 + FF(0))) +
                    (poseidon2_B_21_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<105>(evals) += tmp;
        }
        // Contribution 106
        {
            Avm_DECLARE_VIEWS(106);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_22_2 -
                  (((poseidon2_B_21_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                            11335157279655967493UL,
                                                            16233357323017397007UL,
                                                            2124770605461456708UL })) *
                          (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                            11335157279655967493UL,
                                                            16233357323017397007UL,
                                                            2124770605461456708UL }))) *
                         (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                           11335157279655967493UL,
                                                           16233357323017397007UL,
                                                           2124770605461456708UL }))) *
                        (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                          11335157279655967493UL,
                                                          16233357323017397007UL,
                                                          2124770605461456708UL }))) *
                       (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                         11335157279655967493UL,
                                                         16233357323017397007UL,
                                                         2124770605461456708UL }))) +
                      (poseidon2_B_21_1 + FF(0))) +
                     (poseidon2_B_21_2 + FF(0))) +
                    (poseidon2_B_21_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<106>(evals) += tmp;
        }
        // Contribution 107
        {
            Avm_DECLARE_VIEWS(107);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_22_3 -
                  (((poseidon2_B_21_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                            11335157279655967493UL,
                                                            16233357323017397007UL,
                                                            2124770605461456708UL })) *
                          (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                            11335157279655967493UL,
                                                            16233357323017397007UL,
                                                            2124770605461456708UL }))) *
                         (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                           11335157279655967493UL,
                                                           16233357323017397007UL,
                                                           2124770605461456708UL }))) *
                        (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                          11335157279655967493UL,
                                                          16233357323017397007UL,
                                                          2124770605461456708UL }))) *
                       (poseidon2_B_21_0 + FF(uint256_t{ 326429241861474059UL,
                                                         11335157279655967493UL,
                                                         16233357323017397007UL,
                                                         2124770605461456708UL }))) +
                      (poseidon2_B_21_1 + FF(0))) +
                     (poseidon2_B_21_2 + FF(0))) +
                    (poseidon2_B_21_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<107>(evals) += tmp;
        }
        // Contribution 108
        {
            Avm_DECLARE_VIEWS(108);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_23_0 -
                  (((((((poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                          9765425316929074945UL,
                                                          10455054851855122687UL,
                                                          3371280263716451574UL })) *
                        (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                          9765425316929074945UL,
                                                          10455054851855122687UL,
                                                          3371280263716451574UL }))) *
                       (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                         9765425316929074945UL,
                                                         10455054851855122687UL,
                                                         3371280263716451574UL }))) *
                      (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                        9765425316929074945UL,
                                                        10455054851855122687UL,
                                                        3371280263716451574UL }))) *
                     (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                       9765425316929074945UL,
                                                       10455054851855122687UL,
                                                       3371280263716451574UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                            9765425316929074945UL,
                                                            10455054851855122687UL,
                                                            3371280263716451574UL })) *
                          (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                            9765425316929074945UL,
                                                            10455054851855122687UL,
                                                            3371280263716451574UL }))) *
                         (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                           9765425316929074945UL,
                                                           10455054851855122687UL,
                                                           3371280263716451574UL }))) *
                        (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                          9765425316929074945UL,
                                                          10455054851855122687UL,
                                                          3371280263716451574UL }))) *
                       (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                         9765425316929074945UL,
                                                         10455054851855122687UL,
                                                         3371280263716451574UL }))) +
                      (poseidon2_B_22_1 + FF(0))) +
                     (poseidon2_B_22_2 + FF(0))) +
                    (poseidon2_B_22_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<108>(evals) += tmp;
        }
        // Contribution 109
        {
            Avm_DECLARE_VIEWS(109);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_23_1 -
                  (((poseidon2_B_22_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                            9765425316929074945UL,
                                                            10455054851855122687UL,
                                                            3371280263716451574UL })) *
                          (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                            9765425316929074945UL,
                                                            10455054851855122687UL,
                                                            3371280263716451574UL }))) *
                         (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                           9765425316929074945UL,
                                                           10455054851855122687UL,
                                                           3371280263716451574UL }))) *
                        (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                          9765425316929074945UL,
                                                          10455054851855122687UL,
                                                          3371280263716451574UL }))) *
                       (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                         9765425316929074945UL,
                                                         10455054851855122687UL,
                                                         3371280263716451574UL }))) +
                      (poseidon2_B_22_1 + FF(0))) +
                     (poseidon2_B_22_2 + FF(0))) +
                    (poseidon2_B_22_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<109>(evals) += tmp;
        }
        // Contribution 110
        {
            Avm_DECLARE_VIEWS(110);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_23_2 -
                  (((poseidon2_B_22_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                            9765425316929074945UL,
                                                            10455054851855122687UL,
                                                            3371280263716451574UL })) *
                          (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                            9765425316929074945UL,
                                                            10455054851855122687UL,
                                                            3371280263716451574UL }))) *
                         (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                           9765425316929074945UL,
                                                           10455054851855122687UL,
                                                           3371280263716451574UL }))) *
                        (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                          9765425316929074945UL,
                                                          10455054851855122687UL,
                                                          3371280263716451574UL }))) *
                       (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                         9765425316929074945UL,
                                                         10455054851855122687UL,
                                                         3371280263716451574UL }))) +
                      (poseidon2_B_22_1 + FF(0))) +
                     (poseidon2_B_22_2 + FF(0))) +
                    (poseidon2_B_22_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<110>(evals) += tmp;
        }
        // Contribution 111
        {
            Avm_DECLARE_VIEWS(111);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_23_3 -
                  (((poseidon2_B_22_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                            9765425316929074945UL,
                                                            10455054851855122687UL,
                                                            3371280263716451574UL })) *
                          (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                            9765425316929074945UL,
                                                            10455054851855122687UL,
                                                            3371280263716451574UL }))) *
                         (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                           9765425316929074945UL,
                                                           10455054851855122687UL,
                                                           3371280263716451574UL }))) *
                        (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                          9765425316929074945UL,
                                                          10455054851855122687UL,
                                                          3371280263716451574UL }))) *
                       (poseidon2_B_22_0 + FF(uint256_t{ 13507610432344102875UL,
                                                         9765425316929074945UL,
                                                         10455054851855122687UL,
                                                         3371280263716451574UL }))) +
                      (poseidon2_B_22_1 + FF(0))) +
                     (poseidon2_B_22_2 + FF(0))) +
                    (poseidon2_B_22_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<111>(evals) += tmp;
        }
        // Contribution 112
        {
            Avm_DECLARE_VIEWS(112);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_24_0 -
                  (((((((poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                          16916651192445074064UL,
                                                          12002862125451454299UL,
                                                          3293088726774108791UL })) *
                        (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                          16916651192445074064UL,
                                                          12002862125451454299UL,
                                                          3293088726774108791UL }))) *
                       (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                         16916651192445074064UL,
                                                         12002862125451454299UL,
                                                         3293088726774108791UL }))) *
                      (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                        16916651192445074064UL,
                                                        12002862125451454299UL,
                                                        3293088726774108791UL }))) *
                     (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                       16916651192445074064UL,
                                                       12002862125451454299UL,
                                                       3293088726774108791UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                            16916651192445074064UL,
                                                            12002862125451454299UL,
                                                            3293088726774108791UL })) *
                          (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                            16916651192445074064UL,
                                                            12002862125451454299UL,
                                                            3293088726774108791UL }))) *
                         (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                           16916651192445074064UL,
                                                           12002862125451454299UL,
                                                           3293088726774108791UL }))) *
                        (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                          16916651192445074064UL,
                                                          12002862125451454299UL,
                                                          3293088726774108791UL }))) *
                       (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                         16916651192445074064UL,
                                                         12002862125451454299UL,
                                                         3293088726774108791UL }))) +
                      (poseidon2_B_23_1 + FF(0))) +
                     (poseidon2_B_23_2 + FF(0))) +
                    (poseidon2_B_23_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<112>(evals) += tmp;
        }
        // Contribution 113
        {
            Avm_DECLARE_VIEWS(113);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_24_1 -
                  (((poseidon2_B_23_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                            16916651192445074064UL,
                                                            12002862125451454299UL,
                                                            3293088726774108791UL })) *
                          (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                            16916651192445074064UL,
                                                            12002862125451454299UL,
                                                            3293088726774108791UL }))) *
                         (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                           16916651192445074064UL,
                                                           12002862125451454299UL,
                                                           3293088726774108791UL }))) *
                        (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                          16916651192445074064UL,
                                                          12002862125451454299UL,
                                                          3293088726774108791UL }))) *
                       (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                         16916651192445074064UL,
                                                         12002862125451454299UL,
                                                         3293088726774108791UL }))) +
                      (poseidon2_B_23_1 + FF(0))) +
                     (poseidon2_B_23_2 + FF(0))) +
                    (poseidon2_B_23_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<113>(evals) += tmp;
        }
        // Contribution 114
        {
            Avm_DECLARE_VIEWS(114);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_24_2 -
                  (((poseidon2_B_23_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                            16916651192445074064UL,
                                                            12002862125451454299UL,
                                                            3293088726774108791UL })) *
                          (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                            16916651192445074064UL,
                                                            12002862125451454299UL,
                                                            3293088726774108791UL }))) *
                         (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                           16916651192445074064UL,
                                                           12002862125451454299UL,
                                                           3293088726774108791UL }))) *
                        (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                          16916651192445074064UL,
                                                          12002862125451454299UL,
                                                          3293088726774108791UL }))) *
                       (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                         16916651192445074064UL,
                                                         12002862125451454299UL,
                                                         3293088726774108791UL }))) +
                      (poseidon2_B_23_1 + FF(0))) +
                     (poseidon2_B_23_2 + FF(0))) +
                    (poseidon2_B_23_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<114>(evals) += tmp;
        }
        // Contribution 115
        {
            Avm_DECLARE_VIEWS(115);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_24_3 -
                  (((poseidon2_B_23_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                            16916651192445074064UL,
                                                            12002862125451454299UL,
                                                            3293088726774108791UL })) *
                          (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                            16916651192445074064UL,
                                                            12002862125451454299UL,
                                                            3293088726774108791UL }))) *
                         (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                           16916651192445074064UL,
                                                           12002862125451454299UL,
                                                           3293088726774108791UL }))) *
                        (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                          16916651192445074064UL,
                                                          12002862125451454299UL,
                                                          3293088726774108791UL }))) *
                       (poseidon2_B_23_0 + FF(uint256_t{ 9433430149246843174UL,
                                                         16916651192445074064UL,
                                                         12002862125451454299UL,
                                                         3293088726774108791UL }))) +
                      (poseidon2_B_23_1 + FF(0))) +
                     (poseidon2_B_23_2 + FF(0))) +
                    (poseidon2_B_23_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<115>(evals) += tmp;
        }
        // Contribution 116
        {
            Avm_DECLARE_VIEWS(116);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_25_0 -
                  (((((((poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                          10975964170403460506UL,
                                                          7594578539046143282UL,
                                                          441635248990433378UL })) *
                        (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                          10975964170403460506UL,
                                                          7594578539046143282UL,
                                                          441635248990433378UL }))) *
                       (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                         10975964170403460506UL,
                                                         7594578539046143282UL,
                                                         441635248990433378UL }))) *
                      (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                        10975964170403460506UL,
                                                        7594578539046143282UL,
                                                        441635248990433378UL }))) *
                     (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                       10975964170403460506UL,
                                                       7594578539046143282UL,
                                                       441635248990433378UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                            10975964170403460506UL,
                                                            7594578539046143282UL,
                                                            441635248990433378UL })) *
                          (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                            10975964170403460506UL,
                                                            7594578539046143282UL,
                                                            441635248990433378UL }))) *
                         (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                           10975964170403460506UL,
                                                           7594578539046143282UL,
                                                           441635248990433378UL }))) *
                        (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                          10975964170403460506UL,
                                                          7594578539046143282UL,
                                                          441635248990433378UL }))) *
                       (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                         10975964170403460506UL,
                                                         7594578539046143282UL,
                                                         441635248990433378UL }))) +
                      (poseidon2_B_24_1 + FF(0))) +
                     (poseidon2_B_24_2 + FF(0))) +
                    (poseidon2_B_24_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<116>(evals) += tmp;
        }
        // Contribution 117
        {
            Avm_DECLARE_VIEWS(117);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_25_1 -
                  (((poseidon2_B_24_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                            10975964170403460506UL,
                                                            7594578539046143282UL,
                                                            441635248990433378UL })) *
                          (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                            10975964170403460506UL,
                                                            7594578539046143282UL,
                                                            441635248990433378UL }))) *
                         (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                           10975964170403460506UL,
                                                           7594578539046143282UL,
                                                           441635248990433378UL }))) *
                        (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                          10975964170403460506UL,
                                                          7594578539046143282UL,
                                                          441635248990433378UL }))) *
                       (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                         10975964170403460506UL,
                                                         7594578539046143282UL,
                                                         441635248990433378UL }))) +
                      (poseidon2_B_24_1 + FF(0))) +
                     (poseidon2_B_24_2 + FF(0))) +
                    (poseidon2_B_24_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<117>(evals) += tmp;
        }
        // Contribution 118
        {
            Avm_DECLARE_VIEWS(118);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_25_2 -
                  (((poseidon2_B_24_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                            10975964170403460506UL,
                                                            7594578539046143282UL,
                                                            441635248990433378UL })) *
                          (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                            10975964170403460506UL,
                                                            7594578539046143282UL,
                                                            441635248990433378UL }))) *
                         (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                           10975964170403460506UL,
                                                           7594578539046143282UL,
                                                           441635248990433378UL }))) *
                        (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                          10975964170403460506UL,
                                                          7594578539046143282UL,
                                                          441635248990433378UL }))) *
                       (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                         10975964170403460506UL,
                                                         7594578539046143282UL,
                                                         441635248990433378UL }))) +
                      (poseidon2_B_24_1 + FF(0))) +
                     (poseidon2_B_24_2 + FF(0))) +
                    (poseidon2_B_24_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<118>(evals) += tmp;
        }
        // Contribution 119
        {
            Avm_DECLARE_VIEWS(119);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_25_3 -
                  (((poseidon2_B_24_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                            10975964170403460506UL,
                                                            7594578539046143282UL,
                                                            441635248990433378UL })) *
                          (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                            10975964170403460506UL,
                                                            7594578539046143282UL,
                                                            441635248990433378UL }))) *
                         (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                           10975964170403460506UL,
                                                           7594578539046143282UL,
                                                           441635248990433378UL }))) *
                        (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                          10975964170403460506UL,
                                                          7594578539046143282UL,
                                                          441635248990433378UL }))) *
                       (poseidon2_B_24_0 + FF(uint256_t{ 15895963712096768440UL,
                                                         10975964170403460506UL,
                                                         7594578539046143282UL,
                                                         441635248990433378UL }))) +
                      (poseidon2_B_24_1 + FF(0))) +
                     (poseidon2_B_24_2 + FF(0))) +
                    (poseidon2_B_24_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<119>(evals) += tmp;
        }
        // Contribution 120
        {
            Avm_DECLARE_VIEWS(120);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_26_0 -
                  (((((((poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                          2316046008873247993UL,
                                                          6273091099984972305UL,
                                                          531938487375579818UL })) *
                        (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                          2316046008873247993UL,
                                                          6273091099984972305UL,
                                                          531938487375579818UL }))) *
                       (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                         2316046008873247993UL,
                                                         6273091099984972305UL,
                                                         531938487375579818UL }))) *
                      (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                        2316046008873247993UL,
                                                        6273091099984972305UL,
                                                        531938487375579818UL }))) *
                     (poseidon2_B_25_0 +
                      FF(uint256_t{
                          55564641555031451UL, 2316046008873247993UL, 6273091099984972305UL, 531938487375579818UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                            2316046008873247993UL,
                                                            6273091099984972305UL,
                                                            531938487375579818UL })) *
                          (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                            2316046008873247993UL,
                                                            6273091099984972305UL,
                                                            531938487375579818UL }))) *
                         (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                           2316046008873247993UL,
                                                           6273091099984972305UL,
                                                           531938487375579818UL }))) *
                        (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                          2316046008873247993UL,
                                                          6273091099984972305UL,
                                                          531938487375579818UL }))) *
                       (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                         2316046008873247993UL,
                                                         6273091099984972305UL,
                                                         531938487375579818UL }))) +
                      (poseidon2_B_25_1 + FF(0))) +
                     (poseidon2_B_25_2 + FF(0))) +
                    (poseidon2_B_25_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<120>(evals) += tmp;
        }
        // Contribution 121
        {
            Avm_DECLARE_VIEWS(121);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_26_1 -
                  (((poseidon2_B_25_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                            2316046008873247993UL,
                                                            6273091099984972305UL,
                                                            531938487375579818UL })) *
                          (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                            2316046008873247993UL,
                                                            6273091099984972305UL,
                                                            531938487375579818UL }))) *
                         (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                           2316046008873247993UL,
                                                           6273091099984972305UL,
                                                           531938487375579818UL }))) *
                        (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                          2316046008873247993UL,
                                                          6273091099984972305UL,
                                                          531938487375579818UL }))) *
                       (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                         2316046008873247993UL,
                                                         6273091099984972305UL,
                                                         531938487375579818UL }))) +
                      (poseidon2_B_25_1 + FF(0))) +
                     (poseidon2_B_25_2 + FF(0))) +
                    (poseidon2_B_25_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<121>(evals) += tmp;
        }
        // Contribution 122
        {
            Avm_DECLARE_VIEWS(122);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_26_2 -
                  (((poseidon2_B_25_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                            2316046008873247993UL,
                                                            6273091099984972305UL,
                                                            531938487375579818UL })) *
                          (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                            2316046008873247993UL,
                                                            6273091099984972305UL,
                                                            531938487375579818UL }))) *
                         (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                           2316046008873247993UL,
                                                           6273091099984972305UL,
                                                           531938487375579818UL }))) *
                        (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                          2316046008873247993UL,
                                                          6273091099984972305UL,
                                                          531938487375579818UL }))) *
                       (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                         2316046008873247993UL,
                                                         6273091099984972305UL,
                                                         531938487375579818UL }))) +
                      (poseidon2_B_25_1 + FF(0))) +
                     (poseidon2_B_25_2 + FF(0))) +
                    (poseidon2_B_25_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<122>(evals) += tmp;
        }
        // Contribution 123
        {
            Avm_DECLARE_VIEWS(123);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_26_3 -
                  (((poseidon2_B_25_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                            2316046008873247993UL,
                                                            6273091099984972305UL,
                                                            531938487375579818UL })) *
                          (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                            2316046008873247993UL,
                                                            6273091099984972305UL,
                                                            531938487375579818UL }))) *
                         (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                           2316046008873247993UL,
                                                           6273091099984972305UL,
                                                           531938487375579818UL }))) *
                        (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                          2316046008873247993UL,
                                                          6273091099984972305UL,
                                                          531938487375579818UL }))) *
                       (poseidon2_B_25_0 + FF(uint256_t{ 55564641555031451UL,
                                                         2316046008873247993UL,
                                                         6273091099984972305UL,
                                                         531938487375579818UL }))) +
                      (poseidon2_B_25_1 + FF(0))) +
                     (poseidon2_B_25_2 + FF(0))) +
                    (poseidon2_B_25_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<123>(evals) += tmp;
        }
        // Contribution 124
        {
            Avm_DECLARE_VIEWS(124);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_27_0 -
                  (((((((poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                          6735239388814238924UL,
                                                          3181517889518583601UL,
                                                          2376846283559998361UL })) *
                        (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                          6735239388814238924UL,
                                                          3181517889518583601UL,
                                                          2376846283559998361UL }))) *
                       (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                         6735239388814238924UL,
                                                         3181517889518583601UL,
                                                         2376846283559998361UL }))) *
                      (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                        6735239388814238924UL,
                                                        3181517889518583601UL,
                                                        2376846283559998361UL }))) *
                     (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                       6735239388814238924UL,
                                                       3181517889518583601UL,
                                                       2376846283559998361UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                            6735239388814238924UL,
                                                            3181517889518583601UL,
                                                            2376846283559998361UL })) *
                          (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                            6735239388814238924UL,
                                                            3181517889518583601UL,
                                                            2376846283559998361UL }))) *
                         (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                           6735239388814238924UL,
                                                           3181517889518583601UL,
                                                           2376846283559998361UL }))) *
                        (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                          6735239388814238924UL,
                                                          3181517889518583601UL,
                                                          2376846283559998361UL }))) *
                       (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                         6735239388814238924UL,
                                                         3181517889518583601UL,
                                                         2376846283559998361UL }))) +
                      (poseidon2_B_26_1 + FF(0))) +
                     (poseidon2_B_26_2 + FF(0))) +
                    (poseidon2_B_26_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<124>(evals) += tmp;
        }
        // Contribution 125
        {
            Avm_DECLARE_VIEWS(125);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_27_1 -
                  (((poseidon2_B_26_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                            6735239388814238924UL,
                                                            3181517889518583601UL,
                                                            2376846283559998361UL })) *
                          (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                            6735239388814238924UL,
                                                            3181517889518583601UL,
                                                            2376846283559998361UL }))) *
                         (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                           6735239388814238924UL,
                                                           3181517889518583601UL,
                                                           2376846283559998361UL }))) *
                        (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                          6735239388814238924UL,
                                                          3181517889518583601UL,
                                                          2376846283559998361UL }))) *
                       (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                         6735239388814238924UL,
                                                         3181517889518583601UL,
                                                         2376846283559998361UL }))) +
                      (poseidon2_B_26_1 + FF(0))) +
                     (poseidon2_B_26_2 + FF(0))) +
                    (poseidon2_B_26_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<125>(evals) += tmp;
        }
        // Contribution 126
        {
            Avm_DECLARE_VIEWS(126);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_27_2 -
                  (((poseidon2_B_26_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                            6735239388814238924UL,
                                                            3181517889518583601UL,
                                                            2376846283559998361UL })) *
                          (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                            6735239388814238924UL,
                                                            3181517889518583601UL,
                                                            2376846283559998361UL }))) *
                         (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                           6735239388814238924UL,
                                                           3181517889518583601UL,
                                                           2376846283559998361UL }))) *
                        (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                          6735239388814238924UL,
                                                          3181517889518583601UL,
                                                          2376846283559998361UL }))) *
                       (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                         6735239388814238924UL,
                                                         3181517889518583601UL,
                                                         2376846283559998361UL }))) +
                      (poseidon2_B_26_1 + FF(0))) +
                     (poseidon2_B_26_2 + FF(0))) +
                    (poseidon2_B_26_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<126>(evals) += tmp;
        }
        // Contribution 127
        {
            Avm_DECLARE_VIEWS(127);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_27_3 -
                  (((poseidon2_B_26_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                            6735239388814238924UL,
                                                            3181517889518583601UL,
                                                            2376846283559998361UL })) *
                          (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                            6735239388814238924UL,
                                                            3181517889518583601UL,
                                                            2376846283559998361UL }))) *
                         (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                           6735239388814238924UL,
                                                           3181517889518583601UL,
                                                           2376846283559998361UL }))) *
                        (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                          6735239388814238924UL,
                                                          3181517889518583601UL,
                                                          2376846283559998361UL }))) *
                       (poseidon2_B_26_0 + FF(uint256_t{ 17845282940759944461UL,
                                                         6735239388814238924UL,
                                                         3181517889518583601UL,
                                                         2376846283559998361UL }))) +
                      (poseidon2_B_26_1 + FF(0))) +
                     (poseidon2_B_26_2 + FF(0))) +
                    (poseidon2_B_26_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<127>(evals) += tmp;
        }
        // Contribution 128
        {
            Avm_DECLARE_VIEWS(128);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_28_0 -
                  (((((((poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                          1165420652731038559UL,
                                                          12527303660854712762UL,
                                                          2717289076364278965UL })) *
                        (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                          1165420652731038559UL,
                                                          12527303660854712762UL,
                                                          2717289076364278965UL }))) *
                       (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                         1165420652731038559UL,
                                                         12527303660854712762UL,
                                                         2717289076364278965UL }))) *
                      (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                        1165420652731038559UL,
                                                        12527303660854712762UL,
                                                        2717289076364278965UL }))) *
                     (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                       1165420652731038559UL,
                                                       12527303660854712762UL,
                                                       2717289076364278965UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                            1165420652731038559UL,
                                                            12527303660854712762UL,
                                                            2717289076364278965UL })) *
                          (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                            1165420652731038559UL,
                                                            12527303660854712762UL,
                                                            2717289076364278965UL }))) *
                         (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                           1165420652731038559UL,
                                                           12527303660854712762UL,
                                                           2717289076364278965UL }))) *
                        (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                          1165420652731038559UL,
                                                          12527303660854712762UL,
                                                          2717289076364278965UL }))) *
                       (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                         1165420652731038559UL,
                                                         12527303660854712762UL,
                                                         2717289076364278965UL }))) +
                      (poseidon2_B_27_1 + FF(0))) +
                     (poseidon2_B_27_2 + FF(0))) +
                    (poseidon2_B_27_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<128>(evals) += tmp;
        }
        // Contribution 129
        {
            Avm_DECLARE_VIEWS(129);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_28_1 -
                  (((poseidon2_B_27_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                            1165420652731038559UL,
                                                            12527303660854712762UL,
                                                            2717289076364278965UL })) *
                          (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                            1165420652731038559UL,
                                                            12527303660854712762UL,
                                                            2717289076364278965UL }))) *
                         (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                           1165420652731038559UL,
                                                           12527303660854712762UL,
                                                           2717289076364278965UL }))) *
                        (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                          1165420652731038559UL,
                                                          12527303660854712762UL,
                                                          2717289076364278965UL }))) *
                       (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                         1165420652731038559UL,
                                                         12527303660854712762UL,
                                                         2717289076364278965UL }))) +
                      (poseidon2_B_27_1 + FF(0))) +
                     (poseidon2_B_27_2 + FF(0))) +
                    (poseidon2_B_27_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<129>(evals) += tmp;
        }
        // Contribution 130
        {
            Avm_DECLARE_VIEWS(130);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_28_2 -
                  (((poseidon2_B_27_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                            1165420652731038559UL,
                                                            12527303660854712762UL,
                                                            2717289076364278965UL })) *
                          (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                            1165420652731038559UL,
                                                            12527303660854712762UL,
                                                            2717289076364278965UL }))) *
                         (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                           1165420652731038559UL,
                                                           12527303660854712762UL,
                                                           2717289076364278965UL }))) *
                        (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                          1165420652731038559UL,
                                                          12527303660854712762UL,
                                                          2717289076364278965UL }))) *
                       (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                         1165420652731038559UL,
                                                         12527303660854712762UL,
                                                         2717289076364278965UL }))) +
                      (poseidon2_B_27_1 + FF(0))) +
                     (poseidon2_B_27_2 + FF(0))) +
                    (poseidon2_B_27_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<130>(evals) += tmp;
        }
        // Contribution 131
        {
            Avm_DECLARE_VIEWS(131);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_28_3 -
                  (((poseidon2_B_27_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                            1165420652731038559UL,
                                                            12527303660854712762UL,
                                                            2717289076364278965UL })) *
                          (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                            1165420652731038559UL,
                                                            12527303660854712762UL,
                                                            2717289076364278965UL }))) *
                         (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                           1165420652731038559UL,
                                                           12527303660854712762UL,
                                                           2717289076364278965UL }))) *
                        (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                          1165420652731038559UL,
                                                          12527303660854712762UL,
                                                          2717289076364278965UL }))) *
                       (poseidon2_B_27_0 + FF(uint256_t{ 14097127963645492314UL,
                                                         1165420652731038559UL,
                                                         12527303660854712762UL,
                                                         2717289076364278965UL }))) +
                      (poseidon2_B_27_1 + FF(0))) +
                     (poseidon2_B_27_2 + FF(0))) +
                    (poseidon2_B_27_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<131>(evals) += tmp;
        }
        // Contribution 132
        {
            Avm_DECLARE_VIEWS(132);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_29_0 -
                  (((((((poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                          255324662529267034UL,
                                                          11859356122961343981UL,
                                                          2571979992654075442UL })) *
                        (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                          255324662529267034UL,
                                                          11859356122961343981UL,
                                                          2571979992654075442UL }))) *
                       (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                         255324662529267034UL,
                                                         11859356122961343981UL,
                                                         2571979992654075442UL }))) *
                      (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                        255324662529267034UL,
                                                        11859356122961343981UL,
                                                        2571979992654075442UL }))) *
                     (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                       255324662529267034UL,
                                                       11859356122961343981UL,
                                                       2571979992654075442UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                            255324662529267034UL,
                                                            11859356122961343981UL,
                                                            2571979992654075442UL })) *
                          (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                            255324662529267034UL,
                                                            11859356122961343981UL,
                                                            2571979992654075442UL }))) *
                         (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                           255324662529267034UL,
                                                           11859356122961343981UL,
                                                           2571979992654075442UL }))) *
                        (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                          255324662529267034UL,
                                                          11859356122961343981UL,
                                                          2571979992654075442UL }))) *
                       (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                         255324662529267034UL,
                                                         11859356122961343981UL,
                                                         2571979992654075442UL }))) +
                      (poseidon2_B_28_1 + FF(0))) +
                     (poseidon2_B_28_2 + FF(0))) +
                    (poseidon2_B_28_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<132>(evals) += tmp;
        }
        // Contribution 133
        {
            Avm_DECLARE_VIEWS(133);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_29_1 -
                  (((poseidon2_B_28_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                            255324662529267034UL,
                                                            11859356122961343981UL,
                                                            2571979992654075442UL })) *
                          (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                            255324662529267034UL,
                                                            11859356122961343981UL,
                                                            2571979992654075442UL }))) *
                         (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                           255324662529267034UL,
                                                           11859356122961343981UL,
                                                           2571979992654075442UL }))) *
                        (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                          255324662529267034UL,
                                                          11859356122961343981UL,
                                                          2571979992654075442UL }))) *
                       (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                         255324662529267034UL,
                                                         11859356122961343981UL,
                                                         2571979992654075442UL }))) +
                      (poseidon2_B_28_1 + FF(0))) +
                     (poseidon2_B_28_2 + FF(0))) +
                    (poseidon2_B_28_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<133>(evals) += tmp;
        }
        // Contribution 134
        {
            Avm_DECLARE_VIEWS(134);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_29_2 -
                  (((poseidon2_B_28_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                            255324662529267034UL,
                                                            11859356122961343981UL,
                                                            2571979992654075442UL })) *
                          (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                            255324662529267034UL,
                                                            11859356122961343981UL,
                                                            2571979992654075442UL }))) *
                         (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                           255324662529267034UL,
                                                           11859356122961343981UL,
                                                           2571979992654075442UL }))) *
                        (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                          255324662529267034UL,
                                                          11859356122961343981UL,
                                                          2571979992654075442UL }))) *
                       (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                         255324662529267034UL,
                                                         11859356122961343981UL,
                                                         2571979992654075442UL }))) +
                      (poseidon2_B_28_1 + FF(0))) +
                     (poseidon2_B_28_2 + FF(0))) +
                    (poseidon2_B_28_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<134>(evals) += tmp;
        }
        // Contribution 135
        {
            Avm_DECLARE_VIEWS(135);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_29_3 -
                  (((poseidon2_B_28_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                            255324662529267034UL,
                                                            11859356122961343981UL,
                                                            2571979992654075442UL })) *
                          (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                            255324662529267034UL,
                                                            11859356122961343981UL,
                                                            2571979992654075442UL }))) *
                         (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                           255324662529267034UL,
                                                           11859356122961343981UL,
                                                           2571979992654075442UL }))) *
                        (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                          255324662529267034UL,
                                                          11859356122961343981UL,
                                                          2571979992654075442UL }))) *
                       (poseidon2_B_28_0 + FF(uint256_t{ 15600044695084040011UL,
                                                         255324662529267034UL,
                                                         11859356122961343981UL,
                                                         2571979992654075442UL }))) +
                      (poseidon2_B_28_1 + FF(0))) +
                     (poseidon2_B_28_2 + FF(0))) +
                    (poseidon2_B_28_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<135>(evals) += tmp;
        }
        // Contribution 136
        {
            Avm_DECLARE_VIEWS(136);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_30_0 -
                  (((((((poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                          1086723465680833706UL,
                                                          6948011514366564799UL,
                                                          2482410610948543635UL })) *
                        (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                          1086723465680833706UL,
                                                          6948011514366564799UL,
                                                          2482410610948543635UL }))) *
                       (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                         1086723465680833706UL,
                                                         6948011514366564799UL,
                                                         2482410610948543635UL }))) *
                      (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                        1086723465680833706UL,
                                                        6948011514366564799UL,
                                                        2482410610948543635UL }))) *
                     (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                       1086723465680833706UL,
                                                       6948011514366564799UL,
                                                       2482410610948543635UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                            1086723465680833706UL,
                                                            6948011514366564799UL,
                                                            2482410610948543635UL })) *
                          (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                            1086723465680833706UL,
                                                            6948011514366564799UL,
                                                            2482410610948543635UL }))) *
                         (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                           1086723465680833706UL,
                                                           6948011514366564799UL,
                                                           2482410610948543635UL }))) *
                        (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                          1086723465680833706UL,
                                                          6948011514366564799UL,
                                                          2482410610948543635UL }))) *
                       (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                         1086723465680833706UL,
                                                         6948011514366564799UL,
                                                         2482410610948543635UL }))) +
                      (poseidon2_B_29_1 + FF(0))) +
                     (poseidon2_B_29_2 + FF(0))) +
                    (poseidon2_B_29_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<136>(evals) += tmp;
        }
        // Contribution 137
        {
            Avm_DECLARE_VIEWS(137);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_30_1 -
                  (((poseidon2_B_29_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                            1086723465680833706UL,
                                                            6948011514366564799UL,
                                                            2482410610948543635UL })) *
                          (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                            1086723465680833706UL,
                                                            6948011514366564799UL,
                                                            2482410610948543635UL }))) *
                         (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                           1086723465680833706UL,
                                                           6948011514366564799UL,
                                                           2482410610948543635UL }))) *
                        (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                          1086723465680833706UL,
                                                          6948011514366564799UL,
                                                          2482410610948543635UL }))) *
                       (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                         1086723465680833706UL,
                                                         6948011514366564799UL,
                                                         2482410610948543635UL }))) +
                      (poseidon2_B_29_1 + FF(0))) +
                     (poseidon2_B_29_2 + FF(0))) +
                    (poseidon2_B_29_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<137>(evals) += tmp;
        }
        // Contribution 138
        {
            Avm_DECLARE_VIEWS(138);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_30_2 -
                  (((poseidon2_B_29_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                            1086723465680833706UL,
                                                            6948011514366564799UL,
                                                            2482410610948543635UL })) *
                          (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                            1086723465680833706UL,
                                                            6948011514366564799UL,
                                                            2482410610948543635UL }))) *
                         (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                           1086723465680833706UL,
                                                           6948011514366564799UL,
                                                           2482410610948543635UL }))) *
                        (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                          1086723465680833706UL,
                                                          6948011514366564799UL,
                                                          2482410610948543635UL }))) *
                       (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                         1086723465680833706UL,
                                                         6948011514366564799UL,
                                                         2482410610948543635UL }))) +
                      (poseidon2_B_29_1 + FF(0))) +
                     (poseidon2_B_29_2 + FF(0))) +
                    (poseidon2_B_29_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<138>(evals) += tmp;
        }
        // Contribution 139
        {
            Avm_DECLARE_VIEWS(139);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_30_3 -
                  (((poseidon2_B_29_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                            1086723465680833706UL,
                                                            6948011514366564799UL,
                                                            2482410610948543635UL })) *
                          (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                            1086723465680833706UL,
                                                            6948011514366564799UL,
                                                            2482410610948543635UL }))) *
                         (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                           1086723465680833706UL,
                                                           6948011514366564799UL,
                                                           2482410610948543635UL }))) *
                        (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                          1086723465680833706UL,
                                                          6948011514366564799UL,
                                                          2482410610948543635UL }))) *
                       (poseidon2_B_29_0 + FF(uint256_t{ 1589817027469470176UL,
                                                         1086723465680833706UL,
                                                         6948011514366564799UL,
                                                         2482410610948543635UL }))) +
                      (poseidon2_B_29_1 + FF(0))) +
                     (poseidon2_B_29_2 + FF(0))) +
                    (poseidon2_B_29_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<139>(evals) += tmp;
        }
        // Contribution 140
        {
            Avm_DECLARE_VIEWS(140);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_31_0 -
                  (((((((poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                          16554668458221199618UL,
                                                          16319484688832471879UL,
                                                          2792452762383364279UL })) *
                        (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                          16554668458221199618UL,
                                                          16319484688832471879UL,
                                                          2792452762383364279UL }))) *
                       (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                         16554668458221199618UL,
                                                         16319484688832471879UL,
                                                         2792452762383364279UL }))) *
                      (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                        16554668458221199618UL,
                                                        16319484688832471879UL,
                                                        2792452762383364279UL }))) *
                     (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                       16554668458221199618UL,
                                                       16319484688832471879UL,
                                                       2792452762383364279UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                            16554668458221199618UL,
                                                            16319484688832471879UL,
                                                            2792452762383364279UL })) *
                          (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                            16554668458221199618UL,
                                                            16319484688832471879UL,
                                                            2792452762383364279UL }))) *
                         (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                           16554668458221199618UL,
                                                           16319484688832471879UL,
                                                           2792452762383364279UL }))) *
                        (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                          16554668458221199618UL,
                                                          16319484688832471879UL,
                                                          2792452762383364279UL }))) *
                       (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                         16554668458221199618UL,
                                                         16319484688832471879UL,
                                                         2792452762383364279UL }))) +
                      (poseidon2_B_30_1 + FF(0))) +
                     (poseidon2_B_30_2 + FF(0))) +
                    (poseidon2_B_30_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<140>(evals) += tmp;
        }
        // Contribution 141
        {
            Avm_DECLARE_VIEWS(141);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_31_1 -
                  (((poseidon2_B_30_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                            16554668458221199618UL,
                                                            16319484688832471879UL,
                                                            2792452762383364279UL })) *
                          (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                            16554668458221199618UL,
                                                            16319484688832471879UL,
                                                            2792452762383364279UL }))) *
                         (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                           16554668458221199618UL,
                                                           16319484688832471879UL,
                                                           2792452762383364279UL }))) *
                        (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                          16554668458221199618UL,
                                                          16319484688832471879UL,
                                                          2792452762383364279UL }))) *
                       (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                         16554668458221199618UL,
                                                         16319484688832471879UL,
                                                         2792452762383364279UL }))) +
                      (poseidon2_B_30_1 + FF(0))) +
                     (poseidon2_B_30_2 + FF(0))) +
                    (poseidon2_B_30_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<141>(evals) += tmp;
        }
        // Contribution 142
        {
            Avm_DECLARE_VIEWS(142);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_31_2 -
                  (((poseidon2_B_30_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                            16554668458221199618UL,
                                                            16319484688832471879UL,
                                                            2792452762383364279UL })) *
                          (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                            16554668458221199618UL,
                                                            16319484688832471879UL,
                                                            2792452762383364279UL }))) *
                         (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                           16554668458221199618UL,
                                                           16319484688832471879UL,
                                                           2792452762383364279UL }))) *
                        (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                          16554668458221199618UL,
                                                          16319484688832471879UL,
                                                          2792452762383364279UL }))) *
                       (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                         16554668458221199618UL,
                                                         16319484688832471879UL,
                                                         2792452762383364279UL }))) +
                      (poseidon2_B_30_1 + FF(0))) +
                     (poseidon2_B_30_2 + FF(0))) +
                    (poseidon2_B_30_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<142>(evals) += tmp;
        }
        // Contribution 143
        {
            Avm_DECLARE_VIEWS(143);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_31_3 -
                  (((poseidon2_B_30_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                            16554668458221199618UL,
                                                            16319484688832471879UL,
                                                            2792452762383364279UL })) *
                          (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                            16554668458221199618UL,
                                                            16319484688832471879UL,
                                                            2792452762383364279UL }))) *
                         (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                           16554668458221199618UL,
                                                           16319484688832471879UL,
                                                           2792452762383364279UL }))) *
                        (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                          16554668458221199618UL,
                                                          16319484688832471879UL,
                                                          2792452762383364279UL }))) *
                       (poseidon2_B_30_0 + FF(uint256_t{ 6071201116374785253UL,
                                                         16554668458221199618UL,
                                                         16319484688832471879UL,
                                                         2792452762383364279UL }))) +
                      (poseidon2_B_30_1 + FF(0))) +
                     (poseidon2_B_30_2 + FF(0))) +
                    (poseidon2_B_30_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<143>(evals) += tmp;
        }
        // Contribution 144
        {
            Avm_DECLARE_VIEWS(144);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_32_0 -
                  (((((((poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                          1831807297936988201UL,
                                                          16757520396573457190UL,
                                                          508291910620511162UL })) *
                        (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                          1831807297936988201UL,
                                                          16757520396573457190UL,
                                                          508291910620511162UL }))) *
                       (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                         1831807297936988201UL,
                                                         16757520396573457190UL,
                                                         508291910620511162UL }))) *
                      (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                        1831807297936988201UL,
                                                        16757520396573457190UL,
                                                        508291910620511162UL }))) *
                     (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                       1831807297936988201UL,
                                                       16757520396573457190UL,
                                                       508291910620511162UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                            1831807297936988201UL,
                                                            16757520396573457190UL,
                                                            508291910620511162UL })) *
                          (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                            1831807297936988201UL,
                                                            16757520396573457190UL,
                                                            508291910620511162UL }))) *
                         (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                           1831807297936988201UL,
                                                           16757520396573457190UL,
                                                           508291910620511162UL }))) *
                        (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                          1831807297936988201UL,
                                                          16757520396573457190UL,
                                                          508291910620511162UL }))) *
                       (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                         1831807297936988201UL,
                                                         16757520396573457190UL,
                                                         508291910620511162UL }))) +
                      (poseidon2_B_31_1 + FF(0))) +
                     (poseidon2_B_31_2 + FF(0))) +
                    (poseidon2_B_31_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<144>(evals) += tmp;
        }
        // Contribution 145
        {
            Avm_DECLARE_VIEWS(145);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_32_1 -
                  (((poseidon2_B_31_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                            1831807297936988201UL,
                                                            16757520396573457190UL,
                                                            508291910620511162UL })) *
                          (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                            1831807297936988201UL,
                                                            16757520396573457190UL,
                                                            508291910620511162UL }))) *
                         (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                           1831807297936988201UL,
                                                           16757520396573457190UL,
                                                           508291910620511162UL }))) *
                        (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                          1831807297936988201UL,
                                                          16757520396573457190UL,
                                                          508291910620511162UL }))) *
                       (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                         1831807297936988201UL,
                                                         16757520396573457190UL,
                                                         508291910620511162UL }))) +
                      (poseidon2_B_31_1 + FF(0))) +
                     (poseidon2_B_31_2 + FF(0))) +
                    (poseidon2_B_31_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<145>(evals) += tmp;
        }
        // Contribution 146
        {
            Avm_DECLARE_VIEWS(146);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_32_2 -
                  (((poseidon2_B_31_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                            1831807297936988201UL,
                                                            16757520396573457190UL,
                                                            508291910620511162UL })) *
                          (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                            1831807297936988201UL,
                                                            16757520396573457190UL,
                                                            508291910620511162UL }))) *
                         (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                           1831807297936988201UL,
                                                           16757520396573457190UL,
                                                           508291910620511162UL }))) *
                        (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                          1831807297936988201UL,
                                                          16757520396573457190UL,
                                                          508291910620511162UL }))) *
                       (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                         1831807297936988201UL,
                                                         16757520396573457190UL,
                                                         508291910620511162UL }))) +
                      (poseidon2_B_31_1 + FF(0))) +
                     (poseidon2_B_31_2 + FF(0))) +
                    (poseidon2_B_31_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<146>(evals) += tmp;
        }
        // Contribution 147
        {
            Avm_DECLARE_VIEWS(147);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_32_3 -
                  (((poseidon2_B_31_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                            1831807297936988201UL,
                                                            16757520396573457190UL,
                                                            508291910620511162UL })) *
                          (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                            1831807297936988201UL,
                                                            16757520396573457190UL,
                                                            508291910620511162UL }))) *
                         (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                           1831807297936988201UL,
                                                           16757520396573457190UL,
                                                           508291910620511162UL }))) *
                        (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                          1831807297936988201UL,
                                                          16757520396573457190UL,
                                                          508291910620511162UL }))) *
                       (poseidon2_B_31_0 + FF(uint256_t{ 13535048470209809113UL,
                                                         1831807297936988201UL,
                                                         16757520396573457190UL,
                                                         508291910620511162UL }))) +
                      (poseidon2_B_31_1 + FF(0))) +
                     (poseidon2_B_31_2 + FF(0))) +
                    (poseidon2_B_31_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<147>(evals) += tmp;
        }
        // Contribution 148
        {
            Avm_DECLARE_VIEWS(148);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_33_0 -
                  (((((((poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                          14033399912488027565UL,
                                                          12701200401813783486UL,
                                                          1348363389498465135UL })) *
                        (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                          14033399912488027565UL,
                                                          12701200401813783486UL,
                                                          1348363389498465135UL }))) *
                       (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                         14033399912488027565UL,
                                                         12701200401813783486UL,
                                                         1348363389498465135UL }))) *
                      (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                        14033399912488027565UL,
                                                        12701200401813783486UL,
                                                        1348363389498465135UL }))) *
                     (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                       14033399912488027565UL,
                                                       12701200401813783486UL,
                                                       1348363389498465135UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                            14033399912488027565UL,
                                                            12701200401813783486UL,
                                                            1348363389498465135UL })) *
                          (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                            14033399912488027565UL,
                                                            12701200401813783486UL,
                                                            1348363389498465135UL }))) *
                         (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                           14033399912488027565UL,
                                                           12701200401813783486UL,
                                                           1348363389498465135UL }))) *
                        (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                          14033399912488027565UL,
                                                          12701200401813783486UL,
                                                          1348363389498465135UL }))) *
                       (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                         14033399912488027565UL,
                                                         12701200401813783486UL,
                                                         1348363389498465135UL }))) +
                      (poseidon2_B_32_1 + FF(0))) +
                     (poseidon2_B_32_2 + FF(0))) +
                    (poseidon2_B_32_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<148>(evals) += tmp;
        }
        // Contribution 149
        {
            Avm_DECLARE_VIEWS(149);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_33_1 -
                  (((poseidon2_B_32_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                            14033399912488027565UL,
                                                            12701200401813783486UL,
                                                            1348363389498465135UL })) *
                          (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                            14033399912488027565UL,
                                                            12701200401813783486UL,
                                                            1348363389498465135UL }))) *
                         (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                           14033399912488027565UL,
                                                           12701200401813783486UL,
                                                           1348363389498465135UL }))) *
                        (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                          14033399912488027565UL,
                                                          12701200401813783486UL,
                                                          1348363389498465135UL }))) *
                       (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                         14033399912488027565UL,
                                                         12701200401813783486UL,
                                                         1348363389498465135UL }))) +
                      (poseidon2_B_32_1 + FF(0))) +
                     (poseidon2_B_32_2 + FF(0))) +
                    (poseidon2_B_32_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<149>(evals) += tmp;
        }
        // Contribution 150
        {
            Avm_DECLARE_VIEWS(150);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_33_2 -
                  (((poseidon2_B_32_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                            14033399912488027565UL,
                                                            12701200401813783486UL,
                                                            1348363389498465135UL })) *
                          (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                            14033399912488027565UL,
                                                            12701200401813783486UL,
                                                            1348363389498465135UL }))) *
                         (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                           14033399912488027565UL,
                                                           12701200401813783486UL,
                                                           1348363389498465135UL }))) *
                        (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                          14033399912488027565UL,
                                                          12701200401813783486UL,
                                                          1348363389498465135UL }))) *
                       (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                         14033399912488027565UL,
                                                         12701200401813783486UL,
                                                         1348363389498465135UL }))) +
                      (poseidon2_B_32_1 + FF(0))) +
                     (poseidon2_B_32_2 + FF(0))) +
                    (poseidon2_B_32_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<150>(evals) += tmp;
        }
        // Contribution 151
        {
            Avm_DECLARE_VIEWS(151);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_33_3 -
                  (((poseidon2_B_32_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                            14033399912488027565UL,
                                                            12701200401813783486UL,
                                                            1348363389498465135UL })) *
                          (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                            14033399912488027565UL,
                                                            12701200401813783486UL,
                                                            1348363389498465135UL }))) *
                         (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                           14033399912488027565UL,
                                                           12701200401813783486UL,
                                                           1348363389498465135UL }))) *
                        (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                          14033399912488027565UL,
                                                          12701200401813783486UL,
                                                          1348363389498465135UL }))) *
                       (poseidon2_B_32_0 + FF(uint256_t{ 6946737468087619802UL,
                                                         14033399912488027565UL,
                                                         12701200401813783486UL,
                                                         1348363389498465135UL }))) +
                      (poseidon2_B_32_1 + FF(0))) +
                     (poseidon2_B_32_2 + FF(0))) +
                    (poseidon2_B_32_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<151>(evals) += tmp;
        }
        // Contribution 152
        {
            Avm_DECLARE_VIEWS(152);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_34_0 -
                  (((((((poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                          13866524545426155292UL,
                                                          4317879914214157329UL,
                                                          2633928310905799638UL })) *
                        (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                          13866524545426155292UL,
                                                          4317879914214157329UL,
                                                          2633928310905799638UL }))) *
                       (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                         13866524545426155292UL,
                                                         4317879914214157329UL,
                                                         2633928310905799638UL }))) *
                      (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                        13866524545426155292UL,
                                                        4317879914214157329UL,
                                                        2633928310905799638UL }))) *
                     (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                       13866524545426155292UL,
                                                       4317879914214157329UL,
                                                       2633928310905799638UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                            13866524545426155292UL,
                                                            4317879914214157329UL,
                                                            2633928310905799638UL })) *
                          (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                            13866524545426155292UL,
                                                            4317879914214157329UL,
                                                            2633928310905799638UL }))) *
                         (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                           13866524545426155292UL,
                                                           4317879914214157329UL,
                                                           2633928310905799638UL }))) *
                        (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                          13866524545426155292UL,
                                                          4317879914214157329UL,
                                                          2633928310905799638UL }))) *
                       (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                         13866524545426155292UL,
                                                         4317879914214157329UL,
                                                         2633928310905799638UL }))) +
                      (poseidon2_B_33_1 + FF(0))) +
                     (poseidon2_B_33_2 + FF(0))) +
                    (poseidon2_B_33_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<152>(evals) += tmp;
        }
        // Contribution 153
        {
            Avm_DECLARE_VIEWS(153);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_34_1 -
                  (((poseidon2_B_33_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                            13866524545426155292UL,
                                                            4317879914214157329UL,
                                                            2633928310905799638UL })) *
                          (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                            13866524545426155292UL,
                                                            4317879914214157329UL,
                                                            2633928310905799638UL }))) *
                         (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                           13866524545426155292UL,
                                                           4317879914214157329UL,
                                                           2633928310905799638UL }))) *
                        (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                          13866524545426155292UL,
                                                          4317879914214157329UL,
                                                          2633928310905799638UL }))) *
                       (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                         13866524545426155292UL,
                                                         4317879914214157329UL,
                                                         2633928310905799638UL }))) +
                      (poseidon2_B_33_1 + FF(0))) +
                     (poseidon2_B_33_2 + FF(0))) +
                    (poseidon2_B_33_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<153>(evals) += tmp;
        }
        // Contribution 154
        {
            Avm_DECLARE_VIEWS(154);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_34_2 -
                  (((poseidon2_B_33_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                            13866524545426155292UL,
                                                            4317879914214157329UL,
                                                            2633928310905799638UL })) *
                          (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                            13866524545426155292UL,
                                                            4317879914214157329UL,
                                                            2633928310905799638UL }))) *
                         (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                           13866524545426155292UL,
                                                           4317879914214157329UL,
                                                           2633928310905799638UL }))) *
                        (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                          13866524545426155292UL,
                                                          4317879914214157329UL,
                                                          2633928310905799638UL }))) *
                       (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                         13866524545426155292UL,
                                                         4317879914214157329UL,
                                                         2633928310905799638UL }))) +
                      (poseidon2_B_33_1 + FF(0))) +
                     (poseidon2_B_33_2 + FF(0))) +
                    (poseidon2_B_33_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<154>(evals) += tmp;
        }
        // Contribution 155
        {
            Avm_DECLARE_VIEWS(155);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_34_3 -
                  (((poseidon2_B_33_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                            13866524545426155292UL,
                                                            4317879914214157329UL,
                                                            2633928310905799638UL })) *
                          (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                            13866524545426155292UL,
                                                            4317879914214157329UL,
                                                            2633928310905799638UL }))) *
                         (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                           13866524545426155292UL,
                                                           4317879914214157329UL,
                                                           2633928310905799638UL }))) *
                        (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                          13866524545426155292UL,
                                                          4317879914214157329UL,
                                                          2633928310905799638UL }))) *
                       (poseidon2_B_33_0 + FF(uint256_t{ 6788008051328210729UL,
                                                         13866524545426155292UL,
                                                         4317879914214157329UL,
                                                         2633928310905799638UL }))) +
                      (poseidon2_B_33_1 + FF(0))) +
                     (poseidon2_B_33_2 + FF(0))) +
                    (poseidon2_B_33_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<155>(evals) += tmp;
        }
        // Contribution 156
        {
            Avm_DECLARE_VIEWS(156);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_35_0 -
                  (((((((poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                          10035686235057284266UL,
                                                          1656321729167440177UL,
                                                          1887128381037099784UL })) *
                        (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                          10035686235057284266UL,
                                                          1656321729167440177UL,
                                                          1887128381037099784UL }))) *
                       (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                         10035686235057284266UL,
                                                         1656321729167440177UL,
                                                         1887128381037099784UL }))) *
                      (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                        10035686235057284266UL,
                                                        1656321729167440177UL,
                                                        1887128381037099784UL }))) *
                     (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                       10035686235057284266UL,
                                                       1656321729167440177UL,
                                                       1887128381037099784UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                            10035686235057284266UL,
                                                            1656321729167440177UL,
                                                            1887128381037099784UL })) *
                          (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                            10035686235057284266UL,
                                                            1656321729167440177UL,
                                                            1887128381037099784UL }))) *
                         (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                           10035686235057284266UL,
                                                           1656321729167440177UL,
                                                           1887128381037099784UL }))) *
                        (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                          10035686235057284266UL,
                                                          1656321729167440177UL,
                                                          1887128381037099784UL }))) *
                       (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                         10035686235057284266UL,
                                                         1656321729167440177UL,
                                                         1887128381037099784UL }))) +
                      (poseidon2_B_34_1 + FF(0))) +
                     (poseidon2_B_34_2 + FF(0))) +
                    (poseidon2_B_34_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<156>(evals) += tmp;
        }
        // Contribution 157
        {
            Avm_DECLARE_VIEWS(157);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_35_1 -
                  (((poseidon2_B_34_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                            10035686235057284266UL,
                                                            1656321729167440177UL,
                                                            1887128381037099784UL })) *
                          (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                            10035686235057284266UL,
                                                            1656321729167440177UL,
                                                            1887128381037099784UL }))) *
                         (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                           10035686235057284266UL,
                                                           1656321729167440177UL,
                                                           1887128381037099784UL }))) *
                        (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                          10035686235057284266UL,
                                                          1656321729167440177UL,
                                                          1887128381037099784UL }))) *
                       (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                         10035686235057284266UL,
                                                         1656321729167440177UL,
                                                         1887128381037099784UL }))) +
                      (poseidon2_B_34_1 + FF(0))) +
                     (poseidon2_B_34_2 + FF(0))) +
                    (poseidon2_B_34_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<157>(evals) += tmp;
        }
        // Contribution 158
        {
            Avm_DECLARE_VIEWS(158);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_35_2 -
                  (((poseidon2_B_34_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                            10035686235057284266UL,
                                                            1656321729167440177UL,
                                                            1887128381037099784UL })) *
                          (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                            10035686235057284266UL,
                                                            1656321729167440177UL,
                                                            1887128381037099784UL }))) *
                         (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                           10035686235057284266UL,
                                                           1656321729167440177UL,
                                                           1887128381037099784UL }))) *
                        (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                          10035686235057284266UL,
                                                          1656321729167440177UL,
                                                          1887128381037099784UL }))) *
                       (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                         10035686235057284266UL,
                                                         1656321729167440177UL,
                                                         1887128381037099784UL }))) +
                      (poseidon2_B_34_1 + FF(0))) +
                     (poseidon2_B_34_2 + FF(0))) +
                    (poseidon2_B_34_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<158>(evals) += tmp;
        }
        // Contribution 159
        {
            Avm_DECLARE_VIEWS(159);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_35_3 -
                  (((poseidon2_B_34_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                            10035686235057284266UL,
                                                            1656321729167440177UL,
                                                            1887128381037099784UL })) *
                          (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                            10035686235057284266UL,
                                                            1656321729167440177UL,
                                                            1887128381037099784UL }))) *
                         (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                           10035686235057284266UL,
                                                           1656321729167440177UL,
                                                           1887128381037099784UL }))) *
                        (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                          10035686235057284266UL,
                                                          1656321729167440177UL,
                                                          1887128381037099784UL }))) *
                       (poseidon2_B_34_0 + FF(uint256_t{ 1183626302001490602UL,
                                                         10035686235057284266UL,
                                                         1656321729167440177UL,
                                                         1887128381037099784UL }))) +
                      (poseidon2_B_34_1 + FF(0))) +
                     (poseidon2_B_34_2 + FF(0))) +
                    (poseidon2_B_34_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<159>(evals) += tmp;
        }
        // Contribution 160
        {
            Avm_DECLARE_VIEWS(160);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_36_0 -
                  (((((((poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                          17650087760652370459UL,
                                                          14904592615785317921UL,
                                                          2929864473487096026UL })) *
                        (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                          17650087760652370459UL,
                                                          14904592615785317921UL,
                                                          2929864473487096026UL }))) *
                       (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                         17650087760652370459UL,
                                                         14904592615785317921UL,
                                                         2929864473487096026UL }))) *
                      (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                        17650087760652370459UL,
                                                        14904592615785317921UL,
                                                        2929864473487096026UL }))) *
                     (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                       17650087760652370459UL,
                                                       14904592615785317921UL,
                                                       2929864473487096026UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                            17650087760652370459UL,
                                                            14904592615785317921UL,
                                                            2929864473487096026UL })) *
                          (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                            17650087760652370459UL,
                                                            14904592615785317921UL,
                                                            2929864473487096026UL }))) *
                         (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                           17650087760652370459UL,
                                                           14904592615785317921UL,
                                                           2929864473487096026UL }))) *
                        (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                          17650087760652370459UL,
                                                          14904592615785317921UL,
                                                          2929864473487096026UL }))) *
                       (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                         17650087760652370459UL,
                                                         14904592615785317921UL,
                                                         2929864473487096026UL }))) +
                      (poseidon2_B_35_1 + FF(0))) +
                     (poseidon2_B_35_2 + FF(0))) +
                    (poseidon2_B_35_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<160>(evals) += tmp;
        }
        // Contribution 161
        {
            Avm_DECLARE_VIEWS(161);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_36_1 -
                  (((poseidon2_B_35_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                            17650087760652370459UL,
                                                            14904592615785317921UL,
                                                            2929864473487096026UL })) *
                          (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                            17650087760652370459UL,
                                                            14904592615785317921UL,
                                                            2929864473487096026UL }))) *
                         (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                           17650087760652370459UL,
                                                           14904592615785317921UL,
                                                           2929864473487096026UL }))) *
                        (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                          17650087760652370459UL,
                                                          14904592615785317921UL,
                                                          2929864473487096026UL }))) *
                       (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                         17650087760652370459UL,
                                                         14904592615785317921UL,
                                                         2929864473487096026UL }))) +
                      (poseidon2_B_35_1 + FF(0))) +
                     (poseidon2_B_35_2 + FF(0))) +
                    (poseidon2_B_35_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<161>(evals) += tmp;
        }
        // Contribution 162
        {
            Avm_DECLARE_VIEWS(162);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_36_2 -
                  (((poseidon2_B_35_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                            17650087760652370459UL,
                                                            14904592615785317921UL,
                                                            2929864473487096026UL })) *
                          (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                            17650087760652370459UL,
                                                            14904592615785317921UL,
                                                            2929864473487096026UL }))) *
                         (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                           17650087760652370459UL,
                                                           14904592615785317921UL,
                                                           2929864473487096026UL }))) *
                        (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                          17650087760652370459UL,
                                                          14904592615785317921UL,
                                                          2929864473487096026UL }))) *
                       (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                         17650087760652370459UL,
                                                         14904592615785317921UL,
                                                         2929864473487096026UL }))) +
                      (poseidon2_B_35_1 + FF(0))) +
                     (poseidon2_B_35_2 + FF(0))) +
                    (poseidon2_B_35_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<162>(evals) += tmp;
        }
        // Contribution 163
        {
            Avm_DECLARE_VIEWS(163);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_36_3 -
                  (((poseidon2_B_35_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                            17650087760652370459UL,
                                                            14904592615785317921UL,
                                                            2929864473487096026UL })) *
                          (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                            17650087760652370459UL,
                                                            14904592615785317921UL,
                                                            2929864473487096026UL }))) *
                         (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                           17650087760652370459UL,
                                                           14904592615785317921UL,
                                                           2929864473487096026UL }))) *
                        (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                          17650087760652370459UL,
                                                          14904592615785317921UL,
                                                          2929864473487096026UL }))) *
                       (poseidon2_B_35_0 + FF(uint256_t{ 964566190254741199UL,
                                                         17650087760652370459UL,
                                                         14904592615785317921UL,
                                                         2929864473487096026UL }))) +
                      (poseidon2_B_35_1 + FF(0))) +
                     (poseidon2_B_35_2 + FF(0))) +
                    (poseidon2_B_35_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<163>(evals) += tmp;
        }
        // Contribution 164
        {
            Avm_DECLARE_VIEWS(164);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_37_0 -
                  (((((((poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                          512534187550045064UL,
                                                          13489711551083721364UL,
                                                          41824696873363624UL })) *
                        (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                          512534187550045064UL,
                                                          13489711551083721364UL,
                                                          41824696873363624UL }))) *
                       (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                         512534187550045064UL,
                                                         13489711551083721364UL,
                                                         41824696873363624UL }))) *
                      (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                        512534187550045064UL,
                                                        13489711551083721364UL,
                                                        41824696873363624UL }))) *
                     (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                       512534187550045064UL,
                                                       13489711551083721364UL,
                                                       41824696873363624UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                            512534187550045064UL,
                                                            13489711551083721364UL,
                                                            41824696873363624UL })) *
                          (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                            512534187550045064UL,
                                                            13489711551083721364UL,
                                                            41824696873363624UL }))) *
                         (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                           512534187550045064UL,
                                                           13489711551083721364UL,
                                                           41824696873363624UL }))) *
                        (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                          512534187550045064UL,
                                                          13489711551083721364UL,
                                                          41824696873363624UL }))) *
                       (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                         512534187550045064UL,
                                                         13489711551083721364UL,
                                                         41824696873363624UL }))) +
                      (poseidon2_B_36_1 + FF(0))) +
                     (poseidon2_B_36_2 + FF(0))) +
                    (poseidon2_B_36_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<164>(evals) += tmp;
        }
        // Contribution 165
        {
            Avm_DECLARE_VIEWS(165);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_37_1 -
                  (((poseidon2_B_36_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                            512534187550045064UL,
                                                            13489711551083721364UL,
                                                            41824696873363624UL })) *
                          (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                            512534187550045064UL,
                                                            13489711551083721364UL,
                                                            41824696873363624UL }))) *
                         (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                           512534187550045064UL,
                                                           13489711551083721364UL,
                                                           41824696873363624UL }))) *
                        (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                          512534187550045064UL,
                                                          13489711551083721364UL,
                                                          41824696873363624UL }))) *
                       (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                         512534187550045064UL,
                                                         13489711551083721364UL,
                                                         41824696873363624UL }))) +
                      (poseidon2_B_36_1 + FF(0))) +
                     (poseidon2_B_36_2 + FF(0))) +
                    (poseidon2_B_36_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<165>(evals) += tmp;
        }
        // Contribution 166
        {
            Avm_DECLARE_VIEWS(166);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_37_2 -
                  (((poseidon2_B_36_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                            512534187550045064UL,
                                                            13489711551083721364UL,
                                                            41824696873363624UL })) *
                          (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                            512534187550045064UL,
                                                            13489711551083721364UL,
                                                            41824696873363624UL }))) *
                         (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                           512534187550045064UL,
                                                           13489711551083721364UL,
                                                           41824696873363624UL }))) *
                        (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                          512534187550045064UL,
                                                          13489711551083721364UL,
                                                          41824696873363624UL }))) *
                       (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                         512534187550045064UL,
                                                         13489711551083721364UL,
                                                         41824696873363624UL }))) +
                      (poseidon2_B_36_1 + FF(0))) +
                     (poseidon2_B_36_2 + FF(0))) +
                    (poseidon2_B_36_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<166>(evals) += tmp;
        }
        // Contribution 167
        {
            Avm_DECLARE_VIEWS(167);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_37_3 -
                  (((poseidon2_B_36_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                            512534187550045064UL,
                                                            13489711551083721364UL,
                                                            41824696873363624UL })) *
                          (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                            512534187550045064UL,
                                                            13489711551083721364UL,
                                                            41824696873363624UL }))) *
                         (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                           512534187550045064UL,
                                                           13489711551083721364UL,
                                                           41824696873363624UL }))) *
                        (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                          512534187550045064UL,
                                                          13489711551083721364UL,
                                                          41824696873363624UL }))) *
                       (poseidon2_B_36_0 + FF(uint256_t{ 13584300701347139198UL,
                                                         512534187550045064UL,
                                                         13489711551083721364UL,
                                                         41824696873363624UL }))) +
                      (poseidon2_B_36_1 + FF(0))) +
                     (poseidon2_B_36_2 + FF(0))) +
                    (poseidon2_B_36_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<167>(evals) += tmp;
        }
        // Contribution 168
        {
            Avm_DECLARE_VIEWS(168);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_38_0 -
                  (((((((poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                          6430987250922925699UL,
                                                          9294838151373947091UL,
                                                          348446557360066429UL })) *
                        (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                          6430987250922925699UL,
                                                          9294838151373947091UL,
                                                          348446557360066429UL }))) *
                       (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                         6430987250922925699UL,
                                                         9294838151373947091UL,
                                                         348446557360066429UL }))) *
                      (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                        6430987250922925699UL,
                                                        9294838151373947091UL,
                                                        348446557360066429UL }))) *
                     (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                       6430987250922925699UL,
                                                       9294838151373947091UL,
                                                       348446557360066429UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                            6430987250922925699UL,
                                                            9294838151373947091UL,
                                                            348446557360066429UL })) *
                          (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                            6430987250922925699UL,
                                                            9294838151373947091UL,
                                                            348446557360066429UL }))) *
                         (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                           6430987250922925699UL,
                                                           9294838151373947091UL,
                                                           348446557360066429UL }))) *
                        (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                          6430987250922925699UL,
                                                          9294838151373947091UL,
                                                          348446557360066429UL }))) *
                       (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                         6430987250922925699UL,
                                                         9294838151373947091UL,
                                                         348446557360066429UL }))) +
                      (poseidon2_B_37_1 + FF(0))) +
                     (poseidon2_B_37_2 + FF(0))) +
                    (poseidon2_B_37_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<168>(evals) += tmp;
        }
        // Contribution 169
        {
            Avm_DECLARE_VIEWS(169);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_38_1 -
                  (((poseidon2_B_37_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                            6430987250922925699UL,
                                                            9294838151373947091UL,
                                                            348446557360066429UL })) *
                          (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                            6430987250922925699UL,
                                                            9294838151373947091UL,
                                                            348446557360066429UL }))) *
                         (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                           6430987250922925699UL,
                                                           9294838151373947091UL,
                                                           348446557360066429UL }))) *
                        (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                          6430987250922925699UL,
                                                          9294838151373947091UL,
                                                          348446557360066429UL }))) *
                       (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                         6430987250922925699UL,
                                                         9294838151373947091UL,
                                                         348446557360066429UL }))) +
                      (poseidon2_B_37_1 + FF(0))) +
                     (poseidon2_B_37_2 + FF(0))) +
                    (poseidon2_B_37_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<169>(evals) += tmp;
        }
        // Contribution 170
        {
            Avm_DECLARE_VIEWS(170);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_38_2 -
                  (((poseidon2_B_37_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                            6430987250922925699UL,
                                                            9294838151373947091UL,
                                                            348446557360066429UL })) *
                          (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                            6430987250922925699UL,
                                                            9294838151373947091UL,
                                                            348446557360066429UL }))) *
                         (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                           6430987250922925699UL,
                                                           9294838151373947091UL,
                                                           348446557360066429UL }))) *
                        (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                          6430987250922925699UL,
                                                          9294838151373947091UL,
                                                          348446557360066429UL }))) *
                       (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                         6430987250922925699UL,
                                                         9294838151373947091UL,
                                                         348446557360066429UL }))) +
                      (poseidon2_B_37_1 + FF(0))) +
                     (poseidon2_B_37_2 + FF(0))) +
                    (poseidon2_B_37_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<170>(evals) += tmp;
        }
        // Contribution 171
        {
            Avm_DECLARE_VIEWS(171);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_38_3 -
                  (((poseidon2_B_37_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                            6430987250922925699UL,
                                                            9294838151373947091UL,
                                                            348446557360066429UL })) *
                          (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                            6430987250922925699UL,
                                                            9294838151373947091UL,
                                                            348446557360066429UL }))) *
                         (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                           6430987250922925699UL,
                                                           9294838151373947091UL,
                                                           348446557360066429UL }))) *
                        (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                          6430987250922925699UL,
                                                          9294838151373947091UL,
                                                          348446557360066429UL }))) *
                       (poseidon2_B_37_0 + FF(uint256_t{ 17586611824788147557UL,
                                                         6430987250922925699UL,
                                                         9294838151373947091UL,
                                                         348446557360066429UL }))) +
                      (poseidon2_B_37_1 + FF(0))) +
                     (poseidon2_B_37_2 + FF(0))) +
                    (poseidon2_B_37_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<171>(evals) += tmp;
        }
        // Contribution 172
        {
            Avm_DECLARE_VIEWS(172);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_39_0 -
                  (((((((poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                          14393211163878018166UL,
                                                          7154440178410267241UL,
                                                          3057088631006286899UL })) *
                        (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                          14393211163878018166UL,
                                                          7154440178410267241UL,
                                                          3057088631006286899UL }))) *
                       (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                         14393211163878018166UL,
                                                         7154440178410267241UL,
                                                         3057088631006286899UL }))) *
                      (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                        14393211163878018166UL,
                                                        7154440178410267241UL,
                                                        3057088631006286899UL }))) *
                     (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                       14393211163878018166UL,
                                                       7154440178410267241UL,
                                                       3057088631006286899UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                            14393211163878018166UL,
                                                            7154440178410267241UL,
                                                            3057088631006286899UL })) *
                          (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                            14393211163878018166UL,
                                                            7154440178410267241UL,
                                                            3057088631006286899UL }))) *
                         (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                           14393211163878018166UL,
                                                           7154440178410267241UL,
                                                           3057088631006286899UL }))) *
                        (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                          14393211163878018166UL,
                                                          7154440178410267241UL,
                                                          3057088631006286899UL }))) *
                       (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                         14393211163878018166UL,
                                                         7154440178410267241UL,
                                                         3057088631006286899UL }))) +
                      (poseidon2_B_38_1 + FF(0))) +
                     (poseidon2_B_38_2 + FF(0))) +
                    (poseidon2_B_38_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<172>(evals) += tmp;
        }
        // Contribution 173
        {
            Avm_DECLARE_VIEWS(173);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_39_1 -
                  (((poseidon2_B_38_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                            14393211163878018166UL,
                                                            7154440178410267241UL,
                                                            3057088631006286899UL })) *
                          (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                            14393211163878018166UL,
                                                            7154440178410267241UL,
                                                            3057088631006286899UL }))) *
                         (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                           14393211163878018166UL,
                                                           7154440178410267241UL,
                                                           3057088631006286899UL }))) *
                        (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                          14393211163878018166UL,
                                                          7154440178410267241UL,
                                                          3057088631006286899UL }))) *
                       (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                         14393211163878018166UL,
                                                         7154440178410267241UL,
                                                         3057088631006286899UL }))) +
                      (poseidon2_B_38_1 + FF(0))) +
                     (poseidon2_B_38_2 + FF(0))) +
                    (poseidon2_B_38_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<173>(evals) += tmp;
        }
        // Contribution 174
        {
            Avm_DECLARE_VIEWS(174);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_39_2 -
                  (((poseidon2_B_38_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                            14393211163878018166UL,
                                                            7154440178410267241UL,
                                                            3057088631006286899UL })) *
                          (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                            14393211163878018166UL,
                                                            7154440178410267241UL,
                                                            3057088631006286899UL }))) *
                         (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                           14393211163878018166UL,
                                                           7154440178410267241UL,
                                                           3057088631006286899UL }))) *
                        (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                          14393211163878018166UL,
                                                          7154440178410267241UL,
                                                          3057088631006286899UL }))) *
                       (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                         14393211163878018166UL,
                                                         7154440178410267241UL,
                                                         3057088631006286899UL }))) +
                      (poseidon2_B_38_1 + FF(0))) +
                     (poseidon2_B_38_2 + FF(0))) +
                    (poseidon2_B_38_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<174>(evals) += tmp;
        }
        // Contribution 175
        {
            Avm_DECLARE_VIEWS(175);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_39_3 -
                  (((poseidon2_B_38_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                            14393211163878018166UL,
                                                            7154440178410267241UL,
                                                            3057088631006286899UL })) *
                          (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                            14393211163878018166UL,
                                                            7154440178410267241UL,
                                                            3057088631006286899UL }))) *
                         (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                           14393211163878018166UL,
                                                           7154440178410267241UL,
                                                           3057088631006286899UL }))) *
                        (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                          14393211163878018166UL,
                                                          7154440178410267241UL,
                                                          3057088631006286899UL }))) *
                       (poseidon2_B_38_0 + FF(uint256_t{ 15025298913764434311UL,
                                                         14393211163878018166UL,
                                                         7154440178410267241UL,
                                                         3057088631006286899UL }))) +
                      (poseidon2_B_38_1 + FF(0))) +
                     (poseidon2_B_38_2 + FF(0))) +
                    (poseidon2_B_38_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<175>(evals) += tmp;
        }
        // Contribution 176
        {
            Avm_DECLARE_VIEWS(176);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_40_0 -
                  (((((((poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                          17839347496757587523UL,
                                                          10553299811918798519UL,
                                                          2523373819901075642UL })) *
                        (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                          17839347496757587523UL,
                                                          10553299811918798519UL,
                                                          2523373819901075642UL }))) *
                       (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                         17839347496757587523UL,
                                                         10553299811918798519UL,
                                                         2523373819901075642UL }))) *
                      (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                        17839347496757587523UL,
                                                        10553299811918798519UL,
                                                        2523373819901075642UL }))) *
                     (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                       17839347496757587523UL,
                                                       10553299811918798519UL,
                                                       2523373819901075642UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                            17839347496757587523UL,
                                                            10553299811918798519UL,
                                                            2523373819901075642UL })) *
                          (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                            17839347496757587523UL,
                                                            10553299811918798519UL,
                                                            2523373819901075642UL }))) *
                         (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                           17839347496757587523UL,
                                                           10553299811918798519UL,
                                                           2523373819901075642UL }))) *
                        (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                          17839347496757587523UL,
                                                          10553299811918798519UL,
                                                          2523373819901075642UL }))) *
                       (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                         17839347496757587523UL,
                                                         10553299811918798519UL,
                                                         2523373819901075642UL }))) +
                      (poseidon2_B_39_1 + FF(0))) +
                     (poseidon2_B_39_2 + FF(0))) +
                    (poseidon2_B_39_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<176>(evals) += tmp;
        }
        // Contribution 177
        {
            Avm_DECLARE_VIEWS(177);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_40_1 -
                  (((poseidon2_B_39_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                            17839347496757587523UL,
                                                            10553299811918798519UL,
                                                            2523373819901075642UL })) *
                          (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                            17839347496757587523UL,
                                                            10553299811918798519UL,
                                                            2523373819901075642UL }))) *
                         (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                           17839347496757587523UL,
                                                           10553299811918798519UL,
                                                           2523373819901075642UL }))) *
                        (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                          17839347496757587523UL,
                                                          10553299811918798519UL,
                                                          2523373819901075642UL }))) *
                       (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                         17839347496757587523UL,
                                                         10553299811918798519UL,
                                                         2523373819901075642UL }))) +
                      (poseidon2_B_39_1 + FF(0))) +
                     (poseidon2_B_39_2 + FF(0))) +
                    (poseidon2_B_39_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<177>(evals) += tmp;
        }
        // Contribution 178
        {
            Avm_DECLARE_VIEWS(178);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_40_2 -
                  (((poseidon2_B_39_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                            17839347496757587523UL,
                                                            10553299811918798519UL,
                                                            2523373819901075642UL })) *
                          (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                            17839347496757587523UL,
                                                            10553299811918798519UL,
                                                            2523373819901075642UL }))) *
                         (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                           17839347496757587523UL,
                                                           10553299811918798519UL,
                                                           2523373819901075642UL }))) *
                        (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                          17839347496757587523UL,
                                                          10553299811918798519UL,
                                                          2523373819901075642UL }))) *
                       (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                         17839347496757587523UL,
                                                         10553299811918798519UL,
                                                         2523373819901075642UL }))) +
                      (poseidon2_B_39_1 + FF(0))) +
                     (poseidon2_B_39_2 + FF(0))) +
                    (poseidon2_B_39_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<178>(evals) += tmp;
        }
        // Contribution 179
        {
            Avm_DECLARE_VIEWS(179);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_40_3 -
                  (((poseidon2_B_39_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                            17839347496757587523UL,
                                                            10553299811918798519UL,
                                                            2523373819901075642UL })) *
                          (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                            17839347496757587523UL,
                                                            10553299811918798519UL,
                                                            2523373819901075642UL }))) *
                         (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                           17839347496757587523UL,
                                                           10553299811918798519UL,
                                                           2523373819901075642UL }))) *
                        (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                          17839347496757587523UL,
                                                          10553299811918798519UL,
                                                          2523373819901075642UL }))) *
                       (poseidon2_B_39_0 + FF(uint256_t{ 13451769229280519155UL,
                                                         17839347496757587523UL,
                                                         10553299811918798519UL,
                                                         2523373819901075642UL }))) +
                      (poseidon2_B_39_1 + FF(0))) +
                     (poseidon2_B_39_2 + FF(0))) +
                    (poseidon2_B_39_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<179>(evals) += tmp;
        }
        // Contribution 180
        {
            Avm_DECLARE_VIEWS(180);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_41_0 -
                  (((((((poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                          13830706729545301172UL,
                                                          15413288900478726729UL,
                                                          287556136711008934UL })) *
                        (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                          13830706729545301172UL,
                                                          15413288900478726729UL,
                                                          287556136711008934UL }))) *
                       (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                         13830706729545301172UL,
                                                         15413288900478726729UL,
                                                         287556136711008934UL }))) *
                      (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                        13830706729545301172UL,
                                                        15413288900478726729UL,
                                                        287556136711008934UL }))) *
                     (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                       13830706729545301172UL,
                                                       15413288900478726729UL,
                                                       287556136711008934UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                            13830706729545301172UL,
                                                            15413288900478726729UL,
                                                            287556136711008934UL })) *
                          (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                            13830706729545301172UL,
                                                            15413288900478726729UL,
                                                            287556136711008934UL }))) *
                         (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                           13830706729545301172UL,
                                                           15413288900478726729UL,
                                                           287556136711008934UL }))) *
                        (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                          13830706729545301172UL,
                                                          15413288900478726729UL,
                                                          287556136711008934UL }))) *
                       (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                         13830706729545301172UL,
                                                         15413288900478726729UL,
                                                         287556136711008934UL }))) +
                      (poseidon2_B_40_1 + FF(0))) +
                     (poseidon2_B_40_2 + FF(0))) +
                    (poseidon2_B_40_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<180>(evals) += tmp;
        }
        // Contribution 181
        {
            Avm_DECLARE_VIEWS(181);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_41_1 -
                  (((poseidon2_B_40_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                            13830706729545301172UL,
                                                            15413288900478726729UL,
                                                            287556136711008934UL })) *
                          (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                            13830706729545301172UL,
                                                            15413288900478726729UL,
                                                            287556136711008934UL }))) *
                         (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                           13830706729545301172UL,
                                                           15413288900478726729UL,
                                                           287556136711008934UL }))) *
                        (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                          13830706729545301172UL,
                                                          15413288900478726729UL,
                                                          287556136711008934UL }))) *
                       (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                         13830706729545301172UL,
                                                         15413288900478726729UL,
                                                         287556136711008934UL }))) +
                      (poseidon2_B_40_1 + FF(0))) +
                     (poseidon2_B_40_2 + FF(0))) +
                    (poseidon2_B_40_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<181>(evals) += tmp;
        }
        // Contribution 182
        {
            Avm_DECLARE_VIEWS(182);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_41_2 -
                  (((poseidon2_B_40_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                            13830706729545301172UL,
                                                            15413288900478726729UL,
                                                            287556136711008934UL })) *
                          (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                            13830706729545301172UL,
                                                            15413288900478726729UL,
                                                            287556136711008934UL }))) *
                         (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                           13830706729545301172UL,
                                                           15413288900478726729UL,
                                                           287556136711008934UL }))) *
                        (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                          13830706729545301172UL,
                                                          15413288900478726729UL,
                                                          287556136711008934UL }))) *
                       (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                         13830706729545301172UL,
                                                         15413288900478726729UL,
                                                         287556136711008934UL }))) +
                      (poseidon2_B_40_1 + FF(0))) +
                     (poseidon2_B_40_2 + FF(0))) +
                    (poseidon2_B_40_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<182>(evals) += tmp;
        }
        // Contribution 183
        {
            Avm_DECLARE_VIEWS(183);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_41_3 -
                  (((poseidon2_B_40_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                            13830706729545301172UL,
                                                            15413288900478726729UL,
                                                            287556136711008934UL })) *
                          (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                            13830706729545301172UL,
                                                            15413288900478726729UL,
                                                            287556136711008934UL }))) *
                         (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                           13830706729545301172UL,
                                                           15413288900478726729UL,
                                                           287556136711008934UL }))) *
                        (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                          13830706729545301172UL,
                                                          15413288900478726729UL,
                                                          287556136711008934UL }))) *
                       (poseidon2_B_40_0 + FF(uint256_t{ 16267315463205810352UL,
                                                         13830706729545301172UL,
                                                         15413288900478726729UL,
                                                         287556136711008934UL }))) +
                      (poseidon2_B_40_1 + FF(0))) +
                     (poseidon2_B_40_2 + FF(0))) +
                    (poseidon2_B_40_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<183>(evals) += tmp;
        }
        // Contribution 184
        {
            Avm_DECLARE_VIEWS(184);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_42_0 -
                  (((((((poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                          8758089751960064775UL,
                                                          2470295096511057988UL,
                                                          51551212240288730UL })) *
                        (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                          8758089751960064775UL,
                                                          2470295096511057988UL,
                                                          51551212240288730UL }))) *
                       (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                         8758089751960064775UL,
                                                         2470295096511057988UL,
                                                         51551212240288730UL }))) *
                      (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                        8758089751960064775UL,
                                                        2470295096511057988UL,
                                                        51551212240288730UL }))) *
                     (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                       8758089751960064775UL,
                                                       2470295096511057988UL,
                                                       51551212240288730UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                            8758089751960064775UL,
                                                            2470295096511057988UL,
                                                            51551212240288730UL })) *
                          (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                            8758089751960064775UL,
                                                            2470295096511057988UL,
                                                            51551212240288730UL }))) *
                         (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                           8758089751960064775UL,
                                                           2470295096511057988UL,
                                                           51551212240288730UL }))) *
                        (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                          8758089751960064775UL,
                                                          2470295096511057988UL,
                                                          51551212240288730UL }))) *
                       (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                         8758089751960064775UL,
                                                         2470295096511057988UL,
                                                         51551212240288730UL }))) +
                      (poseidon2_B_41_1 + FF(0))) +
                     (poseidon2_B_41_2 + FF(0))) +
                    (poseidon2_B_41_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<184>(evals) += tmp;
        }
        // Contribution 185
        {
            Avm_DECLARE_VIEWS(185);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_42_1 -
                  (((poseidon2_B_41_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                            8758089751960064775UL,
                                                            2470295096511057988UL,
                                                            51551212240288730UL })) *
                          (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                            8758089751960064775UL,
                                                            2470295096511057988UL,
                                                            51551212240288730UL }))) *
                         (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                           8758089751960064775UL,
                                                           2470295096511057988UL,
                                                           51551212240288730UL }))) *
                        (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                          8758089751960064775UL,
                                                          2470295096511057988UL,
                                                          51551212240288730UL }))) *
                       (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                         8758089751960064775UL,
                                                         2470295096511057988UL,
                                                         51551212240288730UL }))) +
                      (poseidon2_B_41_1 + FF(0))) +
                     (poseidon2_B_41_2 + FF(0))) +
                    (poseidon2_B_41_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<185>(evals) += tmp;
        }
        // Contribution 186
        {
            Avm_DECLARE_VIEWS(186);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_42_2 -
                  (((poseidon2_B_41_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                            8758089751960064775UL,
                                                            2470295096511057988UL,
                                                            51551212240288730UL })) *
                          (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                            8758089751960064775UL,
                                                            2470295096511057988UL,
                                                            51551212240288730UL }))) *
                         (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                           8758089751960064775UL,
                                                           2470295096511057988UL,
                                                           51551212240288730UL }))) *
                        (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                          8758089751960064775UL,
                                                          2470295096511057988UL,
                                                          51551212240288730UL }))) *
                       (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                         8758089751960064775UL,
                                                         2470295096511057988UL,
                                                         51551212240288730UL }))) +
                      (poseidon2_B_41_1 + FF(0))) +
                     (poseidon2_B_41_2 + FF(0))) +
                    (poseidon2_B_41_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<186>(evals) += tmp;
        }
        // Contribution 187
        {
            Avm_DECLARE_VIEWS(187);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_42_3 -
                  (((poseidon2_B_41_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                            8758089751960064775UL,
                                                            2470295096511057988UL,
                                                            51551212240288730UL })) *
                          (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                            8758089751960064775UL,
                                                            2470295096511057988UL,
                                                            51551212240288730UL }))) *
                         (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                           8758089751960064775UL,
                                                           2470295096511057988UL,
                                                           51551212240288730UL }))) *
                        (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                          8758089751960064775UL,
                                                          2470295096511057988UL,
                                                          51551212240288730UL }))) *
                       (poseidon2_B_41_0 + FF(uint256_t{ 4573780169675443044UL,
                                                         8758089751960064775UL,
                                                         2470295096511057988UL,
                                                         51551212240288730UL }))) +
                      (poseidon2_B_41_1 + FF(0))) +
                     (poseidon2_B_41_2 + FF(0))) +
                    (poseidon2_B_41_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<187>(evals) += tmp;
        }
        // Contribution 188
        {
            Avm_DECLARE_VIEWS(188);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_43_0 -
                  (((((((poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                          12771428392262798771UL,
                                                          17021632567931004395UL,
                                                          1558106578814965657UL })) *
                        (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                          12771428392262798771UL,
                                                          17021632567931004395UL,
                                                          1558106578814965657UL }))) *
                       (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                         12771428392262798771UL,
                                                         17021632567931004395UL,
                                                         1558106578814965657UL }))) *
                      (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                        12771428392262798771UL,
                                                        17021632567931004395UL,
                                                        1558106578814965657UL }))) *
                     (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                       12771428392262798771UL,
                                                       17021632567931004395UL,
                                                       1558106578814965657UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                            12771428392262798771UL,
                                                            17021632567931004395UL,
                                                            1558106578814965657UL })) *
                          (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                            12771428392262798771UL,
                                                            17021632567931004395UL,
                                                            1558106578814965657UL }))) *
                         (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                           12771428392262798771UL,
                                                           17021632567931004395UL,
                                                           1558106578814965657UL }))) *
                        (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                          12771428392262798771UL,
                                                          17021632567931004395UL,
                                                          1558106578814965657UL }))) *
                       (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                         12771428392262798771UL,
                                                         17021632567931004395UL,
                                                         1558106578814965657UL }))) +
                      (poseidon2_B_42_1 + FF(0))) +
                     (poseidon2_B_42_2 + FF(0))) +
                    (poseidon2_B_42_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<188>(evals) += tmp;
        }
        // Contribution 189
        {
            Avm_DECLARE_VIEWS(189);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_43_1 -
                  (((poseidon2_B_42_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                            12771428392262798771UL,
                                                            17021632567931004395UL,
                                                            1558106578814965657UL })) *
                          (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                            12771428392262798771UL,
                                                            17021632567931004395UL,
                                                            1558106578814965657UL }))) *
                         (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                           12771428392262798771UL,
                                                           17021632567931004395UL,
                                                           1558106578814965657UL }))) *
                        (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                          12771428392262798771UL,
                                                          17021632567931004395UL,
                                                          1558106578814965657UL }))) *
                       (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                         12771428392262798771UL,
                                                         17021632567931004395UL,
                                                         1558106578814965657UL }))) +
                      (poseidon2_B_42_1 + FF(0))) +
                     (poseidon2_B_42_2 + FF(0))) +
                    (poseidon2_B_42_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<189>(evals) += tmp;
        }
        // Contribution 190
        {
            Avm_DECLARE_VIEWS(190);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_43_2 -
                  (((poseidon2_B_42_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                            12771428392262798771UL,
                                                            17021632567931004395UL,
                                                            1558106578814965657UL })) *
                          (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                            12771428392262798771UL,
                                                            17021632567931004395UL,
                                                            1558106578814965657UL }))) *
                         (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                           12771428392262798771UL,
                                                           17021632567931004395UL,
                                                           1558106578814965657UL }))) *
                        (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                          12771428392262798771UL,
                                                          17021632567931004395UL,
                                                          1558106578814965657UL }))) *
                       (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                         12771428392262798771UL,
                                                         17021632567931004395UL,
                                                         1558106578814965657UL }))) +
                      (poseidon2_B_42_1 + FF(0))) +
                     (poseidon2_B_42_2 + FF(0))) +
                    (poseidon2_B_42_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<190>(evals) += tmp;
        }
        // Contribution 191
        {
            Avm_DECLARE_VIEWS(191);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_43_3 -
                  (((poseidon2_B_42_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                            12771428392262798771UL,
                                                            17021632567931004395UL,
                                                            1558106578814965657UL })) *
                          (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                            12771428392262798771UL,
                                                            17021632567931004395UL,
                                                            1558106578814965657UL }))) *
                         (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                           12771428392262798771UL,
                                                           17021632567931004395UL,
                                                           1558106578814965657UL }))) *
                        (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                          12771428392262798771UL,
                                                          17021632567931004395UL,
                                                          1558106578814965657UL }))) *
                       (poseidon2_B_42_0 + FF(uint256_t{ 7093949836145798554UL,
                                                         12771428392262798771UL,
                                                         17021632567931004395UL,
                                                         1558106578814965657UL }))) +
                      (poseidon2_B_42_1 + FF(0))) +
                     (poseidon2_B_42_2 + FF(0))) +
                    (poseidon2_B_42_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<191>(evals) += tmp;
        }
        // Contribution 192
        {
            Avm_DECLARE_VIEWS(192);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_44_0 -
                  (((((((poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                          10376314495036230740UL,
                                                          5774593793305666491UL,
                                                          2231830927015656581UL })) *
                        (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                          10376314495036230740UL,
                                                          5774593793305666491UL,
                                                          2231830927015656581UL }))) *
                       (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                         10376314495036230740UL,
                                                         5774593793305666491UL,
                                                         2231830927015656581UL }))) *
                      (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                        10376314495036230740UL,
                                                        5774593793305666491UL,
                                                        2231830927015656581UL }))) *
                     (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                       10376314495036230740UL,
                                                       5774593793305666491UL,
                                                       2231830927015656581UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                            10376314495036230740UL,
                                                            5774593793305666491UL,
                                                            2231830927015656581UL })) *
                          (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                            10376314495036230740UL,
                                                            5774593793305666491UL,
                                                            2231830927015656581UL }))) *
                         (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                           10376314495036230740UL,
                                                           5774593793305666491UL,
                                                           2231830927015656581UL }))) *
                        (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                          10376314495036230740UL,
                                                          5774593793305666491UL,
                                                          2231830927015656581UL }))) *
                       (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                         10376314495036230740UL,
                                                         5774593793305666491UL,
                                                         2231830927015656581UL }))) +
                      (poseidon2_B_43_1 + FF(0))) +
                     (poseidon2_B_43_2 + FF(0))) +
                    (poseidon2_B_43_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<192>(evals) += tmp;
        }
        // Contribution 193
        {
            Avm_DECLARE_VIEWS(193);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_44_1 -
                  (((poseidon2_B_43_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                            10376314495036230740UL,
                                                            5774593793305666491UL,
                                                            2231830927015656581UL })) *
                          (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                            10376314495036230740UL,
                                                            5774593793305666491UL,
                                                            2231830927015656581UL }))) *
                         (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                           10376314495036230740UL,
                                                           5774593793305666491UL,
                                                           2231830927015656581UL }))) *
                        (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                          10376314495036230740UL,
                                                          5774593793305666491UL,
                                                          2231830927015656581UL }))) *
                       (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                         10376314495036230740UL,
                                                         5774593793305666491UL,
                                                         2231830927015656581UL }))) +
                      (poseidon2_B_43_1 + FF(0))) +
                     (poseidon2_B_43_2 + FF(0))) +
                    (poseidon2_B_43_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<193>(evals) += tmp;
        }
        // Contribution 194
        {
            Avm_DECLARE_VIEWS(194);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_44_2 -
                  (((poseidon2_B_43_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                            10376314495036230740UL,
                                                            5774593793305666491UL,
                                                            2231830927015656581UL })) *
                          (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                            10376314495036230740UL,
                                                            5774593793305666491UL,
                                                            2231830927015656581UL }))) *
                         (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                           10376314495036230740UL,
                                                           5774593793305666491UL,
                                                           2231830927015656581UL }))) *
                        (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                          10376314495036230740UL,
                                                          5774593793305666491UL,
                                                          2231830927015656581UL }))) *
                       (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                         10376314495036230740UL,
                                                         5774593793305666491UL,
                                                         2231830927015656581UL }))) +
                      (poseidon2_B_43_1 + FF(0))) +
                     (poseidon2_B_43_2 + FF(0))) +
                    (poseidon2_B_43_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<194>(evals) += tmp;
        }
        // Contribution 195
        {
            Avm_DECLARE_VIEWS(195);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_44_3 -
                  (((poseidon2_B_43_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                            10376314495036230740UL,
                                                            5774593793305666491UL,
                                                            2231830927015656581UL })) *
                          (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                            10376314495036230740UL,
                                                            5774593793305666491UL,
                                                            2231830927015656581UL }))) *
                         (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                           10376314495036230740UL,
                                                           5774593793305666491UL,
                                                           2231830927015656581UL }))) *
                        (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                          10376314495036230740UL,
                                                          5774593793305666491UL,
                                                          2231830927015656581UL }))) *
                       (poseidon2_B_43_0 + FF(uint256_t{ 8205915653008540447UL,
                                                         10376314495036230740UL,
                                                         5774593793305666491UL,
                                                         2231830927015656581UL }))) +
                      (poseidon2_B_43_1 + FF(0))) +
                     (poseidon2_B_43_2 + FF(0))) +
                    (poseidon2_B_43_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<195>(evals) += tmp;
        }
        // Contribution 196
        {
            Avm_DECLARE_VIEWS(196);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_45_0 -
                  (((((((poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                          10229708558604896492UL,
                                                          1831638669050696278UL,
                                                          2190429714552610800UL })) *
                        (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                          10229708558604896492UL,
                                                          1831638669050696278UL,
                                                          2190429714552610800UL }))) *
                       (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                         10229708558604896492UL,
                                                         1831638669050696278UL,
                                                         2190429714552610800UL }))) *
                      (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                        10229708558604896492UL,
                                                        1831638669050696278UL,
                                                        2190429714552610800UL }))) *
                     (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                       10229708558604896492UL,
                                                       1831638669050696278UL,
                                                       2190429714552610800UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                            10229708558604896492UL,
                                                            1831638669050696278UL,
                                                            2190429714552610800UL })) *
                          (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                            10229708558604896492UL,
                                                            1831638669050696278UL,
                                                            2190429714552610800UL }))) *
                         (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                           10229708558604896492UL,
                                                           1831638669050696278UL,
                                                           2190429714552610800UL }))) *
                        (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                          10229708558604896492UL,
                                                          1831638669050696278UL,
                                                          2190429714552610800UL }))) *
                       (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                         10229708558604896492UL,
                                                         1831638669050696278UL,
                                                         2190429714552610800UL }))) +
                      (poseidon2_B_44_1 + FF(0))) +
                     (poseidon2_B_44_2 + FF(0))) +
                    (poseidon2_B_44_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<196>(evals) += tmp;
        }
        // Contribution 197
        {
            Avm_DECLARE_VIEWS(197);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_45_1 -
                  (((poseidon2_B_44_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                            10229708558604896492UL,
                                                            1831638669050696278UL,
                                                            2190429714552610800UL })) *
                          (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                            10229708558604896492UL,
                                                            1831638669050696278UL,
                                                            2190429714552610800UL }))) *
                         (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                           10229708558604896492UL,
                                                           1831638669050696278UL,
                                                           2190429714552610800UL }))) *
                        (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                          10229708558604896492UL,
                                                          1831638669050696278UL,
                                                          2190429714552610800UL }))) *
                       (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                         10229708558604896492UL,
                                                         1831638669050696278UL,
                                                         2190429714552610800UL }))) +
                      (poseidon2_B_44_1 + FF(0))) +
                     (poseidon2_B_44_2 + FF(0))) +
                    (poseidon2_B_44_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<197>(evals) += tmp;
        }
        // Contribution 198
        {
            Avm_DECLARE_VIEWS(198);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_45_2 -
                  (((poseidon2_B_44_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                            10229708558604896492UL,
                                                            1831638669050696278UL,
                                                            2190429714552610800UL })) *
                          (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                            10229708558604896492UL,
                                                            1831638669050696278UL,
                                                            2190429714552610800UL }))) *
                         (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                           10229708558604896492UL,
                                                           1831638669050696278UL,
                                                           2190429714552610800UL }))) *
                        (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                          10229708558604896492UL,
                                                          1831638669050696278UL,
                                                          2190429714552610800UL }))) *
                       (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                         10229708558604896492UL,
                                                         1831638669050696278UL,
                                                         2190429714552610800UL }))) +
                      (poseidon2_B_44_1 + FF(0))) +
                     (poseidon2_B_44_2 + FF(0))) +
                    (poseidon2_B_44_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<198>(evals) += tmp;
        }
        // Contribution 199
        {
            Avm_DECLARE_VIEWS(199);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_45_3 -
                  (((poseidon2_B_44_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                            10229708558604896492UL,
                                                            1831638669050696278UL,
                                                            2190429714552610800UL })) *
                          (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                            10229708558604896492UL,
                                                            1831638669050696278UL,
                                                            2190429714552610800UL }))) *
                         (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                           10229708558604896492UL,
                                                           1831638669050696278UL,
                                                           2190429714552610800UL }))) *
                        (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                          10229708558604896492UL,
                                                          1831638669050696278UL,
                                                          2190429714552610800UL }))) *
                       (poseidon2_B_44_0 + FF(uint256_t{ 10783762484003267341UL,
                                                         10229708558604896492UL,
                                                         1831638669050696278UL,
                                                         2190429714552610800UL }))) +
                      (poseidon2_B_44_1 + FF(0))) +
                     (poseidon2_B_44_2 + FF(0))) +
                    (poseidon2_B_44_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<199>(evals) += tmp;
        }
        // Contribution 200
        {
            Avm_DECLARE_VIEWS(200);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_46_0 -
                  (((((((poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                          12793746113455595394UL,
                                                          17036245927795997300UL,
                                                          3106081169494120044UL })) *
                        (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                          12793746113455595394UL,
                                                          17036245927795997300UL,
                                                          3106081169494120044UL }))) *
                       (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                         12793746113455595394UL,
                                                         17036245927795997300UL,
                                                         3106081169494120044UL }))) *
                      (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                        12793746113455595394UL,
                                                        17036245927795997300UL,
                                                        3106081169494120044UL }))) *
                     (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                       12793746113455595394UL,
                                                       17036245927795997300UL,
                                                       3106081169494120044UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                            12793746113455595394UL,
                                                            17036245927795997300UL,
                                                            3106081169494120044UL })) *
                          (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                            12793746113455595394UL,
                                                            17036245927795997300UL,
                                                            3106081169494120044UL }))) *
                         (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                           12793746113455595394UL,
                                                           17036245927795997300UL,
                                                           3106081169494120044UL }))) *
                        (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                          12793746113455595394UL,
                                                          17036245927795997300UL,
                                                          3106081169494120044UL }))) *
                       (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                         12793746113455595394UL,
                                                         17036245927795997300UL,
                                                         3106081169494120044UL }))) +
                      (poseidon2_B_45_1 + FF(0))) +
                     (poseidon2_B_45_2 + FF(0))) +
                    (poseidon2_B_45_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<200>(evals) += tmp;
        }
        // Contribution 201
        {
            Avm_DECLARE_VIEWS(201);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_46_1 -
                  (((poseidon2_B_45_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                            12793746113455595394UL,
                                                            17036245927795997300UL,
                                                            3106081169494120044UL })) *
                          (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                            12793746113455595394UL,
                                                            17036245927795997300UL,
                                                            3106081169494120044UL }))) *
                         (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                           12793746113455595394UL,
                                                           17036245927795997300UL,
                                                           3106081169494120044UL }))) *
                        (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                          12793746113455595394UL,
                                                          17036245927795997300UL,
                                                          3106081169494120044UL }))) *
                       (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                         12793746113455595394UL,
                                                         17036245927795997300UL,
                                                         3106081169494120044UL }))) +
                      (poseidon2_B_45_1 + FF(0))) +
                     (poseidon2_B_45_2 + FF(0))) +
                    (poseidon2_B_45_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<201>(evals) += tmp;
        }
        // Contribution 202
        {
            Avm_DECLARE_VIEWS(202);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_46_2 -
                  (((poseidon2_B_45_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                            12793746113455595394UL,
                                                            17036245927795997300UL,
                                                            3106081169494120044UL })) *
                          (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                            12793746113455595394UL,
                                                            17036245927795997300UL,
                                                            3106081169494120044UL }))) *
                         (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                           12793746113455595394UL,
                                                           17036245927795997300UL,
                                                           3106081169494120044UL }))) *
                        (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                          12793746113455595394UL,
                                                          17036245927795997300UL,
                                                          3106081169494120044UL }))) *
                       (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                         12793746113455595394UL,
                                                         17036245927795997300UL,
                                                         3106081169494120044UL }))) +
                      (poseidon2_B_45_1 + FF(0))) +
                     (poseidon2_B_45_2 + FF(0))) +
                    (poseidon2_B_45_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<202>(evals) += tmp;
        }
        // Contribution 203
        {
            Avm_DECLARE_VIEWS(203);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_46_3 -
                  (((poseidon2_B_45_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                            12793746113455595394UL,
                                                            17036245927795997300UL,
                                                            3106081169494120044UL })) *
                          (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                            12793746113455595394UL,
                                                            17036245927795997300UL,
                                                            3106081169494120044UL }))) *
                         (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                           12793746113455595394UL,
                                                           17036245927795997300UL,
                                                           3106081169494120044UL }))) *
                        (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                          12793746113455595394UL,
                                                          17036245927795997300UL,
                                                          3106081169494120044UL }))) *
                       (poseidon2_B_45_0 + FF(uint256_t{ 7310961803978392383UL,
                                                         12793746113455595394UL,
                                                         17036245927795997300UL,
                                                         3106081169494120044UL }))) +
                      (poseidon2_B_45_1 + FF(0))) +
                     (poseidon2_B_45_2 + FF(0))) +
                    (poseidon2_B_45_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<203>(evals) += tmp;
        }
        // Contribution 204
        {
            Avm_DECLARE_VIEWS(204);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_47_0 -
                  (((((((poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                          7339791467855418851UL,
                                                          4622175020331968961UL,
                                                          590786792834928630UL })) *
                        (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                          7339791467855418851UL,
                                                          4622175020331968961UL,
                                                          590786792834928630UL }))) *
                       (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                         7339791467855418851UL,
                                                         4622175020331968961UL,
                                                         590786792834928630UL }))) *
                      (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                        7339791467855418851UL,
                                                        4622175020331968961UL,
                                                        590786792834928630UL }))) *
                     (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                       7339791467855418851UL,
                                                       4622175020331968961UL,
                                                       590786792834928630UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                            7339791467855418851UL,
                                                            4622175020331968961UL,
                                                            590786792834928630UL })) *
                          (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                            7339791467855418851UL,
                                                            4622175020331968961UL,
                                                            590786792834928630UL }))) *
                         (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                           7339791467855418851UL,
                                                           4622175020331968961UL,
                                                           590786792834928630UL }))) *
                        (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                          7339791467855418851UL,
                                                          4622175020331968961UL,
                                                          590786792834928630UL }))) *
                       (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                         7339791467855418851UL,
                                                         4622175020331968961UL,
                                                         590786792834928630UL }))) +
                      (poseidon2_B_46_1 + FF(0))) +
                     (poseidon2_B_46_2 + FF(0))) +
                    (poseidon2_B_46_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<204>(evals) += tmp;
        }
        // Contribution 205
        {
            Avm_DECLARE_VIEWS(205);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_47_1 -
                  (((poseidon2_B_46_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                            7339791467855418851UL,
                                                            4622175020331968961UL,
                                                            590786792834928630UL })) *
                          (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                            7339791467855418851UL,
                                                            4622175020331968961UL,
                                                            590786792834928630UL }))) *
                         (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                           7339791467855418851UL,
                                                           4622175020331968961UL,
                                                           590786792834928630UL }))) *
                        (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                          7339791467855418851UL,
                                                          4622175020331968961UL,
                                                          590786792834928630UL }))) *
                       (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                         7339791467855418851UL,
                                                         4622175020331968961UL,
                                                         590786792834928630UL }))) +
                      (poseidon2_B_46_1 + FF(0))) +
                     (poseidon2_B_46_2 + FF(0))) +
                    (poseidon2_B_46_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<205>(evals) += tmp;
        }
        // Contribution 206
        {
            Avm_DECLARE_VIEWS(206);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_47_2 -
                  (((poseidon2_B_46_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                            7339791467855418851UL,
                                                            4622175020331968961UL,
                                                            590786792834928630UL })) *
                          (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                            7339791467855418851UL,
                                                            4622175020331968961UL,
                                                            590786792834928630UL }))) *
                         (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                           7339791467855418851UL,
                                                           4622175020331968961UL,
                                                           590786792834928630UL }))) *
                        (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                          7339791467855418851UL,
                                                          4622175020331968961UL,
                                                          590786792834928630UL }))) *
                       (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                         7339791467855418851UL,
                                                         4622175020331968961UL,
                                                         590786792834928630UL }))) +
                      (poseidon2_B_46_1 + FF(0))) +
                     (poseidon2_B_46_2 + FF(0))) +
                    (poseidon2_B_46_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<206>(evals) += tmp;
        }
        // Contribution 207
        {
            Avm_DECLARE_VIEWS(207);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_47_3 -
                  (((poseidon2_B_46_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                            7339791467855418851UL,
                                                            4622175020331968961UL,
                                                            590786792834928630UL })) *
                          (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                            7339791467855418851UL,
                                                            4622175020331968961UL,
                                                            590786792834928630UL }))) *
                         (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                           7339791467855418851UL,
                                                           4622175020331968961UL,
                                                           590786792834928630UL }))) *
                        (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                          7339791467855418851UL,
                                                          4622175020331968961UL,
                                                          590786792834928630UL }))) *
                       (poseidon2_B_46_0 + FF(uint256_t{ 17421859032088162675UL,
                                                         7339791467855418851UL,
                                                         4622175020331968961UL,
                                                         590786792834928630UL }))) +
                      (poseidon2_B_46_1 + FF(0))) +
                     (poseidon2_B_46_2 + FF(0))) +
                    (poseidon2_B_46_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<207>(evals) += tmp;
        }
        // Contribution 208
        {
            Avm_DECLARE_VIEWS(208);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_48_0 -
                  (((((((poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                          12806057845811725595UL,
                                                          7743423753614082490UL,
                                                          213381026777379804UL })) *
                        (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                          12806057845811725595UL,
                                                          7743423753614082490UL,
                                                          213381026777379804UL }))) *
                       (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                         12806057845811725595UL,
                                                         7743423753614082490UL,
                                                         213381026777379804UL }))) *
                      (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                        12806057845811725595UL,
                                                        7743423753614082490UL,
                                                        213381026777379804UL }))) *
                     (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                       12806057845811725595UL,
                                                       7743423753614082490UL,
                                                       213381026777379804UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                            12806057845811725595UL,
                                                            7743423753614082490UL,
                                                            213381026777379804UL })) *
                          (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                            12806057845811725595UL,
                                                            7743423753614082490UL,
                                                            213381026777379804UL }))) *
                         (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                           12806057845811725595UL,
                                                           7743423753614082490UL,
                                                           213381026777379804UL }))) *
                        (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                          12806057845811725595UL,
                                                          7743423753614082490UL,
                                                          213381026777379804UL }))) *
                       (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                         12806057845811725595UL,
                                                         7743423753614082490UL,
                                                         213381026777379804UL }))) +
                      (poseidon2_B_47_1 + FF(0))) +
                     (poseidon2_B_47_2 + FF(0))) +
                    (poseidon2_B_47_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<208>(evals) += tmp;
        }
        // Contribution 209
        {
            Avm_DECLARE_VIEWS(209);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_48_1 -
                  (((poseidon2_B_47_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                            12806057845811725595UL,
                                                            7743423753614082490UL,
                                                            213381026777379804UL })) *
                          (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                            12806057845811725595UL,
                                                            7743423753614082490UL,
                                                            213381026777379804UL }))) *
                         (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                           12806057845811725595UL,
                                                           7743423753614082490UL,
                                                           213381026777379804UL }))) *
                        (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                          12806057845811725595UL,
                                                          7743423753614082490UL,
                                                          213381026777379804UL }))) *
                       (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                         12806057845811725595UL,
                                                         7743423753614082490UL,
                                                         213381026777379804UL }))) +
                      (poseidon2_B_47_1 + FF(0))) +
                     (poseidon2_B_47_2 + FF(0))) +
                    (poseidon2_B_47_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<209>(evals) += tmp;
        }
        // Contribution 210
        {
            Avm_DECLARE_VIEWS(210);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_48_2 -
                  (((poseidon2_B_47_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                            12806057845811725595UL,
                                                            7743423753614082490UL,
                                                            213381026777379804UL })) *
                          (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                            12806057845811725595UL,
                                                            7743423753614082490UL,
                                                            213381026777379804UL }))) *
                         (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                           12806057845811725595UL,
                                                           7743423753614082490UL,
                                                           213381026777379804UL }))) *
                        (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                          12806057845811725595UL,
                                                          7743423753614082490UL,
                                                          213381026777379804UL }))) *
                       (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                         12806057845811725595UL,
                                                         7743423753614082490UL,
                                                         213381026777379804UL }))) +
                      (poseidon2_B_47_1 + FF(0))) +
                     (poseidon2_B_47_2 + FF(0))) +
                    (poseidon2_B_47_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<210>(evals) += tmp;
        }
        // Contribution 211
        {
            Avm_DECLARE_VIEWS(211);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_48_3 -
                  (((poseidon2_B_47_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                            12806057845811725595UL,
                                                            7743423753614082490UL,
                                                            213381026777379804UL })) *
                          (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                            12806057845811725595UL,
                                                            7743423753614082490UL,
                                                            213381026777379804UL }))) *
                         (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                           12806057845811725595UL,
                                                           7743423753614082490UL,
                                                           213381026777379804UL }))) *
                        (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                          12806057845811725595UL,
                                                          7743423753614082490UL,
                                                          213381026777379804UL }))) *
                       (poseidon2_B_47_0 + FF(uint256_t{ 14242884250645212438UL,
                                                         12806057845811725595UL,
                                                         7743423753614082490UL,
                                                         213381026777379804UL }))) +
                      (poseidon2_B_47_1 + FF(0))) +
                     (poseidon2_B_47_2 + FF(0))) +
                    (poseidon2_B_47_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<211>(evals) += tmp;
        }
        // Contribution 212
        {
            Avm_DECLARE_VIEWS(212);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_49_0 -
                  (((((((poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                          8318407684973846516UL,
                                                          15952888485475298710UL,
                                                          1018983205230111328UL })) *
                        (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                          8318407684973846516UL,
                                                          15952888485475298710UL,
                                                          1018983205230111328UL }))) *
                       (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                         8318407684973846516UL,
                                                         15952888485475298710UL,
                                                         1018983205230111328UL }))) *
                      (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                        8318407684973846516UL,
                                                        15952888485475298710UL,
                                                        1018983205230111328UL }))) *
                     (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                       8318407684973846516UL,
                                                       15952888485475298710UL,
                                                       1018983205230111328UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                            8318407684973846516UL,
                                                            15952888485475298710UL,
                                                            1018983205230111328UL })) *
                          (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                            8318407684973846516UL,
                                                            15952888485475298710UL,
                                                            1018983205230111328UL }))) *
                         (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                           8318407684973846516UL,
                                                           15952888485475298710UL,
                                                           1018983205230111328UL }))) *
                        (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                          8318407684973846516UL,
                                                          15952888485475298710UL,
                                                          1018983205230111328UL }))) *
                       (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                         8318407684973846516UL,
                                                         15952888485475298710UL,
                                                         1018983205230111328UL }))) +
                      (poseidon2_B_48_1 + FF(0))) +
                     (poseidon2_B_48_2 + FF(0))) +
                    (poseidon2_B_48_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<212>(evals) += tmp;
        }
        // Contribution 213
        {
            Avm_DECLARE_VIEWS(213);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_49_1 -
                  (((poseidon2_B_48_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                            8318407684973846516UL,
                                                            15952888485475298710UL,
                                                            1018983205230111328UL })) *
                          (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                            8318407684973846516UL,
                                                            15952888485475298710UL,
                                                            1018983205230111328UL }))) *
                         (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                           8318407684973846516UL,
                                                           15952888485475298710UL,
                                                           1018983205230111328UL }))) *
                        (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                          8318407684973846516UL,
                                                          15952888485475298710UL,
                                                          1018983205230111328UL }))) *
                       (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                         8318407684973846516UL,
                                                         15952888485475298710UL,
                                                         1018983205230111328UL }))) +
                      (poseidon2_B_48_1 + FF(0))) +
                     (poseidon2_B_48_2 + FF(0))) +
                    (poseidon2_B_48_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<213>(evals) += tmp;
        }
        // Contribution 214
        {
            Avm_DECLARE_VIEWS(214);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_49_2 -
                  (((poseidon2_B_48_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                            8318407684973846516UL,
                                                            15952888485475298710UL,
                                                            1018983205230111328UL })) *
                          (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                            8318407684973846516UL,
                                                            15952888485475298710UL,
                                                            1018983205230111328UL }))) *
                         (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                           8318407684973846516UL,
                                                           15952888485475298710UL,
                                                           1018983205230111328UL }))) *
                        (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                          8318407684973846516UL,
                                                          15952888485475298710UL,
                                                          1018983205230111328UL }))) *
                       (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                         8318407684973846516UL,
                                                         15952888485475298710UL,
                                                         1018983205230111328UL }))) +
                      (poseidon2_B_48_1 + FF(0))) +
                     (poseidon2_B_48_2 + FF(0))) +
                    (poseidon2_B_48_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<214>(evals) += tmp;
        }
        // Contribution 215
        {
            Avm_DECLARE_VIEWS(215);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_49_3 -
                  (((poseidon2_B_48_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                            8318407684973846516UL,
                                                            15952888485475298710UL,
                                                            1018983205230111328UL })) *
                          (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                            8318407684973846516UL,
                                                            15952888485475298710UL,
                                                            1018983205230111328UL }))) *
                         (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                           8318407684973846516UL,
                                                           15952888485475298710UL,
                                                           1018983205230111328UL }))) *
                        (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                          8318407684973846516UL,
                                                          15952888485475298710UL,
                                                          1018983205230111328UL }))) *
                       (poseidon2_B_48_0 + FF(uint256_t{ 1110713325513004805UL,
                                                         8318407684973846516UL,
                                                         15952888485475298710UL,
                                                         1018983205230111328UL }))) +
                      (poseidon2_B_48_1 + FF(0))) +
                     (poseidon2_B_48_2 + FF(0))) +
                    (poseidon2_B_48_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<215>(evals) += tmp;
        }
        // Contribution 216
        {
            Avm_DECLARE_VIEWS(216);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_50_0 -
                  (((((((poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                          333001117808183237UL,
                                                          16968583542443855481UL,
                                                          329716098711096173UL })) *
                        (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                          333001117808183237UL,
                                                          16968583542443855481UL,
                                                          329716098711096173UL }))) *
                       (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                         333001117808183237UL,
                                                         16968583542443855481UL,
                                                         329716098711096173UL }))) *
                      (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                        333001117808183237UL,
                                                        16968583542443855481UL,
                                                        329716098711096173UL }))) *
                     (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                       333001117808183237UL,
                                                       16968583542443855481UL,
                                                       329716098711096173UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                            333001117808183237UL,
                                                            16968583542443855481UL,
                                                            329716098711096173UL })) *
                          (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                            333001117808183237UL,
                                                            16968583542443855481UL,
                                                            329716098711096173UL }))) *
                         (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                           333001117808183237UL,
                                                           16968583542443855481UL,
                                                           329716098711096173UL }))) *
                        (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                          333001117808183237UL,
                                                          16968583542443855481UL,
                                                          329716098711096173UL }))) *
                       (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                         333001117808183237UL,
                                                         16968583542443855481UL,
                                                         329716098711096173UL }))) +
                      (poseidon2_B_49_1 + FF(0))) +
                     (poseidon2_B_49_2 + FF(0))) +
                    (poseidon2_B_49_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<216>(evals) += tmp;
        }
        // Contribution 217
        {
            Avm_DECLARE_VIEWS(217);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_50_1 -
                  (((poseidon2_B_49_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                            333001117808183237UL,
                                                            16968583542443855481UL,
                                                            329716098711096173UL })) *
                          (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                            333001117808183237UL,
                                                            16968583542443855481UL,
                                                            329716098711096173UL }))) *
                         (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                           333001117808183237UL,
                                                           16968583542443855481UL,
                                                           329716098711096173UL }))) *
                        (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                          333001117808183237UL,
                                                          16968583542443855481UL,
                                                          329716098711096173UL }))) *
                       (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                         333001117808183237UL,
                                                         16968583542443855481UL,
                                                         329716098711096173UL }))) +
                      (poseidon2_B_49_1 + FF(0))) +
                     (poseidon2_B_49_2 + FF(0))) +
                    (poseidon2_B_49_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<217>(evals) += tmp;
        }
        // Contribution 218
        {
            Avm_DECLARE_VIEWS(218);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_50_2 -
                  (((poseidon2_B_49_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                            333001117808183237UL,
                                                            16968583542443855481UL,
                                                            329716098711096173UL })) *
                          (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                            333001117808183237UL,
                                                            16968583542443855481UL,
                                                            329716098711096173UL }))) *
                         (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                           333001117808183237UL,
                                                           16968583542443855481UL,
                                                           329716098711096173UL }))) *
                        (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                          333001117808183237UL,
                                                          16968583542443855481UL,
                                                          329716098711096173UL }))) *
                       (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                         333001117808183237UL,
                                                         16968583542443855481UL,
                                                         329716098711096173UL }))) +
                      (poseidon2_B_49_1 + FF(0))) +
                     (poseidon2_B_49_2 + FF(0))) +
                    (poseidon2_B_49_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<218>(evals) += tmp;
        }
        // Contribution 219
        {
            Avm_DECLARE_VIEWS(219);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_50_3 -
                  (((poseidon2_B_49_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                            333001117808183237UL,
                                                            16968583542443855481UL,
                                                            329716098711096173UL })) *
                          (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                            333001117808183237UL,
                                                            16968583542443855481UL,
                                                            329716098711096173UL }))) *
                         (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                           333001117808183237UL,
                                                           16968583542443855481UL,
                                                           329716098711096173UL }))) *
                        (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                          333001117808183237UL,
                                                          16968583542443855481UL,
                                                          329716098711096173UL }))) *
                       (poseidon2_B_49_0 + FF(uint256_t{ 533883137631233338UL,
                                                         333001117808183237UL,
                                                         16968583542443855481UL,
                                                         329716098711096173UL }))) +
                      (poseidon2_B_49_1 + FF(0))) +
                     (poseidon2_B_49_2 + FF(0))) +
                    (poseidon2_B_49_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<219>(evals) += tmp;
        }
        // Contribution 220
        {
            Avm_DECLARE_VIEWS(220);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_51_0 -
                  (((((((poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                          7760073051300251162UL,
                                                          5615103291054015906UL,
                                                          2516053143677338215UL })) *
                        (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                          7760073051300251162UL,
                                                          5615103291054015906UL,
                                                          2516053143677338215UL }))) *
                       (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                         7760073051300251162UL,
                                                         5615103291054015906UL,
                                                         2516053143677338215UL }))) *
                      (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                        7760073051300251162UL,
                                                        5615103291054015906UL,
                                                        2516053143677338215UL }))) *
                     (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                       7760073051300251162UL,
                                                       5615103291054015906UL,
                                                       2516053143677338215UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                            7760073051300251162UL,
                                                            5615103291054015906UL,
                                                            2516053143677338215UL })) *
                          (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                            7760073051300251162UL,
                                                            5615103291054015906UL,
                                                            2516053143677338215UL }))) *
                         (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                           7760073051300251162UL,
                                                           5615103291054015906UL,
                                                           2516053143677338215UL }))) *
                        (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                          7760073051300251162UL,
                                                          5615103291054015906UL,
                                                          2516053143677338215UL }))) *
                       (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                         7760073051300251162UL,
                                                         5615103291054015906UL,
                                                         2516053143677338215UL }))) +
                      (poseidon2_B_50_1 + FF(0))) +
                     (poseidon2_B_50_2 + FF(0))) +
                    (poseidon2_B_50_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<220>(evals) += tmp;
        }
        // Contribution 221
        {
            Avm_DECLARE_VIEWS(221);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_51_1 -
                  (((poseidon2_B_50_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                            7760073051300251162UL,
                                                            5615103291054015906UL,
                                                            2516053143677338215UL })) *
                          (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                            7760073051300251162UL,
                                                            5615103291054015906UL,
                                                            2516053143677338215UL }))) *
                         (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                           7760073051300251162UL,
                                                           5615103291054015906UL,
                                                           2516053143677338215UL }))) *
                        (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                          7760073051300251162UL,
                                                          5615103291054015906UL,
                                                          2516053143677338215UL }))) *
                       (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                         7760073051300251162UL,
                                                         5615103291054015906UL,
                                                         2516053143677338215UL }))) +
                      (poseidon2_B_50_1 + FF(0))) +
                     (poseidon2_B_50_2 + FF(0))) +
                    (poseidon2_B_50_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<221>(evals) += tmp;
        }
        // Contribution 222
        {
            Avm_DECLARE_VIEWS(222);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_51_2 -
                  (((poseidon2_B_50_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                            7760073051300251162UL,
                                                            5615103291054015906UL,
                                                            2516053143677338215UL })) *
                          (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                            7760073051300251162UL,
                                                            5615103291054015906UL,
                                                            2516053143677338215UL }))) *
                         (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                           7760073051300251162UL,
                                                           5615103291054015906UL,
                                                           2516053143677338215UL }))) *
                        (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                          7760073051300251162UL,
                                                          5615103291054015906UL,
                                                          2516053143677338215UL }))) *
                       (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                         7760073051300251162UL,
                                                         5615103291054015906UL,
                                                         2516053143677338215UL }))) +
                      (poseidon2_B_50_1 + FF(0))) +
                     (poseidon2_B_50_2 + FF(0))) +
                    (poseidon2_B_50_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<222>(evals) += tmp;
        }
        // Contribution 223
        {
            Avm_DECLARE_VIEWS(223);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_51_3 -
                  (((poseidon2_B_50_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                            7760073051300251162UL,
                                                            5615103291054015906UL,
                                                            2516053143677338215UL })) *
                          (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                            7760073051300251162UL,
                                                            5615103291054015906UL,
                                                            2516053143677338215UL }))) *
                         (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                           7760073051300251162UL,
                                                           5615103291054015906UL,
                                                           2516053143677338215UL }))) *
                        (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                          7760073051300251162UL,
                                                          5615103291054015906UL,
                                                          2516053143677338215UL }))) *
                       (poseidon2_B_50_0 + FF(uint256_t{ 4449676039486426793UL,
                                                         7760073051300251162UL,
                                                         5615103291054015906UL,
                                                         2516053143677338215UL }))) +
                      (poseidon2_B_50_1 + FF(0))) +
                     (poseidon2_B_50_2 + FF(0))) +
                    (poseidon2_B_50_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<223>(evals) += tmp;
        }
        // Contribution 224
        {
            Avm_DECLARE_VIEWS(224);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_52_0 -
                  (((((((poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                          6358830762575712333UL,
                                                          12313512559299087688UL,
                                                          2716767262544184013UL })) *
                        (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                          6358830762575712333UL,
                                                          12313512559299087688UL,
                                                          2716767262544184013UL }))) *
                       (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                         6358830762575712333UL,
                                                         12313512559299087688UL,
                                                         2716767262544184013UL }))) *
                      (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                        6358830762575712333UL,
                                                        12313512559299087688UL,
                                                        2716767262544184013UL }))) *
                     (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                       6358830762575712333UL,
                                                       12313512559299087688UL,
                                                       2716767262544184013UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                            6358830762575712333UL,
                                                            12313512559299087688UL,
                                                            2716767262544184013UL })) *
                          (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                            6358830762575712333UL,
                                                            12313512559299087688UL,
                                                            2716767262544184013UL }))) *
                         (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                           6358830762575712333UL,
                                                           12313512559299087688UL,
                                                           2716767262544184013UL }))) *
                        (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                          6358830762575712333UL,
                                                          12313512559299087688UL,
                                                          2716767262544184013UL }))) *
                       (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                         6358830762575712333UL,
                                                         12313512559299087688UL,
                                                         2716767262544184013UL }))) +
                      (poseidon2_B_51_1 + FF(0))) +
                     (poseidon2_B_51_2 + FF(0))) +
                    (poseidon2_B_51_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<224>(evals) += tmp;
        }
        // Contribution 225
        {
            Avm_DECLARE_VIEWS(225);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_52_1 -
                  (((poseidon2_B_51_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                            6358830762575712333UL,
                                                            12313512559299087688UL,
                                                            2716767262544184013UL })) *
                          (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                            6358830762575712333UL,
                                                            12313512559299087688UL,
                                                            2716767262544184013UL }))) *
                         (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                           6358830762575712333UL,
                                                           12313512559299087688UL,
                                                           2716767262544184013UL }))) *
                        (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                          6358830762575712333UL,
                                                          12313512559299087688UL,
                                                          2716767262544184013UL }))) *
                       (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                         6358830762575712333UL,
                                                         12313512559299087688UL,
                                                         2716767262544184013UL }))) +
                      (poseidon2_B_51_1 + FF(0))) +
                     (poseidon2_B_51_2 + FF(0))) +
                    (poseidon2_B_51_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<225>(evals) += tmp;
        }
        // Contribution 226
        {
            Avm_DECLARE_VIEWS(226);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_52_2 -
                  (((poseidon2_B_51_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                            6358830762575712333UL,
                                                            12313512559299087688UL,
                                                            2716767262544184013UL })) *
                          (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                            6358830762575712333UL,
                                                            12313512559299087688UL,
                                                            2716767262544184013UL }))) *
                         (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                           6358830762575712333UL,
                                                           12313512559299087688UL,
                                                           2716767262544184013UL }))) *
                        (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                          6358830762575712333UL,
                                                          12313512559299087688UL,
                                                          2716767262544184013UL }))) *
                       (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                         6358830762575712333UL,
                                                         12313512559299087688UL,
                                                         2716767262544184013UL }))) +
                      (poseidon2_B_51_1 + FF(0))) +
                     (poseidon2_B_51_2 + FF(0))) +
                    (poseidon2_B_51_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<226>(evals) += tmp;
        }
        // Contribution 227
        {
            Avm_DECLARE_VIEWS(227);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_52_3 -
                  (((poseidon2_B_51_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                            6358830762575712333UL,
                                                            12313512559299087688UL,
                                                            2716767262544184013UL })) *
                          (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                            6358830762575712333UL,
                                                            12313512559299087688UL,
                                                            2716767262544184013UL }))) *
                         (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                           6358830762575712333UL,
                                                           12313512559299087688UL,
                                                           2716767262544184013UL }))) *
                        (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                          6358830762575712333UL,
                                                          12313512559299087688UL,
                                                          2716767262544184013UL }))) *
                       (poseidon2_B_51_0 + FF(uint256_t{ 16503526645482286870UL,
                                                         6358830762575712333UL,
                                                         12313512559299087688UL,
                                                         2716767262544184013UL }))) +
                      (poseidon2_B_51_1 + FF(0))) +
                     (poseidon2_B_51_2 + FF(0))) +
                    (poseidon2_B_51_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<227>(evals) += tmp;
        }
        // Contribution 228
        {
            Avm_DECLARE_VIEWS(228);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_53_0 -
                  (((((((poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                          13085704829880126552UL,
                                                          6356732802364281819UL,
                                                          2175930396888807151UL })) *
                        (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                          13085704829880126552UL,
                                                          6356732802364281819UL,
                                                          2175930396888807151UL }))) *
                       (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                         13085704829880126552UL,
                                                         6356732802364281819UL,
                                                         2175930396888807151UL }))) *
                      (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                        13085704829880126552UL,
                                                        6356732802364281819UL,
                                                        2175930396888807151UL }))) *
                     (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                       13085704829880126552UL,
                                                       6356732802364281819UL,
                                                       2175930396888807151UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                            13085704829880126552UL,
                                                            6356732802364281819UL,
                                                            2175930396888807151UL })) *
                          (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                            13085704829880126552UL,
                                                            6356732802364281819UL,
                                                            2175930396888807151UL }))) *
                         (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                           13085704829880126552UL,
                                                           6356732802364281819UL,
                                                           2175930396888807151UL }))) *
                        (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                          13085704829880126552UL,
                                                          6356732802364281819UL,
                                                          2175930396888807151UL }))) *
                       (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                         13085704829880126552UL,
                                                         6356732802364281819UL,
                                                         2175930396888807151UL }))) +
                      (poseidon2_B_52_1 + FF(0))) +
                     (poseidon2_B_52_2 + FF(0))) +
                    (poseidon2_B_52_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<228>(evals) += tmp;
        }
        // Contribution 229
        {
            Avm_DECLARE_VIEWS(229);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_53_1 -
                  (((poseidon2_B_52_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                            13085704829880126552UL,
                                                            6356732802364281819UL,
                                                            2175930396888807151UL })) *
                          (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                            13085704829880126552UL,
                                                            6356732802364281819UL,
                                                            2175930396888807151UL }))) *
                         (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                           13085704829880126552UL,
                                                           6356732802364281819UL,
                                                           2175930396888807151UL }))) *
                        (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                          13085704829880126552UL,
                                                          6356732802364281819UL,
                                                          2175930396888807151UL }))) *
                       (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                         13085704829880126552UL,
                                                         6356732802364281819UL,
                                                         2175930396888807151UL }))) +
                      (poseidon2_B_52_1 + FF(0))) +
                     (poseidon2_B_52_2 + FF(0))) +
                    (poseidon2_B_52_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<229>(evals) += tmp;
        }
        // Contribution 230
        {
            Avm_DECLARE_VIEWS(230);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_53_2 -
                  (((poseidon2_B_52_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                            13085704829880126552UL,
                                                            6356732802364281819UL,
                                                            2175930396888807151UL })) *
                          (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                            13085704829880126552UL,
                                                            6356732802364281819UL,
                                                            2175930396888807151UL }))) *
                         (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                           13085704829880126552UL,
                                                           6356732802364281819UL,
                                                           2175930396888807151UL }))) *
                        (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                          13085704829880126552UL,
                                                          6356732802364281819UL,
                                                          2175930396888807151UL }))) *
                       (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                         13085704829880126552UL,
                                                         6356732802364281819UL,
                                                         2175930396888807151UL }))) +
                      (poseidon2_B_52_1 + FF(0))) +
                     (poseidon2_B_52_2 + FF(0))) +
                    (poseidon2_B_52_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<230>(evals) += tmp;
        }
        // Contribution 231
        {
            Avm_DECLARE_VIEWS(231);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_53_3 -
                  (((poseidon2_B_52_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                            13085704829880126552UL,
                                                            6356732802364281819UL,
                                                            2175930396888807151UL })) *
                          (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                            13085704829880126552UL,
                                                            6356732802364281819UL,
                                                            2175930396888807151UL }))) *
                         (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                           13085704829880126552UL,
                                                           6356732802364281819UL,
                                                           2175930396888807151UL }))) *
                        (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                          13085704829880126552UL,
                                                          6356732802364281819UL,
                                                          2175930396888807151UL }))) *
                       (poseidon2_B_52_0 + FF(uint256_t{ 5426798011730033104UL,
                                                         13085704829880126552UL,
                                                         6356732802364281819UL,
                                                         2175930396888807151UL }))) +
                      (poseidon2_B_52_1 + FF(0))) +
                     (poseidon2_B_52_2 + FF(0))) +
                    (poseidon2_B_52_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<231>(evals) += tmp;
        }
        // Contribution 232
        {
            Avm_DECLARE_VIEWS(232);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_54_0 -
                  (((((((poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                          2576069526442506486UL,
                                                          14199683559983367515UL,
                                                          3432491072538425468UL })) *
                        (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                          2576069526442506486UL,
                                                          14199683559983367515UL,
                                                          3432491072538425468UL }))) *
                       (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                         2576069526442506486UL,
                                                         14199683559983367515UL,
                                                         3432491072538425468UL }))) *
                      (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                        2576069526442506486UL,
                                                        14199683559983367515UL,
                                                        3432491072538425468UL }))) *
                     (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                       2576069526442506486UL,
                                                       14199683559983367515UL,
                                                       3432491072538425468UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                            2576069526442506486UL,
                                                            14199683559983367515UL,
                                                            3432491072538425468UL })) *
                          (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                            2576069526442506486UL,
                                                            14199683559983367515UL,
                                                            3432491072538425468UL }))) *
                         (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                           2576069526442506486UL,
                                                           14199683559983367515UL,
                                                           3432491072538425468UL }))) *
                        (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                          2576069526442506486UL,
                                                          14199683559983367515UL,
                                                          3432491072538425468UL }))) *
                       (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                         2576069526442506486UL,
                                                         14199683559983367515UL,
                                                         3432491072538425468UL }))) +
                      (poseidon2_B_53_1 + FF(0))) +
                     (poseidon2_B_53_2 + FF(0))) +
                    (poseidon2_B_53_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<232>(evals) += tmp;
        }
        // Contribution 233
        {
            Avm_DECLARE_VIEWS(233);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_54_1 -
                  (((poseidon2_B_53_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                            2576069526442506486UL,
                                                            14199683559983367515UL,
                                                            3432491072538425468UL })) *
                          (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                            2576069526442506486UL,
                                                            14199683559983367515UL,
                                                            3432491072538425468UL }))) *
                         (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                           2576069526442506486UL,
                                                           14199683559983367515UL,
                                                           3432491072538425468UL }))) *
                        (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                          2576069526442506486UL,
                                                          14199683559983367515UL,
                                                          3432491072538425468UL }))) *
                       (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                         2576069526442506486UL,
                                                         14199683559983367515UL,
                                                         3432491072538425468UL }))) +
                      (poseidon2_B_53_1 + FF(0))) +
                     (poseidon2_B_53_2 + FF(0))) +
                    (poseidon2_B_53_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<233>(evals) += tmp;
        }
        // Contribution 234
        {
            Avm_DECLARE_VIEWS(234);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_54_2 -
                  (((poseidon2_B_53_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                            2576069526442506486UL,
                                                            14199683559983367515UL,
                                                            3432491072538425468UL })) *
                          (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                            2576069526442506486UL,
                                                            14199683559983367515UL,
                                                            3432491072538425468UL }))) *
                         (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                           2576069526442506486UL,
                                                           14199683559983367515UL,
                                                           3432491072538425468UL }))) *
                        (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                          2576069526442506486UL,
                                                          14199683559983367515UL,
                                                          3432491072538425468UL }))) *
                       (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                         2576069526442506486UL,
                                                         14199683559983367515UL,
                                                         3432491072538425468UL }))) +
                      (poseidon2_B_53_1 + FF(0))) +
                     (poseidon2_B_53_2 + FF(0))) +
                    (poseidon2_B_53_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<234>(evals) += tmp;
        }
        // Contribution 235
        {
            Avm_DECLARE_VIEWS(235);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_54_3 -
                  (((poseidon2_B_53_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                            2576069526442506486UL,
                                                            14199683559983367515UL,
                                                            3432491072538425468UL })) *
                          (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                            2576069526442506486UL,
                                                            14199683559983367515UL,
                                                            3432491072538425468UL }))) *
                         (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                           2576069526442506486UL,
                                                           14199683559983367515UL,
                                                           3432491072538425468UL }))) *
                        (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                          2576069526442506486UL,
                                                          14199683559983367515UL,
                                                          3432491072538425468UL }))) *
                       (poseidon2_B_53_0 + FF(uint256_t{ 8262282602783970021UL,
                                                         2576069526442506486UL,
                                                         14199683559983367515UL,
                                                         3432491072538425468UL }))) +
                      (poseidon2_B_53_1 + FF(0))) +
                     (poseidon2_B_53_2 + FF(0))) +
                    (poseidon2_B_53_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<235>(evals) += tmp;
        }
        // Contribution 236
        {
            Avm_DECLARE_VIEWS(236);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_55_0 -
                  (((((((poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                          6110468871588391807UL,
                                                          2850248286812407967UL,
                                                          3411084787375678665UL })) *
                        (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                          6110468871588391807UL,
                                                          2850248286812407967UL,
                                                          3411084787375678665UL }))) *
                       (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                         6110468871588391807UL,
                                                         2850248286812407967UL,
                                                         3411084787375678665UL }))) *
                      (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                        6110468871588391807UL,
                                                        2850248286812407967UL,
                                                        3411084787375678665UL }))) *
                     (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                       6110468871588391807UL,
                                                       2850248286812407967UL,
                                                       3411084787375678665UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                            6110468871588391807UL,
                                                            2850248286812407967UL,
                                                            3411084787375678665UL })) *
                          (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                            6110468871588391807UL,
                                                            2850248286812407967UL,
                                                            3411084787375678665UL }))) *
                         (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                           6110468871588391807UL,
                                                           2850248286812407967UL,
                                                           3411084787375678665UL }))) *
                        (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                          6110468871588391807UL,
                                                          2850248286812407967UL,
                                                          3411084787375678665UL }))) *
                       (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                         6110468871588391807UL,
                                                         2850248286812407967UL,
                                                         3411084787375678665UL }))) +
                      (poseidon2_B_54_1 + FF(0))) +
                     (poseidon2_B_54_2 + FF(0))) +
                    (poseidon2_B_54_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<236>(evals) += tmp;
        }
        // Contribution 237
        {
            Avm_DECLARE_VIEWS(237);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_55_1 -
                  (((poseidon2_B_54_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                            6110468871588391807UL,
                                                            2850248286812407967UL,
                                                            3411084787375678665UL })) *
                          (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                            6110468871588391807UL,
                                                            2850248286812407967UL,
                                                            3411084787375678665UL }))) *
                         (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                           6110468871588391807UL,
                                                           2850248286812407967UL,
                                                           3411084787375678665UL }))) *
                        (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                          6110468871588391807UL,
                                                          2850248286812407967UL,
                                                          3411084787375678665UL }))) *
                       (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                         6110468871588391807UL,
                                                         2850248286812407967UL,
                                                         3411084787375678665UL }))) +
                      (poseidon2_B_54_1 + FF(0))) +
                     (poseidon2_B_54_2 + FF(0))) +
                    (poseidon2_B_54_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<237>(evals) += tmp;
        }
        // Contribution 238
        {
            Avm_DECLARE_VIEWS(238);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_55_2 -
                  (((poseidon2_B_54_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                            6110468871588391807UL,
                                                            2850248286812407967UL,
                                                            3411084787375678665UL })) *
                          (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                            6110468871588391807UL,
                                                            2850248286812407967UL,
                                                            3411084787375678665UL }))) *
                         (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                           6110468871588391807UL,
                                                           2850248286812407967UL,
                                                           3411084787375678665UL }))) *
                        (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                          6110468871588391807UL,
                                                          2850248286812407967UL,
                                                          3411084787375678665UL }))) *
                       (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                         6110468871588391807UL,
                                                         2850248286812407967UL,
                                                         3411084787375678665UL }))) +
                      (poseidon2_B_54_1 + FF(0))) +
                     (poseidon2_B_54_2 + FF(0))) +
                    (poseidon2_B_54_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<238>(evals) += tmp;
        }
        // Contribution 239
        {
            Avm_DECLARE_VIEWS(239);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_55_3 -
                  (((poseidon2_B_54_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                            6110468871588391807UL,
                                                            2850248286812407967UL,
                                                            3411084787375678665UL })) *
                          (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                            6110468871588391807UL,
                                                            2850248286812407967UL,
                                                            3411084787375678665UL }))) *
                         (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                           6110468871588391807UL,
                                                           2850248286812407967UL,
                                                           3411084787375678665UL }))) *
                        (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                          6110468871588391807UL,
                                                          2850248286812407967UL,
                                                          3411084787375678665UL }))) *
                       (poseidon2_B_54_0 + FF(uint256_t{ 14778817021916755205UL,
                                                         6110468871588391807UL,
                                                         2850248286812407967UL,
                                                         3411084787375678665UL }))) +
                      (poseidon2_B_54_1 + FF(0))) +
                     (poseidon2_B_54_2 + FF(0))) +
                    (poseidon2_B_54_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<239>(evals) += tmp;
        }
        // Contribution 240
        {
            Avm_DECLARE_VIEWS(240);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_56_0 -
                  (((((((poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                          12096549814065429793UL,
                                                          5988343102643160344UL,
                                                          309820751832846301UL })) *
                        (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                          12096549814065429793UL,
                                                          5988343102643160344UL,
                                                          309820751832846301UL }))) *
                       (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                         12096549814065429793UL,
                                                         5988343102643160344UL,
                                                         309820751832846301UL }))) *
                      (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                        12096549814065429793UL,
                                                        5988343102643160344UL,
                                                        309820751832846301UL }))) *
                     (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                       12096549814065429793UL,
                                                       5988343102643160344UL,
                                                       309820751832846301UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                            12096549814065429793UL,
                                                            5988343102643160344UL,
                                                            309820751832846301UL })) *
                          (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                            12096549814065429793UL,
                                                            5988343102643160344UL,
                                                            309820751832846301UL }))) *
                         (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                           12096549814065429793UL,
                                                           5988343102643160344UL,
                                                           309820751832846301UL }))) *
                        (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                          12096549814065429793UL,
                                                          5988343102643160344UL,
                                                          309820751832846301UL }))) *
                       (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                         12096549814065429793UL,
                                                         5988343102643160344UL,
                                                         309820751832846301UL }))) +
                      (poseidon2_B_55_1 + FF(0))) +
                     (poseidon2_B_55_2 + FF(0))) +
                    (poseidon2_B_55_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<240>(evals) += tmp;
        }
        // Contribution 241
        {
            Avm_DECLARE_VIEWS(241);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_56_1 -
                  (((poseidon2_B_55_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                            12096549814065429793UL,
                                                            5988343102643160344UL,
                                                            309820751832846301UL })) *
                          (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                            12096549814065429793UL,
                                                            5988343102643160344UL,
                                                            309820751832846301UL }))) *
                         (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                           12096549814065429793UL,
                                                           5988343102643160344UL,
                                                           309820751832846301UL }))) *
                        (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                          12096549814065429793UL,
                                                          5988343102643160344UL,
                                                          309820751832846301UL }))) *
                       (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                         12096549814065429793UL,
                                                         5988343102643160344UL,
                                                         309820751832846301UL }))) +
                      (poseidon2_B_55_1 + FF(0))) +
                     (poseidon2_B_55_2 + FF(0))) +
                    (poseidon2_B_55_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<241>(evals) += tmp;
        }
        // Contribution 242
        {
            Avm_DECLARE_VIEWS(242);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_56_2 -
                  (((poseidon2_B_55_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                            12096549814065429793UL,
                                                            5988343102643160344UL,
                                                            309820751832846301UL })) *
                          (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                            12096549814065429793UL,
                                                            5988343102643160344UL,
                                                            309820751832846301UL }))) *
                         (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                           12096549814065429793UL,
                                                           5988343102643160344UL,
                                                           309820751832846301UL }))) *
                        (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                          12096549814065429793UL,
                                                          5988343102643160344UL,
                                                          309820751832846301UL }))) *
                       (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                         12096549814065429793UL,
                                                         5988343102643160344UL,
                                                         309820751832846301UL }))) +
                      (poseidon2_B_55_1 + FF(0))) +
                     (poseidon2_B_55_2 + FF(0))) +
                    (poseidon2_B_55_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<242>(evals) += tmp;
        }
        // Contribution 243
        {
            Avm_DECLARE_VIEWS(243);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_56_3 -
                  (((poseidon2_B_55_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                            12096549814065429793UL,
                                                            5988343102643160344UL,
                                                            309820751832846301UL })) *
                          (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                            12096549814065429793UL,
                                                            5988343102643160344UL,
                                                            309820751832846301UL }))) *
                         (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                           12096549814065429793UL,
                                                           5988343102643160344UL,
                                                           309820751832846301UL }))) *
                        (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                          12096549814065429793UL,
                                                          5988343102643160344UL,
                                                          309820751832846301UL }))) *
                       (poseidon2_B_55_0 + FF(uint256_t{ 4906200604739023933UL,
                                                         12096549814065429793UL,
                                                         5988343102643160344UL,
                                                         309820751832846301UL }))) +
                      (poseidon2_B_55_1 + FF(0))) +
                     (poseidon2_B_55_2 + FF(0))) +
                    (poseidon2_B_55_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<243>(evals) += tmp;
        }
        // Contribution 244
        {
            Avm_DECLARE_VIEWS(244);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_57_0 -
                  (((((((poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                          10520000332606345601UL,
                                                          4756441214598660785UL,
                                                          2483744946546306397UL })) *
                        (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                          10520000332606345601UL,
                                                          4756441214598660785UL,
                                                          2483744946546306397UL }))) *
                       (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                         10520000332606345601UL,
                                                         4756441214598660785UL,
                                                         2483744946546306397UL }))) *
                      (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                        10520000332606345601UL,
                                                        4756441214598660785UL,
                                                        2483744946546306397UL }))) *
                     (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                       10520000332606345601UL,
                                                       4756441214598660785UL,
                                                       2483744946546306397UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                            10520000332606345601UL,
                                                            4756441214598660785UL,
                                                            2483744946546306397UL })) *
                          (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                            10520000332606345601UL,
                                                            4756441214598660785UL,
                                                            2483744946546306397UL }))) *
                         (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                           10520000332606345601UL,
                                                           4756441214598660785UL,
                                                           2483744946546306397UL }))) *
                        (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                          10520000332606345601UL,
                                                          4756441214598660785UL,
                                                          2483744946546306397UL }))) *
                       (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                         10520000332606345601UL,
                                                         4756441214598660785UL,
                                                         2483744946546306397UL }))) +
                      (poseidon2_B_56_1 + FF(0))) +
                     (poseidon2_B_56_2 + FF(0))) +
                    (poseidon2_B_56_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<244>(evals) += tmp;
        }
        // Contribution 245
        {
            Avm_DECLARE_VIEWS(245);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_57_1 -
                  (((poseidon2_B_56_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                            10520000332606345601UL,
                                                            4756441214598660785UL,
                                                            2483744946546306397UL })) *
                          (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                            10520000332606345601UL,
                                                            4756441214598660785UL,
                                                            2483744946546306397UL }))) *
                         (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                           10520000332606345601UL,
                                                           4756441214598660785UL,
                                                           2483744946546306397UL }))) *
                        (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                          10520000332606345601UL,
                                                          4756441214598660785UL,
                                                          2483744946546306397UL }))) *
                       (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                         10520000332606345601UL,
                                                         4756441214598660785UL,
                                                         2483744946546306397UL }))) +
                      (poseidon2_B_56_1 + FF(0))) +
                     (poseidon2_B_56_2 + FF(0))) +
                    (poseidon2_B_56_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<245>(evals) += tmp;
        }
        // Contribution 246
        {
            Avm_DECLARE_VIEWS(246);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_57_2 -
                  (((poseidon2_B_56_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                            10520000332606345601UL,
                                                            4756441214598660785UL,
                                                            2483744946546306397UL })) *
                          (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                            10520000332606345601UL,
                                                            4756441214598660785UL,
                                                            2483744946546306397UL }))) *
                         (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                           10520000332606345601UL,
                                                           4756441214598660785UL,
                                                           2483744946546306397UL }))) *
                        (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                          10520000332606345601UL,
                                                          4756441214598660785UL,
                                                          2483744946546306397UL }))) *
                       (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                         10520000332606345601UL,
                                                         4756441214598660785UL,
                                                         2483744946546306397UL }))) +
                      (poseidon2_B_56_1 + FF(0))) +
                     (poseidon2_B_56_2 + FF(0))) +
                    (poseidon2_B_56_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<246>(evals) += tmp;
        }
        // Contribution 247
        {
            Avm_DECLARE_VIEWS(247);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_57_3 -
                  (((poseidon2_B_56_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                            10520000332606345601UL,
                                                            4756441214598660785UL,
                                                            2483744946546306397UL })) *
                          (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                            10520000332606345601UL,
                                                            4756441214598660785UL,
                                                            2483744946546306397UL }))) *
                         (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                           10520000332606345601UL,
                                                           4756441214598660785UL,
                                                           2483744946546306397UL }))) *
                        (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                          10520000332606345601UL,
                                                          4756441214598660785UL,
                                                          2483744946546306397UL }))) *
                       (poseidon2_B_56_0 + FF(uint256_t{ 8709336210313678885UL,
                                                         10520000332606345601UL,
                                                         4756441214598660785UL,
                                                         2483744946546306397UL }))) +
                      (poseidon2_B_56_1 + FF(0))) +
                     (poseidon2_B_56_2 + FF(0))) +
                    (poseidon2_B_56_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<247>(evals) += tmp;
        }
        // Contribution 248
        {
            Avm_DECLARE_VIEWS(248);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_58_0 -
                  (((((((poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                          6702332727289490762UL,
                                                          7078214601245292934UL,
                                                          215269160536524476UL })) *
                        (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                          6702332727289490762UL,
                                                          7078214601245292934UL,
                                                          215269160536524476UL }))) *
                       (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                         6702332727289490762UL,
                                                         7078214601245292934UL,
                                                         215269160536524476UL }))) *
                      (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                        6702332727289490762UL,
                                                        7078214601245292934UL,
                                                        215269160536524476UL }))) *
                     (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                       6702332727289490762UL,
                                                       7078214601245292934UL,
                                                       215269160536524476UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                            6702332727289490762UL,
                                                            7078214601245292934UL,
                                                            215269160536524476UL })) *
                          (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                            6702332727289490762UL,
                                                            7078214601245292934UL,
                                                            215269160536524476UL }))) *
                         (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                           6702332727289490762UL,
                                                           7078214601245292934UL,
                                                           215269160536524476UL }))) *
                        (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                          6702332727289490762UL,
                                                          7078214601245292934UL,
                                                          215269160536524476UL }))) *
                       (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                         6702332727289490762UL,
                                                         7078214601245292934UL,
                                                         215269160536524476UL }))) +
                      (poseidon2_B_57_1 + FF(0))) +
                     (poseidon2_B_57_2 + FF(0))) +
                    (poseidon2_B_57_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<248>(evals) += tmp;
        }
        // Contribution 249
        {
            Avm_DECLARE_VIEWS(249);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_58_1 -
                  (((poseidon2_B_57_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                            6702332727289490762UL,
                                                            7078214601245292934UL,
                                                            215269160536524476UL })) *
                          (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                            6702332727289490762UL,
                                                            7078214601245292934UL,
                                                            215269160536524476UL }))) *
                         (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                           6702332727289490762UL,
                                                           7078214601245292934UL,
                                                           215269160536524476UL }))) *
                        (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                          6702332727289490762UL,
                                                          7078214601245292934UL,
                                                          215269160536524476UL }))) *
                       (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                         6702332727289490762UL,
                                                         7078214601245292934UL,
                                                         215269160536524476UL }))) +
                      (poseidon2_B_57_1 + FF(0))) +
                     (poseidon2_B_57_2 + FF(0))) +
                    (poseidon2_B_57_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<249>(evals) += tmp;
        }
        // Contribution 250
        {
            Avm_DECLARE_VIEWS(250);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_58_2 -
                  (((poseidon2_B_57_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                            6702332727289490762UL,
                                                            7078214601245292934UL,
                                                            215269160536524476UL })) *
                          (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                            6702332727289490762UL,
                                                            7078214601245292934UL,
                                                            215269160536524476UL }))) *
                         (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                           6702332727289490762UL,
                                                           7078214601245292934UL,
                                                           215269160536524476UL }))) *
                        (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                          6702332727289490762UL,
                                                          7078214601245292934UL,
                                                          215269160536524476UL }))) *
                       (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                         6702332727289490762UL,
                                                         7078214601245292934UL,
                                                         215269160536524476UL }))) +
                      (poseidon2_B_57_1 + FF(0))) +
                     (poseidon2_B_57_2 + FF(0))) +
                    (poseidon2_B_57_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<250>(evals) += tmp;
        }
        // Contribution 251
        {
            Avm_DECLARE_VIEWS(251);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_58_3 -
                  (((poseidon2_B_57_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                            6702332727289490762UL,
                                                            7078214601245292934UL,
                                                            215269160536524476UL })) *
                          (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                            6702332727289490762UL,
                                                            7078214601245292934UL,
                                                            215269160536524476UL }))) *
                         (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                           6702332727289490762UL,
                                                           7078214601245292934UL,
                                                           215269160536524476UL }))) *
                        (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                          6702332727289490762UL,
                                                          7078214601245292934UL,
                                                          215269160536524476UL }))) *
                       (poseidon2_B_57_0 + FF(uint256_t{ 9617950371599090517UL,
                                                         6702332727289490762UL,
                                                         7078214601245292934UL,
                                                         215269160536524476UL }))) +
                      (poseidon2_B_57_1 + FF(0))) +
                     (poseidon2_B_57_2 + FF(0))) +
                    (poseidon2_B_57_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<251>(evals) += tmp;
        }
        // Contribution 252
        {
            Avm_DECLARE_VIEWS(252);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_59_0 -
                  (((((((poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                          13462371741453101277UL,
                                                          7691247574208617782UL,
                                                          1078917709155142535UL })) *
                        (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                          13462371741453101277UL,
                                                          7691247574208617782UL,
                                                          1078917709155142535UL }))) *
                       (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                         13462371741453101277UL,
                                                         7691247574208617782UL,
                                                         1078917709155142535UL }))) *
                      (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                        13462371741453101277UL,
                                                        7691247574208617782UL,
                                                        1078917709155142535UL }))) *
                     (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                       13462371741453101277UL,
                                                       7691247574208617782UL,
                                                       1078917709155142535UL }))) *
                    FF(uint256_t{
                        13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL })) +
                   ((((((((poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                            13462371741453101277UL,
                                                            7691247574208617782UL,
                                                            1078917709155142535UL })) *
                          (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                            13462371741453101277UL,
                                                            7691247574208617782UL,
                                                            1078917709155142535UL }))) *
                         (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                           13462371741453101277UL,
                                                           7691247574208617782UL,
                                                           1078917709155142535UL }))) *
                        (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                          13462371741453101277UL,
                                                          7691247574208617782UL,
                                                          1078917709155142535UL }))) *
                       (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                         13462371741453101277UL,
                                                         7691247574208617782UL,
                                                         1078917709155142535UL }))) +
                      (poseidon2_B_58_1 + FF(0))) +
                     (poseidon2_B_58_2 + FF(0))) +
                    (poseidon2_B_58_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<252>(evals) += tmp;
        }
        // Contribution 253
        {
            Avm_DECLARE_VIEWS(253);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_59_1 -
                  (((poseidon2_B_58_1 + FF(0)) *
                    FF(uint256_t{
                        12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL })) +
                   ((((((((poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                            13462371741453101277UL,
                                                            7691247574208617782UL,
                                                            1078917709155142535UL })) *
                          (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                            13462371741453101277UL,
                                                            7691247574208617782UL,
                                                            1078917709155142535UL }))) *
                         (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                           13462371741453101277UL,
                                                           7691247574208617782UL,
                                                           1078917709155142535UL }))) *
                        (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                          13462371741453101277UL,
                                                          7691247574208617782UL,
                                                          1078917709155142535UL }))) *
                       (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                         13462371741453101277UL,
                                                         7691247574208617782UL,
                                                         1078917709155142535UL }))) +
                      (poseidon2_B_58_1 + FF(0))) +
                     (poseidon2_B_58_2 + FF(0))) +
                    (poseidon2_B_58_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<253>(evals) += tmp;
        }
        // Contribution 254
        {
            Avm_DECLARE_VIEWS(254);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_59_2 -
                  (((poseidon2_B_58_2 + FF(0)) *
                    FF(uint256_t{
                        8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL })) +
                   ((((((((poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                            13462371741453101277UL,
                                                            7691247574208617782UL,
                                                            1078917709155142535UL })) *
                          (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                            13462371741453101277UL,
                                                            7691247574208617782UL,
                                                            1078917709155142535UL }))) *
                         (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                           13462371741453101277UL,
                                                           7691247574208617782UL,
                                                           1078917709155142535UL }))) *
                        (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                          13462371741453101277UL,
                                                          7691247574208617782UL,
                                                          1078917709155142535UL }))) *
                       (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                         13462371741453101277UL,
                                                         7691247574208617782UL,
                                                         1078917709155142535UL }))) +
                      (poseidon2_B_58_1 + FF(0))) +
                     (poseidon2_B_58_2 + FF(0))) +
                    (poseidon2_B_58_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<254>(evals) += tmp;
        }
        // Contribution 255
        {
            Avm_DECLARE_VIEWS(255);

            auto tmp =
                (poseidon2_sel_poseidon_perm *
                 (poseidon2_B_59_3 -
                  (((poseidon2_B_58_3 + FF(0)) *
                    FF(uint256_t{
                        1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL })) +
                   ((((((((poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                            13462371741453101277UL,
                                                            7691247574208617782UL,
                                                            1078917709155142535UL })) *
                          (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                            13462371741453101277UL,
                                                            7691247574208617782UL,
                                                            1078917709155142535UL }))) *
                         (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                           13462371741453101277UL,
                                                           7691247574208617782UL,
                                                           1078917709155142535UL }))) *
                        (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                          13462371741453101277UL,
                                                          7691247574208617782UL,
                                                          1078917709155142535UL }))) *
                       (poseidon2_B_58_0 + FF(uint256_t{ 14694170287735041964UL,
                                                         13462371741453101277UL,
                                                         7691247574208617782UL,
                                                         1078917709155142535UL }))) +
                      (poseidon2_B_58_1 + FF(0))) +
                     (poseidon2_B_58_2 + FF(0))) +
                    (poseidon2_B_58_3 + FF(0))))));
            tmp *= scaling_factor;
            std::get<255>(evals) += tmp;
        }
        // Contribution 256
        {
            Avm_DECLARE_VIEWS(256);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_60_4 - ((((((((poseidon2_B_59_2 + FF(uint256_t{ 10815195850656127580UL,
                                                                                     17940782720817522247UL,
                                                                                     11666428030894512886UL,
                                                                                     2305765957929457259UL })) *
                                                   (poseidon2_B_59_2 + FF(uint256_t{ 10815195850656127580UL,
                                                                                     17940782720817522247UL,
                                                                                     11666428030894512886UL,
                                                                                     2305765957929457259UL }))) *
                                                  (poseidon2_B_59_2 + FF(uint256_t{ 10815195850656127580UL,
                                                                                    17940782720817522247UL,
                                                                                    11666428030894512886UL,
                                                                                    2305765957929457259UL }))) *
                                                 (poseidon2_B_59_2 + FF(uint256_t{ 10815195850656127580UL,
                                                                                   17940782720817522247UL,
                                                                                   11666428030894512886UL,
                                                                                   2305765957929457259UL }))) *
                                                (poseidon2_B_59_2 + FF(uint256_t{ 10815195850656127580UL,
                                                                                  17940782720817522247UL,
                                                                                  11666428030894512886UL,
                                                                                  2305765957929457259UL }))) +
                                               (((((poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                     6885928680245806601UL,
                                                                                     6031863836827793624UL,
                                                                                     2698250255620259624UL })) *
                                                   (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                     6885928680245806601UL,
                                                                                     6031863836827793624UL,
                                                                                     2698250255620259624UL }))) *
                                                  (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                    6885928680245806601UL,
                                                                                    6031863836827793624UL,
                                                                                    2698250255620259624UL }))) *
                                                 (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                   6885928680245806601UL,
                                                                                   6031863836827793624UL,
                                                                                   2698250255620259624UL }))) *
                                                (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                  6885928680245806601UL,
                                                                                  6031863836827793624UL,
                                                                                  2698250255620259624UL })))) *
                                              FF(4)) +
                                             (((((((poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                     6885928680245806601UL,
                                                                                     6031863836827793624UL,
                                                                                     2698250255620259624UL })) *
                                                   (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                     6885928680245806601UL,
                                                                                     6031863836827793624UL,
                                                                                     2698250255620259624UL }))) *
                                                  (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                    6885928680245806601UL,
                                                                                    6031863836827793624UL,
                                                                                    2698250255620259624UL }))) *
                                                 (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                   6885928680245806601UL,
                                                                                   6031863836827793624UL,
                                                                                   2698250255620259624UL }))) *
                                                (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                  6885928680245806601UL,
                                                                                  6031863836827793624UL,
                                                                                  2698250255620259624UL }))) *
                                               FF(2)) +
                                              ((((((poseidon2_B_59_0 + FF(uint256_t{ 17559938410729200952UL,
                                                                                     12326273425107991305UL,
                                                                                     8641129484519639030UL,
                                                                                     1699848340767391255UL })) *
                                                   (poseidon2_B_59_0 + FF(uint256_t{ 17559938410729200952UL,
                                                                                     12326273425107991305UL,
                                                                                     8641129484519639030UL,
                                                                                     1699848340767391255UL }))) *
                                                  (poseidon2_B_59_0 + FF(uint256_t{ 17559938410729200952UL,
                                                                                    12326273425107991305UL,
                                                                                    8641129484519639030UL,
                                                                                    1699848340767391255UL }))) *
                                                 (poseidon2_B_59_0 + FF(uint256_t{ 17559938410729200952UL,
                                                                                   12326273425107991305UL,
                                                                                   8641129484519639030UL,
                                                                                   1699848340767391255UL }))) *
                                                (poseidon2_B_59_0 + FF(uint256_t{ 17559938410729200952UL,
                                                                                  12326273425107991305UL,
                                                                                  8641129484519639030UL,
                                                                                  1699848340767391255UL }))) +
                                               (((((poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                     10123891284815211853UL,
                                                                                     3676846437799665248UL,
                                                                                     753827773683953838UL })) *
                                                   (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                     10123891284815211853UL,
                                                                                     3676846437799665248UL,
                                                                                     753827773683953838UL }))) *
                                                  (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                    10123891284815211853UL,
                                                                                    3676846437799665248UL,
                                                                                    753827773683953838UL }))) *
                                                 (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                   10123891284815211853UL,
                                                                                   3676846437799665248UL,
                                                                                   753827773683953838UL }))) *
                                                (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                  10123891284815211853UL,
                                                                                  3676846437799665248UL,
                                                                                  753827773683953838UL }))))))));
            tmp *= scaling_factor;
            std::get<256>(evals) += tmp;
        }
        // Contribution 257
        {
            Avm_DECLARE_VIEWS(257);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_60_5 - ((((((((poseidon2_B_59_0 + FF(uint256_t{ 17559938410729200952UL,
                                                                                     12326273425107991305UL,
                                                                                     8641129484519639030UL,
                                                                                     1699848340767391255UL })) *
                                                   (poseidon2_B_59_0 + FF(uint256_t{ 17559938410729200952UL,
                                                                                     12326273425107991305UL,
                                                                                     8641129484519639030UL,
                                                                                     1699848340767391255UL }))) *
                                                  (poseidon2_B_59_0 + FF(uint256_t{ 17559938410729200952UL,
                                                                                    12326273425107991305UL,
                                                                                    8641129484519639030UL,
                                                                                    1699848340767391255UL }))) *
                                                 (poseidon2_B_59_0 + FF(uint256_t{ 17559938410729200952UL,
                                                                                   12326273425107991305UL,
                                                                                   8641129484519639030UL,
                                                                                   1699848340767391255UL }))) *
                                                (poseidon2_B_59_0 + FF(uint256_t{ 17559938410729200952UL,
                                                                                  12326273425107991305UL,
                                                                                  8641129484519639030UL,
                                                                                  1699848340767391255UL }))) +
                                               (((((poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                     10123891284815211853UL,
                                                                                     3676846437799665248UL,
                                                                                     753827773683953838UL })) *
                                                   (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                     10123891284815211853UL,
                                                                                     3676846437799665248UL,
                                                                                     753827773683953838UL }))) *
                                                  (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                    10123891284815211853UL,
                                                                                    3676846437799665248UL,
                                                                                    753827773683953838UL }))) *
                                                 (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                   10123891284815211853UL,
                                                                                   3676846437799665248UL,
                                                                                   753827773683953838UL }))) *
                                                (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                  10123891284815211853UL,
                                                                                  3676846437799665248UL,
                                                                                  753827773683953838UL })))) *
                                              FF(4)) +
                                             (((((((poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                     10123891284815211853UL,
                                                                                     3676846437799665248UL,
                                                                                     753827773683953838UL })) *
                                                   (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                     10123891284815211853UL,
                                                                                     3676846437799665248UL,
                                                                                     753827773683953838UL }))) *
                                                  (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                    10123891284815211853UL,
                                                                                    3676846437799665248UL,
                                                                                    753827773683953838UL }))) *
                                                 (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                   10123891284815211853UL,
                                                                                   3676846437799665248UL,
                                                                                   753827773683953838UL }))) *
                                                (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                  10123891284815211853UL,
                                                                                  3676846437799665248UL,
                                                                                  753827773683953838UL }))) *
                                               FF(2)) +
                                              ((((((poseidon2_B_59_2 + FF(uint256_t{ 10815195850656127580UL,
                                                                                     17940782720817522247UL,
                                                                                     11666428030894512886UL,
                                                                                     2305765957929457259UL })) *
                                                   (poseidon2_B_59_2 + FF(uint256_t{ 10815195850656127580UL,
                                                                                     17940782720817522247UL,
                                                                                     11666428030894512886UL,
                                                                                     2305765957929457259UL }))) *
                                                  (poseidon2_B_59_2 + FF(uint256_t{ 10815195850656127580UL,
                                                                                    17940782720817522247UL,
                                                                                    11666428030894512886UL,
                                                                                    2305765957929457259UL }))) *
                                                 (poseidon2_B_59_2 + FF(uint256_t{ 10815195850656127580UL,
                                                                                   17940782720817522247UL,
                                                                                   11666428030894512886UL,
                                                                                   2305765957929457259UL }))) *
                                                (poseidon2_B_59_2 + FF(uint256_t{ 10815195850656127580UL,
                                                                                  17940782720817522247UL,
                                                                                  11666428030894512886UL,
                                                                                  2305765957929457259UL }))) +
                                               (((((poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                     6885928680245806601UL,
                                                                                     6031863836827793624UL,
                                                                                     2698250255620259624UL })) *
                                                   (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                     6885928680245806601UL,
                                                                                     6031863836827793624UL,
                                                                                     2698250255620259624UL }))) *
                                                  (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                    6885928680245806601UL,
                                                                                    6031863836827793624UL,
                                                                                    2698250255620259624UL }))) *
                                                 (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                   6885928680245806601UL,
                                                                                   6031863836827793624UL,
                                                                                   2698250255620259624UL }))) *
                                                (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                  6885928680245806601UL,
                                                                                  6031863836827793624UL,
                                                                                  2698250255620259624UL }))))))));
            tmp *= scaling_factor;
            std::get<257>(evals) += tmp;
        }
        // Contribution 258
        {
            Avm_DECLARE_VIEWS(258);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_60_6 - ((((((((poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                     6885928680245806601UL,
                                                                                     6031863836827793624UL,
                                                                                     2698250255620259624UL })) *
                                                   (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                     6885928680245806601UL,
                                                                                     6031863836827793624UL,
                                                                                     2698250255620259624UL }))) *
                                                  (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                    6885928680245806601UL,
                                                                                    6031863836827793624UL,
                                                                                    2698250255620259624UL }))) *
                                                 (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                   6885928680245806601UL,
                                                                                   6031863836827793624UL,
                                                                                   2698250255620259624UL }))) *
                                                (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                  6885928680245806601UL,
                                                                                  6031863836827793624UL,
                                                                                  2698250255620259624UL }))) *
                                               FF(2)) +
                                              ((((((poseidon2_B_59_0 + FF(uint256_t{ 17559938410729200952UL,
                                                                                     12326273425107991305UL,
                                                                                     8641129484519639030UL,
                                                                                     1699848340767391255UL })) *
                                                   (poseidon2_B_59_0 + FF(uint256_t{ 17559938410729200952UL,
                                                                                     12326273425107991305UL,
                                                                                     8641129484519639030UL,
                                                                                     1699848340767391255UL }))) *
                                                  (poseidon2_B_59_0 + FF(uint256_t{ 17559938410729200952UL,
                                                                                    12326273425107991305UL,
                                                                                    8641129484519639030UL,
                                                                                    1699848340767391255UL }))) *
                                                 (poseidon2_B_59_0 + FF(uint256_t{ 17559938410729200952UL,
                                                                                   12326273425107991305UL,
                                                                                   8641129484519639030UL,
                                                                                   1699848340767391255UL }))) *
                                                (poseidon2_B_59_0 + FF(uint256_t{ 17559938410729200952UL,
                                                                                  12326273425107991305UL,
                                                                                  8641129484519639030UL,
                                                                                  1699848340767391255UL }))) +
                                               (((((poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                     10123891284815211853UL,
                                                                                     3676846437799665248UL,
                                                                                     753827773683953838UL })) *
                                                   (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                     10123891284815211853UL,
                                                                                     3676846437799665248UL,
                                                                                     753827773683953838UL }))) *
                                                  (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                    10123891284815211853UL,
                                                                                    3676846437799665248UL,
                                                                                    753827773683953838UL }))) *
                                                 (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                   10123891284815211853UL,
                                                                                   3676846437799665248UL,
                                                                                   753827773683953838UL }))) *
                                                (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                  10123891284815211853UL,
                                                                                  3676846437799665248UL,
                                                                                  753827773683953838UL }))))) +
                                             poseidon2_T_60_5)));
            tmp *= scaling_factor;
            std::get<258>(evals) += tmp;
        }
        // Contribution 259
        {
            Avm_DECLARE_VIEWS(259);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_60_7 - ((((((((poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                     10123891284815211853UL,
                                                                                     3676846437799665248UL,
                                                                                     753827773683953838UL })) *
                                                   (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                     10123891284815211853UL,
                                                                                     3676846437799665248UL,
                                                                                     753827773683953838UL }))) *
                                                  (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                    10123891284815211853UL,
                                                                                    3676846437799665248UL,
                                                                                    753827773683953838UL }))) *
                                                 (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                   10123891284815211853UL,
                                                                                   3676846437799665248UL,
                                                                                   753827773683953838UL }))) *
                                                (poseidon2_B_59_1 + FF(uint256_t{ 3946956839294125797UL,
                                                                                  10123891284815211853UL,
                                                                                  3676846437799665248UL,
                                                                                  753827773683953838UL }))) *
                                               FF(2)) +
                                              ((((((poseidon2_B_59_2 + FF(uint256_t{ 10815195850656127580UL,
                                                                                     17940782720817522247UL,
                                                                                     11666428030894512886UL,
                                                                                     2305765957929457259UL })) *
                                                   (poseidon2_B_59_2 + FF(uint256_t{ 10815195850656127580UL,
                                                                                     17940782720817522247UL,
                                                                                     11666428030894512886UL,
                                                                                     2305765957929457259UL }))) *
                                                  (poseidon2_B_59_2 + FF(uint256_t{ 10815195850656127580UL,
                                                                                    17940782720817522247UL,
                                                                                    11666428030894512886UL,
                                                                                    2305765957929457259UL }))) *
                                                 (poseidon2_B_59_2 + FF(uint256_t{ 10815195850656127580UL,
                                                                                   17940782720817522247UL,
                                                                                   11666428030894512886UL,
                                                                                   2305765957929457259UL }))) *
                                                (poseidon2_B_59_2 + FF(uint256_t{ 10815195850656127580UL,
                                                                                  17940782720817522247UL,
                                                                                  11666428030894512886UL,
                                                                                  2305765957929457259UL }))) +
                                               (((((poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                     6885928680245806601UL,
                                                                                     6031863836827793624UL,
                                                                                     2698250255620259624UL })) *
                                                   (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                     6885928680245806601UL,
                                                                                     6031863836827793624UL,
                                                                                     2698250255620259624UL }))) *
                                                  (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                    6885928680245806601UL,
                                                                                    6031863836827793624UL,
                                                                                    2698250255620259624UL }))) *
                                                 (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                   6885928680245806601UL,
                                                                                   6031863836827793624UL,
                                                                                   2698250255620259624UL }))) *
                                                (poseidon2_B_59_3 + FF(uint256_t{ 437280840171101279UL,
                                                                                  6885928680245806601UL,
                                                                                  6031863836827793624UL,
                                                                                  2698250255620259624UL }))))) +
                                             poseidon2_T_60_4)));
            tmp *= scaling_factor;
            std::get<259>(evals) += tmp;
        }
        // Contribution 260
        {
            Avm_DECLARE_VIEWS(260);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_61_4 - ((((((((poseidon2_T_60_7 + FF(uint256_t{ 10578217394647568846UL,
                                                                                     6637113826221079930UL,
                                                                                     1364449097464563400UL,
                                                                                     2379869735503406314UL })) *
                                                   (poseidon2_T_60_7 + FF(uint256_t{ 10578217394647568846UL,
                                                                                     6637113826221079930UL,
                                                                                     1364449097464563400UL,
                                                                                     2379869735503406314UL }))) *
                                                  (poseidon2_T_60_7 + FF(uint256_t{ 10578217394647568846UL,
                                                                                    6637113826221079930UL,
                                                                                    1364449097464563400UL,
                                                                                    2379869735503406314UL }))) *
                                                 (poseidon2_T_60_7 + FF(uint256_t{ 10578217394647568846UL,
                                                                                   6637113826221079930UL,
                                                                                   1364449097464563400UL,
                                                                                   2379869735503406314UL }))) *
                                                (poseidon2_T_60_7 + FF(uint256_t{ 10578217394647568846UL,
                                                                                  6637113826221079930UL,
                                                                                  1364449097464563400UL,
                                                                                  2379869735503406314UL }))) +
                                               (((((poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                     17422837239624809585UL,
                                                                                     12296960536238467913UL,
                                                                                     2434905421004621494UL })) *
                                                   (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                     17422837239624809585UL,
                                                                                     12296960536238467913UL,
                                                                                     2434905421004621494UL }))) *
                                                  (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                    17422837239624809585UL,
                                                                                    12296960536238467913UL,
                                                                                    2434905421004621494UL }))) *
                                                 (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                   17422837239624809585UL,
                                                                                   12296960536238467913UL,
                                                                                   2434905421004621494UL }))) *
                                                (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                  17422837239624809585UL,
                                                                                  12296960536238467913UL,
                                                                                  2434905421004621494UL })))) *
                                              FF(4)) +
                                             (((((((poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                     17422837239624809585UL,
                                                                                     12296960536238467913UL,
                                                                                     2434905421004621494UL })) *
                                                   (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                     17422837239624809585UL,
                                                                                     12296960536238467913UL,
                                                                                     2434905421004621494UL }))) *
                                                  (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                    17422837239624809585UL,
                                                                                    12296960536238467913UL,
                                                                                    2434905421004621494UL }))) *
                                                 (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                   17422837239624809585UL,
                                                                                   12296960536238467913UL,
                                                                                   2434905421004621494UL }))) *
                                                (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                  17422837239624809585UL,
                                                                                  12296960536238467913UL,
                                                                                  2434905421004621494UL }))) *
                                               FF(2)) +
                                              ((((((poseidon2_T_60_6 + FF(uint256_t{ 16961604592822056794UL,
                                                                                     12516844188945734293UL,
                                                                                     2404426354458718742UL,
                                                                                     901141949721836097UL })) *
                                                   (poseidon2_T_60_6 + FF(uint256_t{ 16961604592822056794UL,
                                                                                     12516844188945734293UL,
                                                                                     2404426354458718742UL,
                                                                                     901141949721836097UL }))) *
                                                  (poseidon2_T_60_6 + FF(uint256_t{ 16961604592822056794UL,
                                                                                    12516844188945734293UL,
                                                                                    2404426354458718742UL,
                                                                                    901141949721836097UL }))) *
                                                 (poseidon2_T_60_6 + FF(uint256_t{ 16961604592822056794UL,
                                                                                   12516844188945734293UL,
                                                                                   2404426354458718742UL,
                                                                                   901141949721836097UL }))) *
                                                (poseidon2_T_60_6 + FF(uint256_t{ 16961604592822056794UL,
                                                                                  12516844188945734293UL,
                                                                                  2404426354458718742UL,
                                                                                  901141949721836097UL }))) +
                                               (((((poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                     16108523113696338432UL,
                                                                                     11492645026300260534UL,
                                                                                     1417477149741880787UL })) *
                                                   (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                     16108523113696338432UL,
                                                                                     11492645026300260534UL,
                                                                                     1417477149741880787UL }))) *
                                                  (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                    16108523113696338432UL,
                                                                                    11492645026300260534UL,
                                                                                    1417477149741880787UL }))) *
                                                 (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                   16108523113696338432UL,
                                                                                   11492645026300260534UL,
                                                                                   1417477149741880787UL }))) *
                                                (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                  16108523113696338432UL,
                                                                                  11492645026300260534UL,
                                                                                  1417477149741880787UL }))))))));
            tmp *= scaling_factor;
            std::get<260>(evals) += tmp;
        }
        // Contribution 261
        {
            Avm_DECLARE_VIEWS(261);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_61_5 - ((((((((poseidon2_T_60_6 + FF(uint256_t{ 16961604592822056794UL,
                                                                                     12516844188945734293UL,
                                                                                     2404426354458718742UL,
                                                                                     901141949721836097UL })) *
                                                   (poseidon2_T_60_6 + FF(uint256_t{ 16961604592822056794UL,
                                                                                     12516844188945734293UL,
                                                                                     2404426354458718742UL,
                                                                                     901141949721836097UL }))) *
                                                  (poseidon2_T_60_6 + FF(uint256_t{ 16961604592822056794UL,
                                                                                    12516844188945734293UL,
                                                                                    2404426354458718742UL,
                                                                                    901141949721836097UL }))) *
                                                 (poseidon2_T_60_6 + FF(uint256_t{ 16961604592822056794UL,
                                                                                   12516844188945734293UL,
                                                                                   2404426354458718742UL,
                                                                                   901141949721836097UL }))) *
                                                (poseidon2_T_60_6 + FF(uint256_t{ 16961604592822056794UL,
                                                                                  12516844188945734293UL,
                                                                                  2404426354458718742UL,
                                                                                  901141949721836097UL }))) +
                                               (((((poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                     16108523113696338432UL,
                                                                                     11492645026300260534UL,
                                                                                     1417477149741880787UL })) *
                                                   (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                     16108523113696338432UL,
                                                                                     11492645026300260534UL,
                                                                                     1417477149741880787UL }))) *
                                                  (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                    16108523113696338432UL,
                                                                                    11492645026300260534UL,
                                                                                    1417477149741880787UL }))) *
                                                 (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                   16108523113696338432UL,
                                                                                   11492645026300260534UL,
                                                                                   1417477149741880787UL }))) *
                                                (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                  16108523113696338432UL,
                                                                                  11492645026300260534UL,
                                                                                  1417477149741880787UL })))) *
                                              FF(4)) +
                                             (((((((poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                     16108523113696338432UL,
                                                                                     11492645026300260534UL,
                                                                                     1417477149741880787UL })) *
                                                   (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                     16108523113696338432UL,
                                                                                     11492645026300260534UL,
                                                                                     1417477149741880787UL }))) *
                                                  (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                    16108523113696338432UL,
                                                                                    11492645026300260534UL,
                                                                                    1417477149741880787UL }))) *
                                                 (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                   16108523113696338432UL,
                                                                                   11492645026300260534UL,
                                                                                   1417477149741880787UL }))) *
                                                (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                  16108523113696338432UL,
                                                                                  11492645026300260534UL,
                                                                                  1417477149741880787UL }))) *
                                               FF(2)) +
                                              ((((((poseidon2_T_60_7 + FF(uint256_t{ 10578217394647568846UL,
                                                                                     6637113826221079930UL,
                                                                                     1364449097464563400UL,
                                                                                     2379869735503406314UL })) *
                                                   (poseidon2_T_60_7 + FF(uint256_t{ 10578217394647568846UL,
                                                                                     6637113826221079930UL,
                                                                                     1364449097464563400UL,
                                                                                     2379869735503406314UL }))) *
                                                  (poseidon2_T_60_7 + FF(uint256_t{ 10578217394647568846UL,
                                                                                    6637113826221079930UL,
                                                                                    1364449097464563400UL,
                                                                                    2379869735503406314UL }))) *
                                                 (poseidon2_T_60_7 + FF(uint256_t{ 10578217394647568846UL,
                                                                                   6637113826221079930UL,
                                                                                   1364449097464563400UL,
                                                                                   2379869735503406314UL }))) *
                                                (poseidon2_T_60_7 + FF(uint256_t{ 10578217394647568846UL,
                                                                                  6637113826221079930UL,
                                                                                  1364449097464563400UL,
                                                                                  2379869735503406314UL }))) +
                                               (((((poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                     17422837239624809585UL,
                                                                                     12296960536238467913UL,
                                                                                     2434905421004621494UL })) *
                                                   (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                     17422837239624809585UL,
                                                                                     12296960536238467913UL,
                                                                                     2434905421004621494UL }))) *
                                                  (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                    17422837239624809585UL,
                                                                                    12296960536238467913UL,
                                                                                    2434905421004621494UL }))) *
                                                 (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                   17422837239624809585UL,
                                                                                   12296960536238467913UL,
                                                                                   2434905421004621494UL }))) *
                                                (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                  17422837239624809585UL,
                                                                                  12296960536238467913UL,
                                                                                  2434905421004621494UL }))))))));
            tmp *= scaling_factor;
            std::get<261>(evals) += tmp;
        }
        // Contribution 262
        {
            Avm_DECLARE_VIEWS(262);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_61_6 - ((((((((poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                     17422837239624809585UL,
                                                                                     12296960536238467913UL,
                                                                                     2434905421004621494UL })) *
                                                   (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                     17422837239624809585UL,
                                                                                     12296960536238467913UL,
                                                                                     2434905421004621494UL }))) *
                                                  (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                    17422837239624809585UL,
                                                                                    12296960536238467913UL,
                                                                                    2434905421004621494UL }))) *
                                                 (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                   17422837239624809585UL,
                                                                                   12296960536238467913UL,
                                                                                   2434905421004621494UL }))) *
                                                (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                  17422837239624809585UL,
                                                                                  12296960536238467913UL,
                                                                                  2434905421004621494UL }))) *
                                               FF(2)) +
                                              ((((((poseidon2_T_60_6 + FF(uint256_t{ 16961604592822056794UL,
                                                                                     12516844188945734293UL,
                                                                                     2404426354458718742UL,
                                                                                     901141949721836097UL })) *
                                                   (poseidon2_T_60_6 + FF(uint256_t{ 16961604592822056794UL,
                                                                                     12516844188945734293UL,
                                                                                     2404426354458718742UL,
                                                                                     901141949721836097UL }))) *
                                                  (poseidon2_T_60_6 + FF(uint256_t{ 16961604592822056794UL,
                                                                                    12516844188945734293UL,
                                                                                    2404426354458718742UL,
                                                                                    901141949721836097UL }))) *
                                                 (poseidon2_T_60_6 + FF(uint256_t{ 16961604592822056794UL,
                                                                                   12516844188945734293UL,
                                                                                   2404426354458718742UL,
                                                                                   901141949721836097UL }))) *
                                                (poseidon2_T_60_6 + FF(uint256_t{ 16961604592822056794UL,
                                                                                  12516844188945734293UL,
                                                                                  2404426354458718742UL,
                                                                                  901141949721836097UL }))) +
                                               (((((poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                     16108523113696338432UL,
                                                                                     11492645026300260534UL,
                                                                                     1417477149741880787UL })) *
                                                   (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                     16108523113696338432UL,
                                                                                     11492645026300260534UL,
                                                                                     1417477149741880787UL }))) *
                                                  (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                    16108523113696338432UL,
                                                                                    11492645026300260534UL,
                                                                                    1417477149741880787UL }))) *
                                                 (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                   16108523113696338432UL,
                                                                                   11492645026300260534UL,
                                                                                   1417477149741880787UL }))) *
                                                (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                  16108523113696338432UL,
                                                                                  11492645026300260534UL,
                                                                                  1417477149741880787UL }))))) +
                                             poseidon2_T_61_5)));
            tmp *= scaling_factor;
            std::get<262>(evals) += tmp;
        }
        // Contribution 263
        {
            Avm_DECLARE_VIEWS(263);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_61_7 - ((((((((poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                     16108523113696338432UL,
                                                                                     11492645026300260534UL,
                                                                                     1417477149741880787UL })) *
                                                   (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                     16108523113696338432UL,
                                                                                     11492645026300260534UL,
                                                                                     1417477149741880787UL }))) *
                                                  (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                    16108523113696338432UL,
                                                                                    11492645026300260534UL,
                                                                                    1417477149741880787UL }))) *
                                                 (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                   16108523113696338432UL,
                                                                                   11492645026300260534UL,
                                                                                   1417477149741880787UL }))) *
                                                (poseidon2_T_60_5 + FF(uint256_t{ 3152898413090790038UL,
                                                                                  16108523113696338432UL,
                                                                                  11492645026300260534UL,
                                                                                  1417477149741880787UL }))) *
                                               FF(2)) +
                                              ((((((poseidon2_T_60_7 + FF(uint256_t{ 10578217394647568846UL,
                                                                                     6637113826221079930UL,
                                                                                     1364449097464563400UL,
                                                                                     2379869735503406314UL })) *
                                                   (poseidon2_T_60_7 + FF(uint256_t{ 10578217394647568846UL,
                                                                                     6637113826221079930UL,
                                                                                     1364449097464563400UL,
                                                                                     2379869735503406314UL }))) *
                                                  (poseidon2_T_60_7 + FF(uint256_t{ 10578217394647568846UL,
                                                                                    6637113826221079930UL,
                                                                                    1364449097464563400UL,
                                                                                    2379869735503406314UL }))) *
                                                 (poseidon2_T_60_7 + FF(uint256_t{ 10578217394647568846UL,
                                                                                   6637113826221079930UL,
                                                                                   1364449097464563400UL,
                                                                                   2379869735503406314UL }))) *
                                                (poseidon2_T_60_7 + FF(uint256_t{ 10578217394647568846UL,
                                                                                  6637113826221079930UL,
                                                                                  1364449097464563400UL,
                                                                                  2379869735503406314UL }))) +
                                               (((((poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                     17422837239624809585UL,
                                                                                     12296960536238467913UL,
                                                                                     2434905421004621494UL })) *
                                                   (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                     17422837239624809585UL,
                                                                                     12296960536238467913UL,
                                                                                     2434905421004621494UL }))) *
                                                  (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                    17422837239624809585UL,
                                                                                    12296960536238467913UL,
                                                                                    2434905421004621494UL }))) *
                                                 (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                   17422837239624809585UL,
                                                                                   12296960536238467913UL,
                                                                                   2434905421004621494UL }))) *
                                                (poseidon2_T_60_4 + FF(uint256_t{ 6332539588517624153UL,
                                                                                  17422837239624809585UL,
                                                                                  12296960536238467913UL,
                                                                                  2434905421004621494UL }))))) +
                                             poseidon2_T_61_4)));
            tmp *= scaling_factor;
            std::get<263>(evals) += tmp;
        }
        // Contribution 264
        {
            Avm_DECLARE_VIEWS(264);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_62_4 - ((((((((poseidon2_T_61_7 + FF(uint256_t{ 10329879351081882815UL,
                                                                                     5178010365334480003UL,
                                                                                     7014208314719145622UL,
                                                                                     385149140585498380UL })) *
                                                   (poseidon2_T_61_7 + FF(uint256_t{ 10329879351081882815UL,
                                                                                     5178010365334480003UL,
                                                                                     7014208314719145622UL,
                                                                                     385149140585498380UL }))) *
                                                  (poseidon2_T_61_7 + FF(uint256_t{ 10329879351081882815UL,
                                                                                    5178010365334480003UL,
                                                                                    7014208314719145622UL,
                                                                                    385149140585498380UL }))) *
                                                 (poseidon2_T_61_7 + FF(uint256_t{ 10329879351081882815UL,
                                                                                   5178010365334480003UL,
                                                                                   7014208314719145622UL,
                                                                                   385149140585498380UL }))) *
                                                (poseidon2_T_61_7 + FF(uint256_t{ 10329879351081882815UL,
                                                                                  5178010365334480003UL,
                                                                                  7014208314719145622UL,
                                                                                  385149140585498380UL }))) +
                                               (((((poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                     10541991787372042848UL,
                                                                                     14909749656931548440UL,
                                                                                     708152185224876794UL })) *
                                                   (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                     10541991787372042848UL,
                                                                                     14909749656931548440UL,
                                                                                     708152185224876794UL }))) *
                                                  (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                    10541991787372042848UL,
                                                                                    14909749656931548440UL,
                                                                                    708152185224876794UL }))) *
                                                 (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                   10541991787372042848UL,
                                                                                   14909749656931548440UL,
                                                                                   708152185224876794UL }))) *
                                                (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                  10541991787372042848UL,
                                                                                  14909749656931548440UL,
                                                                                  708152185224876794UL })))) *
                                              FF(4)) +
                                             (((((((poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                     10541991787372042848UL,
                                                                                     14909749656931548440UL,
                                                                                     708152185224876794UL })) *
                                                   (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                     10541991787372042848UL,
                                                                                     14909749656931548440UL,
                                                                                     708152185224876794UL }))) *
                                                  (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                    10541991787372042848UL,
                                                                                    14909749656931548440UL,
                                                                                    708152185224876794UL }))) *
                                                 (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                   10541991787372042848UL,
                                                                                   14909749656931548440UL,
                                                                                   708152185224876794UL }))) *
                                                (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                  10541991787372042848UL,
                                                                                  14909749656931548440UL,
                                                                                  708152185224876794UL }))) *
                                               FF(2)) +
                                              ((((((poseidon2_T_61_6 + FF(uint256_t{ 10311634121439582299UL,
                                                                                     2959376558854333994UL,
                                                                                     6697398963915560134UL,
                                                                                     417944321386245900UL })) *
                                                   (poseidon2_T_61_6 + FF(uint256_t{ 10311634121439582299UL,
                                                                                     2959376558854333994UL,
                                                                                     6697398963915560134UL,
                                                                                     417944321386245900UL }))) *
                                                  (poseidon2_T_61_6 + FF(uint256_t{ 10311634121439582299UL,
                                                                                    2959376558854333994UL,
                                                                                    6697398963915560134UL,
                                                                                    417944321386245900UL }))) *
                                                 (poseidon2_T_61_6 + FF(uint256_t{ 10311634121439582299UL,
                                                                                   2959376558854333994UL,
                                                                                   6697398963915560134UL,
                                                                                   417944321386245900UL }))) *
                                                (poseidon2_T_61_6 + FF(uint256_t{ 10311634121439582299UL,
                                                                                  2959376558854333994UL,
                                                                                  6697398963915560134UL,
                                                                                  417944321386245900UL }))) +
                                               (((((poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                     1640712307042701286UL,
                                                                                     16457516735210998920UL,
                                                                                     1084862449077757478UL })) *
                                                   (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                     1640712307042701286UL,
                                                                                     16457516735210998920UL,
                                                                                     1084862449077757478UL }))) *
                                                  (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                    1640712307042701286UL,
                                                                                    16457516735210998920UL,
                                                                                    1084862449077757478UL }))) *
                                                 (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                   1640712307042701286UL,
                                                                                   16457516735210998920UL,
                                                                                   1084862449077757478UL }))) *
                                                (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                  1640712307042701286UL,
                                                                                  16457516735210998920UL,
                                                                                  1084862449077757478UL }))))))));
            tmp *= scaling_factor;
            std::get<264>(evals) += tmp;
        }
        // Contribution 265
        {
            Avm_DECLARE_VIEWS(265);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_62_5 - ((((((((poseidon2_T_61_6 + FF(uint256_t{ 10311634121439582299UL,
                                                                                     2959376558854333994UL,
                                                                                     6697398963915560134UL,
                                                                                     417944321386245900UL })) *
                                                   (poseidon2_T_61_6 + FF(uint256_t{ 10311634121439582299UL,
                                                                                     2959376558854333994UL,
                                                                                     6697398963915560134UL,
                                                                                     417944321386245900UL }))) *
                                                  (poseidon2_T_61_6 + FF(uint256_t{ 10311634121439582299UL,
                                                                                    2959376558854333994UL,
                                                                                    6697398963915560134UL,
                                                                                    417944321386245900UL }))) *
                                                 (poseidon2_T_61_6 + FF(uint256_t{ 10311634121439582299UL,
                                                                                   2959376558854333994UL,
                                                                                   6697398963915560134UL,
                                                                                   417944321386245900UL }))) *
                                                (poseidon2_T_61_6 + FF(uint256_t{ 10311634121439582299UL,
                                                                                  2959376558854333994UL,
                                                                                  6697398963915560134UL,
                                                                                  417944321386245900UL }))) +
                                               (((((poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                     1640712307042701286UL,
                                                                                     16457516735210998920UL,
                                                                                     1084862449077757478UL })) *
                                                   (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                     1640712307042701286UL,
                                                                                     16457516735210998920UL,
                                                                                     1084862449077757478UL }))) *
                                                  (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                    1640712307042701286UL,
                                                                                    16457516735210998920UL,
                                                                                    1084862449077757478UL }))) *
                                                 (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                   1640712307042701286UL,
                                                                                   16457516735210998920UL,
                                                                                   1084862449077757478UL }))) *
                                                (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                  1640712307042701286UL,
                                                                                  16457516735210998920UL,
                                                                                  1084862449077757478UL })))) *
                                              FF(4)) +
                                             (((((((poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                     1640712307042701286UL,
                                                                                     16457516735210998920UL,
                                                                                     1084862449077757478UL })) *
                                                   (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                     1640712307042701286UL,
                                                                                     16457516735210998920UL,
                                                                                     1084862449077757478UL }))) *
                                                  (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                    1640712307042701286UL,
                                                                                    16457516735210998920UL,
                                                                                    1084862449077757478UL }))) *
                                                 (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                   1640712307042701286UL,
                                                                                   16457516735210998920UL,
                                                                                   1084862449077757478UL }))) *
                                                (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                  1640712307042701286UL,
                                                                                  16457516735210998920UL,
                                                                                  1084862449077757478UL }))) *
                                               FF(2)) +
                                              ((((((poseidon2_T_61_7 + FF(uint256_t{ 10329879351081882815UL,
                                                                                     5178010365334480003UL,
                                                                                     7014208314719145622UL,
                                                                                     385149140585498380UL })) *
                                                   (poseidon2_T_61_7 + FF(uint256_t{ 10329879351081882815UL,
                                                                                     5178010365334480003UL,
                                                                                     7014208314719145622UL,
                                                                                     385149140585498380UL }))) *
                                                  (poseidon2_T_61_7 + FF(uint256_t{ 10329879351081882815UL,
                                                                                    5178010365334480003UL,
                                                                                    7014208314719145622UL,
                                                                                    385149140585498380UL }))) *
                                                 (poseidon2_T_61_7 + FF(uint256_t{ 10329879351081882815UL,
                                                                                   5178010365334480003UL,
                                                                                   7014208314719145622UL,
                                                                                   385149140585498380UL }))) *
                                                (poseidon2_T_61_7 + FF(uint256_t{ 10329879351081882815UL,
                                                                                  5178010365334480003UL,
                                                                                  7014208314719145622UL,
                                                                                  385149140585498380UL }))) +
                                               (((((poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                     10541991787372042848UL,
                                                                                     14909749656931548440UL,
                                                                                     708152185224876794UL })) *
                                                   (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                     10541991787372042848UL,
                                                                                     14909749656931548440UL,
                                                                                     708152185224876794UL }))) *
                                                  (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                    10541991787372042848UL,
                                                                                    14909749656931548440UL,
                                                                                    708152185224876794UL }))) *
                                                 (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                   10541991787372042848UL,
                                                                                   14909749656931548440UL,
                                                                                   708152185224876794UL }))) *
                                                (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                  10541991787372042848UL,
                                                                                  14909749656931548440UL,
                                                                                  708152185224876794UL }))))))));
            tmp *= scaling_factor;
            std::get<265>(evals) += tmp;
        }
        // Contribution 266
        {
            Avm_DECLARE_VIEWS(266);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_62_6 - ((((((((poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                     10541991787372042848UL,
                                                                                     14909749656931548440UL,
                                                                                     708152185224876794UL })) *
                                                   (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                     10541991787372042848UL,
                                                                                     14909749656931548440UL,
                                                                                     708152185224876794UL }))) *
                                                  (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                    10541991787372042848UL,
                                                                                    14909749656931548440UL,
                                                                                    708152185224876794UL }))) *
                                                 (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                   10541991787372042848UL,
                                                                                   14909749656931548440UL,
                                                                                   708152185224876794UL }))) *
                                                (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                  10541991787372042848UL,
                                                                                  14909749656931548440UL,
                                                                                  708152185224876794UL }))) *
                                               FF(2)) +
                                              ((((((poseidon2_T_61_6 + FF(uint256_t{ 10311634121439582299UL,
                                                                                     2959376558854333994UL,
                                                                                     6697398963915560134UL,
                                                                                     417944321386245900UL })) *
                                                   (poseidon2_T_61_6 + FF(uint256_t{ 10311634121439582299UL,
                                                                                     2959376558854333994UL,
                                                                                     6697398963915560134UL,
                                                                                     417944321386245900UL }))) *
                                                  (poseidon2_T_61_6 + FF(uint256_t{ 10311634121439582299UL,
                                                                                    2959376558854333994UL,
                                                                                    6697398963915560134UL,
                                                                                    417944321386245900UL }))) *
                                                 (poseidon2_T_61_6 + FF(uint256_t{ 10311634121439582299UL,
                                                                                   2959376558854333994UL,
                                                                                   6697398963915560134UL,
                                                                                   417944321386245900UL }))) *
                                                (poseidon2_T_61_6 + FF(uint256_t{ 10311634121439582299UL,
                                                                                  2959376558854333994UL,
                                                                                  6697398963915560134UL,
                                                                                  417944321386245900UL }))) +
                                               (((((poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                     1640712307042701286UL,
                                                                                     16457516735210998920UL,
                                                                                     1084862449077757478UL })) *
                                                   (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                     1640712307042701286UL,
                                                                                     16457516735210998920UL,
                                                                                     1084862449077757478UL }))) *
                                                  (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                    1640712307042701286UL,
                                                                                    16457516735210998920UL,
                                                                                    1084862449077757478UL }))) *
                                                 (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                   1640712307042701286UL,
                                                                                   16457516735210998920UL,
                                                                                   1084862449077757478UL }))) *
                                                (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                  1640712307042701286UL,
                                                                                  16457516735210998920UL,
                                                                                  1084862449077757478UL }))))) +
                                             poseidon2_T_62_5)));
            tmp *= scaling_factor;
            std::get<266>(evals) += tmp;
        }
        // Contribution 267
        {
            Avm_DECLARE_VIEWS(267);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_62_7 - ((((((((poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                     1640712307042701286UL,
                                                                                     16457516735210998920UL,
                                                                                     1084862449077757478UL })) *
                                                   (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                     1640712307042701286UL,
                                                                                     16457516735210998920UL,
                                                                                     1084862449077757478UL }))) *
                                                  (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                    1640712307042701286UL,
                                                                                    16457516735210998920UL,
                                                                                    1084862449077757478UL }))) *
                                                 (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                   1640712307042701286UL,
                                                                                   16457516735210998920UL,
                                                                                   1084862449077757478UL }))) *
                                                (poseidon2_T_61_5 + FF(uint256_t{ 16872849857899172004UL,
                                                                                  1640712307042701286UL,
                                                                                  16457516735210998920UL,
                                                                                  1084862449077757478UL }))) *
                                               FF(2)) +
                                              ((((((poseidon2_T_61_7 + FF(uint256_t{ 10329879351081882815UL,
                                                                                     5178010365334480003UL,
                                                                                     7014208314719145622UL,
                                                                                     385149140585498380UL })) *
                                                   (poseidon2_T_61_7 + FF(uint256_t{ 10329879351081882815UL,
                                                                                     5178010365334480003UL,
                                                                                     7014208314719145622UL,
                                                                                     385149140585498380UL }))) *
                                                  (poseidon2_T_61_7 + FF(uint256_t{ 10329879351081882815UL,
                                                                                    5178010365334480003UL,
                                                                                    7014208314719145622UL,
                                                                                    385149140585498380UL }))) *
                                                 (poseidon2_T_61_7 + FF(uint256_t{ 10329879351081882815UL,
                                                                                   5178010365334480003UL,
                                                                                   7014208314719145622UL,
                                                                                   385149140585498380UL }))) *
                                                (poseidon2_T_61_7 + FF(uint256_t{ 10329879351081882815UL,
                                                                                  5178010365334480003UL,
                                                                                  7014208314719145622UL,
                                                                                  385149140585498380UL }))) +
                                               (((((poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                     10541991787372042848UL,
                                                                                     14909749656931548440UL,
                                                                                     708152185224876794UL })) *
                                                   (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                     10541991787372042848UL,
                                                                                     14909749656931548440UL,
                                                                                     708152185224876794UL }))) *
                                                  (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                    10541991787372042848UL,
                                                                                    14909749656931548440UL,
                                                                                    708152185224876794UL }))) *
                                                 (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                   10541991787372042848UL,
                                                                                   14909749656931548440UL,
                                                                                   708152185224876794UL }))) *
                                                (poseidon2_T_61_4 + FF(uint256_t{ 13199866221884806229UL,
                                                                                  10541991787372042848UL,
                                                                                  14909749656931548440UL,
                                                                                  708152185224876794UL }))))) +
                                             poseidon2_T_62_4)));
            tmp *= scaling_factor;
            std::get<267>(evals) += tmp;
        }
        // Contribution 268
        {
            Avm_DECLARE_VIEWS(268);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_63_4 - ((((((((poseidon2_T_62_7 + FF(uint256_t{ 1233442753680249567UL,
                                                                                     15490006495937952898UL,
                                                                                     7249042245074469654UL,
                                                                                     2138985910652398451UL })) *
                                                   (poseidon2_T_62_7 + FF(uint256_t{ 1233442753680249567UL,
                                                                                     15490006495937952898UL,
                                                                                     7249042245074469654UL,
                                                                                     2138985910652398451UL }))) *
                                                  (poseidon2_T_62_7 + FF(uint256_t{ 1233442753680249567UL,
                                                                                    15490006495937952898UL,
                                                                                    7249042245074469654UL,
                                                                                    2138985910652398451UL }))) *
                                                 (poseidon2_T_62_7 + FF(uint256_t{ 1233442753680249567UL,
                                                                                   15490006495937952898UL,
                                                                                   7249042245074469654UL,
                                                                                   2138985910652398451UL }))) *
                                                (poseidon2_T_62_7 + FF(uint256_t{ 1233442753680249567UL,
                                                                                  15490006495937952898UL,
                                                                                  7249042245074469654UL,
                                                                                  2138985910652398451UL }))) +
                                               (((((poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                     2230284817967990783UL,
                                                                                     5095423606777193313UL,
                                                                                     1685862792723606183UL })) *
                                                   (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                     2230284817967990783UL,
                                                                                     5095423606777193313UL,
                                                                                     1685862792723606183UL }))) *
                                                  (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                    2230284817967990783UL,
                                                                                    5095423606777193313UL,
                                                                                    1685862792723606183UL }))) *
                                                 (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                   2230284817967990783UL,
                                                                                   5095423606777193313UL,
                                                                                   1685862792723606183UL }))) *
                                                (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                  2230284817967990783UL,
                                                                                  5095423606777193313UL,
                                                                                  1685862792723606183UL })))) *
                                              FF(4)) +
                                             (((((((poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                     2230284817967990783UL,
                                                                                     5095423606777193313UL,
                                                                                     1685862792723606183UL })) *
                                                   (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                     2230284817967990783UL,
                                                                                     5095423606777193313UL,
                                                                                     1685862792723606183UL }))) *
                                                  (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                    2230284817967990783UL,
                                                                                    5095423606777193313UL,
                                                                                    1685862792723606183UL }))) *
                                                 (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                   2230284817967990783UL,
                                                                                   5095423606777193313UL,
                                                                                   1685862792723606183UL }))) *
                                                (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                  2230284817967990783UL,
                                                                                  5095423606777193313UL,
                                                                                  1685862792723606183UL }))) *
                                               FF(2)) +
                                              ((((((poseidon2_T_62_6 + FF(uint256_t{ 1717216310632203061UL,
                                                                                     17455832130858697862UL,
                                                                                     5278085098799702411UL,
                                                                                     227655898188482835UL })) *
                                                   (poseidon2_T_62_6 + FF(uint256_t{ 1717216310632203061UL,
                                                                                     17455832130858697862UL,
                                                                                     5278085098799702411UL,
                                                                                     227655898188482835UL }))) *
                                                  (poseidon2_T_62_6 + FF(uint256_t{ 1717216310632203061UL,
                                                                                    17455832130858697862UL,
                                                                                    5278085098799702411UL,
                                                                                    227655898188482835UL }))) *
                                                 (poseidon2_T_62_6 + FF(uint256_t{ 1717216310632203061UL,
                                                                                   17455832130858697862UL,
                                                                                   5278085098799702411UL,
                                                                                   227655898188482835UL }))) *
                                                (poseidon2_T_62_6 + FF(uint256_t{ 1717216310632203061UL,
                                                                                  17455832130858697862UL,
                                                                                  5278085098799702411UL,
                                                                                  227655898188482835UL }))) +
                                               (((((poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                     16689913387728553544UL,
                                                                                     2568326884589391367UL,
                                                                                     3166155980659486882UL })) *
                                                   (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                     16689913387728553544UL,
                                                                                     2568326884589391367UL,
                                                                                     3166155980659486882UL }))) *
                                                  (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                    16689913387728553544UL,
                                                                                    2568326884589391367UL,
                                                                                    3166155980659486882UL }))) *
                                                 (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                   16689913387728553544UL,
                                                                                   2568326884589391367UL,
                                                                                   3166155980659486882UL }))) *
                                                (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                  16689913387728553544UL,
                                                                                  2568326884589391367UL,
                                                                                  3166155980659486882UL }))))))));
            tmp *= scaling_factor;
            std::get<268>(evals) += tmp;
        }
        // Contribution 269
        {
            Avm_DECLARE_VIEWS(269);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_63_5 - ((((((((poseidon2_T_62_6 + FF(uint256_t{ 1717216310632203061UL,
                                                                                     17455832130858697862UL,
                                                                                     5278085098799702411UL,
                                                                                     227655898188482835UL })) *
                                                   (poseidon2_T_62_6 + FF(uint256_t{ 1717216310632203061UL,
                                                                                     17455832130858697862UL,
                                                                                     5278085098799702411UL,
                                                                                     227655898188482835UL }))) *
                                                  (poseidon2_T_62_6 + FF(uint256_t{ 1717216310632203061UL,
                                                                                    17455832130858697862UL,
                                                                                    5278085098799702411UL,
                                                                                    227655898188482835UL }))) *
                                                 (poseidon2_T_62_6 + FF(uint256_t{ 1717216310632203061UL,
                                                                                   17455832130858697862UL,
                                                                                   5278085098799702411UL,
                                                                                   227655898188482835UL }))) *
                                                (poseidon2_T_62_6 + FF(uint256_t{ 1717216310632203061UL,
                                                                                  17455832130858697862UL,
                                                                                  5278085098799702411UL,
                                                                                  227655898188482835UL }))) +
                                               (((((poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                     16689913387728553544UL,
                                                                                     2568326884589391367UL,
                                                                                     3166155980659486882UL })) *
                                                   (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                     16689913387728553544UL,
                                                                                     2568326884589391367UL,
                                                                                     3166155980659486882UL }))) *
                                                  (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                    16689913387728553544UL,
                                                                                    2568326884589391367UL,
                                                                                    3166155980659486882UL }))) *
                                                 (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                   16689913387728553544UL,
                                                                                   2568326884589391367UL,
                                                                                   3166155980659486882UL }))) *
                                                (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                  16689913387728553544UL,
                                                                                  2568326884589391367UL,
                                                                                  3166155980659486882UL })))) *
                                              FF(4)) +
                                             (((((((poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                     16689913387728553544UL,
                                                                                     2568326884589391367UL,
                                                                                     3166155980659486882UL })) *
                                                   (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                     16689913387728553544UL,
                                                                                     2568326884589391367UL,
                                                                                     3166155980659486882UL }))) *
                                                  (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                    16689913387728553544UL,
                                                                                    2568326884589391367UL,
                                                                                    3166155980659486882UL }))) *
                                                 (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                   16689913387728553544UL,
                                                                                   2568326884589391367UL,
                                                                                   3166155980659486882UL }))) *
                                                (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                  16689913387728553544UL,
                                                                                  2568326884589391367UL,
                                                                                  3166155980659486882UL }))) *
                                               FF(2)) +
                                              ((((((poseidon2_T_62_7 + FF(uint256_t{ 1233442753680249567UL,
                                                                                     15490006495937952898UL,
                                                                                     7249042245074469654UL,
                                                                                     2138985910652398451UL })) *
                                                   (poseidon2_T_62_7 + FF(uint256_t{ 1233442753680249567UL,
                                                                                     15490006495937952898UL,
                                                                                     7249042245074469654UL,
                                                                                     2138985910652398451UL }))) *
                                                  (poseidon2_T_62_7 + FF(uint256_t{ 1233442753680249567UL,
                                                                                    15490006495937952898UL,
                                                                                    7249042245074469654UL,
                                                                                    2138985910652398451UL }))) *
                                                 (poseidon2_T_62_7 + FF(uint256_t{ 1233442753680249567UL,
                                                                                   15490006495937952898UL,
                                                                                   7249042245074469654UL,
                                                                                   2138985910652398451UL }))) *
                                                (poseidon2_T_62_7 + FF(uint256_t{ 1233442753680249567UL,
                                                                                  15490006495937952898UL,
                                                                                  7249042245074469654UL,
                                                                                  2138985910652398451UL }))) +
                                               (((((poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                     2230284817967990783UL,
                                                                                     5095423606777193313UL,
                                                                                     1685862792723606183UL })) *
                                                   (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                     2230284817967990783UL,
                                                                                     5095423606777193313UL,
                                                                                     1685862792723606183UL }))) *
                                                  (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                    2230284817967990783UL,
                                                                                    5095423606777193313UL,
                                                                                    1685862792723606183UL }))) *
                                                 (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                   2230284817967990783UL,
                                                                                   5095423606777193313UL,
                                                                                   1685862792723606183UL }))) *
                                                (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                  2230284817967990783UL,
                                                                                  5095423606777193313UL,
                                                                                  1685862792723606183UL }))))))));
            tmp *= scaling_factor;
            std::get<269>(evals) += tmp;
        }
        // Contribution 270
        {
            Avm_DECLARE_VIEWS(270);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_63_6 - ((((((((poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                     2230284817967990783UL,
                                                                                     5095423606777193313UL,
                                                                                     1685862792723606183UL })) *
                                                   (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                     2230284817967990783UL,
                                                                                     5095423606777193313UL,
                                                                                     1685862792723606183UL }))) *
                                                  (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                    2230284817967990783UL,
                                                                                    5095423606777193313UL,
                                                                                    1685862792723606183UL }))) *
                                                 (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                   2230284817967990783UL,
                                                                                   5095423606777193313UL,
                                                                                   1685862792723606183UL }))) *
                                                (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                  2230284817967990783UL,
                                                                                  5095423606777193313UL,
                                                                                  1685862792723606183UL }))) *
                                               FF(2)) +
                                              ((((((poseidon2_T_62_6 + FF(uint256_t{ 1717216310632203061UL,
                                                                                     17455832130858697862UL,
                                                                                     5278085098799702411UL,
                                                                                     227655898188482835UL })) *
                                                   (poseidon2_T_62_6 + FF(uint256_t{ 1717216310632203061UL,
                                                                                     17455832130858697862UL,
                                                                                     5278085098799702411UL,
                                                                                     227655898188482835UL }))) *
                                                  (poseidon2_T_62_6 + FF(uint256_t{ 1717216310632203061UL,
                                                                                    17455832130858697862UL,
                                                                                    5278085098799702411UL,
                                                                                    227655898188482835UL }))) *
                                                 (poseidon2_T_62_6 + FF(uint256_t{ 1717216310632203061UL,
                                                                                   17455832130858697862UL,
                                                                                   5278085098799702411UL,
                                                                                   227655898188482835UL }))) *
                                                (poseidon2_T_62_6 + FF(uint256_t{ 1717216310632203061UL,
                                                                                  17455832130858697862UL,
                                                                                  5278085098799702411UL,
                                                                                  227655898188482835UL }))) +
                                               (((((poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                     16689913387728553544UL,
                                                                                     2568326884589391367UL,
                                                                                     3166155980659486882UL })) *
                                                   (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                     16689913387728553544UL,
                                                                                     2568326884589391367UL,
                                                                                     3166155980659486882UL }))) *
                                                  (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                    16689913387728553544UL,
                                                                                    2568326884589391367UL,
                                                                                    3166155980659486882UL }))) *
                                                 (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                   16689913387728553544UL,
                                                                                   2568326884589391367UL,
                                                                                   3166155980659486882UL }))) *
                                                (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                  16689913387728553544UL,
                                                                                  2568326884589391367UL,
                                                                                  3166155980659486882UL }))))) +
                                             poseidon2_T_63_5)));
            tmp *= scaling_factor;
            std::get<270>(evals) += tmp;
        }
        // Contribution 271
        {
            Avm_DECLARE_VIEWS(271);

            auto tmp = (poseidon2_sel_poseidon_perm *
                        (poseidon2_T_63_7 - ((((((((poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                     16689913387728553544UL,
                                                                                     2568326884589391367UL,
                                                                                     3166155980659486882UL })) *
                                                   (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                     16689913387728553544UL,
                                                                                     2568326884589391367UL,
                                                                                     3166155980659486882UL }))) *
                                                  (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                    16689913387728553544UL,
                                                                                    2568326884589391367UL,
                                                                                    3166155980659486882UL }))) *
                                                 (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                   16689913387728553544UL,
                                                                                   2568326884589391367UL,
                                                                                   3166155980659486882UL }))) *
                                                (poseidon2_T_62_5 + FF(uint256_t{ 17164141620747686731UL,
                                                                                  16689913387728553544UL,
                                                                                  2568326884589391367UL,
                                                                                  3166155980659486882UL }))) *
                                               FF(2)) +
                                              ((((((poseidon2_T_62_7 + FF(uint256_t{ 1233442753680249567UL,
                                                                                     15490006495937952898UL,
                                                                                     7249042245074469654UL,
                                                                                     2138985910652398451UL })) *
                                                   (poseidon2_T_62_7 + FF(uint256_t{ 1233442753680249567UL,
                                                                                     15490006495937952898UL,
                                                                                     7249042245074469654UL,
                                                                                     2138985910652398451UL }))) *
                                                  (poseidon2_T_62_7 + FF(uint256_t{ 1233442753680249567UL,
                                                                                    15490006495937952898UL,
                                                                                    7249042245074469654UL,
                                                                                    2138985910652398451UL }))) *
                                                 (poseidon2_T_62_7 + FF(uint256_t{ 1233442753680249567UL,
                                                                                   15490006495937952898UL,
                                                                                   7249042245074469654UL,
                                                                                   2138985910652398451UL }))) *
                                                (poseidon2_T_62_7 + FF(uint256_t{ 1233442753680249567UL,
                                                                                  15490006495937952898UL,
                                                                                  7249042245074469654UL,
                                                                                  2138985910652398451UL }))) +
                                               (((((poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                     2230284817967990783UL,
                                                                                     5095423606777193313UL,
                                                                                     1685862792723606183UL })) *
                                                   (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                     2230284817967990783UL,
                                                                                     5095423606777193313UL,
                                                                                     1685862792723606183UL }))) *
                                                  (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                    2230284817967990783UL,
                                                                                    5095423606777193313UL,
                                                                                    1685862792723606183UL }))) *
                                                 (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                   2230284817967990783UL,
                                                                                   5095423606777193313UL,
                                                                                   1685862792723606183UL }))) *
                                                (poseidon2_T_62_4 + FF(uint256_t{ 4115849303762846724UL,
                                                                                  2230284817967990783UL,
                                                                                  5095423606777193313UL,
                                                                                  1685862792723606183UL }))))) +
                                             poseidon2_T_63_4)));
            tmp *= scaling_factor;
            std::get<271>(evals) += tmp;
        }
        // Contribution 272
        {
            Avm_DECLARE_VIEWS(272);

            auto tmp = (poseidon2_sel_poseidon_perm * (poseidon2_a_0_shift - poseidon2_T_63_6));
            tmp *= scaling_factor;
            std::get<272>(evals) += tmp;
        }
        // Contribution 273
        {
            Avm_DECLARE_VIEWS(273);

            auto tmp = (poseidon2_sel_poseidon_perm * (poseidon2_a_1_shift - poseidon2_T_63_5));
            tmp *= scaling_factor;
            std::get<273>(evals) += tmp;
        }
        // Contribution 274
        {
            Avm_DECLARE_VIEWS(274);

            auto tmp = (poseidon2_sel_poseidon_perm * (poseidon2_a_2_shift - poseidon2_T_63_7));
            tmp *= scaling_factor;
            std::get<274>(evals) += tmp;
        }
        // Contribution 275
        {
            Avm_DECLARE_VIEWS(275);

            auto tmp = (poseidon2_sel_poseidon_perm * (poseidon2_a_3_shift - poseidon2_T_63_4));
            tmp *= scaling_factor;
            std::get<275>(evals) += tmp;
        }
    }
};

template <typename FF> using poseidon2 = Relation<poseidon2Impl<FF>>;

} // namespace bb::Avm_vm