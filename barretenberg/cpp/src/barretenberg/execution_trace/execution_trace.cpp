#include "execution_trace.hpp"
#include "barretenberg/flavor/goblin_ultra.hpp"
#include "barretenberg/flavor/plonk_flavors.hpp"
#include "barretenberg/flavor/ultra.hpp"
namespace bb {

template <class Flavor>
std::shared_ptr<typename Flavor::ProvingKey> ExecutionTrace_<Flavor>::generate(Builder& builder,
                                                                               size_t dyadic_circuit_size)
{
    auto trace_data = generate_trace_polynomials(builder, dyadic_circuit_size);

    if constexpr (IsHonkFlavor<Flavor>) {
        return generate_honk_proving_key(trace_data, builder, dyadic_circuit_size);
    } else if constexpr (IsPlonkFlavor<Flavor>) {
        return generate_plonk_proving_key(trace_data, builder, dyadic_circuit_size);
    }
}

template <class Flavor>
std::shared_ptr<typename Flavor::ProvingKey> ExecutionTrace_<Flavor>::generate_honk_proving_key(
    TraceData& trace_data, Builder& builder, size_t dyadic_circuit_size)
    requires IsUltraFlavor<Flavor>
{
    auto proving_key = std::make_shared<ProvingKey>(dyadic_circuit_size, builder.public_inputs.size());

    for (auto [pkey_wire, trace_wire] : zip_view(proving_key->get_wires(), trace_data.wires)) {
        pkey_wire = std::move(trace_wire);
    }
    for (auto [pkey_selector, trace_selector] : zip_view(proving_key->get_selectors(), trace_data.selectors)) {
        pkey_selector = std::move(trace_selector);
    }
    if constexpr (IsGoblinFlavor<Flavor>) {
        proving_key->lagrange_ecc_op = std::move(trace_data.ecc_op_selector);
    }
    compute_permutation_argument_polynomials<Flavor>(builder, proving_key.get(), trace_data.copy_cycles);

    return proving_key;
}

template <class Flavor>
std::shared_ptr<typename Flavor::ProvingKey> ExecutionTrace_<Flavor>::generate_plonk_proving_key(
    TraceData& trace_data, Builder& builder, size_t dyadic_circuit_size)
    requires IsPlonkFlavor<Flavor>
{
    auto circuit_type = IsUltraPlonkFlavor<Flavor> ? CircuitType::ULTRA : CircuitType::STANDARD;
    auto crs = srs::get_crs_factory()->get_prover_crs(dyadic_circuit_size + 1);
    auto proving_key =
        std::make_shared<ProvingKey>(dyadic_circuit_size, builder.public_inputs.size(), crs, circuit_type);

    // Move wire polynomials to proving key
    for (size_t idx = 0; idx < trace_data.wires.size(); ++idx) {
        std::string wire_tag = "w_" + std::to_string(idx + 1) + "_lagrange";
        proving_key->polynomial_store.put(wire_tag, std::move(trace_data.wires[idx]));
    }
    // Move selector polynomials to proving key
    for (size_t idx = 0; idx < trace_data.selectors.size(); ++idx) {
        // TODO(Cody): Loose coupling here of selector_names and selector_properties.
        proving_key->polynomial_store.put(builder.selector_names[idx] + "_lagrange",
                                          std::move(trace_data.selectors[idx]));
    }
    compute_permutation_argument_polynomials<Flavor>(builder, proving_key.get(), trace_data.copy_cycles);

    return proving_key;
}

template <class Flavor>
ExecutionTrace_<Flavor>::TraceData ExecutionTrace_<Flavor>::generate_trace_polynomials(Builder& builder,
                                                                                       size_t dyadic_circuit_size)
{
    TraceData trace_data{ dyadic_circuit_size, builder };

    auto trace_blocks = create_execution_trace_blocks(builder);

    uint32_t offset = 0; // Track offset at which to place each block in the trace polynomials
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
                trace_data.wires[wire_idx][row_idx + offset] = builder.get_variable(var_idx);
                // Add the address of the witness value to its corresponding copy cycle
                // WORKTODO: Not adding cycles for wires 3 and 4 here is only needed in order to maintain
                // consistency with old version. We can remove this special case and the result is simply that all
                // the zeros in wires 3 and 4 over the PI range are copy constrained together.
                if (!(block.is_public_input && wire_idx > 1)) {
                    trace_data.copy_cycles[real_var_idx].emplace_back(cycle_node{ wire_idx, row_idx + offset });
                }
            }
        }

        // Insert the selector values for this block into the selector polynomials at the correct offset
        // WORKTODO: comment about coupling of arith and flavor stuff
        for (auto [selector_poly, selector] : zip_view(trace_data.selectors, block.selectors.get())) {
            for (size_t row_idx = 0; row_idx < block_size; ++row_idx) {
                selector_poly[row_idx + offset] = selector[row_idx];
            }
        }

        // WORKTODO: this can go away if we just let the goblin op selector be a normal selector. Actually this
        // would be a good test case for the concept of gate blocks.
        if constexpr (IsGoblinFlavor<Flavor>) {
            if (block.is_goblin_op) {
                trace_data.ecc_op_selector = Polynomial{ dyadic_circuit_size };
                for (size_t row_idx = 0; row_idx < block_size; ++row_idx) {
                    trace_data.ecc_op_selector[row_idx + offset] = 1;
                }
            }
        }

        offset += block_size;
    }
    return trace_data;
}

template <class Flavor>
std::vector<typename ExecutionTrace_<Flavor>::TraceBlock> ExecutionTrace_<Flavor>::create_execution_trace_blocks(
    Builder& builder)
{
    std::vector<TraceBlock> trace_blocks;

    // Make a block for the zero row
    if constexpr (Flavor::has_zero_row) {
        Wires zero_row_wires;
        Selectors zero_row_selectors;
        for (auto& wire : zero_row_wires) {
            wire.emplace_back(builder.zero_idx);
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

template class ExecutionTrace_<UltraFlavor>;
template class ExecutionTrace_<GoblinUltraFlavor>;
template class ExecutionTrace_<plonk::flavor::Standard>;
template class ExecutionTrace_<plonk::flavor::Ultra>;

} // namespace bb