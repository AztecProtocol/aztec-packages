#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
namespace bb::stdlib {

/**
 * @brief Hash a vector of field_ct.
 */
template <typename C> field_t<C> poseidon2<C>::hash(const std::vector<field_ct>& inputs)
{

    /* Run the sponge by absorbing all the input and squeezing one output.
     *
     */
    return Sponge::hash_internal(inputs);
}

INSTANTIATE_CLASS_FOR_EACH_MEGA_BUILDER(poseidon2)
template class poseidon2<bb::UltraCircuitBuilder>;

} // namespace bb::stdlib
