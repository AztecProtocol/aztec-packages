/**
 * @file permutation_lib.hpp
 * @brief Contains various functions that help construct Honk and Plonk Sigma and Id polynomials
 *
 * @details It is structured to reuse similar components in Honk and Plonk
 *
 */
#pragma once

#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/plonk/proof_system/proving_key/proving_key.hpp"
#include "barretenberg/polynomials/iterate_over_domain.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/proof_system/flavor/flavor.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <initializer_list>
#include <iterator>
#include <string>
#include <utility>
#include <vector>

// TODO(Cody): very little code is shared; should split this up into plonk/honk files.

namespace proof_system {

/**
 * @brief cycle_node represents the index of a value of the circuit.
 * It will belong to a CyclicPermutation, such that all nodes in a CyclicPermutation
 * must have the value.
 * The total number of constraints is always <2^32 since that is the type used to represent variables, so we can save
 * space by using a type smaller than size_t.
 */
struct cycle_node {
    uint32_t wire_index;
    uint32_t gate_index;
};

/**
 * @brief Permutations subgroup element structure is used to hold data necessary to construct permutation polynomials.
 *
 * @details All parameters define the evaluation of an id or sigma polynomial.
 *
 */
struct permutation_subgroup_element {
    uint32_t row_index = 0;
    uint8_t column_index = 0;
    bool is_public_input = false;
    bool is_tag = false;
};

template <size_t NUM_WIRES> struct PermutationMapping {
    using Mapping = std::array<std::vector<permutation_subgroup_element>, NUM_WIRES>;
    Mapping sigmas;
    Mapping ids;
};

using CyclicPermutation = std::vector<cycle_node>;

namespace {

/**
 * @brief Compute all CyclicPermutations of the circuit. Each CyclicPermutation represents the indices of the values in
 * the witness wires that must have the same value.    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Polynomial = barretenberg::Polynomial<FF>;
 *
 * @tparam program_width Program width
 *
 * */
template <typename Flavor>
std::vector<CyclicPermutation> compute_wire_copy_cycles(const typename Flavor::CircuitBuilder& circuit_constructor)
{
    // Reference circuit constructor members
    const size_t num_gates = circuit_constructor.num_gates;
    std::span<const uint32_t> public_inputs = circuit_constructor.public_inputs;
    const size_t num_public_inputs = public_inputs.size();

    // Each variable represents one cycle
    const size_t number_of_cycles = circuit_constructor.variables.size();
    std::vector<CyclicPermutation> copy_cycles(number_of_cycles);
    copy_cycles.reserve(num_gates * 3);

    // Represents the index of a variable in circuit_constructor.variables
    std::span<const uint32_t> real_variable_index = circuit_constructor.real_variable_index;

    // For some flavors, we need to ensure the value in the 0th index of each wire is 0 to allow for left-shift by 1. To
    // do this, we add the wires of the first gate in the execution trace to the "zero index" copy cycle.
    if constexpr (Flavor::has_zero_row) {
        for (size_t wire_idx = 0; wire_idx < Flavor::NUM_WIRES; ++wire_idx) {
            const auto wire_index = static_cast<uint32_t>(wire_idx);
            const uint32_t gate_index = 0;                          // place zeros at 0th index
            const uint32_t zero_idx = circuit_constructor.zero_idx; // index of constant zero in variables
            copy_cycles[zero_idx].emplace_back(cycle_node{ wire_index, gate_index });
        }
    }

    // Define offsets for placement of public inputs and gates in execution trace
    const size_t num_zero_rows = Flavor::has_zero_row ? 1 : 0;
    size_t pub_inputs_offset = num_zero_rows;
    size_t gates_offset = num_public_inputs + num_zero_rows;

    // If Goblin, adjust offsets to account for ecc op gates and update copy cycles to include these gates
    if constexpr (IsGoblinFlavor<Flavor>) {
        // Set ecc op gate offset and update offsets for PI and conventional gates
        const size_t op_gates_offset = num_zero_rows;
        const size_t num_ecc_op_gates = circuit_constructor.num_ecc_op_gates;
        pub_inputs_offset += num_ecc_op_gates;
        gates_offset += num_ecc_op_gates;

        const auto& op_wires = circuit_constructor.ecc_op_wires;
        // Iterate over all variables of the ecc op gates, and add a corresponding node to the cycle for that variable
        for (size_t i = 0; i < num_ecc_op_gates; ++i) {
            // Note: We exclude the first op wire since it contains the op codes which are not stored in variables
            // TODO(luke): Kesha pointed out that we may need to constrain the op code values in some way, either with a
            // copy cycle that constrains them to a constant or with a relation. Resolve this.
            for (size_t op_wire_idx = 1; op_wire_idx < 4; ++op_wire_idx) {
                const uint32_t var_index = circuit_constructor.real_variable_index[op_wires[op_wire_idx][i]];
                const auto wire_index = static_cast<uint32_t>(op_wire_idx);
                const auto gate_idx = static_cast<uint32_t>(i + op_gates_offset);
                copy_cycles[var_index].emplace_back(cycle_node{ wire_index, gate_idx });
            }
        }
    }

    // We use the permutation argument to enforce the public input variables to be equal to values provided by the
    // verifier. The convension we use is to place the public input values as the first rows of witness vectors.
    // More specifically, we set the LEFT and RIGHT wires to be the public inputs and set the other elements of the row
    // to 0. All selectors are zero at these rows, so they are fully unconstrained. The "real" gates that follow can use
    // references to these variables.
    //
    // The copy cycle for the i-th public variable looks like
    //   (i) -> (n+i) -> (i') -> ... -> (i'')
    // (Using the convention that W^L_i = W_i and W^R_i = W_{n+i}, W^O_i = W_{2n+i})
    //
    // This loop initializes the i-th cycle with (i) -> (n+i), meaning that we always expect W^L_i = W^R_i,
    // for all i s.t. row i defines a public input.
    for (size_t i = 0; i < num_public_inputs; ++i) {
        const uint32_t public_input_index = real_variable_index[public_inputs[i]];
        const auto gate_index = static_cast<uint32_t>(i + pub_inputs_offset);
        // These two nodes must be in adjacent locations in the cycle for correct handling of public inputs
        copy_cycles[public_input_index].emplace_back(cycle_node{ 0, gate_index });
        copy_cycles[public_input_index].emplace_back(cycle_node{ 1, gate_index });
    }

    // Iterate over all variables of the "real" gates, and add a corresponding node to the cycle for that variable
    for (size_t i = 0; i < num_gates; ++i) {
        size_t wire_idx = 0;
        for (auto& wire : circuit_constructor.wires) {
            // We are looking at the j-th wire in the i-th row.
            // The value in this position should be equal to the value of the element at index `var_index`
            // of the `constructor.variables` vector.
            // Therefore, we add (i,j) to the cycle at index `var_index` to indicate that w^j_i should have the values
            // constructor.variables[var_index].
            const uint32_t var_index = circuit_constructor.real_variable_index[wire[i]];
            const auto wire_index = static_cast<uint32_t>(wire_idx);
            const auto gate_idx = static_cast<uint32_t>(i + gates_offset);
            copy_cycles[var_index].emplace_back(cycle_node{ wire_index, gate_idx });
            ++wire_idx;
        }
    }
    return copy_cycles;
}

/**
 * @brief Compute the traditional or generalized permutation mapping
 *
 * @details Computes the mappings from which the sigma polynomials (and conditionally, the id polynomials)
 * can be computed. The output is proving system agnostic.
 *
 * @tparam program_width The number of wires
 * @tparam generalized (bool) Triggers use of gen perm tags and computation of id mappings when true
 * @tparam CircuitBuilder The class that holds basic circuitl ogic
 * @param circuit_constructor Circuit-containing object
 * @param key Pointer to the proving key
 * @return PermutationMapping sigma mapping (and id mapping if generalized == true)
 */
template <typename Flavor, bool generalized>
PermutationMapping<Flavor::NUM_WIRES> compute_permutation_mapping(
    const typename Flavor::CircuitBuilder& circuit_constructor, typename Flavor::ProvingKey* proving_key)
{
    // Compute wire copy cycles (cycles of permutations)
    auto wire_copy_cycles = compute_wire_copy_cycles<Flavor>(circuit_constructor);

    PermutationMapping<Flavor::NUM_WIRES> mapping;

    // Initialize the table of permutations so that every element points to itself
    for (size_t i = 0; i < Flavor::NUM_WIRES; ++i) { // TODO(#391) zip and split
        mapping.sigmas[i].reserve(proving_key->circuit_size);
        if constexpr (generalized) {
            mapping.ids[i].reserve(proving_key->circuit_size);
        }

        for (size_t j = 0; j < proving_key->circuit_size; ++j) {
            mapping.sigmas[i].emplace_back(permutation_subgroup_element{ .row_index = static_cast<uint32_t>(j),
                                                                         .column_index = static_cast<uint8_t>(i),
                                                                         .is_public_input = false,
                                                                         .is_tag = false });
            if constexpr (generalized) {
                mapping.ids[i].emplace_back(permutation_subgroup_element{ .row_index = static_cast<uint32_t>(j),
                                                                          .column_index = static_cast<uint8_t>(i),
                                                                          .is_public_input = false,
                                                                          .is_tag = false });
            }
        }
    }

    // Represents the index of a variable in circuit_constructor.variables (needed only for generalized)
    std::span<const uint32_t> real_variable_tags = circuit_constructor.real_variable_tags;

    // Go through each cycle
    size_t cycle_index = 0;
    for (auto& copy_cycle : wire_copy_cycles) {
        for (size_t node_idx = 0; node_idx < copy_cycle.size(); ++node_idx) {
            // Get the indices of the current node and next node in the cycle
            cycle_node current_cycle_node = copy_cycle[node_idx];
            // If current node is the last one in the cycle, then the next one is the first one
            size_t next_cycle_node_index = (node_idx == copy_cycle.size() - 1 ? 0 : node_idx + 1);
            cycle_node next_cycle_node = copy_cycle[next_cycle_node_index];
            const auto current_row = current_cycle_node.gate_index;
            const auto next_row = next_cycle_node.gate_index;

            const auto current_column = current_cycle_node.wire_index;
            const auto next_column = static_cast<uint8_t>(next_cycle_node.wire_index);
            // Point current node to the next node
            mapping.sigmas[current_column][current_row] = {
                .row_index = next_row, .column_index = next_column, .is_public_input = false, .is_tag = false
            };

            if constexpr (generalized) {
                bool first_node = (node_idx == 0);
                bool last_node = (next_cycle_node_index == 0);

                if (first_node) {
                    mapping.ids[current_column][current_row].is_tag = true;
                    mapping.ids[current_column][current_row].row_index = (real_variable_tags[cycle_index]);
                }
                if (last_node) {
                    mapping.sigmas[current_column][current_row].is_tag = true;

                    // TODO(Zac): yikes, std::maps (tau) are expensive. Can we find a way to get rid of this?
                    mapping.sigmas[current_column][current_row].row_index =
                        circuit_constructor.tau.at(real_variable_tags[cycle_index]);
                }
            }
        }
        cycle_index++;
    }

    // Add information about public inputs to the computation
    const auto num_public_inputs = static_cast<uint32_t>(circuit_constructor.public_inputs.size());

    // The public inputs are placed at the top of the execution trace, potentially offset by a zero row.
    const size_t num_zero_rows = Flavor::has_zero_row ? 1 : 0;
    size_t pub_input_offset = num_zero_rows;
    // If Goblin, PI are further offset by number of ecc op gates
    if constexpr (IsGoblinFlavor<Flavor>) {
        pub_input_offset += circuit_constructor.num_ecc_op_gates;
    }
    for (size_t i = 0; i < num_public_inputs; ++i) {
        size_t idx = i + pub_input_offset;
        mapping.sigmas[0][idx].row_index = static_cast<uint32_t>(idx);
        mapping.sigmas[0][idx].column_index = 0;
        mapping.sigmas[0][idx].is_public_input = true;
        if (mapping.sigmas[0][idx].is_tag) {
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
    std::vector<typename Flavor::PolynomialHandle> permutation_polynomials, // sigma or ID poly
    std::array<std::vector<permutation_subgroup_element>, Flavor::NUM_WIRES>& permutation_mappings,
    typename Flavor::ProvingKey* proving_key)
{
    using FF = typename Flavor::FF;
    const size_t num_gates = proving_key->circuit_size;

    size_t wire_index = 0;
    for (auto& current_permutation_poly : permutation_polynomials) {
        ITERATE_OVER_DOMAIN_START(proving_key->evaluation_domain);
        const auto& current_mapping = permutation_mappings[wire_index][i];
        if (current_mapping.is_public_input) {
            // We intentionally want to break the cycles of the public input variables.
            // During the witness generation, the left and right wire polynomials at index i contain the i-th public
            // input. The CyclicPermutation created for these variables always start with (i) -> (n+i), followed by
            // the indices of the variables in the "real" gates. We make i point to -(i+1), so that the only way of
            // repairing the cycle is add the mapping
            //  -(i+1) -> (n+i)
            // These indices are chosen so they can easily be computed by the verifier. They can expect the running
            // product to be equal to the "public input delta" that is computed in <honk/utils/grand_product_delta.hpp>
            current_permutation_poly[i] = -FF(current_mapping.row_index + 1 + num_gates * current_mapping.column_index);
        } else if (current_mapping.is_tag) {
            // Set evaluations to (arbitrary) values disjoint from non-tag values
            current_permutation_poly[i] = num_gates * Flavor::NUM_WIRES + current_mapping.row_index;
        } else {
            // For the regular permutation we simply point to the next location by setting the evaluation to its
            // index
            current_permutation_poly[i] = FF(current_mapping.row_index + num_gates * current_mapping.column_index);
        }
        ITERATE_OVER_DOMAIN_END;
        wire_index++;
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
inline void compute_standard_plonk_lagrange_polynomial(barretenberg::polynomial& output,
                                                       const std::vector<permutation_subgroup_element>& permutation,
                                                       const barretenberg::evaluation_domain& small_domain)
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
    const barretenberg::fr* roots = small_domain.get_round_roots()[small_domain.log2_size - 2];
    const size_t root_size = small_domain.size >> 1UL;
    const size_t log2_root_size = static_cast<size_t>(numeric::get_msb(root_size));

    ITERATE_OVER_DOMAIN_START(small_domain);

    // `permutation[i]` will specify the 'index' that this wire value will map to.
    // Here, 'index' refers to an element of our subgroup H.
    // We can almost use `permutation[i]` to directly index our `roots` array, which contains our subgroup elements.
    // We first have to accomodate for the fact that `roots` only contains *half* of our subgroup elements. This is
    // because ω^{n/2} = -ω and we don't want to perform redundant work computing roots of unity.

    size_t raw_idx = permutation[i].row_index;

    // Step 1: is `raw_idx` >= (n / 2)? if so, we will need to index `-roots[raw_idx - subgroup_size / 2]` instead
    // of `roots[raw_idx]`
    const bool negative_idx = raw_idx >= root_size;

    // Step 2: compute the index of the subgroup element we'll be accessing.
    // To avoid a conditional branch, we can subtract `negative_idx << log2_root_size` from `raw_idx`.
    // Here, `log2_root_size = numeric::get_msb(subgroup_size / 2)` (we know our subgroup size will be a power of 2,
    // so we lose no precision here)
    const size_t idx = raw_idx - (static_cast<size_t>(negative_idx) << log2_root_size);

    // Call `conditionally_subtract_double_modulus`, using `negative_idx` as our predicate.
    // Our roots of unity table is partially 'overloaded' - we either store the root `w`, or `modulus + w`
    // So to ensure we correctly compute `modulus - w`, we need to compute `2 * modulus - w`
    // The output will similarly be overloaded (containing either 2 * modulus - w, or modulus - w)
    output[i] = roots[idx].conditionally_subtract_from_double_modulus(static_cast<uint64_t>(negative_idx));

    // Finally, if our permutation maps to an index in either the right wire vector, or the output wire vector, we
    // need to multiply our result by one of two quadratic non-residues. (This ensures that mapping into the left
    // wires gives unique values that are not repeated in the right or output wire permutations) (ditto for right
    // wire and output wire mappings)

    if (permutation[i].is_public_input) {
        // As per the paper which modifies plonk to include the public inputs in a permutation argument, the permutation
        // `σ` is modified to `σ'`, where `σ'` maps all public inputs to a set of l distinct ζ elements which are
        // disjoint from H ∪ k1·H ∪ k2·H.
        output[i] *= barretenberg::fr::external_coset_generator();
    } else if (permutation[i].is_tag) {
        output[i] *= barretenberg::fr::tag_coset_generator();
    } else {
        {
            const uint32_t column_index = permutation[i].column_index;
            if (column_index > 0) {
                output[i] *= barretenberg::fr::coset_generator(column_index - 1);
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
void compute_plonk_permutation_lagrange_polynomials_from_mapping(
    std::string label,
    std::array<std::vector<permutation_subgroup_element>, program_width>& mappings,
    plonk::proving_key* key)
{
    for (size_t i = 0; i < program_width; i++) {
        std::string index = std::to_string(i + 1);
        barretenberg::polynomial polynomial_lagrange(key->circuit_size);
        compute_standard_plonk_lagrange_polynomial(polynomial_lagrange, mappings[i], key->small_domain);
        key->polynomial_store.put(label + "_" + index + "_lagrange", std::move(polynomial_lagrange));
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
        std::string index = std::to_string(i + 1);
        std::string prefix = label + "_" + index;

        // Construct permutation polynomials in lagrange base
        auto sigma_polynomial_lagrange = key->polynomial_store.get(prefix + "_lagrange");
        // Compute permutation polynomial monomial form
        barretenberg::polynomial sigma_polynomial(key->circuit_size);
        barretenberg::polynomial_arithmetic::ifft(
            (barretenberg::fr*)&sigma_polynomial_lagrange[0], &sigma_polynomial[0], key->small_domain);

        // Compute permutation polynomial coset FFT form
        barretenberg::polynomial sigma_fft(sigma_polynomial, key->large_domain.size);
        sigma_fft.coset_fft(key->large_domain);

        key->polynomial_store.put(prefix, std::move(sigma_polynomial));
        key->polynomial_store.put(prefix + "_fft", std::move(sigma_fft));
    }
}

/**
 * @brief Compute standard honk id polynomials and put them into cache
 *
 * @details Honk permutations involve using id and sigma polynomials to generate variable cycles. This function
 * generates the id polynomials and puts them into polynomial cache, so that they can be used by the prover.
 *
 * @tparam program_width The number of witness polynomials
 * @param key Proving key where we will save the polynomials
 */
template <typename Flavor>
void compute_standard_honk_id_polynomials(auto proving_key) // TODO(Cody): proving_key* and shared_ptr<proving_key>
{
    // Fill id polynomials with default values
    // TODO(Cody): Allocate polynomial space in proving key constructor.
    size_t coset_idx = 0; // TODO(#391) zip
    for (auto& id_poly : proving_key->get_id_polynomials()) {
        for (size_t i = 0; i < proving_key->circuit_size; ++i) {
            id_poly[i] = coset_idx * proving_key->circuit_size + i;
        }
        ++coset_idx;
    }
}

/**
 * @brief Compute sigma permutations for standard honk and put them into polynomial cache
 *
 * @details These permutations don't involve sets. We only care about equating one witness value to another. The
 * sequences don't use cosets unlike FFT-based Plonk, because there is no need for them. We simply use indices based
 on
 * the witness vector and index within the vector. These values are permuted to account for wire copy cycles
 *
 * @tparam program_width
 * @tparam CircuitBuilder
 * @param circuit_constructor
 * @param key
 */
// TODO(#293): Update this (and all similar functions) to take a smart pointer.
template <typename Flavor>
void compute_standard_honk_sigma_permutations(const typename Flavor::CircuitBuilder& circuit_constructor,
                                              typename Flavor::ProvingKey* proving_key)
{
    // Compute the permutation table specifying which element becomes which
    auto mapping = compute_permutation_mapping<Flavor, /*generalized=*/false>(circuit_constructor, proving_key);
    // Compute Honk-style sigma polynomial from the permutation table
    compute_honk_style_permutation_lagrange_polynomials_from_mapping<Flavor>(
        proving_key->get_sigma_polynomials(), mapping.sigmas, proving_key);
}

/**
 * @brief Compute sigma permutation polynomials for standard plonk and put them in the polynomial cache
 *
 * @tparam program_width Number of wires
 * @tparam CircuitBuilder Class holding the circuit
 * @param circuit_constructor An object holdingt he circuit
 * @param key Pointer to a proving key
 */
template <typename Flavor>
void compute_standard_plonk_sigma_permutations(const typename Flavor::CircuitBuilder& circuit_constructor,
                                               typename Flavor::ProvingKey* key)
{
    // Compute the permutation table specifying which element becomes which
    auto mapping = compute_permutation_mapping<Flavor, /*generalized=*/false>(circuit_constructor, key);
    // Compute Plonk-style sigma polynomials from the mapping
    compute_plonk_permutation_lagrange_polynomials_from_mapping("sigma", mapping.sigmas, key);
    // Compute their monomial and coset versions
    compute_monomial_and_coset_fft_polynomials_from_lagrange<Flavor::NUM_WIRES>("sigma", key);
}

/**
 * @brief Compute Lagrange Polynomials L_0 and L_{n-1} and put them in the polynomial cache
 *
 * @param key Proving key where we will save the polynomials
 */
template <typename Flavor> inline void compute_first_and_last_lagrange_polynomials(auto proving_key)
{
    const size_t n = proving_key->circuit_size;
    typename Flavor::Polynomial lagrange_polynomial_0(n);
    typename Flavor::Polynomial lagrange_polynomial_n_min_1(n);
    lagrange_polynomial_0[0] = 1;
    proving_key->lagrange_first = lagrange_polynomial_0;

    lagrange_polynomial_n_min_1[n - 1] = 1;
    proving_key->lagrange_last = lagrange_polynomial_n_min_1;
}
/**
 * @brief Compute the extra numerator for Goblin range constraint argument
 *
 * @details Goblin proves that several polynomials contain only values in a certain range through 2 relations:
 * 1) A grand product
 * 2) A relation enforcing a range on the polynomial
 *
 * We take the values from 4 polynomials, and spread them into 5 polynomials + add all the steps from MAX_VALUE to 0. We
 * order these polynomials and use them in the denominator of the grand product, at the same time checking that they go
 * from MAX_VALUE to 0. To counteract the added steps we also generate an extra range constraint numerator, which
 * contains 5 MAX_VALUE, 5 (MAX_VALUE-STEP),... values
 *
 * @param key Proving key where we will save the polynomials
 */
template <typename Flavor> inline void compute_extra_range_constraint_numerator(auto proving_key)
{

    // Get the full goblin circuits size (this is the length of concatenated range constraint polynomials)
    auto full_circuit_size = Flavor::FULL_CIRCUIT_SIZE;
    auto sort_step = Flavor::SORT_STEP;
    auto num_concatenated_wires = Flavor::NUM_CONCATENATED_WIRES;

    auto& extra_range_constraint_numerator = proving_key->ordered_extra_range_constraints_numerator;

    uint32_t MAX_VALUE = (1 << Flavor::MICRO_LIMB_BITS) - 1;
    // Calculate how many elements there are in the sequence MAX_VALUE, MAX_VALUE - 3,...,0
    size_t sorted_elements_count = (MAX_VALUE / sort_step) + 1 + (MAX_VALUE % sort_step == 0 ? 0 : 1);

    // Check that we can fit every element in the polynomial
    ASSERT((num_concatenated_wires + 1) * sorted_elements_count < full_circuit_size);

    std::vector<size_t> sorted_elements(sorted_elements_count);

    // Calculate the sequence in integers
    sorted_elements[0] = MAX_VALUE;
    for (size_t i = 1; i < sorted_elements_count; i++) {
        sorted_elements[i] = (sorted_elements_count - 1 - i) * sort_step;
    }

    // TODO(kesha): can be parallelized further. This will use at most 5 threads
    auto fill_with_shift = [&](size_t shift) {
        for (size_t i = 0; i < sorted_elements_count; i++) {
            extra_range_constraint_numerator[shift + i * (num_concatenated_wires + 1)] = sorted_elements[i];
        }
    };
    // Fill polynomials with a sequence, where each element is repeated num_concatenated_wires+1 times
    parallel_for(num_concatenated_wires + 1, fill_with_shift);
}

/**
 * @brief Compute odd and even largrange polynomials and put them in the polynomial cache
 *
 * @param key Proving key where we will save the polynomials
 */
template <typename Flavor> inline void compute_odd_and_even_lagrange_polynomials(auto proving_key)

{
    const size_t n = proving_key->circuit_size;
    typename Flavor::Polynomial lagrange_polynomial_odd(n);
    typename Flavor::Polynomial lagrange_polynomial_even(n);

    for (size_t i = 0; i < n; i += 2) {
        lagrange_polynomial_odd[i + 1] = 1;
        lagrange_polynomial_even[i] = 1;
    }
    proving_key->lagrange_odd = lagrange_polynomial_odd;

    proving_key->lagrange_even = lagrange_polynomial_even;
}

/**
 * @brief Compute generalized permutation sigmas and ids for ultra plonk
 *
 * @tparam program_width
 * @tparam CircuitBuilder
 * @param circuit_constructor
 * @param key
 * @return std::array<std::vector<permutation_subgroup_element>, program_width>
 */
template <typename Flavor>
void compute_plonk_generalized_sigma_permutations(const typename Flavor::CircuitBuilder& circuit_constructor,
                                                  typename Flavor::ProvingKey* key)
{
    auto mapping = compute_permutation_mapping<Flavor, /*generalized=*/true>(circuit_constructor, key);

    // Compute Plonk-style sigma and ID polynomials from the corresponding mappings
    compute_plonk_permutation_lagrange_polynomials_from_mapping("sigma", mapping.sigmas, key);
    compute_plonk_permutation_lagrange_polynomials_from_mapping("id", mapping.ids, key);
    // Compute the monomial and coset-ffts for sigmas and IDs
    compute_monomial_and_coset_fft_polynomials_from_lagrange<Flavor::NUM_WIRES>("sigma", key);
    compute_monomial_and_coset_fft_polynomials_from_lagrange<Flavor::NUM_WIRES>("id", key);
}

/**
 * @brief Compute generalized permutation sigmas and ids for ultra plonk
 *
 * @tparam program_width
 * @tparam CircuitBuilder
 * @param circuit_constructor
 * @param proving_key
 * @return std::array<std::vector<permutation_subgroup_element>, program_width>
 */
template <typename Flavor>
void compute_honk_generalized_sigma_permutations(const typename Flavor::CircuitBuilder& circuit_constructor,
                                                 typename Flavor::ProvingKey* proving_key)
{
    auto mapping = compute_permutation_mapping<Flavor, true>(circuit_constructor, proving_key);

    // Compute Honk-style sigma and ID polynomials from the corresponding mappings
    compute_honk_style_permutation_lagrange_polynomials_from_mapping<Flavor>(
        proving_key->get_sigma_polynomials(), mapping.sigmas, proving_key);
    compute_honk_style_permutation_lagrange_polynomials_from_mapping<Flavor>(
        proving_key->get_id_polynomials(), mapping.ids, proving_key);
}

/**
 * @brief Compute new polynomials which are the concatenated versions of other polynomials
 *
 * @details Multilinear PCS allow to provide openings for concatenated polynomials in an easy way by combining
 * commitments. This method creates concatenated version of polynomials we won't need to commit to.
 *
 * @tparam Flavor
 * @tparam StorageHandle
 * @param proving_key Can be a proving_key or an AllEntities object
 */
template <typename Flavor, typename StorageHandle> void compute_concatenated_polynomials(StorageHandle* proving_key)
{
    // Concatenation groups are vectors of polynomials that are concatenated together
    auto concatenation_groups = proving_key->get_concatenation_groups();

    // Resulting concatenated polynomials
    auto targets = proving_key->get_concatenation_targets();

    // A function that produces 1 concatenated polynomials
    // TODO(kesha): This can be optimized to use more cores. Currently uses at maximum 4
    auto ordering_function = [&](size_t i) {
        auto my_group = concatenation_groups[i];
        auto& current_target = targets[i];

        // For each polynomial in group
        for (size_t j = 0; j < my_group.size(); j++) {
            auto starting_write_offset = current_target.begin();
            auto finishing_read_offset = my_group[j].begin();
            std::advance(starting_write_offset, j * Flavor::MINI_CIRCUIT_SIZE);
            std::advance(finishing_read_offset, Flavor::MINI_CIRCUIT_SIZE);
            // Copy into appropriate position in the concatenated polynomial
            std::copy(my_group[j].begin(), finishing_read_offset, starting_write_offset);
        }
    };
    parallel_for(concatenation_groups.size(), ordering_function);
}

/**
 * @brief Compute denominator polynomials for Goblin Translator's range constraint permutation
 *
 * @tparam Flavor
 * @tparam StorageHandle
 * @param proving_key
 */
template <typename Flavor, typename StorageHandle>
void compute_goblin_translator_range_constraint_ordered_polynomials(StorageHandle* proving_key)
{
    // We need to prove that all the range constrain wires indeed have values within the given range (unless changed - 0
    // to (2¹⁴ - 1)). To do this, we use several virtual concatenated wires, each of which represents a subset or
    // original wires (concatenated_range_constraints_<i>). We also generate several new polynomials of the same length
    // as concatenated ones. These polynomials have values within range, but they are also constrained by the
    // GoblinTranslator's GenPermSort relation, which ensures that sequential values differ by not more than 3, the last
    // value is the maximum and the first value is zero (zero at the start allows us not to dance around shifts).
    //
    // Ideally, we could simply rearrange the values in concatenated_.._0 ,..., concatenated_.._3 and get denominator
    // polynomials (ordered_constraints), but we could get the worst case scenario: each value in the polynomials is
    // maximum value. What can we do in that case? We still have to add (max_range/3)+1 values  to each of the ordered
    // wires for the sort constraint to hold.  So we also need a and extra denominator to store k(max_range/3 + 1)
    // values that couldn't go in + (max_range/3+  1) connecting values. To counteract the extra (k+1)*(max_range/3+1)
    // values needed for denominator sort constraints we need a polynomial in the numerator . So we can construct a
    // proof when (k+1)*(Max/3 +1) < concatenated size

    using FF = typename Flavor::FF;
    // Get constants
    auto sort_step = Flavor::SORT_STEP;
    auto num_concatenated_wires = Flavor::NUM_CONCATENATED_WIRES;
    auto full_circuit_size = Flavor::FULL_CIRCUIT_SIZE;
    auto mini_circuit_size = Flavor::MINI_CIRCUIT_SIZE;

    // The value we have to end polynomials with
    uint32_t MAX_VALUE = (1 << Flavor::MICRO_LIMB_BITS) - 1;

    // Number of elements needed to go from 0 to MAX_VALUE with our step
    size_t sorted_elements_count = (MAX_VALUE / sort_step) + 1 + (MAX_VALUE % sort_step == 0 ? 0 : 1);

    // Check if we can construct these polynomials
    static_assert((num_concatenated_wires + 1) * sorted_elements_count < full_circuit_size);

    // First use integers (easier to sort)
    std::vector<size_t> sorted_elements(sorted_elements_count);

    // Fill with necessary steps
    sorted_elements[0] = MAX_VALUE;
    for (size_t i = 1; i < sorted_elements_count; i++) {
        sorted_elements[i] = (sorted_elements_count - 1 - i) * sort_step;
    }

    std::vector<std::vector<uint32_t>> ordered_vectors_uint(num_concatenated_wires);
    auto ordered_constraint_polynomials = std::vector{ &proving_key->ordered_range_constraints_0,
                                                       &proving_key->ordered_range_constraints_1,
                                                       &proving_key->ordered_range_constraints_2,
                                                       &proving_key->ordered_range_constraints_3 };
    std::vector<size_t> extra_denominator_uint(full_circuit_size);
    auto concatenation_groups = proving_key->get_concatenation_groups();

    // A function that transfers elements from each of polynomials in the chosen concatenation group in the uint ordered
    // polynomials
    auto ordering_function = [&](size_t i) {
        // Get the group and the main target vector
        auto my_group = concatenation_groups[i];
        auto& current_vector = ordered_vectors_uint[i];
        current_vector.resize(Flavor::FULL_CIRCUIT_SIZE);

        // Calculate how much space there is for values from the original polynomials
        auto free_space_before_runway = full_circuit_size - sorted_elements_count;

        // Calculate the offset of this group's overflowing elements in the extra denominator polynomial
        size_t extra_denominator_offset = i * sorted_elements_count;

        // Go through each polynomial in the concatenation group
        for (size_t j = 0; j < Flavor::CONCATENATION_INDEX; j++) {

            // Calculate the offset in the target vector
            auto current_offset = j * mini_circuit_size;
            // For each element in the polynomial
            for (size_t k = 0; k < mini_circuit_size; k++) {

                // Put it it the target polynomial
                if ((current_offset + k) < free_space_before_runway) {
                    current_vector[current_offset + k] = static_cast<uint32_t>(uint256_t(my_group[j][k]).data[0]);

                    // Or in the extra one if there is no space left
                } else {
                    extra_denominator_uint[extra_denominator_offset] =
                        static_cast<uint32_t>(uint256_t(my_group[j][k]).data[0]);
                    extra_denominator_offset++;
                }
            }
        }
        // Copy the steps into the target polynomial
        auto starting_write_offset = current_vector.begin();
        std::advance(starting_write_offset, free_space_before_runway);
        std::copy(sorted_elements.cbegin(), sorted_elements.cend(), starting_write_offset);

        // Sort the polynomial in nondescending order
        std::sort(current_vector.begin(), current_vector.end());

        // Copy the values into the actual polynomial
        std::transform(current_vector.cbegin(),
                       current_vector.cend(),
                       (*ordered_constraint_polynomials[i]).begin(),
                       [](uint32_t in) { return FF(in); });
    };

    // Construct the first 4 polynomials
    parallel_for(num_concatenated_wires, ordering_function);
    ordered_vectors_uint.clear();

    auto sorted_element_insertion_offset = extra_denominator_uint.begin();
    std::advance(sorted_element_insertion_offset, num_concatenated_wires * sorted_elements_count);

    // Add steps to the extra denominator polynomial
    std::copy(sorted_elements.cbegin(), sorted_elements.cend(), sorted_element_insertion_offset);

    // Sort it
#ifdef NO_TBB
    std::sort(extra_denominator_uint.begin(), extra_denominator_uint.end());
#else
    std::sort(std::execution::par_unseq, extra_denominator_uint.begin(), extra_denominator.end());
#endif

    // And copy it to the actual polynomial
    std::transform(extra_denominator_uint.cbegin(),
                   extra_denominator_uint.cend(),
                   proving_key->ordered_range_constraints_4.begin(),
                   [](uint32_t in) { return FF(in); });
}
} // namespace proof_system
