#include "barretenberg/vm/avm/trace/gadgets/ecc.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"

namespace bb::avm_trace {

using element = grumpkin::g1::affine_element;

std::vector<AvmEccTraceBuilder::EccTraceEntry> AvmEccTraceBuilder::finalize()
{
    return std::move(ecc_trace);
}

void AvmEccTraceBuilder::reset()
{
    ecc_trace.clear();
    ecc_trace.shrink_to_fit(); // Reclaim memory.
}

element AvmEccTraceBuilder::embedded_curve_add(element lhs, element rhs, uint32_t clk)
{
    element result = lhs + rhs;
    std::tuple<FF, FF, bool> p1 = { lhs.x, lhs.y, lhs.is_point_at_infinity() };
    std::tuple<FF, FF, bool> p2 = { rhs.x, rhs.y, rhs.is_point_at_infinity() };
    std::tuple<FF, FF, bool> result_tuple = { result.x, result.y, result.is_point_at_infinity() };
    ecc_trace.push_back({ clk, p1, p2, result_tuple });

    return result;
}

} // namespace bb::avm_trace
