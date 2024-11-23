#pragma once

#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/vm/avm/generated/flavor.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/instructions.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"
#include "barretenberg/vm/avm/trace/trace.hpp"

#include <cstddef>
#include <cstdint>
#include <vector>

namespace bb::avm_trace {

class Execution {
  public:
    static constexpr size_t SRS_SIZE = 1 << 22;
    using TraceBuilderConstructor = std::function<AvmTraceBuilder(AvmPublicInputs public_inputs,
                                                                  ExecutionHints execution_hints,
                                                                  uint32_t side_effect_counter,
                                                                  std::vector<FF> calldata)>;

    Execution() = default;

    static std::vector<FF> getDefaultPublicInputs();

    static VmPublicInputs convert_public_inputs(std::vector<FF> const& public_inputs_vec);

    // Bytecode is currently the bytecode of the top-level function call
    // Eventually this will be the bytecode of the dispatch function of top-level contract
    static std::vector<Row> gen_trace(std::vector<FF> const& calldata,
                                      AvmPublicInputs const& new_public_inputs,
                                      std::vector<FF>& returndata,
                                      ExecutionHints const& execution_hints);

    // For testing purposes only.
    static void set_trace_builder_constructor(TraceBuilderConstructor constructor)
    {
        trace_builder_constructor = std::move(constructor);
    }

    static std::tuple<AvmFlavor::VerificationKey, bb::HonkProof> prove(
        std::vector<FF> const& calldata = {},
        AvmPublicInputs const& public_inputs = AvmPublicInputs(),
        ExecutionHints const& execution_hints = {});
    static bool verify(AvmFlavor::VerificationKey vk, HonkProof const& proof);

  private:
    static TraceBuilderConstructor trace_builder_constructor;
};

} // namespace bb::avm_trace
