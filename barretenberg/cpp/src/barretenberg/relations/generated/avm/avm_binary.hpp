
#pragma once
#include "../../relation_parameters.hpp"
#include "../../relation_types.hpp"
#include "./declare_views.hpp"

namespace bb::Avm_vm {

template <typename FF> struct Avm_binaryRow {
    FF avm_binary_bin_sel_shift{};
    FF avm_binary_acc_ic_shift{};
    FF avm_binary_bin_ib_bytes{};
    FF avm_binary_acc_ia{};
    FF avm_main_first{};
    FF avm_binary_acc_ib_shift{};
    FF avm_binary_factor{};
    FF avm_binary_acc_ic{};
    FF avm_binary_factor_shift{};
    FF avm_binary_mem_tag_ctr_shift{};
    FF avm_binary_mem_tag_ctr{};
    FF avm_binary_latch{};
    FF avm_binary_bin_ia_bytes{};
    FF avm_binary_acc_ia_shift{};
    FF avm_binary_acc_ib{};
    FF avm_binary_bin_sel{};
    FF avm_binary_bin_ic_bytes{};
};

inline std::string get_relation_label_avm_binary(int index)
{
    switch (index) {
    case 6:
        return "ACC_REL_B";

    case 5:
        return "ACC_REL_A";

    case 7:
        return "ACC_REL_C";

    case 4:
        return "MEM_TAG_REL";

    case 3:
        return "FACTOR_REL";
    }
    return std::to_string(index);
}

template <typename FF_> class avm_binaryImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 8> SUBRELATION_PARTIAL_LENGTHS{
        3, 3, 3, 5, 4, 4, 4, 4,
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

            auto tmp = (avm_binary_bin_sel * (-avm_binary_bin_sel + FF(1)));
            tmp *= scaling_factor;
            std::get<0>(evals) += tmp;
        }
        // Contribution 1
        {
            Avm_DECLARE_VIEWS(1);

            auto tmp = (avm_binary_latch * (-avm_binary_latch + FF(1)));
            tmp *= scaling_factor;
            std::get<1>(evals) += tmp;
        }
        // Contribution 2
        {
            Avm_DECLARE_VIEWS(2);

            auto tmp = (avm_binary_latch * avm_main_first);
            tmp *= scaling_factor;
            std::get<2>(evals) += tmp;
        }
        // Contribution 3
        {
            Avm_DECLARE_VIEWS(3);

            auto tmp = (avm_binary_factor_shift - ((((-avm_binary_latch + FF(1)) * (avm_binary_factor * FF(256))) +
                                                    (avm_binary_latch + avm_main_first)) *
                                                   avm_binary_bin_sel_shift));
            tmp *= scaling_factor;
            std::get<3>(evals) += tmp;
        }
        // Contribution 4
        {
            Avm_DECLARE_VIEWS(4);

            auto tmp = (avm_binary_mem_tag_ctr_shift -
                        (((avm_binary_mem_tag_ctr + FF(1)) * (-avm_binary_latch + FF(1))) * avm_binary_bin_sel));
            tmp *= scaling_factor;
            std::get<4>(evals) += tmp;
        }
        // Contribution 5
        {
            Avm_DECLARE_VIEWS(5);

            auto tmp =
                (avm_binary_acc_ia_shift -
                 (((avm_binary_acc_ia * (-avm_binary_latch + FF(1))) + (avm_binary_bin_ia_bytes * avm_binary_factor)) *
                  avm_binary_bin_sel_shift));
            tmp *= scaling_factor;
            std::get<5>(evals) += tmp;
        }
        // Contribution 6
        {
            Avm_DECLARE_VIEWS(6);

            auto tmp =
                (avm_binary_acc_ib_shift -
                 (((avm_binary_acc_ib * (-avm_binary_latch + FF(1))) + (avm_binary_bin_ib_bytes * avm_binary_factor)) *
                  avm_binary_bin_sel_shift));
            tmp *= scaling_factor;
            std::get<6>(evals) += tmp;
        }
        // Contribution 7
        {
            Avm_DECLARE_VIEWS(7);

            auto tmp =
                (avm_binary_acc_ic_shift -
                 (((avm_binary_acc_ic * (-avm_binary_latch + FF(1))) + (avm_binary_bin_ic_bytes * avm_binary_factor)) *
                  avm_binary_bin_sel_shift));
            tmp *= scaling_factor;
            std::get<7>(evals) += tmp;
        }
    }
};

template <typename FF> using avm_binary = Relation<avm_binaryImpl<FF>>;

} // namespace bb::Avm_vm