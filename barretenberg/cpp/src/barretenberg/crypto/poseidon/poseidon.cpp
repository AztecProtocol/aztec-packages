#include "./poseidon.hpp"
#include "./poseidon_params.hpp"
#include "./poseidon_permutation.hpp"
#include "../poseidon2/sponge/sponge.hpp"

namespace bb::crypto {

template <typename Params> class Poseidon {
  public:
    using FF = typename Params::FF;

    using Sponge = FieldSponge<FF, Params::t - 1, 1, Params::t, PoseidonPermutation<Params>>;

    static FF hash(const std::vector<FF>& input);

    static FF hash_buffer(const std::vector<uint8_t>& input);
};

extern template class Poseidon<PoseidonStark252BaseFieldParams>;

template <typename Params>
typename Poseidon<Params>::FF Poseidon<Params>::hash(const std::vector<typename Poseidon<Params>::FF>& input)
{
    std::vector<FF> modified_input = { FF(1), FF(0) };
    modified_input.insert(modified_input.end(), input.begin(), input.end());
    FF iv = FF(std::string("0x0000000000000000000000000000000000000000537461726b6e6574486f6e6b")); // "StarknetHonk"
    return Sponge::hash_internal(modified_input, iv);
}

template <typename Params>
typename Poseidon<Params>::FF Poseidon<Params>::hash_buffer(const std::vector<uint8_t>& input)
{
    const size_t num_bytes = input.size();
    const size_t bytes_per_element = 16;
    size_t num_elements = static_cast<size_t>(num_bytes % bytes_per_element != 0) + (num_bytes / bytes_per_element);

    const auto slice = [](const std::vector<uint8_t>& data, const size_t start, const size_t slice_size) {
        uint256_t result(0);
        for (size_t i = 0; i < slice_size; ++i) {
            result = (result << uint256_t(8));
            result += uint256_t(data[i + start]);
        }
        return FF(result);
    };

    std::vector<FF> converted;
    for (size_t i = 0; i < num_elements - 1; ++i) {
        size_t bytes_to_slice = bytes_per_element;
        FF element = slice(input, i * bytes_per_element, bytes_to_slice);
        converted.emplace_back(element);
    }
    size_t bytes_to_slice = num_bytes - ((num_elements - 1) * bytes_per_element);
    FF element = slice(input, (num_elements - 1) * bytes_per_element, bytes_to_slice);
    converted.emplace_back(element);

    for (size_t i = 0; i < num_elements / 2; i += 2) {
        auto t = converted[i + 1];
        converted[i + 1] = converted[i];
        converted[i] = t;
    }

    return hash(converted);
}

template class Poseidon<PoseidonStark252BaseFieldParams>;

PoseidonHash poseidon_stark252(const std::vector<uint8_t>& input)
{
    assert(input.size() % 32 == 0);

    using Permutation = PoseidonPermutation<PoseidonStark252BaseFieldParams>;
    using State = Permutation::State;
    using FF = Permutation::FF;

    //size_t elem_count = input.size() / 32;
    //std::vector<FF> elems(2 * elem_count);

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

        //elems[2 * k + 0] = limb0;
        //elems[2 * k + 1] = limb1;

        state[0] += limb0;
        state[1] += limb1;

        state = Permutation::permutation(state);
    }

    //FF output1 = Poseidon<PoseidonStark252BaseFieldParams>::hash_buffer(input);
    //FF output2 = Poseidon<PoseidonStark252BaseFieldParams>::hash(elems);
    //std::cout << output1 << std::endl;
    //std::cout << output2 << std::endl;
    //std::cout << state[0] << std::endl;

    std::vector<uint8_t> digest = to_buffer(state[0]);

    PoseidonHash result;
    for (size_t i = 0; i < 32; ++i) {
        result[i] = digest[i];
    }
    return result;
}

} // namespace bb::crypto
