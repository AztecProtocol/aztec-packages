// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 21a7e3670e6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

/**
 * @file permutation_lib.hpp
 * @brief Contains various functions that help construct Honk Sigma and Id polynomials
 *
 * @details It is structured to reuse similar components in Honk
 *
 */
#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/ref_span.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

namespace bb {

/**
 * @brief cycle_node represents the idx of a value of the circuit.
 * It will belong to a CyclicPermutation, which constrains all nodes in a CyclicPermutation to have the same value.
 * The total number of constraints is always <2^32 since that is the type used to represent variables, so we can save
 * space by using a type smaller than size_t.
 */
struct cycle_node {
    uint32_t wire_idx;
    uint32_t gate_idx;
};

using CyclicPermutation = std::vector<cycle_node>;

/**
 * @brief Copy cycles for all variables of a circuit in CSR (flat) form.
 * @details One cycle per real variable; cycle i occupies nodes[offsets[i] .. offsets[i+1]).
 * A flat layout avoids materializing one heap-allocated vector per variable (hundreds of
 * thousands per circuit).
 */
struct CopyCycles {
    std::vector<uint32_t> offsets; // size = num_cycles + 1
    std::vector<cycle_node> nodes;

    size_t size() const { return offsets.empty() ? 0 : offsets.size() - 1; }
    std::span<const cycle_node> operator[](size_t i) const
    {
        return { nodes.data() + offsets[i], offsets[i + 1] - offsets[i] };
    }
};

/**
 * @brief Compute Honk-style permutation sigma/id polynomials and add to prover_instance.
 *
 * @details Implements the Generalized Permutation argument by writing sigma/id polynomials directly,
 * without materialising an intermediate `(row_idx, col_idx, is_public_input, is_tag)` mapping struct.
 *
 * The construction is encoded in three layers, each overriding the previous at the cells it touches:
 *
 * 1. **Identity init**: For every (col, row) in the active trace range, write the closed-form
 *    identity `sigma_c[row] = id_c[row] = FF(row + c * SEPARATOR)`. This is the "every variable is
 *    in a cycle by itself" baseline.
 *
 * 2. **Cycle linkages**: For each cycle of size > 0, link sigma at each non-last node to the next node,
 *    tag sigma at the last node (pointing at `tau(var_tag)`), and tag id at the first node (pointing at
 *    `var_tag`). Tag values are encoded as `SEPARATOR * NUM_WIRES + tag` so they cannot collide with
 *    identity values (which are bounded by `SEPARATOR * NUM_WIRES`).
 *
 * 3. **Public input override** (sigma_0 only): At each public input row, overwrite `sigma_0` with
 *    `-FF(row + 1)`. This intentionally breaks the cycle for public inputs and feeds the
 *    "public inputs delta" optimisation; see the construction of the permutation polynomials and
 *    `<honk/library/grand_product_delta.hpp>` for the verifier-side counterpart.
 *
 * Cycles are disjoint by construction (every (gate_idx, wire_idx) position belongs to exactly one
 * variable, hence to exactly one cycle), so per-(col, row) writes from different cycles never alias and
 * phase 2 is parallelised across cycles. The public-input override runs serially because it is small
 * and writes only to `sigma_0`.
 */
template <typename Flavor>
void compute_permutation_argument_polynomials(const typename Flavor::CircuitBuilder& circuit,
                                              typename Flavor::ProverPolynomials& polynomials,
                                              const CopyCycles& copy_cycles)
{
    using FF = typename Flavor::FF;
    constexpr size_t NUM_WIRES = Flavor::NUM_WIRES;
    constexpr size_t SEPARATOR = PERMUTATION_ARGUMENT_VALUE_SEPARATOR;

    auto sigmas = polynomials.get_sigmas();
    auto ids = polynomials.get_ids();

    // SEPARATOR ensures that the identity values for `id_i`/`sigma_i` and `id_j`/`sigma_j` (i != j) are disjoint, and
    // that tag values (at `SEPARATOR * NUM_WIRES + ...`) cannot collide with identity values.
    BB_ASSERT_LT(sigmas[0].size(), SEPARATOR);

    // Phase 1: identity init across the active range of every sigma/id polynomial in parallel.
    {
        BB_BENCH_NAME("permutation_polys_identity_init");
        const size_t domain_size = sigmas[0].size();
        const MultithreadData thread_data = calculate_thread_data(domain_size);
        for (size_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
            auto& sigma = sigmas[wire_idx];
            auto& id = ids[wire_idx];
            const size_t base = SEPARATOR * wire_idx;
            parallel_for(thread_data.num_threads, [&](size_t j) {
                BB_BENCH_TRACY_NAME("Permutation::identity_init");
                const size_t start = thread_data.start[j];
                const size_t end = thread_data.end[j];
                for (size_t i = start; i < end; ++i) {
                    const size_t poly_idx = i + sigma.start_index();
                    const FF v = FF(poly_idx + base);
                    sigma.at(poly_idx) = v;
                    id.at(poly_idx) = v;
                }
            });
        }
    }

    // Phase 2: apply cycle linkages and tag values directly to sigma/id polys.
    {
        BB_BENCH_NAME("permutation_polys_cycle_linkages");

        // Cycles are disjoint by construction of the generalized permutation argument: every
        // (gate_idx, wire_idx) position belongs to exactly one variable, hence to exactly one cycle.
        // Per-(col, row) writes from different cycles never alias, so parallelising across cycle_idx is
        // safe without per-thread staging or merge.
        std::span<const uint32_t> real_variable_tags = circuit.real_variable_tags;
        const auto& tau = circuit.tau();

        parallel_for_heuristic(
            copy_cycles.size(),
            [&](size_t cycle_idx) {
                const std::span<const cycle_node> cycle = copy_cycles[cycle_idx];
                const auto cycle_size = cycle.size();
                if (cycle_size == 0) {
                    return;
                }

                // sigma at every non-last node points to the next node in the cycle.
                for (size_t node_idx = 0; node_idx + 1 < cycle_size; ++node_idx) {
                    const cycle_node& current = cycle[node_idx];
                    const cycle_node& next = cycle[node_idx + 1];
                    sigmas[current.wire_idx].at(current.gate_idx) = FF(next.gate_idx + (SEPARATOR * next.wire_idx));
                }

                const uint32_t var_tag = real_variable_tags[cycle_idx];

                // sigma at the last node is tagged and points to tau(var_tag) instead of wrapping to first.
                const cycle_node& last_node = cycle[cycle_size - 1];
                sigmas[last_node.wire_idx].at(last_node.gate_idx) = FF((SEPARATOR * NUM_WIRES) + tau.at(var_tag));

                // id at the first node is tagged with the cycle's variable tag (this follows the
                // generalized permutation argument: per cycle, exactly one element per permutation
                // polynomial is a tag).
                const cycle_node& first_node = cycle[0];
                ids[first_node.wire_idx].at(first_node.gate_idx) = FF((SEPARATOR * NUM_WIRES) + var_tag);
            },
            /*heuristic_cost=*/thread_heuristics::FF_COPY_COST * 8);
    }

    // Phase 3: public input override on sigma_0.
    //
    // We intentionally want to break the cycles of the public input variables as an optimization.
    // During the witness generation, both the left and right wire polynomials (w_l and w_r
    // respectively) at row idx i contain the i-th public input. Let n = SEPARATOR. The initial
    // CyclicPermutation created for these variables copy-constrained to the ith public input
    // therefore always starts with (i) -> (n+i), followed by the indices of the variables in the
    // "real" gates (i.e., the gates not merely present to set-up inputs).
    //
    // We change this and make i point to -(i+1). This choice "unbalances" the grand product
    // argument, so that the final result of the grand product is _not_ 1. These indices are chosen
    // so they can easily be computed by the verifier (just knowing the public inputs), and this
    // algorithm constitutes a specification of the "permutation argument with public inputs"
    // optimization due to Gabizon and Williamson. The verifier can expect the final product to be
    // equal to the "public input delta" that is computed in <honk/library/grand_product_delta.hpp>.
    {
        BB_BENCH_NAME("permutation_polys_public_input_overrides");
        const auto num_public_inputs = static_cast<uint32_t>(circuit.num_public_inputs());
        const auto pub_inputs_offset = circuit.blocks.pub_inputs.trace_offset();
        for (size_t i = 0; i < num_public_inputs; ++i) {
            const uint32_t idx = static_cast<uint32_t>(i + pub_inputs_offset);
            sigmas[0].at(idx) = -FF(idx + 1);
        }
    }
}

} // namespace bb
