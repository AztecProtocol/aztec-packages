// AUTOGENERATED FILE
#pragma once

#include <string_view>

#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2 {

template <typename FF_> class txImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 38> SUBRELATION_PARTIAL_LENGTHS = { 3, 3, 3, 3, 4, 7, 6, 3, 5, 6, 4, 6, 6,
                                                                            3, 2, 4, 3, 3, 3, 4, 3, 3, 4, 2, 4, 4,
                                                                            4, 3, 3, 3, 3, 2, 4, 4, 4, 4, 4, 4 };

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        using C = ColumnAndShifts;

        return (in.get(C::tx_sel)).is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           [[maybe_unused]] const RelationParameters<FF>&,
                           [[maybe_unused]] const FF& scaling_factor)
    {
        using C = ColumnAndShifts;

        const auto constants_FEE_JUICE_ADDRESS = FF(5);
        const auto constants_FEE_JUICE_BALANCES_SLOT = FF(1);
        const auto constants_AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX = FF(18);
        const auto constants_AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX = FF(369);
        const auto tx_NOT_LAST = in.get(C::tx_sel_shift) * in.get(C::tx_sel);
        const auto tx_NOT_PHASE_END = tx_NOT_LAST * (FF(1) - in.get(C::tx_end_phase));
        const auto tx_REM_COUNT_MINUS_1 = (in.get(C::tx_remaining_phase_counter) - FF(1));

        {
            using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_sel) * (FF(1) - in.get(C::tx_sel));
            tmp *= scaling_factor;
            std::get<0>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<1, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_is_padded) * (FF(1) - in.get(C::tx_is_padded));
            tmp *= scaling_factor;
            std::get<1>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<2, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_start_phase) * (FF(1) - in.get(C::tx_start_phase));
            tmp *= scaling_factor;
            std::get<2>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<3, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_end_phase) * (FF(1) - in.get(C::tx_end_phase));
            tmp *= scaling_factor;
            std::get<3>(evals) += typename Accumulator::View(tmp);
        }
        { // START_FOLLOWS_END
            using Accumulator = typename std::tuple_element_t<4, ContainerOverSubrelations>;
            auto tmp = tx_NOT_LAST *
                       (in.get(C::tx_start_phase_shift) - (in.get(C::tx_end_phase) + in.get(C::precomputed_first_row)));
            tmp *= scaling_factor;
            std::get<4>(evals) += typename Accumulator::View(tmp);
        }
        { // PHASE_VALUE_CONTINUITY
            using Accumulator = typename std::tuple_element_t<5, ContainerOverSubrelations>;
            auto tmp = tx_NOT_PHASE_END * (FF(1) - in.get(C::tx_reverted)) *
                       (FF(1) - in.get(C::precomputed_first_row)) *
                       (in.get(C::tx_phase_value_shift) - in.get(C::tx_phase_value));
            tmp *= scaling_factor;
            std::get<5>(evals) += typename Accumulator::View(tmp);
        }
        { // INCR_PHASE_VALUE_ON_END
            using Accumulator = typename std::tuple_element_t<6, ContainerOverSubrelations>;
            auto tmp = tx_NOT_LAST * (FF(1) - in.get(C::tx_reverted)) * in.get(C::tx_end_phase) *
                       (in.get(C::tx_phase_value_shift) - (in.get(C::tx_phase_value) + FF(1)));
            tmp *= scaling_factor;
            std::get<6>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<7, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_reverted) * (FF(1) - in.get(C::tx_is_revertible));
            tmp *= scaling_factor;
            std::get<7>(evals) += typename Accumulator::View(tmp);
        }
        { // REM_COUNT_IS_ZERO
            using Accumulator = typename std::tuple_element_t<8, ContainerOverSubrelations>;
            auto tmp =
                in.get(C::tx_sel) * ((in.get(C::tx_remaining_phase_counter) *
                                          (in.get(C::tx_is_padded) * (FF(1) - in.get(C::tx_remaining_phase_inv)) +
                                           in.get(C::tx_remaining_phase_inv)) -
                                      FF(1)) +
                                     in.get(C::tx_is_padded));
            tmp *= scaling_factor;
            std::get<8>(evals) += typename Accumulator::View(tmp);
        }
        { // REM_COUNT_IS_ONE
            using Accumulator = typename std::tuple_element_t<9, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_sel) * (FF(1) - in.get(C::tx_is_padded)) *
                       ((tx_REM_COUNT_MINUS_1 *
                             (in.get(C::tx_end_phase) * (FF(1) - in.get(C::tx_remaining_phase_minus_one_inv)) +
                              in.get(C::tx_remaining_phase_minus_one_inv)) -
                         FF(1)) +
                        in.get(C::tx_end_phase));
            tmp *= scaling_factor;
            std::get<9>(evals) += typename Accumulator::View(tmp);
        }
        { // READ_PI_LENGTH_SEL
            using Accumulator = typename std::tuple_element_t<10, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_sel) * (in.get(C::tx_sel_read_phase_length) -
                                            in.get(C::tx_start_phase) * (FF(1) - in.get(C::tx_is_collect_fee)));
            tmp *= scaling_factor;
            std::get<10>(evals) += typename Accumulator::View(tmp);
        }
        { // DECR_REM_PHASE_EVENTS
            using Accumulator = typename std::tuple_element_t<11, ContainerOverSubrelations>;
            auto tmp = (FF(1) - in.get(C::precomputed_first_row)) * tx_NOT_PHASE_END *
                       (in.get(C::tx_remaining_phase_counter_shift) - (in.get(C::tx_remaining_phase_counter) - FF(1)));
            tmp *= scaling_factor;
            std::get<11>(evals) += typename Accumulator::View(tmp);
        }
        { // INCR_READ_PI_OFFSET
            using Accumulator = typename std::tuple_element_t<12, ContainerOverSubrelations>;
            auto tmp = (FF(1) - in.get(C::precomputed_first_row)) * tx_NOT_PHASE_END *
                       (in.get(C::tx_read_pi_offset_shift) - (in.get(C::tx_read_pi_offset) + FF(1)));
            tmp *= scaling_factor;
            std::get<12>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<13, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_is_teardown_phase) * (FF(1) - in.get(C::tx_is_teardown_phase));
            tmp *= scaling_factor;
            std::get<13>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<14, ContainerOverSubrelations>;
            auto tmp =
                (in.get(C::tx_is_tree_insert_phase) -
                 (in.get(C::tx_sel_revertible_append_note_hash) + in.get(C::tx_sel_non_revertible_append_note_hash) +
                  in.get(C::tx_sel_revertible_append_nullifier) + in.get(C::tx_sel_non_revertible_append_nullifier)));
            tmp *= scaling_factor;
            std::get<14>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<15, ContainerOverSubrelations>;
            auto tmp =
                (in.get(C::tx_should_note_hash_append) - in.get(C::tx_sel) * (FF(1) - in.get(C::tx_is_padded)) *
                                                             (in.get(C::tx_sel_revertible_append_note_hash) +
                                                              in.get(C::tx_sel_non_revertible_append_note_hash)));
            tmp *= scaling_factor;
            std::get<15>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<16, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_should_note_hash_append) *
                       ((in.get(C::tx_prev_note_hash_tree_size) + FF(1)) - in.get(C::tx_next_note_hash_tree_size));
            tmp *= scaling_factor;
            std::get<16>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<17, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_should_note_hash_append) * ((in.get(C::tx_prev_num_note_hashes_emitted) + FF(1)) -
                                                                in.get(C::tx_next_num_note_hashes_emitted));
            tmp *= scaling_factor;
            std::get<17>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<18, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_should_note_hash_append) * in.get(C::tx_reverted);
            tmp *= scaling_factor;
            std::get<18>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<19, ContainerOverSubrelations>;
            auto tmp =
                (in.get(C::tx_should_nullifier_append) - in.get(C::tx_sel) * (FF(1) - in.get(C::tx_is_padded)) *
                                                             (in.get(C::tx_sel_revertible_append_nullifier) +
                                                              in.get(C::tx_sel_non_revertible_append_nullifier)));
            tmp *= scaling_factor;
            std::get<19>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<20, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_should_nullifier_append) *
                       (((in.get(C::tx_prev_nullifier_tree_size) + FF(1)) - in.get(C::tx_reverted)) -
                        in.get(C::tx_next_nullifier_tree_size));
            tmp *= scaling_factor;
            std::get<20>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<21, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_should_nullifier_append) *
                       (((in.get(C::tx_prev_num_nullifiers_emitted) + FF(1)) - in.get(C::tx_reverted)) -
                        in.get(C::tx_next_num_nullifiers_emitted));
            tmp *= scaling_factor;
            std::get<21>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<22, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_sel) * (((FF(1) - in.get(C::tx_reverted)) - in.get(C::tx_is_padded)) *
                                                in.get(C::tx_is_l2_l1_msg_phase) -
                                            in.get(C::tx_successful_msg_emit));
            tmp *= scaling_factor;
            std::get<22>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<23, ContainerOverSubrelations>;
            auto tmp = (in.get(C::tx_fee_payer_pi_offset) -
                        in.get(C::tx_is_collect_fee) * constants_AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX);
            tmp *= scaling_factor;
            std::get<23>(evals) += typename Accumulator::View(tmp);
        }
        { // COMPUTE_FEE
            using Accumulator = typename std::tuple_element_t<24, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_is_collect_fee) *
                       ((in.get(C::tx_effective_fee_per_da_gas) * in.get(C::tx_prev_da_gas_used) +
                         in.get(C::tx_effective_fee_per_l2_gas) * in.get(C::tx_prev_l2_gas_used)) -
                        in.get(C::tx_fee));
            tmp *= scaling_factor;
            std::get<24>(evals) += typename Accumulator::View(tmp);
        }
        { // TEARDOWN_GETS_FEE
            using Accumulator = typename std::tuple_element_t<25, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_is_teardown_phase) * (FF(1) - in.get(C::tx_is_padded)) *
                       (in.get(C::tx_fee_shift) - in.get(C::tx_fee));
            tmp *= scaling_factor;
            std::get<25>(evals) += typename Accumulator::View(tmp);
        }
        { // FEE_ZERO_UNLESS_COLLECT_FEE_OR_TEARDOWN
            using Accumulator = typename std::tuple_element_t<26, ContainerOverSubrelations>;
            auto tmp =
                (FF(1) - in.get(C::tx_is_collect_fee)) * (FF(1) - in.get(C::tx_is_teardown_phase)) * in.get(C::tx_fee);
            tmp *= scaling_factor;
            std::get<26>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<27, ContainerOverSubrelations>;
            auto tmp =
                in.get(C::tx_is_collect_fee) * (constants_FEE_JUICE_ADDRESS - in.get(C::tx_fee_juice_contract_address));
            tmp *= scaling_factor;
            std::get<27>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<28, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_is_collect_fee) *
                       (constants_FEE_JUICE_BALANCES_SLOT - in.get(C::tx_fee_juice_balances_slot));
            tmp *= scaling_factor;
            std::get<28>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<29, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_is_collect_fee) *
                       ((in.get(C::tx_fee_payer_balance) - in.get(C::tx_fee)) - in.get(C::tx_fee_payer_new_balance));
            tmp *= scaling_factor;
            std::get<29>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<30, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_is_collect_fee) * (in.get(C::tx_uint32_max) - FF(4294967295UL));
            tmp *= scaling_factor;
            std::get<30>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<31, ContainerOverSubrelations>;
            auto tmp = (in.get(C::tx_end_gas_used_pi_offset) -
                        in.get(C::tx_is_collect_fee) * constants_AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX);
            tmp *= scaling_factor;
            std::get<31>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<32, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_is_public_call_request) *
                       (((FF(0) - in.get(C::tx_prev_l2_gas_used)) * in.get(C::tx_is_teardown_phase) +
                         in.get(C::tx_prev_l2_gas_used)) -
                        in.get(C::tx_prev_l2_gas_used_sent_to_enqueued_call));
            tmp *= scaling_factor;
            std::get<32>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<33, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_is_public_call_request) *
                       (((FF(0) - in.get(C::tx_prev_da_gas_used)) * in.get(C::tx_is_teardown_phase) +
                         in.get(C::tx_prev_da_gas_used)) -
                        in.get(C::tx_prev_da_gas_used_sent_to_enqueued_call));
            tmp *= scaling_factor;
            std::get<33>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<34, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_is_public_call_request) *
                       (((in.get(C::tx_prev_l2_gas_used) - in.get(C::tx_next_l2_gas_used_sent_to_enqueued_call)) *
                             in.get(C::tx_is_teardown_phase) +
                         in.get(C::tx_next_l2_gas_used_sent_to_enqueued_call)) -
                        in.get(C::tx_next_l2_gas_used));
            tmp *= scaling_factor;
            std::get<34>(evals) += typename Accumulator::View(tmp);
        }
        {
            using Accumulator = typename std::tuple_element_t<35, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_is_public_call_request) *
                       (((in.get(C::tx_prev_da_gas_used) - in.get(C::tx_next_da_gas_used_sent_to_enqueued_call)) *
                             in.get(C::tx_is_teardown_phase) +
                         in.get(C::tx_next_da_gas_used_sent_to_enqueued_call)) -
                        in.get(C::tx_next_da_gas_used));
            tmp *= scaling_factor;
            std::get<35>(evals) += typename Accumulator::View(tmp);
        }
        { // PROPAGATE_L2_GAS_USED
            using Accumulator = typename std::tuple_element_t<36, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_sel) * (FF(1) - in.get(C::tx_is_collect_fee)) *
                       (in.get(C::tx_next_l2_gas_used) - in.get(C::tx_prev_l2_gas_used_shift));
            tmp *= scaling_factor;
            std::get<36>(evals) += typename Accumulator::View(tmp);
        }
        { // PROPAGATE_DA_GAS_USED
            using Accumulator = typename std::tuple_element_t<37, ContainerOverSubrelations>;
            auto tmp = in.get(C::tx_sel) * (FF(1) - in.get(C::tx_is_collect_fee)) *
                       (in.get(C::tx_next_da_gas_used) - in.get(C::tx_prev_da_gas_used_shift));
            tmp *= scaling_factor;
            std::get<37>(evals) += typename Accumulator::View(tmp);
        }
    }
};

template <typename FF> class tx : public Relation<txImpl<FF>> {
  public:
    static constexpr const std::string_view NAME = "tx";

    static std::string get_subrelation_label(size_t index)
    {
        switch (index) {
        case 4:
            return "START_FOLLOWS_END";
        case 5:
            return "PHASE_VALUE_CONTINUITY";
        case 6:
            return "INCR_PHASE_VALUE_ON_END";
        case 8:
            return "REM_COUNT_IS_ZERO";
        case 9:
            return "REM_COUNT_IS_ONE";
        case 10:
            return "READ_PI_LENGTH_SEL";
        case 11:
            return "DECR_REM_PHASE_EVENTS";
        case 12:
            return "INCR_READ_PI_OFFSET";
        case 24:
            return "COMPUTE_FEE";
        case 25:
            return "TEARDOWN_GETS_FEE";
        case 26:
            return "FEE_ZERO_UNLESS_COLLECT_FEE_OR_TEARDOWN";
        case 36:
            return "PROPAGATE_L2_GAS_USED";
        case 37:
            return "PROPAGATE_DA_GAS_USED";
        }
        return std::to_string(index);
    }

    // Subrelation indices constants, to be used in tests.
    static constexpr size_t SR_START_FOLLOWS_END = 4;
    static constexpr size_t SR_PHASE_VALUE_CONTINUITY = 5;
    static constexpr size_t SR_INCR_PHASE_VALUE_ON_END = 6;
    static constexpr size_t SR_REM_COUNT_IS_ZERO = 8;
    static constexpr size_t SR_REM_COUNT_IS_ONE = 9;
    static constexpr size_t SR_READ_PI_LENGTH_SEL = 10;
    static constexpr size_t SR_DECR_REM_PHASE_EVENTS = 11;
    static constexpr size_t SR_INCR_READ_PI_OFFSET = 12;
    static constexpr size_t SR_COMPUTE_FEE = 24;
    static constexpr size_t SR_TEARDOWN_GETS_FEE = 25;
    static constexpr size_t SR_FEE_ZERO_UNLESS_COLLECT_FEE_OR_TEARDOWN = 26;
    static constexpr size_t SR_PROPAGATE_L2_GAS_USED = 36;
    static constexpr size_t SR_PROPAGATE_DA_GAS_USED = 37;
};

} // namespace bb::avm2
