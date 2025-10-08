// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

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

template class poseidon2<bb::MegaCircuitBuilder>;
template class poseidon2<bb::UltraCircuitBuilder>;

} // namespace bb::stdlib
