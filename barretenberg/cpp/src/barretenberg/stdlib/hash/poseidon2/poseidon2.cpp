#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
namespace proof_system::plonk::stdlib {

using namespace barretenberg;
using namespace proof_system;

template <typename C> field_t<C> poseidon2_hash<C>::hash(const std::vector<field_t>& inputs)
{

    /* Run the sponge by absorbing all the input and squeezing one output.
     * This should just call the sponge variable length hash function
     *
     */
    auto input{ inputs };
    return Sponge::hash_fixed_length(input);
}

/**
 * Hash a byte_array.
 *
 */
template <typename C> field_t<C> poseidon2_hash<C>::hash_buffer(const stdlib::byte_array<C>& input)
{
    const size_t num_bytes = input.size();
    const size_t bytes_per_element = 31;
    size_t num_elements = static_cast<size_t>(num_bytes % bytes_per_element != 0) + (num_bytes / bytes_per_element);

    std::vector<field_t> elements;
    for (size_t i = 0; i < num_elements; ++i) {
        size_t bytes_to_slice = 0;
        if (i == num_elements - 1) {
            bytes_to_slice = num_bytes - (i * bytes_per_element);
        } else {
            bytes_to_slice = bytes_per_element;
        }
        auto element = static_cast<field_t>(input.slice(i * bytes_per_element, bytes_to_slice));
        elements.emplace_back(element);
    }
    for (auto& x : elements) {
        std::cout << x << std::endl;
    }
    field_t hashed;
    if (elements.size() < 2) {
        hashed = hash(elements);
    } else {
        hashed = hash({ elements[0], elements[1] });
        for (size_t i = 2; i < elements.size(); ++i) {
            hashed = hash({ hashed, elements[i] });
        }
    }
    return hashed;
}
INSTANTIATE_STDLIB_TYPE(poseidon2_hash);

} // namespace proof_system::plonk::stdlib
