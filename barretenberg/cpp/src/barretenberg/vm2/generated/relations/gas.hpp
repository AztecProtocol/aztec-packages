// AUTOGENERATED FILE
#pragma once

#include <string_view>

#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2 {

template <typename FF_> class gasImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 7> SUBRELATION_PARTIAL_LENGTHS = { 3, 3, 3, 5, 5, 3, 3 };

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        using C = ColumnAndShifts;

        return (in.get(C::execution_sel_should_check_gas)).is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           [[maybe_unused]] const RelationParameters<FF>&,
                           [[maybe_unused]] const FF& scaling_factor)
    {
        using C = ColumnAndShifts;

        const auto execution_BASE_L2_GAS = in.get(C::execution_opcode_gas) + in.get(C::execution_addressing_gas);
        const auto execution_DYNAMIC_L2_GAS_USED =
            in.get(C::execution_dynamic_l2_gas) * in.get(C::execution_dynamic_l2_gas_factor);
        const auto execution_DYNAMIC_DA_GAS_USED =
            in.get(C::execution_dynamic_da_gas) * in.get(C::execution_dynamic_da_gas_factor);
        const auto execution_TOTAL_L2_GAS_USED = execution_BASE_L2_GAS + execution_DYNAMIC_L2_GAS_USED;
        const auto execution_TOTAL_DA_GAS_USED = in.get(C::execution_base_da_gas) + execution_DYNAMIC_DA_GAS_USED;
        const auto execution_PREV_GAS_PLUS_USAGE_L2 =
            in.get(C::execution_prev_l2_gas_used) + execution_TOTAL_L2_GAS_USED;
        const auto execution_LIMIT_GTE_USED_L2 = (in.get(C::execution_l2_gas_limit) - execution_PREV_GAS_PLUS_USAGE_L2);
        const auto execution_LIMIT_LT_USED_L2 =
            ((execution_PREV_GAS_PLUS_USAGE_L2 - in.get(C::execution_l2_gas_limit)) - FF(1));
        const auto execution_PREV_GAS_PLUS_USAGE_DA =
            in.get(C::execution_prev_da_gas_used) + execution_TOTAL_DA_GAS_USED;
        const auto execution_LIMIT_GTE_USED_DA = (in.get(C::execution_da_gas_limit) - execution_PREV_GAS_PLUS_USAGE_DA);
        const auto execution_LIMIT_LT_USED_DA =
            ((execution_PREV_GAS_PLUS_USAGE_DA - in.get(C::execution_da_gas_limit)) - FF(1));

        {
            using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
            auto tmp = in.get(C::execution_sel_should_check_gas) * (FF(64) - in.get(C::execution_constant_64));
            tmp *= scaling_factor;
            std::get<0>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<1, ContainerOverSubrelations>;
            auto tmp = in.get(C::execution_out_of_gas_l2) * (FF(1) - in.get(C::execution_out_of_gas_l2));
            tmp *= scaling_factor;
            std::get<1>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<2, ContainerOverSubrelations>;
            auto tmp = in.get(C::execution_out_of_gas_da) * (FF(1) - in.get(C::execution_out_of_gas_da));
            tmp *= scaling_factor;
            std::get<2>(evals) += typename Accumulator::View(tmp);
        }
        { // L2_CMP_DIFF
            using Accumulator = typename std::tuple_element_t<3, ContainerOverSubrelations>;
            auto tmp =
                (in.get(C::execution_limit_used_l2_cmp_diff) -
                 in.get(C::execution_sel_should_check_gas) *
                     ((execution_LIMIT_LT_USED_L2 - execution_LIMIT_GTE_USED_L2) * in.get(C::execution_out_of_gas_l2) +
                      execution_LIMIT_GTE_USED_L2));
            tmp *= scaling_factor;
            std::get<3>(evals) += typename Accumulator::View(tmp);
        }
        { // DA_CMP_DIFF
            using Accumulator = typename std::tuple_element_t<4, ContainerOverSubrelations>;
            auto tmp =
                (in.get(C::execution_limit_used_da_cmp_diff) -
                 in.get(C::execution_sel_should_check_gas) *
                     ((execution_LIMIT_LT_USED_DA - execution_LIMIT_GTE_USED_DA) * in.get(C::execution_out_of_gas_da) +
                      execution_LIMIT_GTE_USED_DA));
            tmp *= scaling_factor;
            std::get<4>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<5, ContainerOverSubrelations>;
            auto tmp =
                (in.get(C::execution_sel_out_of_gas) -
                 (FF(1) - (FF(1) - in.get(C::execution_out_of_gas_l2)) * (FF(1) - in.get(C::execution_out_of_gas_da))));
            tmp *= scaling_factor;
            std::get<5>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<6, ContainerOverSubrelations>;
            auto tmp = (FF(1) - in.get(C::execution_sel_should_check_gas)) * in.get(C::execution_sel_out_of_gas);
            tmp *= scaling_factor;
            std::get<6>(evals) += typename Accumulator::View(tmp);
        }
    }
};

template <typename FF> class gas : public Relation<gasImpl<FF>> {
  public:
    static constexpr const std::string_view NAME = "gas";

    static std::string get_subrelation_label(size_t index)
    {
        switch (index) {
        case 3:
            return "L2_CMP_DIFF";
        case 4:
            return "DA_CMP_DIFF";
        }
        return std::to_string(index);
    }

    // Subrelation indices constants, to be used in tests.
    static constexpr size_t SR_L2_CMP_DIFF = 3;
    static constexpr size_t SR_DA_CMP_DIFF = 4;
};

} // namespace bb::avm2
