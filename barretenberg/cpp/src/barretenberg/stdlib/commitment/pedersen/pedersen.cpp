#include "pedersen.hpp"
#include "../../hash/pedersen/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "pedersen_plookup.hpp"

#include "../../primitives/packed_byte_array/packed_byte_array.hpp"

namespace proof_system::plonk {
namespace stdlib {

using namespace crypto::generators;
using namespace barretenberg;
using namespace crypto::pedersen_commitment;

template <typename C>
point<C> pedersen_commitment<C>::commit(const std::vector<field_t>& inputs, const size_t hash_index)
{
    if constexpr (HasPlookup<C> && C::commitment_type == pedersen::CommitmentType::LOOKUP_PEDERSEN) {
        return pedersen_plookup_commitment<C>::commit(inputs, hash_index);
    }

    std::vector<point> to_accumulate;
    for (size_t i = 0; i < inputs.size(); ++i) {
        generator_index_t index = { hash_index, i };
        to_accumulate.push_back(pedersen_hash<C>::commit_single(inputs[i], index));
    }
    return pedersen_hash<C>::accumulate(to_accumulate);
}

/**
 * Compress the pair (in_left, in_right) with a given hash index.
 * Called unsafe because this allows the option of not validating the input elements are unique, i.e. <r
 */
template <typename C>
field_t<C> pedersen_commitment<C>::compress_unsafe(const field_t& in_left,
                                                   const field_t& in_right,
                                                   const size_t hash_index,
                                                   const bool validate_input_is_in_field)
{
    if constexpr (HasPlookup<C> && C::commitment_type == pedersen::CommitmentType::LOOKUP_PEDERSEN) {
        return pedersen_plookup_commitment<C>::compress({ in_left, in_right });
    }

    std::vector<point> accumulators;
    generator_index_t index_1 = { hash_index, 0 };
    generator_index_t index_2 = { hash_index, 1 };
    accumulators.push_back(pedersen_hash<C>::commit_single(in_left, index_1, validate_input_is_in_field));
    accumulators.push_back(pedersen_hash<C>::commit_single(in_right, index_2, validate_input_is_in_field));
    return pedersen_hash<C>::accumulate(accumulators).x;
}

/**
 * Compress a vector of scalars with a given hash index.
 */
template <typename C>
field_t<C> pedersen_commitment<C>::compress(const std::vector<field_t>& inputs, const size_t hash_index)
{
    if constexpr (HasPlookup<C> && C::commitment_type == pedersen::CommitmentType::LOOKUP_PEDERSEN) {
        return pedersen_plookup_commitment<C>::compress(inputs, hash_index);
    }

    return commit(inputs, hash_index).x;
}

INSTANTIATE_STDLIB_TYPE(pedersen_commitment);

} // namespace stdlib
} // namespace proof_system::plonk