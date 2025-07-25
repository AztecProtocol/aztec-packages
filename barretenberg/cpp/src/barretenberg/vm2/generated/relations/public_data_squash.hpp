// AUTOGENERATED FILE
#pragma once

#include <string_view>

#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2 {

template <typename FF_> class public_data_squashImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 9> SUBRELATION_PARTIAL_LENGTHS = { 3, 4, 3, 3, 5, 4, 3, 3, 3 };

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        using C = ColumnAndShifts;

        return (in.get(C::public_data_squash_sel)).is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           [[maybe_unused]] const RelationParameters<FF>&,
                           [[maybe_unused]] const FF& scaling_factor)
    {
        using C = ColumnAndShifts;

        const auto public_data_squash_END =
            in.get(C::public_data_squash_sel) * (FF(1) - in.get(C::public_data_squash_sel_shift));
        const auto public_data_squash_NOT_END =
            in.get(C::public_data_squash_sel) * in.get(C::public_data_squash_sel_shift);

        {
            using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
            auto tmp = in.get(C::public_data_squash_sel) * (FF(1) - in.get(C::public_data_squash_sel));
            tmp *= scaling_factor;
            std::get<0>(evals) += typename Accumulator::View(tmp);
        }
        { // START_CONDITION
            using Accumulator = typename std::tuple_element_t<1, ContainerOverSubrelations>;
            auto tmp = in.get(C::public_data_squash_sel_shift) * (FF(1) - in.get(C::public_data_squash_sel)) *
                       (FF(1) - in.get(C::precomputed_first_row));
            tmp *= scaling_factor;
            std::get<1>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<2, ContainerOverSubrelations>;
            auto tmp = in.get(C::public_data_squash_write_to_public_inputs) *
                       (FF(1) - in.get(C::public_data_squash_write_to_public_inputs));
            tmp *= scaling_factor;
            std::get<2>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<3, ContainerOverSubrelations>;
            auto tmp = in.get(C::public_data_squash_leaf_slot_increase) *
                       (FF(1) - in.get(C::public_data_squash_leaf_slot_increase));
            tmp *= scaling_factor;
            std::get<3>(evals) += typename Accumulator::View(tmp);
        }
        { // CHECK_SAME_LEAF_SLOT
            using Accumulator = typename std::tuple_element_t<4, ContainerOverSubrelations>;
            auto tmp = public_data_squash_NOT_END * (FF(1) - in.get(C::public_data_squash_leaf_slot_increase)) *
                       (in.get(C::public_data_squash_leaf_slot) - in.get(C::public_data_squash_leaf_slot_shift));
            tmp *= scaling_factor;
            std::get<4>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<5, ContainerOverSubrelations>;
            auto tmp = (in.get(C::public_data_squash_check_clock) -
                        public_data_squash_NOT_END * (FF(1) - in.get(C::public_data_squash_leaf_slot_increase)));
            tmp *= scaling_factor;
            std::get<5>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<6, ContainerOverSubrelations>;
            auto tmp = (in.get(C::public_data_squash_clk_diff) -
                        in.get(C::public_data_squash_check_clock) *
                            (in.get(C::public_data_squash_clk_shift) - in.get(C::public_data_squash_clk)));
            tmp *= scaling_factor;
            std::get<6>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<7, ContainerOverSubrelations>;
            auto tmp = in.get(C::public_data_squash_sel) * (FF(32) - in.get(C::public_data_squash_constant_32));
            tmp *= scaling_factor;
            std::get<7>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<8, ContainerOverSubrelations>;
            auto tmp = (in.get(C::public_data_squash_write_to_public_inputs) -
                        (in.get(C::public_data_squash_leaf_slot_increase) + public_data_squash_END));
            tmp *= scaling_factor;
            std::get<8>(evals) += typename Accumulator::View(tmp);
        }
    }
};

template <typename FF> class public_data_squash : public Relation<public_data_squashImpl<FF>> {
  public:
    static constexpr const std::string_view NAME = "public_data_squash";

    static std::string get_subrelation_label(size_t index)
    {
        switch (index) {
        case 1:
            return "START_CONDITION";
        case 4:
            return "CHECK_SAME_LEAF_SLOT";
        }
        return std::to_string(index);
    }

    // Subrelation indices constants, to be used in tests.
    static constexpr size_t SR_START_CONDITION = 1;
    static constexpr size_t SR_CHECK_SAME_LEAF_SLOT = 4;
};

} // namespace bb::avm2
