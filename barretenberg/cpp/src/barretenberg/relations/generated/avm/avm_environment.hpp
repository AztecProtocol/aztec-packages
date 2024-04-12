
#pragma once
#include "../../relation_parameters.hpp"
#include "../../relation_types.hpp"
#include "./declare_views.hpp"

namespace bb::Avm_vm {

template <typename FF> struct Avm_environmentRow {
    FF avm_environment_environment_selector{};
    FF avm_environment_q_environment_lookup{};
    FF avm_main_sel_op_address{};
    FF avm_main_sel_op_sender{};
};

inline std::string get_relation_label_avm_environment(int index)
{
    switch (index) {
    case 0:
        return "SENDER_ENVIRONMENT";

    case 1:
        return "ADDRESS_ENVIRONMENT";
    }
    return std::to_string(index);
}

template <typename FF_> class avm_environmentImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        4,
        4,
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

            auto tmp = ((avm_environment_q_environment_lookup * avm_main_sel_op_sender) *
                        avm_environment_environment_selector);
            tmp *= scaling_factor;
            std::get<0>(evals) += tmp;
        }
        // Contribution 1
        {
            Avm_DECLARE_VIEWS(1);

            auto tmp = ((avm_environment_q_environment_lookup * avm_main_sel_op_address) *
                        (avm_environment_environment_selector - FF(1)));
            tmp *= scaling_factor;
            std::get<1>(evals) += tmp;
        }
    }
};

template <typename FF> using avm_environment = Relation<avm_environmentImpl<FF>>;

} // namespace bb::Avm_vm