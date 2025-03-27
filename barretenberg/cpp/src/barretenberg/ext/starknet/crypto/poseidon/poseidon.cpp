#include "poseidon.hpp"

namespace bb::starknet::crypto {

template <typename Params>
typename Poseidon<Params>::FF Poseidon<Params>::hash(const std::vector<typename Poseidon<Params>::FF>& input)
{
    return Sponge::hash_internal(input);
}

template <typename Params>
typename Poseidon<Params>::FF Poseidon<Params>::hash(const std::vector<typename Poseidon<Params>::FF>& input, FF iv)
{
    return Sponge::hash_internal(input, iv);
}

template class Poseidon<PoseidonStark252BaseFieldParams>;

} // namespace bb::starknet::crypto
