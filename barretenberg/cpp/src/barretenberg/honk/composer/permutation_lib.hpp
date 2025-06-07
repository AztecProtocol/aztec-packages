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

#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/packed_list_vector.hpp"
#include "barretenberg/common/ref_span.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/thread.hpp"
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
 * @brief CycleNode represents the idx of a value of the circuit.
 * It will belong to a CyclicPermutation, such that all nodes in a CyclicPermutation
 * must have the value.
 * The total number of constraints is always <2^32 since that is the type used to represent variables, so we can save
 * space by using a type smaller than size_t.
 */
struct CycleNode {
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
 * @brief Stores permutation mapping data for a single wire column at a specific row index.
 */
struct PermutationMappingEntry {
    uint32_t row_idx; // row idx of next entry in copy cycle
    uint8_t col_idx;  // column idx of next entry in copy cycle
    bool is_public_input;
    bool is_tag;
};

template <size_t NUM_WIRES, bool generalized> struct PermutationMapping {
    struct Entry {
        PermutationMappingEntry sigma;
        PermutationMappingEntry id; // only used in generalized permutation
    };
    std::unique_ptr<Entry> mapping_allocation;
    size_t circuit_size;

    Entry& get_mapping_entry(size_t col_idx, size_t row_idx) const
    {
        return mapping_allocation.get()[col_idx * circuit_size + row_idx];
    }

    /**
     * @brief Construct a permutation mapping default initialized so every element is in a cycle by itself
     */
    PermutationMapping(size_t circuit_size)
        // Hacky allocation to avoid zero-initialization.
        : mapping_allocation(reinterpret_cast<Entry*>(::operator new[](circuit_size* NUM_WIRES * sizeof(Entry))))
        , circuit_size(circuit_size)
    {
        PROFILE_THIS_NAME("PermutationMapping constructor");

        parallel_for_range(circuit_size, [&](uint32_t start, uint32_t end) {
            // Initialize every element to point to itself
            for (uint8_t col_idx = 0; col_idx < NUM_WIRES; ++col_idx) {
                for (uint32_t row_idx = start; row_idx < end; ++row_idx) {
                    Entry& entry = get_mapping_entry(col_idx, row_idx);
                    entry.sigma.row_idx = row_idx;
                    entry.sigma.col_idx = col_idx;
                    entry.sigma.is_public_input = false;
                    entry.sigma.is_tag = false;
                    if constexpr (generalized) {
                        entry.id.row_idx = row_idx;
                        entry.id.col_idx = col_idx;
                        entry.id.is_public_input = false;
                        entry.id.is_tag = false;
                    }
                }
            }
        });
    }
};

namespace {
/**
 * @brief Compute the traditional or generalized permutation mapping
 *
 * @details Computes the mappings from which the sigma polynomials (and conditionally, the id polynomials)
 * can be computed. The output is proving system agnostic.
 *
 * @tparam program_width The number of wires
 * @tparam generalized (bool) Triggers use of gen perm tags and computation of id mappings when true
 * @param circuit_constructor Circuit-containing object
 * @param proving_key Pointer to the proving key
 * @return PermutationMapping sigma mapping (and id mapping if generalized == true)
 */
template <typename Flavor, bool generalized>
PermutationMapping<Flavor::NUM_WIRES, generalized> compute_permutation_mapping(
    const typename Flavor::CircuitBuilder& circuit_constructor,
    typename Flavor::ProvingKey* proving_key,
    const PackedListVector<CycleNode>& wire_copy_cycles)
{
    using Entry = PermutationMapping<Flavor::NUM_WIRES, generalized>::Entry;
    PROFILE_THIS();
    // These assert the current state of affairs. If this changes, this can be removed.
    // However if we never plan to support non-ultra or mega, we can also just simplify the code entirely.
    static_assert(IsUltraOrMegaHonk<Flavor>);
    static_assert(generalized);

    // Initialize the table of permutations so that every element points to itself
    PermutationMapping<Flavor::NUM_WIRES, generalized> mapping(proving_key->circuit_size);

    // Represents the idx of a variable in circuit_constructor.variables (needed only for generalized)
    std::span<const uint32_t> real_variable_tags = circuit_constructor.real_variable_tags;
    // Go through each cycle
    for (size_t cycle_idx = 0; cycle_idx < wire_copy_cycles.size(); ++cycle_idx) {
        PackedListVector<CycleNode>::Node* start_node = wire_copy_cycles.get_list(cycle_idx);
        for (auto* current_node = start_node; current_node != nullptr; current_node = current_node->next) {
            // Get the indices (column, row) of the current node in the cycle
            const uint32_t current_row = current_node->value.gate_idx;
            const uint32_t current_column = current_node->value.wire_idx;

            // If the current node is last in the cycle, then the next is the first one
            // NOTE: our list is backwards, so the 'next' node is actually the previous one in the cycle.
            auto* prev_node = current_node->next != nullptr ? current_node->next : start_node;
            const uint32_t prev_row = prev_node->value.gate_idx;
            const uint32_t prev_column = prev_node->value.wire_idx;

            // Point current node to the next node
            Entry& prev_entry = mapping.get_mapping_entry(prev_column, prev_row);
            prev_entry.sigma.row_idx = current_row;
            prev_entry.sigma.col_idx = static_cast<uint8_t>(current_column);

            if constexpr (generalized) {
                // NOTE: list is backwards, so being the start_node means we are the last node
                const bool last_node = (prev_node == start_node);
                const bool first_node = (prev_node->next == nullptr);

                if (first_node) {
                    prev_entry.id.is_tag = true;
                    prev_entry.id.row_idx = real_variable_tags[cycle_idx];
                }
                if (last_node) {
                    prev_entry.sigma.is_tag = true;
                    prev_entry.sigma.row_idx = circuit_constructor.tau.at(real_variable_tags[cycle_idx]);
                }
            }
        }
    }

    // Add information about public inputs so that the cycles can be altered later; See the construction of the
    // permutation polynomials for details.
    const auto num_public_inputs = static_cast<uint32_t>(circuit_constructor.public_inputs.size());

    size_t pub_inputs_offset = proving_key->pub_inputs_offset;
    for (size_t i = 0; i < num_public_inputs; ++i) {
        uint32_t idx = static_cast<uint32_t>(i + pub_inputs_offset);
        Entry& entry = mapping.get_mapping_entry(0, idx);
        entry.sigma.row_idx = idx;
        entry.sigma.col_idx = 0;
        entry.sigma.is_public_input = true;
        if (entry.sigma.is_tag) {
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
 * @tparam program_width The number of wires
 * @param permutation_mappings A table with information about permuting each element
 * @param key Pointer to the proving key
 */
template <typename Flavor>
void compute_honk_style_permutation_lagrange_polynomials_from_mapping(
    const RefSpan<typename Flavor::Polynomial>& sigma_polynomials,
    const RefSpan<typename Flavor::Polynomial>& id_polynomials,
    const PermutationMapping<Flavor::NUM_WIRES, true>& permutation_mappings,
    typename Flavor::ProvingKey* proving_key)
{
    PROFILE_THIS();
    using FF = typename Flavor::FF;
    const size_t num_gates = proving_key->circuit_size;

    size_t domain_size = proving_key->active_region_data.size();
    size_t wire_idx = 0;
    for (auto [sigma_poly, id_poly] : zip_view(sigma_polynomials, id_polynomials)) {
        parallel_for_range(domain_size, [&](size_t start, size_t end) {
            for (size_t i = start; i < end; ++i) {
                const size_t poly_idx = proving_key->active_region_data.get_idx(i);
                const auto& entry = permutation_mappings.get_mapping_entry(wire_idx, poly_idx);
                auto poly_pairs = std::array{ std::pair(&sigma_poly, entry.sigma), std::pair(&id_poly, entry.id) };
                for (auto [poly, subentry] : poly_pairs) {
                    const auto current_row_idx = subentry.row_idx;
                    const auto current_col_idx = subentry.col_idx;
                    const auto current_is_tag = subentry.is_tag;
                    const auto current_is_public_input = subentry.is_public_input;

                    if (current_is_public_input) {
                        // We intentionally want to break the cycles of the public input variables.
                        // During the witness generation, the left and right wire polynomials at idx i contain the i-th
                        // public input. The CyclicPermutation created for these variables always start with (i) ->
                        // (n+i), followed by the indices of the variables in the "real" gates. We make i point to
                        // -(i+1), so that the only way of repairing the cycle is add the mapping
                        //  -(i+1) -> (n+i)
                        // These indices are chosen so they can easily be computed by the verifier. They can expect
                        // the running product to be equal to the "public input delta" that is computed
                        // in <honk/utils/grand_product_delta.hpp>
                        poly->at(poly_idx) = -FF(current_row_idx + 1 + num_gates * current_col_idx);
                    } else if (current_is_tag) {
                        // Set evaluations to (arbitrary) values disjoint from non-tag values
                        poly->at(poly_idx) = num_gates * Flavor::NUM_WIRES + current_row_idx;
                    } else {
                        // For the regular permutation we simply point to the next location by setting the
                        // evaluation to its idx
                        poly->at(poly_idx) = FF(current_row_idx + num_gates * current_col_idx);
                    }
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
                                              typename Flavor::ProvingKey* key,
                                              const PackedListVector<CycleNode>& copy_cycles)
{
    constexpr bool generalized = IsUltraOrMegaHonk<Flavor>;
    static_assert(generalized);
    auto mapping = compute_permutation_mapping<Flavor, generalized>(circuit, key, copy_cycles);

    // Compute Honk-style sigma and ID polynomials from the corresponding mappings
    compute_honk_style_permutation_lagrange_polynomials_from_mapping<Flavor>(
        key->polynomials.get_sigmas(), key->polynomials.get_ids(), mapping, key);
}
} // namespace bb
