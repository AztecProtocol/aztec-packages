
#pragma once
#include "../../relation_parameters.hpp"
#include "../../relation_types.hpp"
#include "./declare_views.hpp"

namespace proof_system::AvmMini_vm {

template <typename FF> struct Alu_chipRow {
    FF aluChip_alu_u8_r0{};
    FF aluChip_alu_u16_r0{};
    FF aluChip_alu_u16_r2{};
    FF aluChip_alu_u16_r1{};
    FF aluChip_alu_u16_tag{};
    FF aluChip_alu_ia{};
    FF aluChip_alu_ib{};
    FF aluChip_alu_u16_r3{};
    FF aluChip_alu_u16_r5{};
    FF aluChip_alu_op_sub{};
    FF aluChip_alu_u16_r7{};
    FF aluChip_alu_u16_r6{};
    FF aluChip_alu_u32_tag{};
    FF aluChip_alu_u64_tag{};
    FF aluChip_alu_cf{};
    FF aluChip_alu_u128_tag{};
    FF aluChip_alu_u8_tag{};
    FF aluChip_alu_op_add{};
    FF aluChip_alu_ic{};
    FF aluChip_alu_u16_r4{};
};

inline std::string get_relation_label_alu_chip(int index)
{
    switch (index) {}
    return std::to_string(index);
}

template <typename FF_> class alu_chipImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 25> SUBRELATION_PARTIAL_LENGTHS{
        3, 3, 3, 3, 3, 5, 4, 5, 4, 5, 5, 5, 5, 5, 5, 5, 4, 5, 4, 5, 5, 5, 5, 5, 5,
    };

    template <typename ContainerOverSubrelations, typename AllEntities>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& new_term,
                           [[maybe_unused]] const RelationParameters<FF>&,
                           [[maybe_unused]] const FF& scaling_factor)
    {

        // Contribution 0
        {
            AvmMini_DECLARE_VIEWS(0);

            auto tmp = (aluChip_alu_u8_tag * (-aluChip_alu_u8_tag + FF(1)));
            tmp *= scaling_factor;
            std::get<0>(evals) += tmp;
        }
        // Contribution 1
        {
            AvmMini_DECLARE_VIEWS(1);

            auto tmp = (aluChip_alu_u16_tag * (-aluChip_alu_u16_tag + FF(1)));
            tmp *= scaling_factor;
            std::get<1>(evals) += tmp;
        }
        // Contribution 2
        {
            AvmMini_DECLARE_VIEWS(2);

            auto tmp = (aluChip_alu_u32_tag * (-aluChip_alu_u32_tag + FF(1)));
            tmp *= scaling_factor;
            std::get<2>(evals) += tmp;
        }
        // Contribution 3
        {
            AvmMini_DECLARE_VIEWS(3);

            auto tmp = (aluChip_alu_u64_tag * (-aluChip_alu_u64_tag + FF(1)));
            tmp *= scaling_factor;
            std::get<3>(evals) += tmp;
        }
        // Contribution 4
        {
            AvmMini_DECLARE_VIEWS(4);

            auto tmp = (aluChip_alu_u128_tag * (-aluChip_alu_u128_tag + FF(1)));
            tmp *= scaling_factor;
            std::get<4>(evals) += tmp;
        }
        // Contribution 5
        {
            AvmMini_DECLARE_VIEWS(5);

            auto tmp = ((aluChip_alu_u8_tag * aluChip_alu_op_add) *
                        (((aluChip_alu_u8_r0 + (aluChip_alu_cf * FF(256))) - aluChip_alu_ia) - aluChip_alu_ib));
            tmp *= scaling_factor;
            std::get<5>(evals) += tmp;
        }
        // Contribution 6
        {
            AvmMini_DECLARE_VIEWS(6);

            auto tmp = ((aluChip_alu_u8_tag * aluChip_alu_op_add) * (aluChip_alu_u8_r0 - aluChip_alu_ic));
            tmp *= scaling_factor;
            std::get<6>(evals) += tmp;
        }
        // Contribution 7
        {
            AvmMini_DECLARE_VIEWS(7);

            auto tmp = ((aluChip_alu_u16_tag * aluChip_alu_op_add) *
                        (((aluChip_alu_u16_r0 + (aluChip_alu_cf * FF(65536))) - aluChip_alu_ia) - aluChip_alu_ib));
            tmp *= scaling_factor;
            std::get<7>(evals) += tmp;
        }
        // Contribution 8
        {
            AvmMini_DECLARE_VIEWS(8);

            auto tmp = ((aluChip_alu_u16_tag * aluChip_alu_op_add) * (aluChip_alu_u16_r0 - aluChip_alu_ic));
            tmp *= scaling_factor;
            std::get<8>(evals) += tmp;
        }
        // Contribution 9
        {
            AvmMini_DECLARE_VIEWS(9);

            auto tmp =
                ((aluChip_alu_u32_tag * aluChip_alu_op_add) *
                 ((((aluChip_alu_u16_r0 + (aluChip_alu_u16_r1 * FF(65536))) + (aluChip_alu_cf * FF(4294967296UL))) -
                   aluChip_alu_ia) -
                  aluChip_alu_ib));
            tmp *= scaling_factor;
            std::get<9>(evals) += tmp;
        }
        // Contribution 10
        {
            AvmMini_DECLARE_VIEWS(10);

            auto tmp = ((aluChip_alu_u32_tag * aluChip_alu_op_add) *
                        ((aluChip_alu_u16_r0 + (aluChip_alu_u16_r1 * FF(65536))) - aluChip_alu_ic));
            tmp *= scaling_factor;
            std::get<10>(evals) += tmp;
        }
        // Contribution 11
        {
            AvmMini_DECLARE_VIEWS(11);

            auto tmp = ((aluChip_alu_u64_tag * aluChip_alu_op_add) *
                        ((((((aluChip_alu_u16_r0 + (aluChip_alu_u16_r1 * FF(65536))) +
                             (aluChip_alu_u16_r2 * FF(4294967296UL))) +
                            (aluChip_alu_u16_r3 * FF(281474976710656UL))) +
                           (aluChip_alu_cf * FF(uint256_t{ 0, 1, 0, 0 }))) -
                          aluChip_alu_ia) -
                         aluChip_alu_ib));
            tmp *= scaling_factor;
            std::get<11>(evals) += tmp;
        }
        // Contribution 12
        {
            AvmMini_DECLARE_VIEWS(12);

            auto tmp =
                ((aluChip_alu_u64_tag * aluChip_alu_op_add) *
                 ((((aluChip_alu_u16_r0 + (aluChip_alu_u16_r1 * FF(65536))) + (aluChip_alu_u16_r2 * FF(4294967296UL))) +
                   (aluChip_alu_u16_r3 * FF(281474976710656UL))) -
                  aluChip_alu_ic));
            tmp *= scaling_factor;
            std::get<12>(evals) += tmp;
        }
        // Contribution 13
        {
            AvmMini_DECLARE_VIEWS(13);

            auto tmp = ((aluChip_alu_u128_tag * aluChip_alu_op_add) *
                        ((((((((((aluChip_alu_u16_r0 + (aluChip_alu_u16_r1 * FF(65536))) +
                                 (aluChip_alu_u16_r2 * FF(4294967296UL))) +
                                (aluChip_alu_u16_r3 * FF(281474976710656UL))) +
                               (aluChip_alu_u16_r4 * FF(uint256_t{ 0, 1, 0, 0 }))) +
                              (aluChip_alu_u16_r5 * FF(uint256_t{ 0, 65536, 0, 0 }))) +
                             (aluChip_alu_u16_r6 * FF(uint256_t{ 0, 4294967296, 0, 0 }))) +
                            (aluChip_alu_u16_r7 * FF(uint256_t{ 0, 281474976710656, 0, 0 }))) +
                           (aluChip_alu_cf * FF(uint256_t{ 0, 0, 1, 0 }))) -
                          aluChip_alu_ia) -
                         aluChip_alu_ib));
            tmp *= scaling_factor;
            std::get<13>(evals) += tmp;
        }
        // Contribution 14
        {
            AvmMini_DECLARE_VIEWS(14);

            auto tmp = ((aluChip_alu_u128_tag * aluChip_alu_op_add) *
                        ((((((((aluChip_alu_u16_r0 + (aluChip_alu_u16_r1 * FF(65536))) +
                               (aluChip_alu_u16_r2 * FF(4294967296UL))) +
                              (aluChip_alu_u16_r3 * FF(281474976710656UL))) +
                             (aluChip_alu_u16_r4 * FF(uint256_t{ 0, 1, 0, 0 }))) +
                            (aluChip_alu_u16_r5 * FF(uint256_t{ 0, 65536, 0, 0 }))) +
                           (aluChip_alu_u16_r6 * FF(uint256_t{ 0, 4294967296, 0, 0 }))) +
                          (aluChip_alu_u16_r7 * FF(uint256_t{ 0, 281474976710656, 0, 0 }))) -
                         aluChip_alu_ic));
            tmp *= scaling_factor;
            std::get<14>(evals) += tmp;
        }
        // Contribution 15
        {
            AvmMini_DECLARE_VIEWS(15);

            auto tmp = ((aluChip_alu_u8_tag * aluChip_alu_op_sub) *
                        (((aluChip_alu_u8_r0 + (aluChip_alu_cf * FF(256))) - aluChip_alu_ic) - aluChip_alu_ib));
            tmp *= scaling_factor;
            std::get<15>(evals) += tmp;
        }
        // Contribution 16
        {
            AvmMini_DECLARE_VIEWS(16);

            auto tmp = ((aluChip_alu_u8_tag * aluChip_alu_op_sub) * (aluChip_alu_u8_r0 - aluChip_alu_ia));
            tmp *= scaling_factor;
            std::get<16>(evals) += tmp;
        }
        // Contribution 17
        {
            AvmMini_DECLARE_VIEWS(17);

            auto tmp = ((aluChip_alu_u16_tag * aluChip_alu_op_sub) *
                        (((aluChip_alu_u16_r0 + (aluChip_alu_cf * FF(65536))) - aluChip_alu_ic) - aluChip_alu_ib));
            tmp *= scaling_factor;
            std::get<17>(evals) += tmp;
        }
        // Contribution 18
        {
            AvmMini_DECLARE_VIEWS(18);

            auto tmp = ((aluChip_alu_u16_tag * aluChip_alu_op_sub) * (aluChip_alu_u16_r0 - aluChip_alu_ia));
            tmp *= scaling_factor;
            std::get<18>(evals) += tmp;
        }
        // Contribution 19
        {
            AvmMini_DECLARE_VIEWS(19);

            auto tmp =
                ((aluChip_alu_u32_tag * aluChip_alu_op_sub) *
                 ((((aluChip_alu_u16_r0 + (aluChip_alu_u16_r1 * FF(65536))) + (aluChip_alu_cf * FF(4294967296UL))) -
                   aluChip_alu_ic) -
                  aluChip_alu_ib));
            tmp *= scaling_factor;
            std::get<19>(evals) += tmp;
        }
        // Contribution 20
        {
            AvmMini_DECLARE_VIEWS(20);

            auto tmp = ((aluChip_alu_u32_tag * aluChip_alu_op_sub) *
                        ((aluChip_alu_u16_r0 + (aluChip_alu_u16_r1 * FF(65536))) - aluChip_alu_ia));
            tmp *= scaling_factor;
            std::get<20>(evals) += tmp;
        }
        // Contribution 21
        {
            AvmMini_DECLARE_VIEWS(21);

            auto tmp = ((aluChip_alu_u64_tag * aluChip_alu_op_sub) *
                        ((((((aluChip_alu_u16_r0 + (aluChip_alu_u16_r1 * FF(65536))) +
                             (aluChip_alu_u16_r2 * FF(4294967296UL))) +
                            (aluChip_alu_u16_r3 * FF(281474976710656UL))) +
                           (aluChip_alu_cf * FF(uint256_t{ 0, 1, 0, 0 }))) -
                          aluChip_alu_ic) -
                         aluChip_alu_ib));
            tmp *= scaling_factor;
            std::get<21>(evals) += tmp;
        }
        // Contribution 22
        {
            AvmMini_DECLARE_VIEWS(22);

            auto tmp =
                ((aluChip_alu_u64_tag * aluChip_alu_op_sub) *
                 ((((aluChip_alu_u16_r0 + (aluChip_alu_u16_r1 * FF(65536))) + (aluChip_alu_u16_r2 * FF(4294967296UL))) +
                   (aluChip_alu_u16_r3 * FF(281474976710656UL))) -
                  aluChip_alu_ia));
            tmp *= scaling_factor;
            std::get<22>(evals) += tmp;
        }
        // Contribution 23
        {
            AvmMini_DECLARE_VIEWS(23);

            auto tmp = ((aluChip_alu_u128_tag * aluChip_alu_op_sub) *
                        ((((((((((aluChip_alu_u16_r0 + (aluChip_alu_u16_r1 * FF(65536))) +
                                 (aluChip_alu_u16_r2 * FF(4294967296UL))) +
                                (aluChip_alu_u16_r3 * FF(281474976710656UL))) +
                               (aluChip_alu_u16_r4 * FF(uint256_t{ 0, 1, 0, 0 }))) +
                              (aluChip_alu_u16_r5 * FF(uint256_t{ 0, 65536, 0, 0 }))) +
                             (aluChip_alu_u16_r6 * FF(uint256_t{ 0, 4294967296, 0, 0 }))) +
                            (aluChip_alu_u16_r7 * FF(uint256_t{ 0, 281474976710656, 0, 0 }))) +
                           (aluChip_alu_cf * FF(uint256_t{ 0, 0, 1, 0 }))) -
                          aluChip_alu_ic) -
                         aluChip_alu_ib));
            tmp *= scaling_factor;
            std::get<23>(evals) += tmp;
        }
        // Contribution 24
        {
            AvmMini_DECLARE_VIEWS(24);

            auto tmp = ((aluChip_alu_u128_tag * aluChip_alu_op_sub) *
                        ((((((((aluChip_alu_u16_r0 + (aluChip_alu_u16_r1 * FF(65536))) +
                               (aluChip_alu_u16_r2 * FF(4294967296UL))) +
                              (aluChip_alu_u16_r3 * FF(281474976710656UL))) +
                             (aluChip_alu_u16_r4 * FF(uint256_t{ 0, 1, 0, 0 }))) +
                            (aluChip_alu_u16_r5 * FF(uint256_t{ 0, 65536, 0, 0 }))) +
                           (aluChip_alu_u16_r6 * FF(uint256_t{ 0, 4294967296, 0, 0 }))) +
                          (aluChip_alu_u16_r7 * FF(uint256_t{ 0, 281474976710656, 0, 0 }))) -
                         aluChip_alu_ia));
            tmp *= scaling_factor;
            std::get<24>(evals) += tmp;
        }
    }
};

template <typename FF> using alu_chip = Relation<alu_chipImpl<FF>>;

} // namespace proof_system::AvmMini_vm