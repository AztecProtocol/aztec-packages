#ifdef STARKNET_GARAGA_FLAVORS
#pragma once

#include "barretenberg/ext/starknet/crypto/poseidon/poseidon.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb::starknet {

inline bb::fr starknet_hash_uint256(std::vector<bb::fr> const& data)
{
    using Poseidon = crypto::Poseidon<crypto::PoseidonStark252BaseFieldParams>;
    using FF = Poseidon::FF;

    size_t elem_count = data.size();
    std::vector<FF> elems(2 * (1 + elem_count));

    elems[0] = FF(std::string("0x0000000000000000000000000000000000000000537461726b6e6574486f6e6b")); // "StarknetHonk"
    elems[1] = FF(0);

    for (size_t k = 0; k < elem_count; ++k) {
        std::vector<uint8_t> input = to_buffer(data[k]);

        std::array<uint8_t, 32> limb_lo = {};
        std::array<uint8_t, 32> limb_hi = {};

        for (size_t i = 16; i < 32; ++i) {
            limb_hi[i] = input[i - 16];
            limb_lo[i] = input[i];
        }

        elems[2 * (1 + k)] = from_buffer<FF>(limb_lo);
        elems[2 * (1 + k) + 1] = from_buffer<FF>(limb_hi);
    }

    FF iv = FF(1);

    FF output = Poseidon::hash(elems, iv);

    std::vector<uint8_t> result = to_buffer(output);

    auto result_fr = from_buffer<bb::fr>(result);

    return result_fr;
}

struct StarknetTranscriptParams : public bb::KeccakTranscriptParams {
    static inline Fr hash(const std::vector<Fr>& data) { return starknet_hash_uint256(data); }
};

using StarknetTranscript = bb::BaseTranscript<StarknetTranscriptParams>;

} // namespace bb::starknet
#endif
