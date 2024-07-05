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
                                .addr_ff = FF(direct_dst_offset + i),
                                .val = calldata.at(cd_offset + i),
                                .cd_offset = cd_offset + i,
                                .cnt = copy_size - i,
                                .one_min_inv = FF(1) - FF(copy_size - i).invert(),
                                .sel_start_cd_cpy = i == 0,
                                .sel_cd_cpy = true });
        cd_lookup_counts[cd_offset + i]++;
    }

    // Last extra row for a calldatacopy operation. cnt is zero and we have to add extra dummy
    // values for addr and cd_offset to satisfy the constraints: #[ADDR_CNT_INCREMENT] and #[CD_OFFSET_INCREMENT]
    // Alternatively, we would have to increase the degree of these two relations.
    // Note that addr = 2^32 would be a valid value here, therefore we do not wrap modulo 2^32.
    // cd_offset is fine as the circuit trace cannot reach a size of 2^32.
    slice_trace.emplace_back(
        SliceTraceEntry{ .addr_ff = FF(direct_dst_offset + copy_size - 1) + 1, .cd_offset = cd_offset + copy_size });
}

} // namespace bb::avm_trace