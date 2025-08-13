// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
namespace bb::stdlib {

using namespace bb;

/**
 * @brief Hash a vector of field_ct.
 */
template <typename C> field_t<C> poseidon2<C>::hash(C& builder, const std::vector<field_ct>& inputs)
{

    /* Run the sponge by absorbing all the input and squeezing one output.
     * This should just call the sponge variable length hash function
     *
     */
    return Sponge::hash_internal(builder, inputs);
}

template class poseidon2<bb::MegaCircuitBuilder>;
template class poseidon2<bb::UltraCircuitBuilder>;

} // namespace bb::stdlib
