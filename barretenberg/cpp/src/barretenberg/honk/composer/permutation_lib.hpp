// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
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
 * It will belong to a CyclicPermutation, such that all nodes in a CyclicPermutation
 * must have the value.
 * The total number of constraints is always <2^32 since that is the type used to represent variables, so we can save
 * space by using a type smaller than size_t.
 */
struct cycle_node {
    uint32_t wire_idx;
    uint32_t gate_idx;
};

/**
 * @brief Permutations subgroup element structure is used to hold data necessary to construct permutation polynomials.
 *
 * @details All parameters define the evaluation of an id or sigma polynomial.
 *
 */
struct permutation_subgroup_element {
    uint32_t row_idx = 0;
    uint8_t column_idx = 0;
    bool is_public_input = false;
    bool is_tag = false;
};

/**
 * @brief Stores permutation mapping data for a single wire column
 *
 */
struct Mapping {
    std::shared_ptr<uint32_t[]> row_idx; // row idx of next entry in copy cycle
    std::shared_ptr<uint8_t[]> col_idx;  // column idx of next entry in copy cycle
    std::shared_ptr<bool[]> is_public_input;
    std::shared_ptr<bool[]> is_tag;
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

template <size_t NUM_WIRES, bool generalized> struct PermutationMapping {
    std::array<Mapping, NUM_WIRES> sigmas;
    std::array<Mapping, NUM_WIRES> ids;

    /**
     * @brief Construct a permutation mapping default initialized so every element is in a cycle by itself
     *
     */
    PermutationMapping(size_t circuit_size)
    {
        PROFILE_THIS_NAME("PermutationMapping constructor");

        for (size_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
            sigmas[wire_idx] = Mapping(circuit_size);
            ids[wire_idx] = Mapping(circuit_size);
        }

        const size_t num_threads = calculate_num_threads_pow2(circuit_size, /*min_iterations_per_thread=*/1 << 10);
        size_t iterations_per_thread = circuit_size / num_threads; // actual iterations per thread

        parallel_for(num_threads, [&](size_t thread_idx) {
            uint32_t start = static_cast<uint32_t>(thread_idx * iterations_per_thread);
            uint32_t end = static_cast<uint32_t>((thread_idx + 1) * iterations_per_thread);

            // Initialize every element to point to itself
            for (uint8_t col_idx = 0; col_idx < NUM_WIRES; ++col_idx) {
                for (uint32_t row_idx = start; row_idx < end; ++row_idx) {
                    auto idx = static_cast<ptrdiff_t>(row_idx);
                    sigmas[col_idx].row_idx[idx] = row_idx;
                    sigmas[col_idx].col_idx[idx] = col_idx;
                    sigmas[col_idx].is_public_input[idx] = false;
                    sigmas[col_idx].is_tag[idx] = false;
                    if constexpr (generalized) {
                        ids[col_idx].row_idx[idx] = row_idx;
                        ids[col_idx].col_idx[idx] = col_idx;
                        ids[col_idx].is_public_input[idx] = false;
                        ids[col_idx].is_tag[idx] = false;
                    }
                }
            }
        });
    }
};

using CyclicPermutation = std::vector<cycle_node>;

namespace {

/**
 * @brief Compute the traditional or generalized permutation mapping
 *
 * @details Computes the mappings from which the sigma polynomials (and conditionally, the id polynomials)
 * can be computed. The output is proving system agnostic.
 *
 * @param circuit_constructor
 * @param dyadic_size
 * @param wire_copy_cycles
 * @return PermutationMapping<Flavor::NUM_WIRES, generalized>
 */
template <typename Flavor, bool generalized>
PermutationMapping<Flavor::NUM_WIRES, generalized> compute_permutation_mapping(
    const typename Flavor::CircuitBuilder& circuit_constructor,
    const size_t dyadic_size,
    const std::vector<CyclicPermutation>& wire_copy_cycles)
{

    // Initialize the table of permutations so that every element points to itself
    PermutationMapping<Flavor::NUM_WIRES, generalized> mapping(dyadic_size);

    // Represents the idx of a variable in circuit_constructor.variables (needed only for generalized)
    std::span<const uint32_t> real_variable_tags = circuit_constructor.real_variable_tags;

    // Go through each cycle
    for (size_t cycle_idx = 0; cycle_idx < wire_copy_cycles.size(); ++cycle_idx) {
        const CyclicPermutation& cycle = wire_copy_cycles[cycle_idx];
        for (size_t node_idx = 0; node_idx < cycle.size(); ++node_idx) {
            // Get the indices (column, row) of the current node in the cycle
            const cycle_node& current_node = cycle[node_idx];
            const auto current_row = static_cast<ptrdiff_t>(current_node.gate_idx);
            const auto current_column = current_node.wire_idx;

            // Get indices of next node; If the current node is last in the cycle, then the next is the first one
            size_t next_node_idx = (node_idx == cycle.size() - 1 ? 0 : node_idx + 1);
            const cycle_node& next_node = cycle[next_node_idx];
            const auto next_row = next_node.gate_idx;
            const auto next_column = static_cast<uint8_t>(next_node.wire_idx);

            // Point current node to the next node
            mapping.sigmas[current_column].row_idx[current_row] = next_row;
            mapping.sigmas[current_column].col_idx[current_row] = next_column;

            if constexpr (generalized) {
                const bool first_node = (node_idx == 0);
                const bool last_node = (next_node_idx == 0);

                if (first_node) {
                    mapping.ids[current_column].is_tag[current_row] = true;
                    mapping.ids[current_column].row_idx[current_row] = real_variable_tags[cycle_idx];
                }
                if (last_node) {
                    mapping.sigmas[current_column].is_tag[current_row] = true;

                    // TODO(Zac): yikes, std::maps (tau) are expensive. Can we find a way to get rid of this?
                    mapping.sigmas[current_column].row_idx[current_row] =
                        circuit_constructor.tau.at(real_variable_tags[cycle_idx]);
                }
            }
        }
    }

    // Add information about public inputs so that the cycles can be altered later; See the construction of the
    // permutation polynomials for details.
    const auto num_public_inputs = static_cast<uint32_t>(circuit_constructor.public_inputs.size());

    size_t pub_inputs_offset = 0;
    if constexpr (IsUltraOrMegaHonk<Flavor>) {
        pub_inputs_offset = circuit_constructor.blocks.pub_inputs.trace_offset();
    }
    for (size_t i = 0; i < num_public_inputs; ++i) {
        uint32_t idx = static_cast<uint32_t>(i + pub_inputs_offset);
        mapping.sigmas[0].row_idx[static_cast<ptrdiff_t>(idx)] = idx;
        mapping.sigmas[0].col_idx[static_cast<ptrdiff_t>(idx)] = 0;
        mapping.sigmas[0].is_public_input[static_cast<ptrdiff_t>(idx)] = true;
        if (mapping.sigmas[0].is_tag[static_cast<ptrdiff_t>(idx)]) {
            std::cerr << "MAPPING IS BOTH A TAG AND A PUBLIC INPUT" << std::endl;
        }
    }
    return mapping;
}

/**
 * @brief Compute Sigma/ID polynomials for Honk from a mapping and put into polynomial cache
 *
 * @details Given a mapping (effectively at table pointing witnesses to other witnesses) compute Sigma/ID polynomials in
 * lagrange form and put them into the cache. This version is suitable for traditional and generalized permutations.
 *
 * @param permutation_polynomials sigma or ID poly
 * @param permutation_mappings
 * @param dyadic_size dyadic size of the execution trace
 * @param active_region_data specifies regions of execution trace with non-trivial values
 */
template <typename Flavor>
void compute_honk_style_permutation_lagrange_polynomials_from_mapping(
    const RefSpan<typename Flavor::Polynomial>& permutation_polynomials,
    const std::array<Mapping, Flavor::NUM_WIRES>& permutation_mappings,
    const size_t dyadic_size,
    ActiveRegionData& active_region_data)
{
    using FF = typename Flavor::FF;

    size_t domain_size = active_region_data.size();

    const MultithreadData thread_data = calculate_thread_data(domain_size);

    size_t wire_idx = 0;
    for (auto& current_permutation_poly : permutation_polynomials) {
        parallel_for(thread_data.num_threads, [&](size_t j) {
            const size_t start = thread_data.start[j];
            const size_t end = thread_data.end[j];
            for (size_t i = start; i < end; ++i) {
                const size_t poly_idx = active_region_data.get_idx(i);
                const auto idx = static_cast<ptrdiff_t>(poly_idx);
                const auto& current_row_idx = permutation_mappings[wire_idx].row_idx[idx];
                const auto& current_col_idx = permutation_mappings[wire_idx].col_idx[idx];
                const auto& current_is_tag = permutation_mappings[wire_idx].is_tag[idx];
                const auto& current_is_public_input = permutation_mappings[wire_idx].is_public_input[idx];
                if (current_is_public_input) {
                    // We intentionally want to break the cycles of the public input variables.
                    // During the witness generation, the left and right wire polynomials at idx i contain the i-th
                    // public input. The CyclicPermutation created for these variables always start with (i) -> (n+i),
                    // followed by the indices of the variables in the "real" gates. We make i point to
                    // -(i+1), so that the only way of repairing the cycle is add the mapping
                    //  -(i+1) -> (n+i)
                    // These indices are chosen so they can easily be computed by the verifier. They can expect
                    // the running product to be equal to the "public input delta" that is computed
                    // in <honk/utils/grand_product_delta.hpp>
                    current_permutation_poly.at(poly_idx) = -FF(current_row_idx + 1 + dyadic_size * current_col_idx);
                } else if (current_is_tag) {
                    // Set evaluations to (arbitrary) values disjoint from non-tag values
                    current_permutation_poly.at(poly_idx) = dyadic_size * Flavor::NUM_WIRES + current_row_idx;
                } else {
                    // For the regular permutation we simply point to the next location by setting the
                    // evaluation to its idx
                    current_permutation_poly.at(poly_idx) = FF(current_row_idx + dyadic_size * current_col_idx);
                }
            }
        });
        wire_idx++;
    }
}
} // namespace

/**
 * @brief Compute Honk style generalized permutation sigmas and ids and add to proving_key
 *
 * @param circuit
 * @param proving_key
 * @param copy_cycles pre-computed sets of wire addresses whose values should be copy constrained
 *
 */
template <typename Flavor>
void compute_permutation_argument_polynomials(const typename Flavor::CircuitBuilder& circuit,
                                              typename Flavor::ProverPolynomials& polynomials,
                                              const std::vector<CyclicPermutation>& copy_cycles,
                                              ActiveRegionData& active_region_data)
{
    constexpr bool generalized = IsUltraOrMegaHonk<Flavor>;
    const size_t dyadic_size = polynomials.get_polynomial_size();
    auto mapping = compute_permutation_mapping<Flavor, generalized>(circuit, dyadic_size, copy_cycles);

    // Compute Honk-style sigma and ID polynomials from the corresponding mappings
    {

        PROFILE_THIS_NAME("compute_honk_style_permutation_lagrange_polynomials_from_mapping");

        compute_honk_style_permutation_lagrange_polynomials_from_mapping<Flavor>(
            polynomials.get_sigmas(), mapping.sigmas, dyadic_size, active_region_data);
    }
    {

        PROFILE_THIS_NAME("compute_honk_style_permutation_lagrange_polynomials_from_mapping");

        compute_honk_style_permutation_lagrange_polynomials_from_mapping<Flavor>(
            polynomials.get_ids(), mapping.ids, dyadic_size, active_region_data);
    }
}

} // namespace bb
