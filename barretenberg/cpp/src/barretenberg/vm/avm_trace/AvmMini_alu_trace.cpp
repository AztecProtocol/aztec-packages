#include "AvmMini_alu_trace.hpp"

namespace avm_trace {

/**
 * @brief Constructor of Alu trace builder of AVM. Only serves to set the capacity of the
 *        underlying trace.
 */
AvmMiniAluTraceBuilder::AvmMiniAluTraceBuilder()
{
    alu_trace.reserve(AVM_TRACE_SIZE);
}

} // namespace avm_trace
