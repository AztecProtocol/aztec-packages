#pragma once

#include "barretenberg/relations/generated/avm/declare_views.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb::Avm_vm {

template <typename FF> struct MemSliceRow {
    FF slice_addr{};
    FF slice_addr_shift{};
    FF slice_cd_offset{};
    FF slice_cd_offset_shift{};
    FF slice_cnt{};
    FF slice_cnt_shift{};
    FF slice_one_min_inv{};
    FF slice_sel_cd{};
    FF slice_sel_start_cd{};
};

inline std::string get_relation_label_mem_slice(int index)
{
    switch (index) {
    case 2:
        return "SLICE_CNT_ZERO_TEST1";
    case 3:
        return "SLICE_CNT_ZERO_TEST2";
    case 4:
        return "SLICE_CNT_DECREMENT";
    case 5:
        return "ADDR_CNT_INCREMENT";
    case 6:
        return "CD_OFFSET_INCREMENT";
    }
    return std::to_string(index);
}

template <typename FF_> class mem_sliceImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 7> SUBRELATION_PARTIAL_LENGTHS = { 3, 3, 3, 3, 3, 3, 3 };

    template <typename ContainerOverSubrelations, typename AllEntities>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& new_term,
                           [[maybe_unused]] const RelationParameters<FF>&,
                           [[maybe_unused]] const FF& scaling_factor)
    {
        // Contribution 0
        {
            Avm_DECLARE_VIEWS(0);
            auto tmp = (slice_sel_cd * (-slice_sel_cd + FF(1)));
            tmp *= scaling_factor;
            std::get<0>(evals) += tmp;
        }
        // Contribution 1
        {
            Avm_DECLARE_VIEWS(1);
            auto tmp = (slice_sel_start_cd * (-slice_sel_start_cd + FF(1)));
            tmp *= scaling_factor;
            std::get<1>(evals) += tmp;
        }
        // Contribution 2
        {
            Avm_DECLARE_VIEWS(2);
            auto tmp = ((slice_cnt * (-slice_one_min_inv + FF(1))) - slice_sel_cd);
            tmp *= scaling_factor;
            std::get<2>(evals) += tmp;
        }
        // Contribution 3
        {
            Avm_DECLARE_VIEWS(3);
            auto tmp = ((-slice_sel_cd + FF(1)) * slice_one_min_inv);
            tmp *= scaling_factor;
            std::get<3>(evals) += tmp;
        }
        // Contribution 4
        {
            Avm_DECLARE_VIEWS(4);
            auto tmp = (slice_sel_cd * ((slice_cnt - FF(1)) - slice_cnt_shift));
            tmp *= scaling_factor;
            std::get<4>(evals) += tmp;
        }
        // Contribution 5
        {
            Avm_DECLARE_VIEWS(5);
            auto tmp = (slice_sel_cd * ((slice_addr + FF(1)) - slice_addr_shift));
            tmp *= scaling_factor;
            std::get<5>(evals) += tmp;
        }
        // Contribution 6
        {
            Avm_DECLARE_VIEWS(6);
            auto tmp = (slice_sel_cd * ((slice_cd_offset + FF(1)) - slice_cd_offset_shift));
            tmp *= scaling_factor;
            std::get<6>(evals) += tmp;
        }
    }
};

template <typename FF> using mem_slice = Relation<mem_sliceImpl<FF>>;

} // namespace bb::Avm_vm