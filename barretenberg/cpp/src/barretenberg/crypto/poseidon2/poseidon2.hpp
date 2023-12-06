#pragma once

#include "poseidon2_params.hpp"
#include "poseidon2_permutation.hpp"
#include "sponge/sponge.hpp"

namespace crypto {

template <typename Params> class Poseidon2 {
  public:
    using FF = typename Params::FF;

    using Sponge = FieldSponge<FF, Params::t - 1, 1, Params::t, Poseidon2Permutation<Params>>;
    static FF hash(const std::vector<FF>& input)
    {
        auto input_span = input;
        return Sponge::hash_fixed_length(input_span);
    }
    static FF hash_buffer(const std::vector<uint8_t>& input)
    {
        const size_t num_bytes = input.size();
        const size_t bytes_per_element = 31;
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
        for (size_t i = 0; i < num_elements; ++i) {
            size_t bytes_to_slice = 0;
            if (i == num_elements - 1) {
                bytes_to_slice = num_bytes - (i * bytes_per_element);
            } else {
                bytes_to_slice = bytes_per_element;
            }
            FF element = slice(input, i * bytes_per_element, bytes_to_slice);
            converted.emplace_back(element);
        }

        return hash(converted);
    }
};
} // namespace crypto