// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
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

#include "barretenberg/common/ref_span.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include "barretenberg/polynomials/iterate_over_domain.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <initializer_list>
#include <string>
#include <utility>
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

/**
 * @brief Stores permutation mapping data for a single wire column.
 *
 */
struct Mapping {
    std::shared_ptr<uint32_t[]> row_idx;     // row idx of next entry in copy cycle
    std::shared_ptr<uint8_t[]> col_idx;      // column idx of next entry in copy cycle
    std::shared_ptr<bool[]> is_public_input; // if we are a sigma polynomial, is the current row a public input row?
                                             // (always false for id polynomials.)
    std::shared_ptr<bool[]>
        is_tag; // is this element a tag,  (N.B. For each permutation polynomial (i.e., id_i or
                // sigma_j), only one element per cycle is a tag. This follows the generalized permutation argument.)
    size_t _size = 0;

    Mapping() = default;

    size_t size() const { return _size; }

    Mapping(size_t n)
        : row_idx(_allocate_aligned_memory<uint32_t>(n))
        , col_idx(_allocate_aligned_memory<uint8_t>(n))
        , is_public_input(_allocate_aligned_memory<bool>(n))
        , is_tag(_allocate_aligned_memory<bool>(n))
        , _size(n)
    {}
};

template <size_t NUM_WIRES> struct PermutationMapping {
    std::array<Mapping, NUM_WIRES> sigmas;
    std::array<Mapping, NUM_WIRES> ids;

    /**
     * @brief Construct a permutation mapping default initialized so every element is in a cycle by itself
     *
     */
    PermutationMapping(size_t circuit_size)
    {
        BB_BENCH_NAME("PermutationMapping constructor");

        for (size_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
            sigmas[wire_idx] = Mapping(circuit_size);
            ids[wire_idx] = Mapping(circuit_size);
        }

        parallel_for([&](const ThreadChunk& chunk) {
            // Initialize every element to point to itself
            for (uint8_t col_idx = 0; col_idx < NUM_WIRES; ++col_idx) {
                for (size_t i : chunk.range(circuit_size)) {
                    auto row_idx = static_cast<uint32_t>(i);
                    auto idx = static_cast<ptrdiff_t>(row_idx);
                    // sigma polynomials
                    sigmas[col_idx].row_idx[idx] = row_idx;
                    sigmas[col_idx].col_idx[idx] = col_idx;
                    sigmas[col_idx].is_public_input[idx] = false;
                    sigmas[col_idx].is_tag[idx] = false;
                    // id polynomials
                    ids[col_idx].row_idx[idx] = row_idx;
                    ids[col_idx].col_idx[idx] = col_idx;
                    ids[col_idx].is_public_input[idx] = false; // always false.
                    ids[col_idx].is_tag[idx] = false;
                }
            }
        });
    }
};

using CyclicPermutation = std::vector<cycle_node>;

namespace {

constexpr size_t PERMUTATION_POLY_START_INDEX =
    1; // start_index of the Sigma and ID polynomials, which are shiftable. (Note that they are never shifted.)

/**
 * @brief Compute the permutation mapping
 *
 * @details Computes the mappings from which the sigma and ID polynomials can be computed, as specified by the
 * Generalized Permutation argument. The output is proving-system agnostic.
 *
 * @param circuit_constructor
 * @param dyadic_size
 * @param wire_copy_cycles
 * @return PermutationMapping<Flavor::NUM_WIRES>
 * @note This does not take into account the optimization for public inputs, a.k.a. the "public inputs delta"; it purely
 * reflects the actual copy cycles.
 */
template <typename Flavor>
PermutationMapping<Flavor::NUM_WIRES> compute_permutation_mapping(
    const typename Flavor::CircuitBuilder& circuit_constructor,
    const size_t dyadic_size,
    const std::vector<CyclicPermutation>& wire_copy_cycles)
{

    // Initialize the table of permutations so that every element points to itself
    PermutationMapping<Flavor::NUM_WIRES> mapping(dyadic_size);

    // Represents the idx of a variable in circuit_constructor.variables
    std::span<const uint32_t> real_variable_tags = circuit_constructor.real_variable_tags;

    // Go through each cycle
    for (size_t cycle_idx = 0; cycle_idx < wire_copy_cycles.size(); ++cycle_idx) {
        // We go through the cycle and fill-out/modify `mapping`. Following the generalized permutation algorithm, we
        // take separate care of first/last node handling.
        const CyclicPermutation& cycle = wire_copy_cycles[cycle_idx];
        const auto cycle_size = cycle.size();
        if (cycle_size == 0) {
            continue;
        }

        const cycle_node& first_node = cycle[0];
        const cycle_node& last_node = cycle[cycle_size - 1];

        const auto first_row = static_cast<ptrdiff_t>(first_node.gate_idx);
        const auto first_col = first_node.wire_idx;
        const auto last_row = static_cast<ptrdiff_t>(last_node.gate_idx);
        const auto last_col = last_node.wire_idx;

        // First node: id gets tagged with the cycle's variable tag
        mapping.ids[first_col].is_tag[first_row] = true;
        mapping.ids[first_col].row_idx[first_row] = real_variable_tags[cycle_idx];

        // Last node: sigma gets tagged and points to tau(tag) instead of wrapping to first node
        mapping.sigmas[last_col].is_tag[last_row] = true;
        mapping.sigmas[last_col].row_idx[last_row] = circuit_constructor.tau().at(real_variable_tags[cycle_idx]);

        // All nodes except the last: sigma points to the next node in the cycle
        for (size_t node_idx = 0; node_idx + 1 < cycle_size; ++node_idx) {
            const cycle_node& current_node = cycle[node_idx];
            const cycle_node& next_node = cycle[node_idx + 1];

            const auto current_row = static_cast<ptrdiff_t>(current_node.gate_idx);
            const auto current_col = current_node.wire_idx;
            // Point current node to next node.
            mapping.sigmas[current_col].row_idx[current_row] = next_node.gate_idx;
            mapping.sigmas[current_col].col_idx[current_row] = static_cast<uint8_t>(next_node.wire_idx);
        }
    }

    // Add information about public inputs so that the cycles can be altered later; See the construction of the
    // permutation polynomials for details. This _only_ effects sigma_0, the 0th sigma polynomial, as the structure of
    // the algorithm only requires modifying sigma_0(i) where i is a public input row. (Note that at such a row, the
    // non-zero wire values are in w_l and w_r, and both of them contain the public input.)
    const auto num_public_inputs = static_cast<uint32_t>(circuit_constructor.num_public_inputs());

    auto pub_inputs_offset = circuit_constructor.blocks.pub_inputs.trace_offset();
    for (size_t i = 0; i < num_public_inputs; ++i) {
        uint32_t idx = static_cast<uint32_t>(i + pub_inputs_offset);
        mapping.sigmas[0].row_idx[static_cast<ptrdiff_t>(idx)] = idx;
        mapping.sigmas[0].col_idx[static_cast<ptrdiff_t>(idx)] = 0;
        mapping.sigmas[0].is_public_input[static_cast<ptrdiff_t>(idx)] = true;
        if (mapping.sigmas[0].is_tag[static_cast<ptrdiff_t>(idx)]) {
            std::cerr << "MAPPING IS BOTH A TAG AND A PUBLIC INPUT\n";
        }
    }
    return mapping;
}

/**
 * @brief Compute Sigma/ID polynomials for Honk from a mapping and put into polynomial cache
 *
 * @details Given a mapping (effectively at table pointing witnesses to other witnesses) compute Sigma/ID polynomials in
 * lagrange form and put them into the cache.
 *
 * @param permutation_polynomials sigma or ID poly
 * @param permutation_mappings
 */
template <typename Flavor>
void compute_honk_style_permutation_lagrange_polynomials_from_mapping(
    const RefSpan<typename Flavor::Polynomial>& permutation_polynomials,
    const std::array<Mapping, Flavor::NUM_WIRES>& permutation_mappings)
{
    using FF = typename Flavor::FF;

    size_t domain_size = permutation_polynomials[0].size();

    // SEPARATOR ensures that the evaluations of `id_i` (`sigma_i`) and `id_j`(`sigma_j`) polynomials on the boolean
    // hypercube do not intersect for i != j.
    const size_t SEPARATOR = PERMUTATION_ARGUMENT_VALUE_SEPARATOR;
    BB_ASSERT_LT(permutation_polynomials[0].size(), SEPARATOR);

    const MultithreadData thread_data = calculate_thread_data(domain_size);

    size_t wire_idx = 0;
    for (auto& current_permutation_poly : permutation_polynomials) {
        parallel_for(thread_data.num_threads, [&](size_t j) {
            const size_t start = thread_data.start[j];
            const size_t end = thread_data.end[j];
            for (size_t i = start; i < end; ++i) {
                const size_t poly_idx =
                    i +
                    PERMUTATION_POLY_START_INDEX; // Permutation polynomials (sigma and ID) are shiftable, hence
                                                  // allocated starting at index `PERMUTATION_POLY_START_INDEX == 1`.
                const auto idx = static_cast<ptrdiff_t>(poly_idx);
                const auto& current_row_idx = permutation_mappings[wire_idx].row_idx[idx];
                const auto& current_col_idx = permutation_mappings[wire_idx].col_idx[idx];
                const auto& current_is_tag = permutation_mappings[wire_idx].is_tag[idx];
                const auto& current_is_public_input =
                    permutation_mappings[wire_idx].is_public_input[idx]; // this is only `true` for sigma polynomials,
                                                                         // it is always false for the ID polynomials.
                if (current_is_public_input) {
                    // We intentionally want to break the cycles of the public input variables as an optimization.
                    // During the witness generation, both the left and right wire polynomials (w_l and w_r
                    // respectively) at row idx i contain the i-th public input. Let n = SEPARATOR. The initial
                    // CyclicPermutation created for these variables copy-constrained to the ith public input therefore
                    // always starts with (i) -> (n+i), followed by the indices of the variables in the "real" gates
                    // (i.e., the gates not merely present to set-up inputs).
                    //
                    // We change this and make i point to -(i+1). This choice "unbalances" the grand product argument,
                    // so that the final result of the grand product is _not_ 1. These indices are chosen so they can
                    // easily be computed by the verifier (just knowing the public inputs), and this algorithm
                    // constitutes a specification of the "permutation argument with public inputs" optimization due to
                    // Gabizon and Williamson. The verifier can expect the final product to be equal to the "public
                    // input delta" that is computed in <honk/library/grand_product_delta.hpp>.
                    current_permutation_poly.at(poly_idx) = -FF(current_row_idx + 1 + SEPARATOR * current_col_idx);
                } else if (current_is_tag) {
                    // Set evaluations to (arbitrary) values disjoint from non-tag values. This is for the
                    // multiset-equality part of the generalized permutation argument, which requires auxiliary values
                    // which have not been used as indices. In particular, these are the actual tags assigned to the
                    // cycle.
                    current_permutation_poly.at(poly_idx) = SEPARATOR * Flavor::NUM_WIRES + current_row_idx;
                } else {
                    // For the regular permutation we simply point to the next location by setting the
                    // evaluation to its idx
                    current_permutation_poly.at(poly_idx) = FF(current_row_idx + SEPARATOR * current_col_idx);
                }
            }
        });
        wire_idx++;
    }
}
} // namespace

/**
 * @brief Compute Honk-style permutation sigma/id polynomials and add to prover_instance, where the
 * copy_cycles are pre-computed sets of wire addresses whose values should be copy-constrained.
 */
template <typename Flavor>
void compute_permutation_argument_polynomials(const typename Flavor::CircuitBuilder& circuit,
                                              typename Flavor::ProverPolynomials& polynomials,
                                              const std::vector<CyclicPermutation>& copy_cycles)
{
    const size_t polynomial_size = polynomials.get_polynomial_size();
    auto mapping = compute_permutation_mapping<Flavor>(circuit, polynomial_size, copy_cycles);

    // Compute Honk-style sigma and ID polynomials from the corresponding mappings
    {
        BB_BENCH_NAME("compute_honk_style_permutation_lagrange_polynomials_from_mapping");
        compute_honk_style_permutation_lagrange_polynomials_from_mapping<Flavor>(polynomials.get_sigmas(),
                                                                                 mapping.sigmas);
    }
    {
        BB_BENCH_NAME("compute_honk_style_permutation_lagrange_polynomials_from_mapping");
        compute_honk_style_permutation_lagrange_polynomials_from_mapping<Flavor>(polynomials.get_ids(), mapping.ids);
    }
}

} // namespace bb
