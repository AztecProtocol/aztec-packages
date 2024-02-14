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

    std::array<Polynomial, Flavor::NUM_WIRES> wire_polynomials_;
    std::array<Polynomial, Builder::Selectors::NUM_SELECTORS> selector_polynomials_;
    std::vector<CyclicPermutation> copy_cycles_;
    Polynomial ecc_op_selector_;

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

        // Make a block for the zero row
        if constexpr (Flavor::has_zero_row) {
            Wires zero_row_wires;
            Selectors zero_row_selectors;
            for (auto& wire : zero_row_wires) {
                wire.emplace_back(0);
            }
            zero_row_selectors.reserve_and_zero(1);
            TraceBlock zero_block{ zero_row_wires, zero_row_selectors };
            trace_blocks.emplace_back(zero_block);
        }

        // Make a block for the ecc op wires
        if constexpr (IsGoblinFlavor<Flavor>) {
            Wires ecc_op_wires = builder.ecc_op_wires;
            Selectors ecc_op_selectors;
            // Note: there is no selector for ecc ops
            ecc_op_selectors.reserve_and_zero(builder.num_ecc_op_gates);
            TraceBlock ecc_op_block{ ecc_op_wires, ecc_op_selectors, /*is_public_input=*/false, /*is_goblin_op=*/true };
            trace_blocks.emplace_back(ecc_op_block);
        }

        // Make a block for the public inputs
        Wires public_input_wires;
        Selectors public_input_selectors;
        public_input_selectors.reserve_and_zero(builder.public_inputs.size());
        for (auto& idx : builder.public_inputs) {
            public_input_wires[0].emplace_back(idx);
            public_input_wires[1].emplace_back(idx);
            public_input_wires[2].emplace_back(builder.zero_idx);
            public_input_wires[3].emplace_back(builder.zero_idx);
        }
        TraceBlock public_input_block{ public_input_wires, public_input_selectors, /*is_public_input=*/true };
        trace_blocks.emplace_back(public_input_block);

        // Make a block for the basic wires and selectors
        TraceBlock conventional_block{ builder.wires, builder.selectors };
        trace_blocks.emplace_back(conventional_block);

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

    std::shared_ptr<ProvingKey> generate(Builder& builder, size_t dyadic_circuit_size)
    {
        // WORKTODO: need to do the finalizing here if we ditch prover instance
        // builder.add_gates_to_ensure_all_polys_are_non_zero();
        // builder.finalize_circuit();
        // Feels like this should just be park of the pkey constructor?
        // compute_circuit_size_parameters(builder);
        auto proving_key = std::make_shared<ProvingKey>(dyadic_circuit_size, builder.public_inputs.size());

        auto trace_blocks = create_execution_trace_blocks(builder);
        info("Num trace blocks = ", trace_blocks.size());

        // Initializate the wire polynomials
        auto wire_polynomials = proving_key->get_wires();
        for (auto wire : wire_polynomials) {
            wire = Polynomial(proving_key->circuit_size);
        }
        // Initializate the selector polynomials
        auto selector_polynomials = proving_key->get_selectors();
        for (auto selector : selector_polynomials) {
            selector = Polynomial(proving_key->circuit_size);
        }
        // Initialize the vector of copy cycles; these are simply collections of indices into the wire polynomials whose
        // values are copy constrained to be equal
        const size_t number_of_cycles = builder.variables.size(); // Each variable represents one cycle
        std::vector<CyclicPermutation> copy_cycles(number_of_cycles);

        uint32_t offset = 0;
        size_t block_num = 0; // debug only
        // For each block in the trace, populate wire polys, copy cycles and selector polys
        for (auto& block : trace_blocks) {
            auto block_size = static_cast<uint32_t>(block.wires[0].size());
            info("block num = ", block_num);
            info("block size = ", block_size);

            // Update wire polynomials and copy cycles
            // WORKTODO: order of row/column loops is arbitrary but needs to be row/column to match old copy_cycle code
            for (uint32_t row_idx = 0; row_idx < block_size; ++row_idx) {
                for (uint32_t wire_idx = 0; wire_idx < Builder::NUM_WIRES; ++wire_idx) {
                    uint32_t var_idx = block.wires[wire_idx][row_idx]; // an index into the variables array
                    uint32_t real_var_idx = builder.real_variable_index[var_idx];
                    // Insert the real witness values from this block into the wire polys at the correct offset
                    wire_polynomials[wire_idx][row_idx + offset] = builder.get_variable(var_idx);
                    // Add the address of the witness value to its corresponding copy cycle
                    // WORKTODO: can we copy constrain the zeros in wires 3 and 4 together and avoud the special case?
                    if (!(block.is_public_input && wire_idx > 1)) {
                        copy_cycles[real_var_idx].emplace_back(cycle_node{ wire_idx, row_idx + offset });
                    }
                }
            }

            // Insert the selector values for this block into the selector polynomials at the correct offset
            // WORKTODO: comment about coupling of arith and flavor stuff
            for (auto [selector_poly, selector] : zip_view(selector_polynomials, block.selectors.get())) {
                for (size_t row_idx = 0; row_idx < block_size; ++row_idx) {
                    selector_poly[row_idx + offset] = selector[row_idx];
                }
            }

            // WORKTODO: this can go away if we just let the goblin op selector be a normal selector. Actually this
            // would be a good test case for the concept of gate blocks.
            if constexpr (IsGoblinFlavor<Flavor>) {
                if (block.is_goblin_op) {
                    Polynomial poly{ proving_key->circuit_size };
                    for (size_t row_idx = 0; row_idx < block_size; ++row_idx) {
                        poly[row_idx + offset] = 1;
                    }
                    proving_key->lagrange_ecc_op = poly.share();
                }
            }

            block_num++;
            offset += block_size;
        }

        // info("NEW: num copy cycles = ", copy_cycles.size());
        // size_t cycle_idx = 0;
        // for (auto& cycle : copy_cycles) {
        //     info("cycle_idx = ", cycle_idx);
        //     info("cycle length = ", cycle.size());
        //     if (!cycle.empty()) {
        //         info("value = ", wire_polynomials[cycle[0].wire_index][cycle[0].gate_index]);
        //     }
        //     for (auto& node : cycle) {
        //         info("node.wire_index = ", node.wire_index);
        //         info("node.gate_index = ", node.gate_index);
        //     }
        //     cycle_idx++;
        // }

        compute_honk_generalized_sigma_permutations<Flavor>(builder, proving_key.get(), copy_cycles);

        return proving_key;
    }

    std::shared_ptr<ProvingKey> generate_for_honk(Builder& builder, size_t dyadic_circuit_size)
    {
        auto proving_key = std::make_shared<ProvingKey>(dyadic_circuit_size, builder.public_inputs.size());

        generate_trace_polynomials(builder, dyadic_circuit_size);

        info("proving_key->get_wires().size() = ", proving_key->get_wires().size());
        info("wire_polynomials_.size() = ", wire_polynomials_.size());
        // WORKTODO: this diff size issue goes away once adam fixes the get_wires bug
        for (auto [pkey_wire, wire] :
             zip_view(ZipAllowDifferentSizes::FLAG, proving_key->get_wires(), wire_polynomials_)) {
            pkey_wire = wire.share();
        }
        for (auto [pkey_selector, selector] : zip_view(proving_key->get_selectors(), selector_polynomials_)) {
            pkey_selector = selector.share();
        }

        if constexpr (IsGoblinFlavor<Flavor>) {
            proving_key->lagrange_ecc_op = ecc_op_selector_.share();
        }

        compute_honk_generalized_sigma_permutations<Flavor>(builder, proving_key.get(), copy_cycles_);

        return proving_key;
    }

    void generate_trace_polynomials(Builder& builder, size_t dyadic_circuit_size)
    {
        auto trace_blocks = create_execution_trace_blocks(builder);
        info("Num trace blocks = ", trace_blocks.size());

        // WORKTODO: all of this initialization can happen in constructor
        // Initializate the wire polynomials
        for (auto& wire : wire_polynomials_) {
            wire = Polynomial(dyadic_circuit_size);
        }
        // Initializate the selector polynomials
        for (auto& selector : selector_polynomials_) {
            selector = Polynomial(dyadic_circuit_size);
        }
        // Initialize the vector of copy cycles; these are simply collections of indices into the wire polynomials whose
        // values are copy constrained to be equal. Each variable represents one cycle.
        copy_cycles_.resize(builder.variables.size());

        uint32_t offset = 0;
        size_t block_num = 0; // debug only
        // For each block in the trace, populate wire polys, copy cycles and selector polys
        for (auto& block : trace_blocks) {
            auto block_size = static_cast<uint32_t>(block.wires[0].size());
            info("block num = ", block_num);
            info("block size = ", block_size);

            // Update wire polynomials and copy cycles
            // WORKTODO: order of row/column loops is arbitrary but needs to be row/column to match old copy_cycle code
            for (uint32_t row_idx = 0; row_idx < block_size; ++row_idx) {
                for (uint32_t wire_idx = 0; wire_idx < Builder::NUM_WIRES; ++wire_idx) {
                    uint32_t var_idx = block.wires[wire_idx][row_idx]; // an index into the variables array
                    uint32_t real_var_idx = builder.real_variable_index[var_idx];
                    // Insert the real witness values from this block into the wire polys at the correct offset
                    wire_polynomials_[wire_idx][row_idx + offset] = builder.get_variable(var_idx);
                    // Add the address of the witness value to its corresponding copy cycle
                    // WORKTODO: can we copy constrain the zeros in wires 3 and 4 together and avoud the special case?
                    if (!(block.is_public_input && wire_idx > 1)) {
                        copy_cycles_[real_var_idx].emplace_back(cycle_node{ wire_idx, row_idx + offset });
                    }
                }
            }

            // Insert the selector values for this block into the selector polynomials at the correct offset
            // WORKTODO: comment about coupling of arith and flavor stuff
            for (auto [selector_poly, selector] : zip_view(selector_polynomials_, block.selectors.get())) {
                for (size_t row_idx = 0; row_idx < block_size; ++row_idx) {
                    selector_poly[row_idx + offset] = selector[row_idx];
                }
            }

            // WORKTODO: this can go away if we just let the goblin op selector be a normal selector. Actually this
            // would be a good test case for the concept of gate blocks.
            if constexpr (IsGoblinFlavor<Flavor>) {
                if (block.is_goblin_op) {
                    ecc_op_selector_ = Polynomial{ dyadic_circuit_size };
                    for (size_t row_idx = 0; row_idx < block_size; ++row_idx) {
                        ecc_op_selector_[row_idx + offset] = 1;
                    }
                }
            }

            block_num++;
            offset += block_size;
        }
    }
};

} // namespace bb