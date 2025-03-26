#include "poseidon.hpp"

namespace bb::crypto {

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

PoseidonHash poseidon_stark252(const std::vector<uint8_t>& input)
{
    assert(input.size() % 32 == 0);

    using Poseidon = Poseidon<PoseidonStark252BaseFieldParams>;
    using FF = Poseidon::FF;

    FF iv = FF(1);

    size_t elem_count = input.size() / 32;
    std::vector<FF> elems(2 * (1 + elem_count));

    elems[0] = FF(std::string("0x0000000000000000000000000000000000000000537461726b6e6574486f6e6b")); // "StarknetHonk"
    elems[1] = FF(0);

    for (size_t k = 0; k < input.size() / 32; ++k) {
        std::array<uint8_t, 32> limb_lo = {};
        std::array<uint8_t, 32> limb_hi = {};

        for (size_t i = 16; i < 32; ++i) {
            limb_hi[i] = input[k * 32 + i - 16];
            limb_lo[i] = input[k * 32 + i];
        }

        FF limb0 = from_buffer<FF>(limb_lo);
        FF limb1 = from_buffer<FF>(limb_hi);

        elems[2 * (1 + k) + 0] = limb0;
        elems[2 * (1 + k) + 1] = limb1;
    }

    FF output = Poseidon::hash(elems, iv);

    std::vector<uint8_t> digest = to_buffer(output);

    PoseidonHash result;
    for (size_t i = 0; i < 32; ++i) {
        result[i] = digest[i];
    }
    return result;
}

} // namespace bb::crypto
