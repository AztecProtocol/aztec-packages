/**
 * @file permutation_lib.hpp
 * @brief Contains various functions that help construct Honk and Plonk Sigma and Id polynomials
 *
 * @details It is structured to reuse similar components in Honk and Plonk
 *
 */
#pragma once

#include "barretenberg/common/ref_span.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/plonk/proof_system/proving_key/proving_key.hpp"
#include "barretenberg/polynomials/iterate_over_domain.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <initializer_list>
#include <string>
#include <utility>
#include <vector>

// TODO(Cody): very little code is shared; should split this up into plonk/honk files.

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

struct Mapping {
    std::shared_ptr<uint32_t[]> row_idx;
    std::shared_ptr<uint8_t[]> col_idx;
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

        {
            PROFILE_THIS_NAME("PermutationMapping PRE");
            for (size_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
                sigmas[wire_idx] = Mapping(circuit_size);
                ids[wire_idx] = Mapping(circuit_size);
            }
        }

        const size_t num_threads = get_num_cpus_pow2();
        size_t iterations_per_thread = circuit_size / num_threads; // actual iterations per thread

        auto initialize_chunk = [&](size_t thread_idx) {
            uint32_t start = static_cast<uint32_t>(thread_idx * iterations_per_thread);
            uint32_t end = static_cast<uint32_t>((thread_idx + 1) * iterations_per_thread);

            // Initialize every element to point to itself
            // WORKTODO: I think no need for this?
            for (uint8_t col_idx = 0; col_idx < NUM_WIRES; ++col_idx) {
                for (uint32_t row_idx = start; row_idx < end; ++row_idx) {
                    sigmas[col_idx].row_idx[row_idx] = row_idx;
                    sigmas[col_idx].col_idx[row_idx] = col_idx;
                    sigmas[col_idx].is_public_input[row_idx] = false;
                    sigmas[col_idx].is_tag[row_idx] = false;
                    if constexpr (generalized) {
                        ids[col_idx].row_idx[row_idx] = row_idx;
                        ids[col_idx].col_idx[row_idx] = col_idx;
                        ids[col_idx].is_public_input[row_idx] = false;
                        ids[col_idx].is_tag[row_idx] = false;
                    }
                }
            }
        };

        {
            PROFILE_THIS_NAME("PermutationMapping init");
            parallel_for(num_threads, initialize_chunk);
        }
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
    const std::vector<CyclicPermutation>& wire_copy_cycles)
{

    // Initialize the table of permutations so that every element points to itself
    PermutationMapping<Flavor::NUM_WIRES, generalized> mapping(proving_key->circuit_size);

    // Represents the idx of a variable in circuit_constructor.variables (needed only for generalized)
    std::span<const uint32_t> real_variable_tags = circuit_constructor.real_variable_tags;

    // Go through each cycle
    for (size_t cycle_idx = 0; cycle_idx < wire_copy_cycles.size(); ++cycle_idx) {
        const CyclicPermutation& cycle = wire_copy_cycles[cycle_idx];
        for (size_t node_idx = 0; node_idx < cycle.size(); ++node_idx) {
            // Get the indices (column, row) of the current node in the cycle
            const cycle_node& current_node = cycle[node_idx];
            const auto current_row = current_node.gate_idx;
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
    if constexpr (IsUltraFlavor<Flavor>) {
        pub_inputs_offset = proving_key->pub_inputs_offset;
    }
    for (size_t i = 0; i < num_public_inputs; ++i) {
        uint32_t idx = static_cast<uint32_t>(i + pub_inputs_offset);
        mapping.sigmas[0].row_idx[idx] = idx;
        mapping.sigmas[0].col_idx[idx] = 0;
        mapping.sigmas[0].is_public_input[idx] = true;
        if (mapping.sigmas[0].is_tag[idx]) {
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
    const RefSpan<typename Flavor::Polynomial>& permutation_polynomials, // sigma or ID poly
    const std::array<Mapping, Flavor::NUM_WIRES>& permutation_mappings,
    typename Flavor::ProvingKey* proving_key)
{
    using FF = typename Flavor::FF;
    const size_t num_gates = proving_key->circuit_size;

    size_t wire_idx = 0;
    for (auto& current_permutation_poly : permutation_polynomials) {
        ITERATE_OVER_DOMAIN_START(proving_key->evaluation_domain);
        auto idx = static_cast<ptrdiff_t>(i);
        const auto& current_row_idx = permutation_mappings[wire_idx].row_idx[idx];
        const auto& current_col_idx = permutation_mappings[wire_idx].col_idx[idx];
        const auto& current_is_tag = permutation_mappings[wire_idx].is_tag[idx];
        const auto& current_is_public_input = permutation_mappings[wire_idx].is_public_input[idx];
        if (current_is_public_input) {
            // We intentionally want to break the cycles of the public input variables.
            // During the witness generation, the left and right wire polynomials at idx i contain the i-th public
            // input. The CyclicPermutation created for these variables always start with (i) -> (n+i), followed by
            // the indices of the variables in the "real" gates. We make i point to -(i+1), so that the only way of
            // repairing the cycle is add the mapping
            //  -(i+1) -> (n+i)
            // These indices are chosen so they can easily be computed by the verifier. They can expect the running
            // product to be equal to the "public input delta" that is computed in <honk/utils/grand_product_delta.hpp>
            current_permutation_poly.at(i) = -FF(current_row_idx + 1 + num_gates * current_col_idx);
        } else if (current_is_tag) {
            // Set evaluations to (arbitrary) values disjoint from non-tag values
            current_permutation_poly.at(i) = num_gates * Flavor::NUM_WIRES + current_row_idx;
        } else {
            // For the regular permutation we simply point to the next location by setting the evaluation to its
            // idx
            current_permutation_poly.at(i) = FF(current_row_idx + num_gates * current_col_idx);
        }
        ITERATE_OVER_DOMAIN_END;
        wire_idx++;
    }
}
} // namespace

/**
 * Compute sigma permutation polynomial in lagrange base
 *
 * @param output Output polynomial.
 * @param permuataion Input permutation.
 * @param small_domain The domain we base our polynomial in.
 *
 * */
inline void compute_standard_plonk_lagrange_polynomial(bb::polynomial& output,
                                                       const Mapping& permutation,
                                                       const bb::evaluation_domain& small_domain)
{
    if (output.size() < permutation.size()) {
        throw_or_abort("Permutation polynomial size is insufficient to store permutations.");
    }
    // permutation encoding:
    // low 28 bits defines the location in witness polynomial
    // upper 2 bits defines the witness polynomial:
    // 0 = left
    // 1 = right
    // 2 = output
    ASSERT(small_domain.log2_size > 1);
    const bb::fr* roots = small_domain.get_round_roots()[small_domain.log2_size - 2];
    const size_t root_size = small_domain.size >> 1UL;
    const size_t log2_root_size = static_cast<size_t>(numeric::get_msb(root_size));

    ITERATE_OVER_DOMAIN_START(small_domain);

    // `permutation[i]` will specify the 'idx' that this wire value will map to.
    // Here, 'idx' refers to an element of our subgroup H.
    // We can almost use `permutation[i]` to directly idx our `roots` array, which contains our subgroup elements.
    // We first have to accommodate for the fact that `roots` only contains *half* of our subgroup elements. This is
    // because ω^{n/2} = -ω and we don't want to perform redundant work computing roots of unity.

    size_t raw_idx = permutation.row_idx[static_cast<ptrdiff_t>(i)];

    // Step 1: is `raw_idx` >= (n / 2)? if so, we will need to idx `-roots[raw_idx - subgroup_size / 2]` instead
    // of `roots[raw_idx]`
    const bool negative_idx = raw_idx >= root_size;

    // Step 2: compute the idx of the subgroup element we'll be accessing.
    // To avoid a conditional branch, we can subtract `negative_idx << log2_root_size` from `raw_idx`.
    // Here, `log2_root_size = numeric::get_msb(subgroup_size / 2)` (we know our subgroup size will be a power of 2,
    // so we lose no precision here)
    const size_t idx = raw_idx - (static_cast<size_t>(negative_idx) << log2_root_size);

    // Call `conditionally_subtract_double_modulus`, using `negative_idx` as our predicate.
    // Our roots of unity table is partially 'overloaded' - we either store the root `w`, or `modulus + w`
    // So to ensure we correctly compute `modulus - w`, we need to compute `2 * modulus - w`
    // The output will similarly be overloaded (containing either 2 * modulus - w, or modulus - w)
    output[i] = roots[idx].conditionally_subtract_from_double_modulus(static_cast<uint64_t>(negative_idx));

    // Finally, if our permutation maps to an idx in either the right wire vector, or the output wire vector, we
    // need to multiply our result by one of two quadratic non-residues. (This ensures that mapping into the left
    // wires gives unique values that are not repeated in the right or output wire permutations) (ditto for right
    // wire and output wire mappings)

    if (permutation.is_public_input[static_cast<ptrdiff_t>(i)]) {
        // As per the paper which modifies plonk to include the public inputs in a permutation argument, the permutation
        // `σ` is modified to `σ'`, where `σ'` maps all public inputs to a set of l distinct ζ elements which are
        // disjoint from H ∪ k1·H ∪ k2·H.
        output[i] *= bb::fr::external_coset_generator();
    } else if (permutation.is_tag[static_cast<ptrdiff_t>(i)]) {
        output[i] *= bb::fr::tag_coset_generator();
    } else {
        {
            const uint32_t column_idx = permutation.col_idx[static_cast<ptrdiff_t>(i)];
            if (column_idx > 0) {
                output[i] *= bb::fr::coset_generator(column_idx - 1);
            }
        }
    }
    ITERATE_OVER_DOMAIN_END;
}

/**
 * @brief Compute lagrange polynomial from mapping (used for sigmas or ids)
 *
 * @tparam program_width
 * @param mappings
 * @param label
 * @param key
 */
template <size_t program_width>
void compute_plonk_permutation_lagrange_polynomials_from_mapping(std::string label,
                                                                 std::array<Mapping, program_width>& mappings,
                                                                 plonk::proving_key* key)
{
    for (size_t i = 0; i < program_width; i++) {
        std::string idx = std::to_string(i + 1);
        bb::polynomial polynomial_lagrange(key->circuit_size);
        compute_standard_plonk_lagrange_polynomial(polynomial_lagrange, mappings[i], key->small_domain);
        key->polynomial_store.put(label + "_" + idx + "_lagrange", polynomial_lagrange.share());
    }
}

/**
 * @brief Compute the monomial and coset-fft version of each lagrange polynomial of the given label
 *
 * @details For Plonk we need the monomial and coset form of the polynomials, so we retrieve the lagrange form from
 * polynomial cache, compute FFT versions and put them in the cache
 *
 * @tparam program_width Number of wires
 * @param key Pointer to the proving key
 */
template <size_t program_width>
void compute_monomial_and_coset_fft_polynomials_from_lagrange(std::string label, plonk::proving_key* key)
{
    for (size_t i = 0; i < program_width; ++i) {
        std::string idx = std::to_string(i + 1);
        std::string prefix = label + "_" + idx;

        // Construct permutation polynomials in lagrange base
        auto sigma_polynomial_lagrange = key->polynomial_store.get(prefix + "_lagrange");
        // Compute permutation polynomial monomial form
        bb::polynomial sigma_polynomial(key->circuit_size);
        bb::polynomial_arithmetic::ifft(
            (bb::fr*)&sigma_polynomial_lagrange[0], &sigma_polynomial[0], key->small_domain);

        // Compute permutation polynomial coset FFT form
        bb::polynomial sigma_fft(sigma_polynomial, key->large_domain.size);
        sigma_fft.coset_fft(key->large_domain);

        key->polynomial_store.put(prefix, sigma_polynomial.share());
        key->polynomial_store.put(prefix + "_fft", sigma_fft.share());
    }
}

/**
 * @brief Compute Lagrange Polynomials L_0 and L_{n-1} and put them in the polynomial cache
 */
template <typename FF>
inline std::tuple<LegacyPolynomial<FF>, LegacyPolynomial<FF>> compute_first_and_last_lagrange_polynomials(
    const size_t circuit_size)
{
    LegacyPolynomial<FF> lagrange_polynomial_0(circuit_size);
    LegacyPolynomial<FF> lagrange_polynomial_n_min_1(circuit_size);
    lagrange_polynomial_0[0] = 1;

    lagrange_polynomial_n_min_1[circuit_size - 1] = 1;
    return std::make_tuple(lagrange_polynomial_0.share(), lagrange_polynomial_n_min_1.share());
}

/**
 * @brief Compute Plonk or Honk style generalized permutation sigmas and ids and add to proving_key
 *
 * @param circuit
 * @param proving_key
 * @param copy_cycles pre-computed sets of wire addresses whose values should be copy constrained
 *
 */
template <typename Flavor>
void compute_permutation_argument_polynomials(const typename Flavor::CircuitBuilder& circuit,
                                              typename Flavor::ProvingKey* key,
                                              const std::vector<CyclicPermutation>& copy_cycles)
{
    constexpr bool generalized = IsUltraPlonkOrHonk<Flavor>;
    auto mapping = compute_permutation_mapping<Flavor, generalized>(circuit, key, copy_cycles);

    if constexpr (IsPlonkFlavor<Flavor>) { // any Plonk flavor
        // Compute Plonk-style sigma and ID polynomials in lagrange, monomial, and coset-fft forms
        compute_plonk_permutation_lagrange_polynomials_from_mapping("sigma", mapping.sigmas, key);
        compute_monomial_and_coset_fft_polynomials_from_lagrange<Flavor::NUM_WIRES>("sigma", key);
        if constexpr (generalized) {
            compute_plonk_permutation_lagrange_polynomials_from_mapping("id", mapping.ids, key);
            compute_monomial_and_coset_fft_polynomials_from_lagrange<Flavor::NUM_WIRES>("id", key);
        }
    } else if constexpr (IsUltraFlavor<Flavor>) { // any UltraHonk flavor
        // Compute Honk-style sigma and ID polynomials from the corresponding mappings
        {

            PROFILE_THIS_NAME("compute_honk_style_permutation_lagrange_polynomials_from_mapping");

            compute_honk_style_permutation_lagrange_polynomials_from_mapping<Flavor>(
                key->polynomials.get_sigmas(), mapping.sigmas, key);
        }
        {

            PROFILE_THIS_NAME("compute_honk_style_permutation_lagrange_polynomials_from_mapping");

            compute_honk_style_permutation_lagrange_polynomials_from_mapping<Flavor>(
                key->polynomials.get_ids(), mapping.ids, key);
        }
    }
}

} // namespace bb
