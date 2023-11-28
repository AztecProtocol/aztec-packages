
#pragma once
#include "../../relation_parameters.hpp"
#include "../../relation_types.hpp"

namespace proof_system::AvmMini_vm {

template <typename FF> struct Mem_traceRow {
    FF memTrace_m_addr_shift{};
    FF avmMini_last{};
    FF memTrace_m_rw_shift{};
    FF avmMini_first{};
    FF memTrace_m_addr{};
    FF memTrace_m_val{};
    FF memTrace_m_rw{};
    FF memTrace_m_lastAccess{};
    FF memTrace_m_val_shift{};
};

#define DECLARE_VIEWS(index)                                                                                           \
    using View = typename std::tuple_element<index, ContainerOverSubrelations>::type;                                  \
    [[maybe_unused]] auto avmMini_clk = View(new_term.avmMini_clk);                                                    \
    [[maybe_unused]] auto avmMini_first = View(new_term.avmMini_first);                                                \
    [[maybe_unused]] auto memTrace_m_clk = View(new_term.memTrace_m_clk);                                              \
    [[maybe_unused]] auto memTrace_m_sub_clk = View(new_term.memTrace_m_sub_clk);                                      \
    [[maybe_unused]] auto memTrace_m_addr = View(new_term.memTrace_m_addr);                                            \
    [[maybe_unused]] auto memTrace_m_val = View(new_term.memTrace_m_val);                                              \
    [[maybe_unused]] auto memTrace_m_lastAccess = View(new_term.memTrace_m_lastAccess);                                \
    [[maybe_unused]] auto memTrace_m_rw = View(new_term.memTrace_m_rw);                                                \
    [[maybe_unused]] auto avmMini_subop = View(new_term.avmMini_subop);                                                \
    [[maybe_unused]] auto avmMini_ia = View(new_term.avmMini_ia);                                                      \
    [[maybe_unused]] auto avmMini_ib = View(new_term.avmMini_ib);                                                      \
    [[maybe_unused]] auto avmMini_ic = View(new_term.avmMini_ic);                                                      \
    [[maybe_unused]] auto avmMini_mem_op_a = View(new_term.avmMini_mem_op_a);                                          \
    [[maybe_unused]] auto avmMini_mem_op_b = View(new_term.avmMini_mem_op_b);                                          \
    [[maybe_unused]] auto avmMini_mem_op_c = View(new_term.avmMini_mem_op_c);                                          \
    [[maybe_unused]] auto avmMini_rwa = View(new_term.avmMini_rwa);                                                    \
    [[maybe_unused]] auto avmMini_rwb = View(new_term.avmMini_rwb);                                                    \
    [[maybe_unused]] auto avmMini_rwc = View(new_term.avmMini_rwc);                                                    \
    [[maybe_unused]] auto avmMini_mem_idx_a = View(new_term.avmMini_mem_idx_a);                                        \
    [[maybe_unused]] auto avmMini_mem_idx_b = View(new_term.avmMini_mem_idx_b);                                        \
    [[maybe_unused]] auto avmMini_mem_idx_c = View(new_term.avmMini_mem_idx_c);                                        \
    [[maybe_unused]] auto avmMini_last = View(new_term.avmMini_last);                                                  \
    [[maybe_unused]] auto memTrace_m_rw_shift = View(new_term.memTrace_m_rw_shift);                                    \
    [[maybe_unused]] auto memTrace_m_addr_shift = View(new_term.memTrace_m_addr_shift);                                \
    [[maybe_unused]] auto memTrace_m_val_shift = View(new_term.memTrace_m_val_shift);

template <typename FF_> class mem_traceImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{
        6,
        6,
        6,
        6,
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

            auto tmp = (memTrace_m_lastAccess * (-memTrace_m_lastAccess + FF(1)));
            tmp *= scaling_factor;
            std::get<0>(evals) += tmp;
        }
        // Contribution 1
        {
            DECLARE_VIEWS(1);

            auto tmp = (memTrace_m_rw * (-memTrace_m_rw + FF(1)));
            tmp *= scaling_factor;
            std::get<1>(evals) += tmp;
        }
        // Contribution 2
        {
            DECLARE_VIEWS(2);

            auto tmp = (((-avmMini_first + FF(1)) * (-memTrace_m_lastAccess + FF(1))) *
                        (memTrace_m_addr_shift - memTrace_m_addr));
            tmp *= scaling_factor;
            std::get<2>(evals) += tmp;
        }
        // Contribution 3
        {
            DECLARE_VIEWS(3);

            auto tmp = (((((-avmMini_first + FF(1)) * (-avmMini_last + FF(1))) * (-memTrace_m_lastAccess + FF(1))) *
                         (-memTrace_m_rw_shift + FF(1))) *
                        (memTrace_m_val_shift - memTrace_m_val));
            tmp *= scaling_factor;
            std::get<3>(evals) += tmp;
        }
    }
};

template <typename FF> using mem_trace = Relation<mem_traceImpl<FF>>;

} // namespace proof_system::AvmMini_vm