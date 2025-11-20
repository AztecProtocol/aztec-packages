#pragma once

#include <vector>

#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

using CalldataProvider = std::function<std::vector<FF>(uint32_t max_size)>;
using ReturnDataProvider = std::function<std::vector<FF>(uint32_t max_size)>;
using InternalCallStackProvider = std::function<std::vector<PC>()>;

class CallStackMetadataCollectorInterface {
  public:
    virtual ~CallStackMetadataCollectorInterface() = default;

    virtual void set_phase(CoarseTransactionPhase phase) = 0;
    virtual void notify_enter_call(const AztecAddress& contract_address,
                                   uint32_t caller_pc,
                                   const CalldataProvider& calldata_provider,
                                   bool is_static_call,
                                   const Gas& gas_limit) = 0;
    virtual void notify_exit_call(bool success,
                                  uint32_t pc,
                                  const std::optional<std::string>& halting_message,
                                  const ReturnDataProvider& return_data_provider,
                                  const InternalCallStackProvider& internal_call_stack_provider) = 0;
    virtual std::vector<CallStackMetadata> dump_call_stack_metadata() = 0;
};

} // namespace bb::avm2::simulation
