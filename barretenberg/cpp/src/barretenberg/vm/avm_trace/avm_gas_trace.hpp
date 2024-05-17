
#include "avm_common.hpp"

namespace bb::avm_trace {

class AvmGasTraceBuilder {
  public:
    struct GasTableEntry {
        uint32_t opcode_idx = 0;
        uint32_t l2_fixed_gas_cost = 0;
        uint32_t da_fixed_gas_cost = 0;
    };

    struct GasTraceEntry {
        uint32_t opcode_idx = 0;
        uint32_t l2_gas_cost = 0;
        uint32_t da_gas_cost = 0;
    };

    // Counts each time an opcode is read
    std::unordered_map<uint32_t, uint32_t> opcode_lookup_counter;

    // Constructor receives copy of kernel_inputs from the main trace builder
    AvmGasTraceBuilder();

    void reset();
    std::vector<GasTraceEntry> finalize();

    // TODO: do we return the gas cost here?
    void constrain_gas_lookup(uint32_t opcode_idx);

    std::vector<GasTableEntry> construct_gas_lookup_table();

  private:
    std::vector<GasTableEntry> gas_lookup_table;
    std::vector<GasTraceEntry> gas_trace;
};
} // namespace bb::avm_trace