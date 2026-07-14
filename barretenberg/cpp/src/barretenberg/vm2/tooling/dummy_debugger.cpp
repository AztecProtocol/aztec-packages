#include "barretenberg/vm2/tooling/debugger.hpp"

#ifndef AVM_INCLUDE_DEBUGGER
namespace bb::avm2 {

void InteractiveDebugger::run(uint32_t)
{
    std::cout << "Interactive debugger not available. Build with AVM_INCLUDE_DEBUGGER=1 (or in assert mode) to enable."
              << std::endl;
}

} // namespace bb::avm2
#endif
