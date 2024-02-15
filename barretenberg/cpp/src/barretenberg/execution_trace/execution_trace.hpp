#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/proof_system/composer/permutation_lib.hpp"
#include "barretenberg/srs/global_crs.hpp"

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

template <class Flavor> class ExecutionTrace_ {
    using Builder = typename Flavor::CircuitBuilder;
    using Polynomial = typename Flavor::Polynomial;
    using FF = typename Flavor::FF;
    using TraceBlock = ExecutionTraceBlock<typename Builder::Selectors>;
    using Wires = std::array<std::vector<uint32_t, bb::ContainerSlabAllocator<uint32_t>>, Builder::NUM_WIRES>;
    using Selectors = typename Builder::Selectors;
    using ProvingKey = typename Flavor::ProvingKey;

  public:
    static constexpr size_t NUM_WIRES = Builder::NUM_WIRES;

    std::array<Polynomial, NUM_WIRES> trace_wires;
    std::array<Polynomial, Builder::Selectors::NUM_SELECTORS> trace_selectors;
    std::vector<CyclicPermutation> trace_copy_cycles;
    Polynomial trace_ecc_op_selector;

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
            for (size_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
                if (wire_idx < 2) { // first two wires get a copy of the PI
                    public_input_wires[wire_idx].emplace_back(idx);
                } else { // remaining wires get zeros
                    public_input_wires[wire_idx].emplace_back(builder.zero_idx);
                }
            }
        }
        TraceBlock public_input_block{ public_input_wires, public_input_selectors, /*is_public_input=*/true };
        trace_blocks.emplace_back(public_input_block);

        // Make a block for the basic wires and selectors
        TraceBlock conventional_block{ builder.wires, builder.selectors };
        trace_blocks.emplace_back(conventional_block);

        return trace_blocks;
    }

    std::shared_ptr<ProvingKey> generate_for_honk(Builder& builder, size_t dyadic_circuit_size)
    {
        auto proving_key = std::make_shared<ProvingKey>(dyadic_circuit_size, builder.public_inputs.size());

        generate_trace_polynomials(builder, dyadic_circuit_size);

        for (auto [pkey_wire, wire] : zip_view(proving_key->get_wires(), trace_wires)) {
            pkey_wire = wire.share();
        }
        for (auto [pkey_selector, selector] : zip_view(proving_key->get_selectors(), trace_selectors)) {
            pkey_selector = selector.share();
        }

        if constexpr (IsGoblinFlavor<Flavor>) {
            proving_key->lagrange_ecc_op = trace_ecc_op_selector.share();
        }

        compute_honk_generalized_sigma_permutations<Flavor>(builder, proving_key.get(), trace_copy_cycles);

        return proving_key;
    }

    std::shared_ptr<ProvingKey> generate_for_plonk(Builder& builder, size_t dyadic_circuit_size)
    {
        auto circuit_type = IsUltraPlonkFlavor<Flavor> ? CircuitType::ULTRA : CircuitType::STANDARD;
        auto crs = srs::get_crs_factory()->get_prover_crs(dyadic_circuit_size + 1);
        auto proving_key =
            std::make_shared<ProvingKey>(dyadic_circuit_size, builder.public_inputs.size(), crs, circuit_type);

        generate_trace_polynomials(builder, dyadic_circuit_size);

        // Move wire polynomials to proving key
        for (size_t idx = 0; idx < trace_wires.size(); ++idx) {
            std::string wire_tag = "w_" + std::to_string(idx + 1) + "_lagrange";
            proving_key->polynomial_store.put(wire_tag, std::move(trace_wires[idx]));
        }
        // Move selector polynomials to proving key
        for (size_t idx = 0; idx < trace_selectors.size(); ++idx) {
            // TODO(Cody): Loose coupling here of selector_names and selector_properties.
            proving_key->polynomial_store.put(builder.selector_names[idx] + "_lagrange",
                                              std::move(trace_selectors[idx]));
        }
        compute_plonk_sigma_permutations<Flavor>(builder, proving_key.get(), trace_copy_cycles);

        return proving_key;
    }

    void generate_trace_polynomials(Builder& builder, size_t dyadic_circuit_size)
    {
        auto trace_blocks = create_execution_trace_blocks(builder);
        info("Num trace blocks = ", trace_blocks.size());

        // WORKTODO: all of this initialization can happen in constructor
        // Initializate the wire polynomials
        for (auto& wire : trace_wires) {
            wire = Polynomial(dyadic_circuit_size);
        }
        // Initializate the selector polynomials
        for (auto& selector : trace_selectors) {
            selector = Polynomial(dyadic_circuit_size);
        }
        // Initialize the vector of copy cycles; these are simply collections of indices into the wire polynomials whose
        // values are copy constrained to be equal. Each variable represents one cycle.
        trace_copy_cycles.resize(builder.variables.size());

        uint32_t offset = 0;
        // For each block in the trace, populate wire polys, copy cycles and selector polys
        for (auto& block : trace_blocks) {
            auto block_size = static_cast<uint32_t>(block.wires[0].size());
            info("block size = ", block_size);

            // Update wire polynomials and copy cycles
            // WORKTODO: order of row/column loops is arbitrary but needs to be row/column to match old copy_cycle code
            for (uint32_t row_idx = 0; row_idx < block_size; ++row_idx) {
                for (uint32_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
                    uint32_t var_idx = block.wires[wire_idx][row_idx]; // an index into the variables array
                    uint32_t real_var_idx = builder.real_variable_index[var_idx];
                    // Insert the real witness values from this block into the wire polys at the correct offset
                    trace_wires[wire_idx][row_idx + offset] = builder.get_variable(var_idx);
                    // Add the address of the witness value to its corresponding copy cycle
                    // WORKTODO: Not adding cycles for wires 3 and 4 here is only needed in order to maintain
                    // consistency with old version. We can remove this special case and the result is simply that all
                    // the zeros in wires 3 and 4 over the PI range are copy constrainted together.
                    if (!(block.is_public_input && wire_idx > 1)) {
                        trace_copy_cycles[real_var_idx].emplace_back(cycle_node{ wire_idx, row_idx + offset });
                    }
                }
            }

            // Insert the selector values for this block into the selector polynomials at the correct offset
            // WORKTODO: comment about coupling of arith and flavor stuff
            for (auto [selector_poly, selector] : zip_view(trace_selectors, block.selectors.get())) {
                for (size_t row_idx = 0; row_idx < block_size; ++row_idx) {
                    selector_poly[row_idx + offset] = selector[row_idx];
                }
            }

            // WORKTODO: this can go away if we just let the goblin op selector be a normal selector. Actually this
            // would be a good test case for the concept of gate blocks.
            if constexpr (IsGoblinFlavor<Flavor>) {
                if (block.is_goblin_op) {
                    trace_ecc_op_selector = Polynomial{ dyadic_circuit_size };
                    for (size_t row_idx = 0; row_idx < block_size; ++row_idx) {
                        trace_ecc_op_selector[row_idx + offset] = 1;
                    }
                }
            }

            offset += block_size;
        }
    }
};

} // namespace bb