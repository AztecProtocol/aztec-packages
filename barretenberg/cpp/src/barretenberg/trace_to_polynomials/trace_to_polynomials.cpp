// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "trace_to_polynomials.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ext/starknet/flavor/ultra_starknet_flavor.hpp"
#include "barretenberg/ext/starknet/flavor/ultra_starknet_zk_flavor.hpp"

#include "barretenberg/flavor/mega_app_flavor.hpp"
#include "barretenberg/flavor/mega_avm_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
namespace bb {

template <class Flavor>
void TraceToPolynomials<Flavor>::populate(Builder& builder, typename Flavor::ProverPolynomials& polynomials)
{

    BB_BENCH_NAME("trace populate");

    auto copy_cycles = populate_wires_and_selectors_and_compute_copy_cycles(builder, polynomials);

    if constexpr (Flavor::HasEccOpQueue) {
        BB_BENCH_NAME("add_ecc_op_wires_to_prover_instance");

        add_ecc_op_wires_to_prover_instance(builder, polynomials);
    }

    // Compute the permutation argument polynomials (sigma/id) and add them to proving key
    {
        BB_BENCH_NAME("compute_permutation_argument_polynomials");

        compute_permutation_argument_polynomials<Flavor>(builder, polynomials, copy_cycles);
    }
}

template <class Flavor>
std::vector<CyclicPermutation> TraceToPolynomials<Flavor>::populate_wires_and_selectors_and_compute_copy_cycles(
    Builder& builder, ProverPolynomials& polynomials)
{

    BB_BENCH_NAME("construct_trace_data");

    std::vector<CyclicPermutation> copy_cycles;
    copy_cycles.resize(builder.get_num_variables()); // at most one copy cycle per variable

    RefArray<Polynomial, NUM_WIRES> wires = polynomials.get_wires();
    auto selectors = polynomials.get_selectors();

    // Two-phase parallelisation. Phase 1 fans out over blocks to populate wires and emit copy-cycle
    // nodes; phase 2 fans out over a flattened (block, selector) task list to fill selectors.
    auto blocks_array = builder.blocks.get();
    const size_t num_blocks = blocks_array.size();

    // Pre-pass: count copy-cycle sizes per real-variable index so each copy_cycles[i] can be
    // reserve()d once before the serial concat in phase 1.5, avoiding repeated reallocations.
    {
        BB_BENCH_NAME("counting copy_cycles");
        std::vector<uint32_t> cycle_counts(builder.real_variable_index.size(), 0);
        for (auto& block : blocks_array) {
            const uint32_t block_size = static_cast<uint32_t>(block.size());
            for (uint32_t block_row_idx = 0; block_row_idx < block_size; ++block_row_idx) {
                for (uint32_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
                    uint32_t var_idx = block.wires[wire_idx][block_row_idx];
                    // var_idx may be untrusted (e.g. from ACIR) so use .at() to catch OOB. This validates real_var_idx
                    // as an in-range index for both cycle_counts and copy_cycles (same size), which is why phase 1.5
                    // below can index copy_cycles[real_var_idx] without .at().
                    ++cycle_counts.at(builder.real_variable_index.at(var_idx));
                }
            }
        }
        for (size_t i = 0; i < copy_cycles.size(); ++i) {
            copy_cycles[i].reserve(cycle_counts[i]);
        }
    }

    // Phase 1: per-block parallel pass over wires and emit copy-cycle nodes.
    std::vector<std::vector<std::pair<uint32_t, cycle_node>>> per_block_nodes(num_blocks);
    {
        BB_BENCH_NAME("populate_wires_and_emit_cycles");
        parallel_for(num_blocks, [&](size_t block_idx) {
            auto& block = blocks_array[block_idx];
            const uint32_t offset = block.trace_offset();
            const uint32_t block_size = static_cast<uint32_t>(block.size());
            auto& local_nodes = per_block_nodes[block_idx];
            local_nodes.reserve(static_cast<size_t>(block_size) * NUM_WIRES);

            // NB: The order of row/column loops is arbitrary but needs to be row/column to match old copy_cycle code.
            for (uint32_t block_row_idx = 0; block_row_idx < block_size; ++block_row_idx) {
                for (uint32_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
                    uint32_t var_idx = block.wires[wire_idx][block_row_idx]; // an index into the variables array
                    // Use .at() so out-of-range var_idx is caught instead of producing a silent OOB read.
                    uint32_t real_var_idx = builder.real_variable_index.at(var_idx);
                    uint32_t trace_row_idx = block_row_idx + offset;
                    // Insert the real witness values from this block into the wire polys at the correct offset
                    wires[wire_idx].at(trace_row_idx) = builder.get_variable(var_idx);
                    local_nodes.emplace_back(real_var_idx, cycle_node{ wire_idx, trace_row_idx });
                }
            }
        });
    }

    // Phase 1.5: Serial concat in block order to preserve cycle-node ordering within each variable's cycle list.
    {
        BB_BENCH_NAME("fill_copy_cycles");
        for (const auto& block_nodes : per_block_nodes) {
            for (const auto& [real_var_idx, node] : block_nodes) {
                copy_cycles[real_var_idx].emplace_back(node);
            }
        }
    }

    // Phase 2: parallel selector filling across a flattened task list.
    // Non-gate selectors (q_m/q_c/q_l/q_r/q_o/q_4/q_5) come from every block via codegen-emitted
    // `get_block_non_gate_selectors(block)`. Gate selectors come from the codegen's
    // `get_gate_blocks(blocks)` × `GATE_KINDS` parallel arrays — one task per flavor gate
    // selector, sourced from the unique block that owns the matching `GateKind`.
    {
        BB_BENCH_NAME("populate_selectors");
        struct SelectorTask {
            Selector<FF>* source;
            size_t target_poly_idx;
            uint32_t trace_offset;
            uint32_t block_size;
        };

        const auto& polynomials_ref = polynomials;
        const size_t num_non_gate = polynomials_ref.get_non_gate_selectors().size();

        std::vector<SelectorTask> selector_tasks;
        for (auto& block : blocks_array) {
            const uint32_t offset = block.trace_offset();
            const uint32_t block_size = static_cast<uint32_t>(block.size());
            auto non_gate = Flavor::Generated::get_block_non_gate_selectors(block);
            for (size_t i = 0; i < non_gate.size(); ++i) {
                selector_tasks.emplace_back(SelectorTask{ &non_gate[i], i, offset, block_size });
            }
        }

        auto gate_blocks = Flavor::Generated::get_gate_blocks(builder.blocks);
        constexpr auto& gate_kinds = Flavor::Generated::GATE_KINDS;
        for (size_t i = 0; i < gate_kinds.size(); ++i) {
            auto& block = gate_blocks[i];
            selector_tasks.emplace_back(SelectorTask{ &block.gate_selector_for(gate_kinds[i]),
                                                      num_non_gate + i,
                                                      block.trace_offset(),
                                                      static_cast<uint32_t>(block.size()) });
        }

        parallel_for(selector_tasks.size(), [&](size_t task_idx) {
            const auto& task = selector_tasks[task_idx];
            const auto& source = *task.source;
            for (uint32_t row_idx = 0; row_idx < task.block_size; ++row_idx) {
                selectors[task.target_poly_idx].set_if_valid_index(row_idx + task.trace_offset, source[row_idx]);
            }
        });
    }

    return copy_cycles;
}

template <class Flavor>
void TraceToPolynomials<Flavor>::add_ecc_op_wires_to_prover_instance(Builder& builder, ProverPolynomials& polynomials)
    requires Flavor::HasEccOpQueue
{
    auto& ecc_op_selector = polynomials.lagrange_ecc_op();

    // The EccOpQueueRelation constrains ecc_op_wire[row] == w_shift[row] where lagrange_ecc_op == 1;
    // equivalently, ecc_op_wire[row] == w[row + NUM_ZERO_ROWS], so we write ecc_op_wire starting at
    // (ecc_op_block.trace_offset() - NUM_ZERO_ROWS).
    const auto& ecc_op_block = builder.blocks.ecc_op;
    const size_t wire_start = ecc_op_block.trace_offset();
    BB_ASSERT_GTE(wire_start, NUM_ZERO_ROWS, "ecc_op block must start beyond the zero row");
    const size_t op_wire_start = wire_start - NUM_ZERO_ROWS;
    for (auto [ecc_op_wire, wire] : zip_view(polynomials.get_ecc_op_wires(), polynomials.get_wires())) {
        for (size_t i = 0; i < ecc_op_block.size(); ++i) {
            ecc_op_wire.at(op_wire_start + i) = wire[wire_start + i];
            ecc_op_selector.at(op_wire_start + i) = 1;
        }
    }
}

template class TraceToPolynomials<UltraFlavor>;
template class TraceToPolynomials<UltraZKFlavor>;
template class TraceToPolynomials<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
template class TraceToPolynomials<UltraStarknetFlavor>;
template class TraceToPolynomials<UltraStarknetZKFlavor>;
#endif
template class TraceToPolynomials<UltraKeccakZKFlavor>;
template class TraceToPolynomials<MegaFlavor>;
template class TraceToPolynomials<MegaZKFlavor>;
template class TraceToPolynomials<MegaAvmFlavor>;
template class TraceToPolynomials<MegaAppFlavor>;
template class TraceToPolynomials<MegaKernelFlavor>;

} // namespace bb
