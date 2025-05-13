#pragma once

#include <string>
#include <vector>

#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2 {

/**
 * An interactive debugger for the AVM2.
 *
 * (1) To use it in tests add the following after you construct the trace:
 *
 * auto container = TestTraceContainer::from_rows(trace);
 * InteractiveDebugger debugger(container);
 * debugger.run();
 *
 * (2) To use it to debug `avm2_check_circuit` failures just set the `AVM_DEBUG` environment variable.
 */
class InteractiveDebugger {
  public:
    InteractiveDebugger(tracegen::TraceContainer& trace)
        : trace(trace)
    {}

    void run(uint32_t starting_row = 0);

  private:
    tracegen::TraceContainer& trace;
    uint32_t row = 0;
    std::string prefix;

    void print_columns(const std::vector<std::string>& regex);
    void set_column(const std::string& column_name, const std::string& value);
    void test_relation(const std::string& relation_name, std::optional<std::string> subrelation_name);
};

} // namespace bb::avm2