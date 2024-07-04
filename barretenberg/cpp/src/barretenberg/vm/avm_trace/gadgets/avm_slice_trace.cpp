#include "barretenberg/vm/avm_trace/gadgets/avm_slice_trace.hpp"

#include <cstddef>
#include <cstdint>

namespace bb::avm_trace {

void AvmSliceTraceBuilder::reset()
{
    slice_trace.clear();
    cd_lookup_counts.clear();
}

std::vector<AvmSliceTraceBuilder::SliceTraceEntry> AvmSliceTraceBuilder::finalize()
{
    return std::move(slice_trace);
}

void AvmSliceTraceBuilder::create_calldata_copy_slice(std::vector<FF> const& calldata,
                                                      uint32_t clk,
                                                      uint8_t space_id,
                                                      uint32_t cd_offset,
                                                      uint32_t copy_size,
                                                      uint32_t direct_dst_offset)
{
    for (uint32_t i = 0; i < copy_size; i++) {
        slice_trace.push_back({ .clk = clk,
                                .space_id = space_id,
                                .addr = direct_dst_offset + i,
                                .val = calldata.at(cd_offset + i),
                                .cd_offset = cd_offset + i,
                                .cnt = copy_size - i,
                                .one_min_inv = FF(1) - FF(copy_size - i).invert(),
                                .sel_start_cd = i == 0,
                                .sel_cd = true });
        cd_lookup_counts[cd_offset]++;
    }

    // Delimiter zero row between two calldata_copy calls.
    slice_trace.push_back({});
}

} // namespace bb::avm_trace