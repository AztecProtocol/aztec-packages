// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "poseidon2.hpp"

namespace bb::crypto {
/**
 * @brief Hashes a vector of field elements
 */
template <typename Params>
typename Poseidon2<Params>::FF Poseidon2<Params>::hash(const std::vector<typename Poseidon2<Params>::FF>& input)
{
    return Sponge::hash_internal(input);
}

template class Poseidon2<Poseidon2Bn254ScalarFieldParams>;
} // namespace bb::crypto
