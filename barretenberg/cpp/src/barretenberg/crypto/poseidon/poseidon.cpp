#include "./poseidon.hpp"
#include "./poseidon_params.hpp"
#include "./poseidon_permutation.hpp"

namespace bb::crypto {

PoseidonHash poseidon_stark252(const std::vector<uint8_t>& input)
{
    assert(input.size() % 32 == 0);

    using Permutation = PoseidonPermutation<PoseidonStark252BaseFieldParams>;
    using State = Permutation::State;
    using FF = Permutation::FF;

    State state = {
      FF(1),
      FF(0),
      FF(std::string("0x0000000000000000000000000000000000000000537461726b6e6574486f6e6b")), // "StarknetHonk"
    };

    state = Permutation::permutation(state);

    for (size_t k = 0; k < input.size() / 32; ++k) {
        std::array<uint8_t, 32> limb_lo = {};
        std::array<uint8_t, 32> limb_hi = {};

        for (size_t i = 16; i < 32; ++i) {
            limb_hi[i] = input[k * 32 + i - 16];
            limb_lo[i] = input[k * 32 + i];
        }

        FF limb0 = from_buffer<FF>(limb_lo);
        FF limb1 = from_buffer<FF>(limb_hi);

        state[2] += limb0;
        state[1] += limb1;

        state = Permutation::permutation(state);
    }

    std::vector<uint8_t> digest = to_buffer(state[2]);

    PoseidonHash result;
    for (size_t i = 0; i < 32; ++i) {
        result[i] = digest[i];
    }
    return result;
}

} // namespace bb::crypto
