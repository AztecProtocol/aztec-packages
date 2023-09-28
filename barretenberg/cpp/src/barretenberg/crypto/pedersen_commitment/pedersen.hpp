#pragma once

#include "../generators/generator_data.hpp"
#include "barretenberg/common/container.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <array>

namespace crypto {

/**
 * @brief Performs pedersen commitments!
 *
 * To commit to a size-n list of field elements `x`, a commitment is defined as:
 *
 *      Commit(x) = x[0].g[0] + x[1].g[1] + ... + x[n-1].g[n-1]
 *
 * Where `g` is a list of generator points defined by `generator_data`
 *
 */
template <typename Curve> class pedersen_commitment_base {
  public:
    using AffineElement = typename Curve::AffineElement;
    using Element = typename Curve::Element;
    using Fr = typename Curve::ScalarField;
    using Fq = typename Curve::BaseField;
    using Group = typename Curve::Group;
    using GeneratorContext = typename crypto::GeneratorContext<Curve>;

    static AffineElement commit_native(const std::vector<Fq>& inputs, GeneratorContext context = {});

    static Fq compress_native(const std::vector<Fq>& inputs, GeneratorContext context = {});

    /**
     * @brief Converts input uint8_t buffers into vector of field elements. Used to hash the Transcript in a
     * SNARK-friendly manner for recursive circuits.
     *
     * `buffer` is an unstructured byte array we want to convert these into field elements
     * prior to hashing. We do this by splitting buffer into 31-byte chunks.
     *
     * @param buffer
     * @return std::vector<Fq>
     */
    inline static std::vector<Fq> convert_buffer_to_field(const std::vector<uint8_t>& input)
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
            return Fq(result);
        };

        std::vector<Fq> elements;
        for (size_t i = 0; i < num_elements; ++i) {
            size_t bytes_to_slice = 0;
            if (i == num_elements - 1) {
                bytes_to_slice = num_bytes - (i * bytes_per_element);
            } else {
                bytes_to_slice = bytes_per_element;
            }
            Fq element = slice(input, i * bytes_per_element, bytes_to_slice);
            elements.emplace_back(element);
        }
        return elements;
    }

    /**
     * Given an arbitrary length of bytes, convert them to fields and compress the result using the default generators.
     */
    static Fq compress_native_buffer_to_field(const std::vector<uint8_t>& input, const size_t hash_index)
    {
        const auto elements = convert_buffer_to_field(input);
        GeneratorContext base = {}; // todo remove
        base.offset = hash_index;
        Fq result_fq = compress_native(elements, base);
        return result_fq;
    }

    static Fq compress_native(const std::vector<uint8_t>& input, const size_t hash_index = 0)
    {
        return compress_native_buffer_to_field(input, hash_index);
    }

    template <size_t T> static Fq compress_native(const std::array<Fq, T>& input, const size_t hash_index = 0)
    {
        std::vector<Fq> converted(input.begin(), input.end());
        GeneratorContext base = {}; // todo remove
        base.offset = hash_index;
        return compress_native(converted, base);
    }
};

extern template class pedersen_commitment_base<curve::Grumpkin>;

using pedersen_commitment = pedersen_commitment_base<curve::Grumpkin>;
} // namespace crypto
