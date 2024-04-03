
#pragma once
#include "../../relation_parameters.hpp"
#include "../../relation_types.hpp"
#include "./declare_views.hpp"

namespace bb::Avm_vm {

template <typename FF> struct Avm_cmpRow {
    FF avm_cmp_a_hi{};
    FF avm_cmp_a_lo{};
    FF avm_cmp_b_hi{};
    FF avm_cmp_b_lo{};
    FF avm_cmp_borrow{};
    FF avm_cmp_cmp_sel{};
    FF avm_cmp_ia{};
    FF avm_cmp_ib{};
    FF avm_cmp_ic{};
    FF avm_cmp_input_ia{};
    FF avm_cmp_input_ib{};
    FF avm_cmp_lt_query{};
    FF avm_cmp_lt_sel{};
    FF avm_cmp_lte_sel{};
    FF avm_cmp_p_a_borrow{};
    FF avm_cmp_p_b_borrow{};
    FF avm_cmp_p_hi{};
    FF avm_cmp_p_lo{};
    FF avm_cmp_p_sub_a_hi{};
    FF avm_cmp_p_sub_a_lo{};
    FF avm_cmp_p_sub_b_hi{};
    FF avm_cmp_p_sub_b_lo{};
    FF avm_cmp_res_hi{};
    FF avm_cmp_res_lo{};
};

inline std::string get_relation_label_avm_cmp(int index)
{
    switch (index) {}
    return std::to_string(index);
}

template <typename FF_> class avm_cmpImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 16> SUBRELATION_PARTIAL_LENGTHS{
        3, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 3, 2, 3, 4, 3,
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

            auto tmp = (avm_cmp_ic * (-avm_cmp_ic + FF(1)));
            tmp *= scaling_factor;
            std::get<0>(evals) += tmp;
        }
        // Contribution 1
        {
            Avm_DECLARE_VIEWS(1);

            auto tmp = (avm_cmp_cmp_sel - (avm_cmp_lt_sel + avm_cmp_lte_sel));
            tmp *= scaling_factor;
            std::get<1>(evals) += tmp;
        }
        // Contribution 2
        {
            Avm_DECLARE_VIEWS(2);

            auto tmp = (avm_cmp_lt_sel * (-avm_cmp_lt_sel + FF(1)));
            tmp *= scaling_factor;
            std::get<2>(evals) += tmp;
        }
        // Contribution 3
        {
            Avm_DECLARE_VIEWS(3);

            auto tmp = (avm_cmp_lte_sel * (-avm_cmp_lte_sel + FF(1)));
            tmp *= scaling_factor;
            std::get<3>(evals) += tmp;
        }
        // Contribution 4
        {
            Avm_DECLARE_VIEWS(4);

            auto tmp = (avm_cmp_lt_sel * avm_cmp_lte_sel);
            tmp *= scaling_factor;
            std::get<4>(evals) += tmp;
        }
        // Contribution 5
        {
            Avm_DECLARE_VIEWS(5);

            auto tmp = (avm_cmp_input_ia - ((avm_cmp_lt_sel * avm_cmp_ib) + (avm_cmp_lte_sel * avm_cmp_ia)));
            tmp *= scaling_factor;
            std::get<5>(evals) += tmp;
        }
        // Contribution 6
        {
            Avm_DECLARE_VIEWS(6);

            auto tmp = (avm_cmp_input_ib - ((avm_cmp_lt_sel * avm_cmp_ia) + (avm_cmp_lte_sel * avm_cmp_ib)));
            tmp *= scaling_factor;
            std::get<6>(evals) += tmp;
        }
        // Contribution 7
        {
            Avm_DECLARE_VIEWS(7);

            auto tmp = (avm_cmp_input_ia - (avm_cmp_a_lo + (avm_cmp_a_hi * FF(uint256_t{ 0, 0, 1, 0 }))));
            tmp *= scaling_factor;
            std::get<7>(evals) += tmp;
        }
        // Contribution 8
        {
            Avm_DECLARE_VIEWS(8);

            auto tmp = (avm_cmp_input_ib - (avm_cmp_b_lo + (avm_cmp_b_hi * FF(uint256_t{ 0, 0, 1, 0 }))));
            tmp *= scaling_factor;
            std::get<8>(evals) += tmp;
        }
        // Contribution 9
        {
            Avm_DECLARE_VIEWS(9);

            auto tmp = (avm_cmp_p_sub_a_lo -
                        ((avm_cmp_p_lo - avm_cmp_a_lo) + (avm_cmp_p_a_borrow * FF(uint256_t{ 0, 0, 1, 0 }))));
            tmp *= scaling_factor;
            std::get<9>(evals) += tmp;
        }
        // Contribution 10
        {
            Avm_DECLARE_VIEWS(10);

            auto tmp = (avm_cmp_p_sub_a_hi - ((avm_cmp_p_hi - avm_cmp_a_hi) - avm_cmp_p_a_borrow));
            tmp *= scaling_factor;
            std::get<10>(evals) += tmp;
        }
        // Contribution 11
        {
            Avm_DECLARE_VIEWS(11);

            auto tmp = (avm_cmp_p_sub_b_lo -
                        ((avm_cmp_p_lo - avm_cmp_b_lo) + (avm_cmp_p_b_borrow * FF(uint256_t{ 0, 0, 1, 0 }))));
            tmp *= scaling_factor;
            std::get<11>(evals) += tmp;
        }
        // Contribution 12
        {
            Avm_DECLARE_VIEWS(12);

            auto tmp = (avm_cmp_p_sub_b_hi - ((avm_cmp_p_hi - avm_cmp_b_hi) - avm_cmp_p_b_borrow));
            tmp *= scaling_factor;
            std::get<12>(evals) += tmp;
        }
        // Contribution 13
        {
            Avm_DECLARE_VIEWS(13);

            auto tmp = (avm_cmp_lt_query - ((avm_cmp_lt_sel * avm_cmp_ic) + ((-avm_cmp_ic + FF(1)) * avm_cmp_lte_sel)));
            tmp *= scaling_factor;
            std::get<13>(evals) += tmp;
        }
        // Contribution 14
        {
            Avm_DECLARE_VIEWS(14);

            auto tmp = (avm_cmp_res_lo -
                        (((((avm_cmp_a_lo - avm_cmp_b_lo) - FF(1)) + (avm_cmp_borrow * FF(uint256_t{ 0, 0, 1, 0 }))) *
                          avm_cmp_lt_query) +
                         (((avm_cmp_b_lo - avm_cmp_a_lo) + (avm_cmp_borrow * FF(uint256_t{ 0, 0, 1, 0 }))) *
                          (-avm_cmp_lt_query + FF(1)))));
            tmp *= scaling_factor;
            std::get<14>(evals) += tmp;
        }
        // Contribution 15
        {
            Avm_DECLARE_VIEWS(15);

            auto tmp =
                (avm_cmp_res_hi - ((((avm_cmp_a_hi - avm_cmp_b_hi) - avm_cmp_borrow) * avm_cmp_lt_query) +
                                   (((avm_cmp_b_hi - avm_cmp_a_hi) - avm_cmp_borrow) * (-avm_cmp_lt_query + FF(1)))));
            tmp *= scaling_factor;
            std::get<15>(evals) += tmp;
        }
    }
};

template <typename FF> using avm_cmp = Relation<avm_cmpImpl<FF>>;

} // namespace bb::Avm_vm