#pragma once
#include "barretenberg/flavor/flavor.hpp"

namespace bb {

/**
 * @brief The wires and selectors used to define a block in the execution trace
 *
 * @tparam Arithmetization The set of selectors corresponding to the arithmetization
 */
template <class Arithmetization> struct ExecutionTraceBlock {
    using Wires = std::array<std::vector<uint32_t, bb::ContainerSlabAllocator<uint32_t>>, Arithmetization::NUM_WIRES>;
    Wires wires;
    Arithmetization selectors;
};

template <IsUltraFlavor Flavor> class ExecutionTrace_ {
    using Builder = typename Flavor::CircuitBuilder;
    using TraceBlock = ExecutionTraceBlock<typename Builder::Selectors>;
    using Wires = std::array<std::vector<uint32_t, bb::ContainerSlabAllocator<uint32_t>>, Builder::NUM_WIRES>;
    using Selectors = typename Builder::Selectors;

  public:
    /**
     * @brief Temporary helper method to construct execution trace blocks from existing builder structures
     * @details Eventually the builder will construct blocks directly
     *
     * @param builder
     * @return std::vector<TraceBlock>
     */
    std::vector<TraceBlock> create_execution_trace_blocks(Builder& builder)
    {
        std::vector<TraceBlock> trace_blocks;

        // Make a block for the basic wires and selectors
        TraceBlock conventional_gates{ builder.wires, builder.selectors };

        // Make a block for the public inputs
        Wires public_input_wires;
        Selectors public_input_selectors;
        for (auto& idx : builder.public_inputs) {
            public_input_wires[0].emplace_back(idx);
            public_input_wires[1].emplace_back(idx);
            public_input_wires[2].emplace_back(builder.zero_idx);
            public_input_wires[3].emplace_back(builder.zero_idx);
        }
        public_input_selectors.reserve_and_zero(builder.public_inputs.size());
        TraceBlock public_inputs{ public_input_wires, public_input_selectors };

        // Make a block for the zero row
        Wires zero_row_wires;
        Selectors zero_row_selectors;
        if constexpr (Flavor::has_zero_row) {
            for (auto& wire : zero_row_wires) {
                wire.emplace_back(0);
            }
            zero_row_selectors.reserve_and_zero(1);
        }
        TraceBlock zero_row{ zero_row_wires, zero_row_selectors };

        // Make a block for the ecc op wires
        Wires ecc_op_wires = builder.ecc_op_wires;
        Selectors ecc_op_selectors;
        // Note: there is no selector for ecc ops
        ecc_op_selectors.reserve_and_zero(builder.num_ecc_op_gates);
        TraceBlock ecc_op_gates{ ecc_op_wires, ecc_op_selectors };

        // Construct trace
        trace_blocks.emplace_back(zero_row);
        trace_blocks.emplace_back(ecc_op_gates);
        trace_blocks.emplace_back(public_inputs);
        trace_blocks.emplace_back(conventional_gates);

        return trace_blocks;
    }
};

} // namespace bb