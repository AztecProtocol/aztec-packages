
#pragma once
#include "../../relation_parameters.hpp"
#include "../../relation_types.hpp"
#include "./declare_views.hpp"

namespace proof_system::AvmMini_vm {

template <typename FF> struct Alu_chipRow {
    FF aluChip_alu_s3{};
    FF aluChip_alu_s16{};
    FF aluChip_alu_s9{};
    FF aluChip_alu_op_add{};
    FF aluChip_alu_u32{};
    FF aluChip_alu_s5{};
    FF aluChip_alu_s6{};
    FF aluChip_alu_s1{};
    FF aluChip_alu_u64{};
    FF aluChip_alu_cf{};
    FF aluChip_alu_u16{};
    FF aluChip_alu_s4{};
    FF aluChip_alu_u128{};
    FF aluChip_alu_ia{};
    FF aluChip_alu_s2{};
    FF aluChip_alu_s8{};
    FF aluChip_alu_u8{};
    FF aluChip_alu_s10{};
    FF aluChip_alu_ib{};
    FF aluChip_alu_s11{};
    FF aluChip_alu_s12{};
    FF aluChip_alu_ic{};
    FF aluChip_alu_s14{};
    FF aluChip_alu_s13{};
    FF aluChip_alu_s15{};
    FF aluChip_alu_s7{};
};

inline std::string get_relation_label_alu_chip(int index)
{
    switch (index) {}
    return std::to_string(index);
}

template <typename FF_> class alu_chipImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 15> SUBRELATION_PARTIAL_LENGTHS{
        3, 3, 3, 3, 3, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5,
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

            auto tmp = (aluChip_alu_u8 * (-aluChip_alu_u8 + FF(1)));
            tmp *= scaling_factor;
            std::get<0>(evals) += tmp;
        }
        // Contribution 1
        {
            AvmMini_DECLARE_VIEWS(1);

            auto tmp = (aluChip_alu_u16 * (-aluChip_alu_u16 + FF(1)));
            tmp *= scaling_factor;
            std::get<1>(evals) += tmp;
        }
        // Contribution 2
        {
            AvmMini_DECLARE_VIEWS(2);

            auto tmp = (aluChip_alu_u32 * (-aluChip_alu_u32 + FF(1)));
            tmp *= scaling_factor;
            std::get<2>(evals) += tmp;
        }
        // Contribution 3
        {
            AvmMini_DECLARE_VIEWS(3);

            auto tmp = (aluChip_alu_u64 * (-aluChip_alu_u64 + FF(1)));
            tmp *= scaling_factor;
            std::get<3>(evals) += tmp;
        }
        // Contribution 4
        {
            AvmMini_DECLARE_VIEWS(4);

            auto tmp = (aluChip_alu_u128 * (-aluChip_alu_u128 + FF(1)));
            tmp *= scaling_factor;
            std::get<4>(evals) += tmp;
        }
        // Contribution 5
        {
            AvmMini_DECLARE_VIEWS(5);

            auto tmp = ((aluChip_alu_u8 * aluChip_alu_op_add) *
                        (((aluChip_alu_s1 + (FF(256) * aluChip_alu_cf)) - aluChip_alu_ia) - aluChip_alu_ib));
            tmp *= scaling_factor;
            std::get<5>(evals) += tmp;
        }
        // Contribution 6
        {
            AvmMini_DECLARE_VIEWS(6);

            auto tmp = ((aluChip_alu_u8 * aluChip_alu_op_add) * (aluChip_alu_s1 - aluChip_alu_ic));
            tmp *= scaling_factor;
            std::get<6>(evals) += tmp;
        }
        // Contribution 7
        {
            AvmMini_DECLARE_VIEWS(7);

            auto tmp =
                ((aluChip_alu_u16 * aluChip_alu_op_add) *
                 ((((aluChip_alu_s1 + (FF(256) * aluChip_alu_s2)) + (FF(65536) * aluChip_alu_cf)) - aluChip_alu_ia) -
                  aluChip_alu_ib));
            tmp *= scaling_factor;
            std::get<7>(evals) += tmp;
        }
        // Contribution 8
        {
            AvmMini_DECLARE_VIEWS(8);

            auto tmp = ((aluChip_alu_u16 * aluChip_alu_op_add) *
                        ((aluChip_alu_s1 + (FF(256) * aluChip_alu_s2)) - aluChip_alu_ic));
            tmp *= scaling_factor;
            std::get<8>(evals) += tmp;
        }
        // Contribution 9
        {
            AvmMini_DECLARE_VIEWS(9);

            auto tmp = ((aluChip_alu_u32 * aluChip_alu_op_add) *
                        ((((((aluChip_alu_s1 + (FF(256) * aluChip_alu_s2)) + (FF(65536) * aluChip_alu_s3)) +
                            (FF(16777216) * aluChip_alu_s4)) +
                           (FF(4294967296UL) * aluChip_alu_cf)) -
                          aluChip_alu_ia) -
                         aluChip_alu_ib));
            tmp *= scaling_factor;
            std::get<9>(evals) += tmp;
        }
        // Contribution 10
        {
            AvmMini_DECLARE_VIEWS(10);

            auto tmp = ((aluChip_alu_u32 * aluChip_alu_op_add) *
                        ((((aluChip_alu_s1 + (FF(256) * aluChip_alu_s2)) + (FF(65536) * aluChip_alu_s3)) +
                          (FF(16777216) * aluChip_alu_s4)) -
                         aluChip_alu_ic));
            tmp *= scaling_factor;
            std::get<10>(evals) += tmp;
        }
        // Contribution 11
        {
            AvmMini_DECLARE_VIEWS(11);

            auto tmp = ((aluChip_alu_u64 * aluChip_alu_op_add) *
                        ((((((((((aluChip_alu_s1 + (FF(256) * aluChip_alu_s2)) + (FF(65536) * aluChip_alu_s3)) +
                                (FF(16777216) * aluChip_alu_s4)) +
                               (FF(4294967296UL) * aluChip_alu_s5)) +
                              (FF(1099511627776UL) * aluChip_alu_s6)) +
                             (FF(281474976710656UL) * aluChip_alu_s7)) +
                            (FF(72057594037927936UL) * aluChip_alu_s8)) +
                           (FF(uint256_t{ 0, 1, 0, 0 }) * aluChip_alu_cf)) -
                          aluChip_alu_ia) -
                         aluChip_alu_ib));
            tmp *= scaling_factor;
            std::get<11>(evals) += tmp;
        }
        // Contribution 12
        {
            AvmMini_DECLARE_VIEWS(12);

            auto tmp = ((aluChip_alu_u64 * aluChip_alu_op_add) *
                        ((((((((aluChip_alu_s1 + (FF(256) * aluChip_alu_s2)) + (FF(65536) * aluChip_alu_s3)) +
                              (FF(16777216) * aluChip_alu_s4)) +
                             (FF(4294967296UL) * aluChip_alu_s5)) +
                            (FF(1099511627776UL) * aluChip_alu_s6)) +
                           (FF(281474976710656UL) * aluChip_alu_s7)) +
                          (FF(72057594037927936UL) * aluChip_alu_s8)) -
                         aluChip_alu_ic));
            tmp *= scaling_factor;
            std::get<12>(evals) += tmp;
        }
        // Contribution 13
        {
            AvmMini_DECLARE_VIEWS(13);

            auto tmp = ((aluChip_alu_u128 * aluChip_alu_op_add) *
                        ((((((((((((((((((aluChip_alu_s1 + (FF(256) * aluChip_alu_s2)) + (FF(65536) * aluChip_alu_s3)) +
                                        (FF(16777216) * aluChip_alu_s4)) +
                                       (FF(4294967296UL) * aluChip_alu_s5)) +
                                      (FF(1099511627776UL) * aluChip_alu_s6)) +
                                     (FF(281474976710656UL) * aluChip_alu_s7)) +
                                    (FF(72057594037927936UL) * aluChip_alu_s8)) +
                                   (FF(uint256_t{ 0, 1, 0, 0 }) * aluChip_alu_s9)) +
                                  (FF(uint256_t{ 0, 256, 0, 0 }) * aluChip_alu_s10)) +
                                 (FF(uint256_t{ 0, 65536, 0, 0 }) * aluChip_alu_s11)) +
                                (FF(uint256_t{ 0, 16777216, 0, 0 }) * aluChip_alu_s12)) +
                               (FF(uint256_t{ 0, 4294967296, 0, 0 }) * aluChip_alu_s13)) +
                              (FF(uint256_t{ 0, 1099511627776, 0, 0 }) * aluChip_alu_s14)) +
                             (FF(uint256_t{ 0, 281474976710656, 0, 0 }) * aluChip_alu_s15)) +
                            (FF(uint256_t{ 0, 72057594037927936, 0, 0 }) * aluChip_alu_s16)) +
                           (FF(uint256_t{ 0, 0, 1, 0 }) * aluChip_alu_cf)) -
                          aluChip_alu_ia) -
                         aluChip_alu_ib));
            tmp *= scaling_factor;
            std::get<13>(evals) += tmp;
        }
        // Contribution 14
        {
            AvmMini_DECLARE_VIEWS(14);

            auto tmp = ((aluChip_alu_u128 * aluChip_alu_op_add) *
                        ((((((((((((((((aluChip_alu_s1 + (FF(256) * aluChip_alu_s2)) + (FF(65536) * aluChip_alu_s3)) +
                                      (FF(16777216) * aluChip_alu_s4)) +
                                     (FF(4294967296UL) * aluChip_alu_s5)) +
                                    (FF(1099511627776UL) * aluChip_alu_s6)) +
                                   (FF(281474976710656UL) * aluChip_alu_s7)) +
                                  (FF(72057594037927936UL) * aluChip_alu_s8)) +
                                 (FF(uint256_t{ 0, 1, 0, 0 }) * aluChip_alu_s9)) +
                                (FF(uint256_t{ 0, 256, 0, 0 }) * aluChip_alu_s10)) +
                               (FF(uint256_t{ 0, 65536, 0, 0 }) * aluChip_alu_s11)) +
                              (FF(uint256_t{ 0, 16777216, 0, 0 }) * aluChip_alu_s12)) +
                             (FF(uint256_t{ 0, 4294967296, 0, 0 }) * aluChip_alu_s13)) +
                            (FF(uint256_t{ 0, 1099511627776, 0, 0 }) * aluChip_alu_s14)) +
                           (FF(uint256_t{ 0, 281474976710656, 0, 0 }) * aluChip_alu_s15)) +
                          (FF(uint256_t{ 0, 72057594037927936, 0, 0 }) * aluChip_alu_s16)) -
                         aluChip_alu_ic));
            tmp *= scaling_factor;
            std::get<14>(evals) += tmp;
        }
    }
};

template <typename FF> using alu_chip = Relation<alu_chipImpl<FF>>;

} // namespace proof_system::AvmMini_vm