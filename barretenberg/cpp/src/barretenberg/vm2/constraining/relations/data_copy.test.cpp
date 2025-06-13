#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/data_copy_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using data_copy = bb::avm2::data_copy<FF>;

using mem_read_lookup = bb::avm2::lookup_data_copy_mem_read_settings;
using mem_write_lookup = bb::avm2::lookup_data_copy_mem_write_settings;

// todo(ilyas): expand this test to pass in a copy_size so we can test padding
TestTraceContainer calldata_rows(const std::vector<FF>& calldata)
{

    std::vector<std::vector<std::pair<Column, FF>>> rows;
    uint32_t read_size = static_cast<uint32_t>(calldata.size());
    uint32_t data_copy_size = static_cast<uint32_t>(calldata.size());
    for (uint32_t i = 0; i < calldata.size(); ++i) {
        uint32_t copy_size = data_copy_size - i;
        bool end = (copy_size - 1) == 0;
        FF next_write_count_inv = !end ? FF(copy_size - 1).invert() : 0;

        // Reads
        uint32_t read_count = read_size - i;
        bool is_padding_row = read_count == 0;
        // Read from memory if this is not a padding row and we are either RD_COPY-ing or a nested CD_COPY
        FF read_count_inv = is_padding_row ? 0 : FF(read_count).invert();

        rows.push_back({ {
            { C::data_copy_clk, 0 },
            { C::data_copy_sel_cd_copy, 1 },
            { C::data_copy_sel_rd_copy, 0 },
            { C::data_copy_operation_id, 1 },

            { C::data_copy_src_context_id, 2 },
            { C::data_copy_dst_context_id, 3 },
            { C::data_copy_data_copy_size, calldata.size() - i },
            { C::data_copy_data_offset, 0 },
            { C::data_copy_data_addr, 0 },
            { C::data_copy_data_size, calldata.size() },
            { C::data_copy_write_addr, i }, // Write to sequential addr from 0

            { C::data_copy_sel_start, i == 0 ? 1 : 0 },
            { C::data_copy_sel_end, (i == calldata.size() - 1) ? 1 : 0 },
            { C::data_copy_next_write_count_inv, next_write_count_inv },

            { C::data_copy_sel_mem_write, 1 },

            { C::data_copy_is_top_level, 0 },
            { C::data_copy_parent_id_inv, /*src_context_id*/ FF(2).invert() },

            { C::data_copy_sel_mem_read, 1 },
            { C::data_copy_read_addr, i }, // Read from sequential addr from 0
            { C::data_copy_read_count, read_count },
            { C::data_copy_read_count_inv, read_count_inv },
            { C::data_copy_padding, is_padding_row ? 1 : 0 },
            { C::data_copy_value, calldata[i] },

            { C::data_copy_cd_copy_col_read, 0 },
            { C::data_copy_cd_index, i },
        } });
    }
    return TestTraceContainer(rows);
}

TEST(DataCopyConstrainingTest, EmptyRow)
{
    check_relation<data_copy>(testing::empty_trace());
}

TEST(DataCopyConstrainingTest, EnqueuedCallCdCopy)
{
    std::vector<FF> calldata = { 1, 2, 3, 4, 5, 6, 7, 8 };

    TestTraceContainer trace({
        // Row 0
        {
            { C::precomputed_clk, 0 },
            { C::precomputed_first_row, 1 },
            { C::calldata_sel, 1 },
            { C::calldata_index, 1 },
            { C::calldata_value, calldata[0] },

        },

        // Row 1
        { { C::precomputed_clk, 1 },
          { C::data_copy_sel_cd_copy, 1 },
          { C::data_copy_sel_rd_copy, 0 },
          { C::data_copy_operation_id, 1 },
          { C::data_copy_clk, 0 },
          { C::data_copy_src_context_id, 0 },
          { C::data_copy_dst_context_id, 1 },
          { C::data_copy_data_copy_size, 1 },
          { C::data_copy_data_offset, 0 },
          { C::data_copy_data_addr, 0 },
          { C::data_copy_data_size, static_cast<uint32_t>(calldata.size()) },
          { C::data_copy_write_addr, 0 },

          { C::data_copy_sel_start, 1 },
          { C::data_copy_sel_end, 1 },
          { C::data_copy_next_write_count_inv, FF(calldata.size() - 1).invert() },

          { C::data_copy_sel_mem_write, 1 },

          { C::data_copy_is_top_level, 1 },
          { C::data_copy_parent_id_inv, 0 },

          { C::data_copy_sel_mem_read, 0 },
          { C::data_copy_read_addr, 0 },
          { C::data_copy_read_count, 1 },
          { C::data_copy_read_count_inv, 1 },
          { C::data_copy_padding, 0 },
          { C::data_copy_value, calldata[0] },

          { C::data_copy_cd_copy_col_read, 1 },
          { C::data_copy_cd_index, 1 } },
    });
    check_relation<data_copy>(trace);
}

TEST(DataCopyConstrainingTest, NestedCdCopy)
{
    std::vector<FF> calldata = { 1, 2, 3, 4, 5, 6, 7, 8 };

    auto rows = calldata_rows(calldata);

    auto trace = TestTraceContainer(rows);
    // Set memory rows
    uint32_t row_counter = 0;
    for (uint32_t i = 0; i < calldata.size(); i++) {
        // Write Portion of memory
        trace.set(row_counter++,
                  { {
                      { C::memory_sel, 1 },
                      { C::memory_clk, 0 },
                      { C::memory_address, i },
                      { C::memory_value, calldata[i] },
                      { C::memory_tag, 0 },      // FF tag
                      { C::memory_rw, 1 },       // Write operation
                      { C::memory_space_id, 3 }, // The write is to the context_id = 3
                  } });
        // Read Portion of memory
        trace.set(row_counter++,
                  { {
                      { C::memory_sel, 1 },
                      { C::memory_clk, 0 },
                      { C::memory_address, i },
                      { C::memory_value, calldata[i] },
                      { C::memory_tag, 0 },      // FF tag
                      { C::memory_rw, 0 },       // Read operation
                      { C::memory_space_id, 2 }, // The read is from context_id = 2
                  } });
    }

    check_relation<data_copy>(trace);
    tracegen::LookupIntoDynamicTableGeneric<mem_read_lookup>().process(trace);
    tracegen::LookupIntoDynamicTableGeneric<mem_write_lookup>().process(trace);
}

} // namespace
} // namespace bb::avm2::constraining
