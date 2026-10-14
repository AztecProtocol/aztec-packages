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
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include <atomic>

namespace bb {

template <class Flavor>
void TraceToPolynomials<Flavor>::populate(Builder& builder,
                                          typename Flavor::ProverPolynomials& polynomials,
                                          CopiedCircuitData copied_circuit_data)
{

    BB_BENCH_NAME("trace populate");

    auto copy_cycles = populate_wires_and_selectors_and_compute_copy_cycles(builder, polynomials, copied_circuit_data);

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
CopyCycles TraceToPolynomials<Flavor>::populate_wires_and_selectors_and_compute_copy_cycles(
    Builder& builder, ProverPolynomials& polynomials, CopiedCircuitData copied_circuit_data)
{

    BB_BENCH_NAME("construct_trace_data");

    CopyCycles copy_cycles; // at most one copy cycle per variable

    RefArray<Polynomial, NUM_WIRES> wires = polynomials.get_wires();
    auto selectors = polynomials.get_selectors();

    // Two-phase parallelisation. Phase 1 fans out over a flattened (block, selector) task list to fill selectors;
    // phase 2 fans out over row chunks of all blocks to populate wires and record copy-cycle cells.
    auto blocks_array = builder.blocks.get();
    const size_t num_blocks = blocks_array.size();

    // Phase 1: parallel selector filling across a flattened task list. It runs before the wire pass so that the wire
    // pass can release each block's gate data once it is done with it.
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
            auto& poly = selectors[task.target_poly_idx];
            // Bulk-copy the range that lands inside the polynomial's backing store (tile-wise, no
            // per-element virtual call); rows clamped off by the store bounds would previously have
            // been dropped by set_if_valid_index and must be zero.
            const size_t dst_begin = std::max<size_t>(task.trace_offset, poly.start_index());
            const size_t dst_end = std::min<size_t>(task.trace_offset + task.block_size, poly.end_index());
            if (dst_begin < dst_end) {
                source.copy_into(&poly.at(dst_begin), dst_begin - task.trace_offset, dst_end - dst_begin);
            }
        });
    }

    // Wire cells are laid out flat in (block, row, wire) order; cell_offsets[b] is the first cell of block b. This is
    // the order in which nodes are appended to each variable's copy cycle.
    const size_t num_cycles = builder.get_num_variables();
    std::vector<size_t> cell_offsets(num_blocks + 1, 0);
    for (size_t block_idx = 0; block_idx < num_blocks; ++block_idx) {
        cell_offsets[block_idx + 1] = cell_offsets[block_idx] + blocks_array[block_idx].size() * NUM_WIRES;
    }
    // The real variable index of every wire cell.
    std::vector<uint32_t> cell_real_var_idx(cell_offsets[num_blocks]);

    // Phase 2: populate the wires and record each cell's real variable index, in parallel over row chunks of all
    // blocks (the blocks differ greatly in size). With CopiedCircuitData::RELEASE, the task that finishes a block's
    // last chunk frees the block's gate data: the copy-cycle phases below read only the recorded cells and the blocks'
    // offsets and sizes.
    {
        BB_BENCH_NAME("populate_wires_and_emit_cycles");
        constexpr uint32_t ROWS_PER_TASK = 1 << 12;
        struct RowTask {
            size_t block_idx;
            uint32_t row_begin;
            uint32_t row_end;
        };
        std::vector<RowTask> row_tasks;
        for (size_t block_idx = 0; block_idx < num_blocks; ++block_idx) {
            const uint32_t block_size = static_cast<uint32_t>(blocks_array[block_idx].size());
            for (uint32_t row_begin = 0; row_begin < block_size; row_begin += ROWS_PER_TASK) {
                row_tasks.push_back({ block_idx, row_begin, std::min(row_begin + ROWS_PER_TASK, block_size) });
            }
        }
        std::vector<std::atomic<uint32_t>> chunks_left(num_blocks);
        for (const RowTask& task : row_tasks) {
            chunks_left[task.block_idx].fetch_add(1, std::memory_order_relaxed);
        }
        parallel_for(row_tasks.size(), [&](size_t task_idx) {
            const RowTask& task = row_tasks[task_idx];
            auto& block = blocks_array[task.block_idx];
            const uint32_t offset = block.trace_offset();
            uint32_t* cell = &cell_real_var_idx[cell_offsets[task.block_idx] + (task.row_begin * NUM_WIRES)];
            for (uint32_t block_row_idx = task.row_begin; block_row_idx < task.row_end; ++block_row_idx) {
                for (uint32_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
                    uint32_t var_idx = block.wires[wire_idx][block_row_idx]; // an index into the variables array
                    // var_idx may be untrusted (e.g. from ACIR): use .at() so an out-of-range var_idx is caught
                    // instead of producing a silent OOB read, and check that the real index has a copy cycle.
                    uint32_t real_var_idx = builder.real_variable_index.at(var_idx);
                    if (real_var_idx >= num_cycles) {
                        throw_or_abort("TraceToPolynomials: real variable index out of range");
                    }
                    uint32_t trace_row_idx = block_row_idx + offset;
                    // Insert the real witness values from this block into the wire polys at the correct offset
                    wires[wire_idx].at(trace_row_idx) = builder.get_variable(var_idx);
                    *cell++ = real_var_idx;
                }
            }
            if (copied_circuit_data == CopiedCircuitData::RELEASE &&
                chunks_left[task.block_idx].fetch_sub(1, std::memory_order_acq_rel) == 1) {
                block.free_data();
            }
        });
    }

    // Phases 2.5 and 2.6 split the variables into one contiguous range per thread. Each thread scans all cells in
    // order and handles only its own variables, so every copy cycle is counted and filled by one thread, in cell order.
    {
        BB_BENCH_NAME("counting copy_cycles");
        // Count copy-cycle sizes per real variable, then take the exclusive prefix sum to get the CSR offsets; a
        // single flat node array replaces one heap-allocated vector per variable.
        copy_cycles.offsets.assign(num_cycles + 1, 0);
        parallel_for([&](const ThreadChunk& chunk) {
            const auto vars = chunk.range(num_cycles);
            if (vars.empty()) {
                return;
            }
            const uint32_t var_begin = static_cast<uint32_t>(vars.front());
            const uint32_t num_vars = static_cast<uint32_t>(vars.size());
            for (const uint32_t real_var_idx : cell_real_var_idx) {
                if (real_var_idx - var_begin < num_vars) {
                    ++copy_cycles.offsets[real_var_idx];
                }
            }
        });
        uint32_t running = 0;
        for (size_t i = 0; i < num_cycles; ++i) {
            const uint32_t count = copy_cycles.offsets[i];
            copy_cycles.offsets[i] = running;
            running += count;
        }
        copy_cycles.offsets[num_cycles] = running;
        copy_cycles.nodes.resize(running);
    }

    {
        BB_BENCH_NAME("fill_copy_cycles");
        std::vector<uint32_t> cursors(copy_cycles.offsets.begin(), copy_cycles.offsets.end() - 1);
        parallel_for([&](const ThreadChunk& chunk) {
            const auto vars = chunk.range(num_cycles);
            if (vars.empty()) {
                return;
            }
            const uint32_t var_begin = static_cast<uint32_t>(vars.front());
            const uint32_t num_vars = static_cast<uint32_t>(vars.size());
            for (size_t block_idx = 0; block_idx < num_blocks; ++block_idx) {
                const uint32_t offset = blocks_array[block_idx].trace_offset();
                const uint32_t block_size = static_cast<uint32_t>(blocks_array[block_idx].size());
                const uint32_t* cell = &cell_real_var_idx[cell_offsets[block_idx]];
                for (uint32_t block_row_idx = 0; block_row_idx < block_size; ++block_row_idx) {
                    for (uint32_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
                        const uint32_t real_var_idx = *cell++;
                        if (real_var_idx - var_begin < num_vars) {
                            copy_cycles.nodes[cursors[real_var_idx]++] = cycle_node{ wire_idx, block_row_idx + offset };
                        }
                    }
                }
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
