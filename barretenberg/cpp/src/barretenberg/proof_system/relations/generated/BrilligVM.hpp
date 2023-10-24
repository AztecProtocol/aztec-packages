
#pragma once
#include "../relation_parameters.hpp"
#include "../relation_types.hpp"

namespace proof_system::BrilligVM_vm {

template <typename FF> struct Row {
    FF main_POSITIVE{};
    FF main_FIRST{};
    FF main_LAST{};
    FF main_STEP{};
    FF main__romgen_first_step{};
    FF main_first_step{};
    FF main_p_line{};
    FF main_p_X_const{};
    FF main_p_instr__jump_to_operation{};
    FF main_p_instr__loop{};
    FF main_p_instr__reset{};
    FF main_p_instr_call{};
    FF main_p_instr_call_param_l{};
    FF main_p_instr_ret{};
    FF main_p_instr_return{};
    FF main_p_reg_write_X_r0{};
    FF main_p_reg_write_X_r1{};
    FF main_p_reg_write_X_r3{};
    FF main__block_enforcer_last_step{};
    FF main__linker_first_step{};
    FF main_XInv{};
    FF main_XIsZero{};
    FF main_m_addr{};
    FF main_m_step{};
    FF main_m_change{};
    FF main_m_value{};
    FF main_m_op{};
    FF main_m_is_write{};
    FF main_m_is_read{};
    FF main__operation_id{};
    FF main__sigma{};
    FF main_pc{};
    FF main_X{};
    FF main_Y{};
    FF main_Z{};
    FF main_jump_ptr{};
    FF main_addr{};
    FF main_tmp{};
    FF main_reg_write_X_r0{};
    FF main_r0{};
    FF main_reg_write_X_r1{};
    FF main_r1{};
    FF main_r2{};
    FF main_reg_write_X_r3{};
    FF main_r3{};
    FF main_r4{};
    FF main_r5{};
    FF main_r6{};
    FF main_r7{};
    FF main_r8{};
    FF main_r9{};
    FF main_r10{};
    FF main_r11{};
    FF main_instr_call{};
    FF main_instr_call_param_l{};
    FF main_instr_ret{};
    FF main_instr__jump_to_operation{};
    FF main_instr__reset{};
    FF main_instr__loop{};
    FF main_instr_return{};
    FF main_X_const{};
    FF main_X_free_value{};
    FF main_Y_free_value{};
    FF main_Z_free_value{};
    FF main__operation_id_no_change{};
    FF main_r7_shift{};
    FF main__romgen_first_step_shift{};
    FF main_r0_shift{};
    FF main_r8_shift{};
    FF main_r1_shift{};
    FF main_r9_shift{};
    FF main_r10_shift{};
    FF main_m_is_write_shift{};
    FF main_pc_shift{};
    FF main_tmp_shift{};
    FF main_addr_shift{};
    FF main_jump_ptr_shift{};
    FF main_r11_shift{};
    FF main_r2_shift{};
    FF main_r3_shift{};
    FF main_m_value_shift{};
    FF main_r5_shift{};
    FF main__operation_id_shift{};
    FF main__sigma_shift{};
    FF main_r4_shift{};
    FF main_m_addr_shift{};
    FF main_r6_shift{};
    FF main_first_step_shift{};
};

#define DECLARE_VIEWS(index)                                                                                           \
    using View = typename std::tuple_element<index, ContainerOverSubrelations>::type;                                  \
    [[maybe_unused]] auto main_POSITIVE = View(new_term.main_POSITIVE);                                                \
    [[maybe_unused]] auto main_FIRST = View(new_term.main_FIRST);                                                      \
    [[maybe_unused]] auto main_LAST = View(new_term.main_LAST);                                                        \
    [[maybe_unused]] auto main_STEP = View(new_term.main_STEP);                                                        \
    [[maybe_unused]] auto main__romgen_first_step = View(new_term.main__romgen_first_step);                            \
    [[maybe_unused]] auto main_first_step = View(new_term.main_first_step);                                            \
    [[maybe_unused]] auto main_p_line = View(new_term.main_p_line);                                                    \
    [[maybe_unused]] auto main_p_X_const = View(new_term.main_p_X_const);                                              \
    [[maybe_unused]] auto main_p_instr__jump_to_operation = View(new_term.main_p_instr__jump_to_operation);            \
    [[maybe_unused]] auto main_p_instr__loop = View(new_term.main_p_instr__loop);                                      \
    [[maybe_unused]] auto main_p_instr__reset = View(new_term.main_p_instr__reset);                                    \
    [[maybe_unused]] auto main_p_instr_call = View(new_term.main_p_instr_call);                                        \
    [[maybe_unused]] auto main_p_instr_call_param_l = View(new_term.main_p_instr_call_param_l);                        \
    [[maybe_unused]] auto main_p_instr_ret = View(new_term.main_p_instr_ret);                                          \
    [[maybe_unused]] auto main_p_instr_return = View(new_term.main_p_instr_return);                                    \
    [[maybe_unused]] auto main_p_reg_write_X_r0 = View(new_term.main_p_reg_write_X_r0);                                \
    [[maybe_unused]] auto main_p_reg_write_X_r1 = View(new_term.main_p_reg_write_X_r1);                                \
    [[maybe_unused]] auto main_p_reg_write_X_r3 = View(new_term.main_p_reg_write_X_r3);                                \
    [[maybe_unused]] auto main__block_enforcer_last_step = View(new_term.main__block_enforcer_last_step);              \
    [[maybe_unused]] auto main__linker_first_step = View(new_term.main__linker_first_step);                            \
    [[maybe_unused]] auto main_XInv = View(new_term.main_XInv);                                                        \
    [[maybe_unused]] auto main_XIsZero = View(new_term.main_XIsZero);                                                  \
    [[maybe_unused]] auto main_m_addr = View(new_term.main_m_addr);                                                    \
    [[maybe_unused]] auto main_m_step = View(new_term.main_m_step);                                                    \
    [[maybe_unused]] auto main_m_change = View(new_term.main_m_change);                                                \
    [[maybe_unused]] auto main_m_value = View(new_term.main_m_value);                                                  \
    [[maybe_unused]] auto main_m_op = View(new_term.main_m_op);                                                        \
    [[maybe_unused]] auto main_m_is_write = View(new_term.main_m_is_write);                                            \
    [[maybe_unused]] auto main_m_is_read = View(new_term.main_m_is_read);                                              \
    [[maybe_unused]] auto main__operation_id = View(new_term.main__operation_id);                                      \
    [[maybe_unused]] auto main__sigma = View(new_term.main__sigma);                                                    \
    [[maybe_unused]] auto main_pc = View(new_term.main_pc);                                                            \
    [[maybe_unused]] auto main_X = View(new_term.main_X);                                                              \
    [[maybe_unused]] auto main_Y = View(new_term.main_Y);                                                              \
    [[maybe_unused]] auto main_Z = View(new_term.main_Z);                                                              \
    [[maybe_unused]] auto main_jump_ptr = View(new_term.main_jump_ptr);                                                \
    [[maybe_unused]] auto main_addr = View(new_term.main_addr);                                                        \
    [[maybe_unused]] auto main_tmp = View(new_term.main_tmp);                                                          \
    [[maybe_unused]] auto main_reg_write_X_r0 = View(new_term.main_reg_write_X_r0);                                    \
    [[maybe_unused]] auto main_r0 = View(new_term.main_r0);                                                            \
    [[maybe_unused]] auto main_reg_write_X_r1 = View(new_term.main_reg_write_X_r1);                                    \
    [[maybe_unused]] auto main_r1 = View(new_term.main_r1);                                                            \
    [[maybe_unused]] auto main_r2 = View(new_term.main_r2);                                                            \
    [[maybe_unused]] auto main_reg_write_X_r3 = View(new_term.main_reg_write_X_r3);                                    \
    [[maybe_unused]] auto main_r3 = View(new_term.main_r3);                                                            \
    [[maybe_unused]] auto main_r4 = View(new_term.main_r4);                                                            \
    [[maybe_unused]] auto main_r5 = View(new_term.main_r5);                                                            \
    [[maybe_unused]] auto main_r6 = View(new_term.main_r6);                                                            \
    [[maybe_unused]] auto main_r7 = View(new_term.main_r7);                                                            \
    [[maybe_unused]] auto main_r8 = View(new_term.main_r8);                                                            \
    [[maybe_unused]] auto main_r9 = View(new_term.main_r9);                                                            \
    [[maybe_unused]] auto main_r10 = View(new_term.main_r10);                                                          \
    [[maybe_unused]] auto main_r11 = View(new_term.main_r11);                                                          \
    [[maybe_unused]] auto main_instr_call = View(new_term.main_instr_call);                                            \
    [[maybe_unused]] auto main_instr_call_param_l = View(new_term.main_instr_call_param_l);                            \
    [[maybe_unused]] auto main_instr_ret = View(new_term.main_instr_ret);                                              \
    [[maybe_unused]] auto main_instr__jump_to_operation = View(new_term.main_instr__jump_to_operation);                \
    [[maybe_unused]] auto main_instr__reset = View(new_term.main_instr__reset);                                        \
    [[maybe_unused]] auto main_instr__loop = View(new_term.main_instr__loop);                                          \
    [[maybe_unused]] auto main_instr_return = View(new_term.main_instr_return);                                        \
    [[maybe_unused]] auto main_X_const = View(new_term.main_X_const);                                                  \
    [[maybe_unused]] auto main_X_free_value = View(new_term.main_X_free_value);                                        \
    [[maybe_unused]] auto main_Y_free_value = View(new_term.main_Y_free_value);                                        \
    [[maybe_unused]] auto main_Z_free_value = View(new_term.main_Z_free_value);                                        \
    [[maybe_unused]] auto main__operation_id_no_change = View(new_term.main__operation_id_no_change);                  \
    [[maybe_unused]] auto main_r7_shift = View(new_term.main_r7_shift);                                                \
    [[maybe_unused]] auto main__romgen_first_step_shift = View(new_term.main__romgen_first_step_shift);                \
    [[maybe_unused]] auto main_r0_shift = View(new_term.main_r0_shift);                                                \
    [[maybe_unused]] auto main_r8_shift = View(new_term.main_r8_shift);                                                \
    [[maybe_unused]] auto main_r1_shift = View(new_term.main_r1_shift);                                                \
    [[maybe_unused]] auto main_r9_shift = View(new_term.main_r9_shift);                                                \
    [[maybe_unused]] auto main_r10_shift = View(new_term.main_r10_shift);                                              \
    [[maybe_unused]] auto main_m_is_write_shift = View(new_term.main_m_is_write_shift);                                \
    [[maybe_unused]] auto main_pc_shift = View(new_term.main_pc_shift);                                                \
    [[maybe_unused]] auto main_tmp_shift = View(new_term.main_tmp_shift);                                              \
    [[maybe_unused]] auto main_addr_shift = View(new_term.main_addr_shift);                                            \
    [[maybe_unused]] auto main_jump_ptr_shift = View(new_term.main_jump_ptr_shift);                                    \
    [[maybe_unused]] auto main_r11_shift = View(new_term.main_r11_shift);                                              \
    [[maybe_unused]] auto main_r2_shift = View(new_term.main_r2_shift);                                                \
    [[maybe_unused]] auto main_r3_shift = View(new_term.main_r3_shift);                                                \
    [[maybe_unused]] auto main_m_value_shift = View(new_term.main_m_value_shift);                                      \
    [[maybe_unused]] auto main_r5_shift = View(new_term.main_r5_shift);                                                \
    [[maybe_unused]] auto main__operation_id_shift = View(new_term.main__operation_id_shift);                          \
    [[maybe_unused]] auto main__sigma_shift = View(new_term.main__sigma_shift);                                        \
    [[maybe_unused]] auto main_r4_shift = View(new_term.main_r4_shift);                                                \
    [[maybe_unused]] auto main_m_addr_shift = View(new_term.main_m_addr_shift);                                        \
    [[maybe_unused]] auto main_r6_shift = View(new_term.main_r6_shift);                                                \
    [[maybe_unused]] auto main_first_step_shift = View(new_term.main_first_step_shift);

template <typename FF_> class BrilligVMImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 37> SUBRELATION_LENGTHS{
        10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10,
        10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10,
    };

    template <typename ContainerOverSubrelations, typename AllEntities>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& new_term,
                           [[maybe_unused]] const RelationParameters<FF>&,
                           [[maybe_unused]] const FF& scaling_factor)
    {

        // Contribution 0
        {
            DECLARE_VIEWS(0);

            auto tmp = (main_XIsZero - (-(main_X * main_XInv) + FF(1)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<0>(evals) += tmp;
        }
        // Contribution 1
        {
            DECLARE_VIEWS(1);

            auto tmp = (main_XIsZero * main_X);
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<1>(evals) += tmp;
        }
        // Contribution 2
        {
            DECLARE_VIEWS(2);

            auto tmp = (main_XIsZero * (-main_XIsZero + FF(1)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<2>(evals) += tmp;
        }
        // Contribution 3
        {
            DECLARE_VIEWS(3);

            auto tmp = (main_m_change * (-main_m_change + FF(1)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<3>(evals) += tmp;
        }
        // Contribution 4
        {
            DECLARE_VIEWS(4);

            auto tmp = ((main_m_addr_shift * (-main_LAST + FF(1)) - main_m_addr) * (-main_m_change + FF(1)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<4>(evals) += tmp;
        }
        // Contribution 5
        {
            DECLARE_VIEWS(5);

            auto tmp = (main_m_op * (-main_m_op + FF(1)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<5>(evals) += tmp;
        }
        // Contribution 6
        {
            DECLARE_VIEWS(6);

            auto tmp = (main_m_is_write * (-main_m_is_write + FF(1)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<6>(evals) += tmp;
        }
        // Contribution 7
        {
            DECLARE_VIEWS(7);

            auto tmp = (main_m_is_read * (-main_m_is_read + FF(1)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<7>(evals) += tmp;
        }
        // Contribution 8
        {
            DECLARE_VIEWS(8);

            auto tmp = (main_m_is_write * (-main_m_op + FF(1)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<8>(evals) += tmp;
        }
        // Contribution 9
        {
            DECLARE_VIEWS(9);

            auto tmp = (main_m_is_read * (-main_m_op + FF(1)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<9>(evals) += tmp;
        }
        // Contribution 10
        {
            DECLARE_VIEWS(10);

            auto tmp = (main_m_is_read * main_m_is_write);
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<10>(evals) += tmp;
        }
        // Contribution 11
        {
            DECLARE_VIEWS(11);

            auto tmp = (((-main_m_is_write_shift * (-main_LAST + FF(1)) + FF(1)) * (-main_m_change + FF(1))) *
                        (main_m_value_shift * (-main_LAST + FF(1)) - main_m_value));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<11>(evals) += tmp;
        }
        // Contribution 12
        {
            DECLARE_VIEWS(12);

            auto tmp = (((-main_m_is_write_shift * (-main_LAST + FF(1)) + FF(1)) * main_m_change) * main_m_value_shift *
                        (-main_LAST + FF(1)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<12>(evals) += tmp;
        }
        // Contribution 13
        {
            DECLARE_VIEWS(13);

            auto tmp =
                (main__sigma_shift * (-main_LAST + FF(1)) -
                 ((-main__romgen_first_step_shift * (-main_LAST + FF(1)) + FF(1)) * (main__sigma + main_instr_return)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<13>(evals) += tmp;
        }
        // Contribution 14
        {
            DECLARE_VIEWS(14);

            auto tmp = (main__sigma * (main__operation_id - FF(8)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<14>(evals) += tmp;
        }
        // Contribution 15
        {
            DECLARE_VIEWS(15);

            auto tmp = (main_X - main_X_const);
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<15>(evals) += tmp;
        }
        // Contribution 16
        {
            DECLARE_VIEWS(16);

            auto tmp = main_Y;
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<16>(evals) += tmp;
        }
        // Contribution 17
        {
            DECLARE_VIEWS(17);

            auto tmp = main_Z;
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<17>(evals) += tmp;
        }
        // Contribution 18
        {
            DECLARE_VIEWS(18);

            auto tmp = (main_addr_shift * (-main_LAST + FF(1)) - ((-main_instr__reset + FF(1)) * main_addr));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<18>(evals) += tmp;
        }
        // Contribution 19
        {
            DECLARE_VIEWS(19);

            auto tmp = (main_jump_ptr_shift * (-main_LAST + FF(1)) -
                        ((main_instr_call * (main_pc + FF(1))) +
                         ((-(main_instr_call + main_instr__reset) + FF(1)) * main_jump_ptr)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<19>(evals) += tmp;
        }
        // Contribution 20
        {
            DECLARE_VIEWS(20);

            auto tmp =
                (main_pc_shift * (-main_LAST + FF(1)) -
                 ((-main_first_step_shift * (-main_LAST + FF(1)) + FF(1)) *
                  (((((main_instr_call * main_instr_call_param_l) + (main_instr_ret * main_jump_ptr)) +
                     (main_instr__jump_to_operation * main__operation_id)) +
                    (main_instr__loop * main_pc)) +
                   ((-((((main_instr_call + main_instr_ret) + main_instr__jump_to_operation) + main_instr__loop) +
                       main_instr_return) +
                     FF(1)) *
                    (main_pc + FF(1))))));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<20>(evals) += tmp;
        }
        // Contribution 21
        {
            DECLARE_VIEWS(21);

            auto tmp =
                (main_r0_shift * (-main_LAST + FF(1)) -
                 ((main_reg_write_X_r0 * main_X) + ((-(main_reg_write_X_r0 + main_instr__reset) + FF(1)) * main_r0)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<21>(evals) += tmp;
        }
        // Contribution 22
        {
            DECLARE_VIEWS(22);

            auto tmp =
                (main_r1_shift * (-main_LAST + FF(1)) -
                 ((main_reg_write_X_r1 * main_X) + ((-(main_reg_write_X_r1 + main_instr__reset) + FF(1)) * main_r1)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<22>(evals) += tmp;
        }
        // Contribution 23
        {
            DECLARE_VIEWS(23);

            auto tmp = (main_r10_shift * (-main_LAST + FF(1)) - ((-main_instr__reset + FF(1)) * main_r10));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<23>(evals) += tmp;
        }
        // Contribution 24
        {
            DECLARE_VIEWS(24);

            auto tmp = (main_r11_shift * (-main_LAST + FF(1)) - ((-main_instr__reset + FF(1)) * main_r11));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<24>(evals) += tmp;
        }
        // Contribution 25
        {
            DECLARE_VIEWS(25);

            auto tmp = (main_r2_shift * (-main_LAST + FF(1)) - ((-main_instr__reset + FF(1)) * main_r2));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<25>(evals) += tmp;
        }
        // Contribution 26
        {
            DECLARE_VIEWS(26);

            auto tmp =
                (main_r3_shift * (-main_LAST + FF(1)) -
                 ((main_reg_write_X_r3 * main_X) + ((-(main_reg_write_X_r3 + main_instr__reset) + FF(1)) * main_r3)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<26>(evals) += tmp;
        }
        // Contribution 27
        {
            DECLARE_VIEWS(27);

            auto tmp = (main_r4_shift * (-main_LAST + FF(1)) - ((-main_instr__reset + FF(1)) * main_r4));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<27>(evals) += tmp;
        }
        // Contribution 28
        {
            DECLARE_VIEWS(28);

            auto tmp = (main_r5_shift * (-main_LAST + FF(1)) - ((-main_instr__reset + FF(1)) * main_r5));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<28>(evals) += tmp;
        }
        // Contribution 29
        {
            DECLARE_VIEWS(29);

            auto tmp = (main_r6_shift * (-main_LAST + FF(1)) - ((-main_instr__reset + FF(1)) * main_r6));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<29>(evals) += tmp;
        }
        // Contribution 30
        {
            DECLARE_VIEWS(30);

            auto tmp = (main_r7_shift * (-main_LAST + FF(1)) - ((-main_instr__reset + FF(1)) * main_r7));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<30>(evals) += tmp;
        }
        // Contribution 31
        {
            DECLARE_VIEWS(31);

            auto tmp = (main_r8_shift * (-main_LAST + FF(1)) - ((-main_instr__reset + FF(1)) * main_r8));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<31>(evals) += tmp;
        }
        // Contribution 32
        {
            DECLARE_VIEWS(32);

            auto tmp = (main_r9_shift * (-main_LAST + FF(1)) - ((-main_instr__reset + FF(1)) * main_r9));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<32>(evals) += tmp;
        }
        // Contribution 33
        {
            DECLARE_VIEWS(33);

            auto tmp = (main_tmp_shift * (-main_LAST + FF(1)) - ((-main_instr__reset + FF(1)) * main_tmp));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<33>(evals) += tmp;
        }
        // Contribution 34
        {
            DECLARE_VIEWS(34);

            auto tmp = (main__operation_id_no_change -
                        ((-main__block_enforcer_last_step + FF(1)) * (-main_instr_return + FF(1))));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<34>(evals) += tmp;
        }
        // Contribution 35
        {
            DECLARE_VIEWS(35);

            auto tmp =
                (main__operation_id_no_change * (main__operation_id_shift * (-main_LAST + FF(1)) - main__operation_id));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<35>(evals) += tmp;
        }
        // Contribution 36
        {
            DECLARE_VIEWS(36);

            auto tmp = (main__linker_first_step * (main__operation_id - FF(2)));
            tmp *= scaling_factor;
            tmp *= main_FIRST; // Temp to switch off
            std::get<36>(evals) += tmp;
        }
    }
};

template <typename FF> using BrilligVM = Relation<BrilligVMImpl<FF>>;

} // namespace proof_system::BrilligVM_vm