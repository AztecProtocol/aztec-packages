
#include "avm_common.hpp"
#include "barretenberg/vm/avm_trace/avm_opcode.hpp"

namespace bb::avm_trace {

class AvmGasTraceBuilder {
  public:
    struct GasTableEntry {
        uint32_t opcode_val = 0;
        uint32_t l2_fixed_gas_cost = 0;
        uint32_t da_fixed_gas_cost = 0;
    };

    struct GasTraceEntry {
        uint32_t clk = 0;
        uint32_t opcode_val = 0;
        uint32_t l2_gas_cost = 0;
        uint32_t da_gas_cost = 0;
        uint32_t remaining_l2_gas = 0;
        uint32_t remaining_da_gas = 0;
    };

    // Counts each time an opcode is read
    // opcode_val -> count
    std::unordered_map<uint32_t, uint32_t> gas_opcode_lookup_counter;

    // Constructor receives copy of kernel_inputs from the main trace builder
    AvmGasTraceBuilder();

    void reset();
    std::vector<GasTraceEntry> finalize();

    void constrain_gas_lookup(uint32_t clk, OpCode opcode);
    void set_initial_gas(uint32_t l2_gas, uint32_t da_gas);

    // TODO: make getters?
    std::vector<GasTableEntry> gas_lookup_table;
    std::vector<GasTraceEntry> gas_trace;

    uint32_t initial_l2_gas = 0;
    uint32_t initial_da_gas = 0;

  private:
    std::vector<GasTableEntry> construct_gas_lookup_table();

    uint32_t remaining_l2_gas = 0;
    uint32_t reamining_da_gas = 0;
};
} // namespace bb::avm_trace