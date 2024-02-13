#include "AvmMini_helper.hpp"

namespace avm_trace {

/**
 * @brief Routine to log some slice of a trace of the AVM. Used to debug or in some unit tests.
 *
 * @param trace The whole trace for AVM as a vector of rows.
 * @param beg The index of the beginning of the slice. (included)
 * @param end The index of the end of the slice (not included).
 */
void log_avmMini_trace(std::vector<Row> const& trace, size_t beg, size_t end)
{
    info("Built circuit with ", trace.size(), " rows");

    for (size_t i = beg; i < end; i++) {
        Row row = trace.at(i);
        // info("=====================================================================================");
        info("==        ROW       ", i);
        // info("=====================================================================================");

        // info("=======MEMORY TRACE==================================================================");
        info("m_trace_m_tag_err:             ", row.memTrace_m_tag_err);
        info("m_clk:                         ", row.memTrace_m_clk);
        info("");
        info("tag err:                       ", row.avmMini_tag_err);
        info("clk:                           ", row.avmMini_clk);
        // info("m_tag_err_trace_counts:        ", row.equiv_tag_err_counts);

        // info("m_addr:             ", row.memTrace_m_addr);
        // info("m_clk:              ", row.memTrace_m_clk);
        // info("m_sub_clk:          ", row.memTrace_m_sub_clk);
        // info("m_val:              ", row.memTrace_m_val);
        // info("m_rw:               ", row.memTrace_m_rw);
        // info("m_tag:              ", row.memTrace_m_tag);
        // info("m_in_tag:           ", row.memTrace_m_in_tag);
        // info("m_tag_err:          ", row.memTrace_m_tag_err);
        // info("m_one_min_inv:      ", row.memTrace_m_one_min_inv);

        // info("m_lastAccess:       ", row.memTrace_m_lastAccess);
        // info("m_last:             ", row.memTrace_m_last);
        // info("m_val_shift:        ", row.memTrace_m_val_shift);

        // info("=======CONTROL_FLOW===================================================================");
        // info("pc:                 ", row.avmMini_pc);
        // info("internal_call:      ", row.avmMini_sel_internal_call);
        // info("internal_return:    ", row.avmMini_sel_internal_return);
        // info("internal_return_ptr:", row.avmMini_internal_return_ptr);

        // info("=======ALU TRACE=====================================================================");
        // info("alu_clk             ", row.aluChip_alu_clk);
        // info("alu_ia              ", row.aluChip_alu_ia);
        // info("alu_ib              ", row.aluChip_alu_ib);
        // info("alu_ic              ", row.aluChip_alu_ic);

        // info("=======MAIN TRACE====================================================================");
        // info("clk:                ", row.avmMini_clk);
        // info("ia:                 ", row.avmMini_ia);
        // info("ib:                 ", row.avmMini_ib);
        // info("ic:                 ", row.avmMini_ic);
        // info("first:              ", row.avmMini_first);
        // info("last:               ", row.avmMini_last);

        // info("=======MEM_OP_A======================================================================");
        // info("mem_op_a:           ", row.avmMini_mem_op_a);
        // info("mem_idx_a:          ", row.avmMini_mem_idx_a);
        // info("rwa:                ", row.avmMini_rwa);

        // info("=======MEM_OP_B======================================================================");
        // info("mem_op_b:           ", row.avmMini_mem_op_b);
        // info("mem_idx_b:          ", row.avmMini_mem_idx_b);
        // info("rwb:                ", row.avmMini_rwb);

        // info("=======MEM_OP_C======================================================================");
        // info("mem_op_c:           ", row.avmMini_mem_op_c);
        // info("mem_idx_c:          ", row.avmMini_mem_idx_c);
        // info("rwc:                ", row.avmMini_rwc);
        info("\n");
    }
}

} // namespace avm_trace