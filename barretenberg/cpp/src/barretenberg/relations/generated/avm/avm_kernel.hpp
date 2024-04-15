
#pragma once
#include "../../relation_parameters.hpp"
#include "../../relation_types.hpp"
#include "./declare_views.hpp"

namespace bb::Avm_vm {

template <typename FF> struct Avm_kernelRow {
    FF avm_kernel_kernel_sel{};
    FF avm_main_sel_op_address{};
    FF avm_main_sel_op_fee_per_da_gas{};
    FF avm_main_sel_op_fee_per_l1_gas{};
    FF avm_main_sel_op_fee_per_l2_gas{};
    FF avm_main_sel_op_function_selector{};
    FF avm_main_sel_op_portal{};
    FF avm_main_sel_op_sender{};
};

inline std::string get_relation_label_avm_kernel(int index)
{
    switch (index) {
    case 0:
        return "SENDER_KERNEL";

    case 1:
        return "ADDRESS_KERNEL";

    case 2:
        return "PORTAL_KERNEL";

    case 3:
        return "FUNCTION_KERNEL";

    case 4:
        return "FEE_DA_GAS_KERNEL";

    case 5:
        return "FEE_L1_GAS_KERNEL";

    case 6:
        return "FEE_L2_GAS_KERNEL";
    }
    return std::to_string(index);
}

template <typename FF_> class avm_kernelImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 7> SUBRELATION_PARTIAL_LENGTHS{
        3, 3, 3, 3, 3, 3, 3,
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

            auto tmp = (avm_main_sel_op_sender * (avm_kernel_kernel_sel - FF(0)));
            tmp *= scaling_factor;
            std::get<0>(evals) += tmp;
        }
        // Contribution 1
        {
            Avm_DECLARE_VIEWS(1);

            auto tmp = (avm_main_sel_op_address * (avm_kernel_kernel_sel - FF(1)));
            tmp *= scaling_factor;
            std::get<1>(evals) += tmp;
        }
        // Contribution 2
        {
            Avm_DECLARE_VIEWS(2);

            auto tmp = (avm_main_sel_op_portal * (avm_kernel_kernel_sel - FF(2)));
            tmp *= scaling_factor;
            std::get<2>(evals) += tmp;
        }
        // Contribution 3
        {
            Avm_DECLARE_VIEWS(3);

            auto tmp = (avm_main_sel_op_function_selector * (avm_kernel_kernel_sel - FF(3)));
            tmp *= scaling_factor;
            std::get<3>(evals) += tmp;
        }
        // Contribution 4
        {
            Avm_DECLARE_VIEWS(4);

            auto tmp = (avm_main_sel_op_fee_per_da_gas * (avm_kernel_kernel_sel - FF(9)));
            tmp *= scaling_factor;
            std::get<4>(evals) += tmp;
        }
        // Contribution 5
        {
            Avm_DECLARE_VIEWS(5);

            auto tmp = (avm_main_sel_op_fee_per_l1_gas * (avm_kernel_kernel_sel - FF(11)));
            tmp *= scaling_factor;
            std::get<5>(evals) += tmp;
        }
        // Contribution 6
        {
            Avm_DECLARE_VIEWS(6);

            auto tmp = (avm_main_sel_op_fee_per_l2_gas * (avm_kernel_kernel_sel - FF(13)));
            tmp *= scaling_factor;
            std::get<6>(evals) += tmp;
        }
    }
};

template <typename FF> using avm_kernel = Relation<avm_kernelImpl<FF>>;

} // namespace bb::Avm_vm