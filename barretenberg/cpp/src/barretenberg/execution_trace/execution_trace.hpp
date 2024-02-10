#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/proof_system/composer/permutation_lib.hpp"

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
    bool is_public_input = false;
    bool is_goblin_op = false;
};

template <IsUltraFlavor Flavor> class ExecutionTrace_ {
    using Builder = typename Flavor::CircuitBuilder;
    using Polynomial = typename Flavor::Polynomial;
    using FF = typename Flavor::FF;
    using TraceBlock = ExecutionTraceBlock<typename Builder::Selectors>;
    using Wires = std::array<std::vector<uint32_t, bb::ContainerSlabAllocator<uint32_t>>, Builder::NUM_WIRES>;
    using Selectors = typename Builder::Selectors;
    using ProvingKey = typename Flavor::ProvingKey;

  public:
    static constexpr size_t num_zero_rows = Flavor::has_zero_row ? 1 : 0;
    static constexpr size_t NUM_WIRES = Builder::NUM_WIRES;
    size_t total_num_gates = 0; // num_gates + num_pub_inputs + tables + zero_row_offset (used to compute dyadic size)
    size_t dyadic_circuit_size = 0; // final power-of-2 circuit size
    size_t lookups_size = 0;        // total number of lookup gates
    size_t tables_size = 0;         // total number of table entries
    size_t num_public_inputs = 0;
    size_t num_ecc_op_gates = 0;

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
        if constexpr (IsGoblinFlavor<Flavor>) {
            Wires ecc_op_wires = builder.ecc_op_wires;
            Selectors ecc_op_selectors;
            // Note: there is no selector for ecc ops
            ecc_op_selectors.reserve_and_zero(builder.num_ecc_op_gates);
            TraceBlock ecc_op_gates{ ecc_op_wires, ecc_op_selectors };
            trace_blocks.emplace_back(ecc_op_gates);
        }

        // Construct trace
        trace_blocks.emplace_back(zero_row);
        trace_blocks.emplace_back(public_inputs);
        trace_blocks.emplace_back(conventional_gates);

        return trace_blocks;
    }

    void compute_circuit_size_parameters(Builder& circuit)
    {
        // Compute total length of the tables and the number of lookup gates; their sum is the minimum circuit size
        for (const auto& table : circuit.lookup_tables) {
            tables_size += table.size;
            lookups_size += table.lookup_gates.size();
        }

        // Get num conventional gates, num public inputs and num Goblin style ECC op gates
        const size_t num_gates = circuit.num_gates;
        num_public_inputs = circuit.public_inputs.size();
        num_ecc_op_gates = 0;
        if constexpr (IsGoblinFlavor<Flavor>) {
            num_ecc_op_gates = circuit.num_ecc_op_gates;
        }

        // minimum circuit size due to the length of lookups plus tables
        const size_t minimum_circuit_size_due_to_lookups = tables_size + lookups_size + num_zero_rows;

        // number of populated rows in the execution trace
        size_t num_rows_populated_in_execution_trace = num_zero_rows + num_ecc_op_gates + num_public_inputs + num_gates;

        // The number of gates is max(lookup gates + tables, rows already populated in trace) + 1, where the +1 is due
        // to addition of a "zero row" at top of the execution trace to ensure wires and other polys are shiftable.
        total_num_gates = std::max(minimum_circuit_size_due_to_lookups, num_rows_populated_in_execution_trace);

        // Next power of 2
        dyadic_circuit_size = circuit.get_circuit_subgroup_size(total_num_gates);
    }

    std::shared_ptr<ProvingKey> generate(Builder& builder)
    {
        // WORKTODO: need some kind of finalize here to init PK with proper circuit size
        // Feels like this should just be park of the pkey constructor?
        compute_circuit_size_parameters(builder);
        auto proving_key = std::make_shared<ProvingKey>(dyadic_circuit_size, num_public_inputs);

        auto trace_blocks = create_execution_trace_blocks(builder);

        // Initialization of some stuff
        auto wire_polynomials = proving_key->get_wires();
        const size_t number_of_cycles = builder.variables.size(); // Each variable represents one cycle
        std::vector<CyclicPermutation> copy_cycles(number_of_cycles);

        uint32_t offset = 0;
        // For each block in the trace, populate wire polys, copy cycles and selector polys
        for (auto& block : trace_blocks) {
            size_t block_size = block.wires[0].size();

            // Update wire polynomials and copy cycles
            for (uint32_t wire_idx = 0; wire_idx < Builder::NUM_WIRES; ++wire_idx) {
                for (uint32_t row_idx = 0; row_idx < block_size; ++row_idx) {
                    uint32_t wire_val = block.wires[wire_idx][row_idx];
                    uint32_t var_index = builder.real_variable_index[wire_val];

                    wire_polynomials[wire_idx][row_idx + offset] = builder.get_variable(wire_val);
                    copy_cycles[var_index].emplace_back(cycle_node{ wire_idx, row_idx + offset });
                }
            }

            // Update selector polynomials
            // WORKTODO: can we just set the values of the polys in the key directly?
            for (auto [poly, selector_values] : zip_view(ZipAllowDifferentSizes::FLAG,
                                                         proving_key->get_precomputed_polynomials(),
                                                         builder.selectors.get())) {
                Polynomial selector_poly_lagrange(proving_key->circuit_size);
                for (size_t row_idx = 0; row_idx < selector_values.size(); ++row_idx) {
                    selector_poly_lagrange[row_idx + offset] = selector_values[row_idx];
                }
                poly = selector_poly_lagrange.share();
            }

            offset += block_size;
        }

        // compute_honk_generalized_sigma_permutations(builder, proving_key, copy_cycles);

        return proving_key;
    }
};

} // namespace bb