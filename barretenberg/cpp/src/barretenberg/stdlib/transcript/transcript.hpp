// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"
#include "barretenberg/stdlib/primitives/field/field_utils.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#include "barretenberg/transcript/transcript.hpp"
namespace bb::stdlib::recursion::honk {

template <typename Builder> struct StdlibTranscriptParams {
    using DataType = stdlib::field_t<Builder>;
    using Proof = std::vector<DataType>;

    static DataType hash(const std::vector<DataType>& data)
    {

        ASSERT(!data.empty());
        return stdlib::poseidon2<Builder>::hash(data);
    }
    /**
     * @brief Split a challenge field element into two half-width challenges
     * @details `lo` is 128 bits and `hi` is 126 bits which should provide significantly more than our security
     * parameter bound: 100 bits. The decomposition is constrained to be unique.
     *
     * @param challenge
     * @return std::array<DataType, 2>
     */
    static std::array<DataType, 2> split_challenge(const DataType& challenge)
    {
        const size_t lo_bits = DataType::native::Params::MAX_BITS_PER_ENDOMORPHISM_SCALAR;
        // Constuct a unique lo/hi decomposition of the challenge (hi_bits will be 254 - 128 = 126)
        const auto [lo, hi] = split_unique(challenge, lo_bits);
        return std::array<DataType, 2>{ lo, hi };
    }
    template <typename T> static T convert_challenge(const DataType& challenge)
    {
        return bb::stdlib::field_conversion::convert_challenge<Builder, T>(challenge);
    }

    template <typename T> static constexpr size_t calc_num_data_types()
    {
        return bb::stdlib::field_conversion::calc_num_bn254_frs<Builder, T>();
    }

    template <typename T> static T deserialize(std::span<const DataType> frs)
    {
        ASSERT(!frs.empty());
        return bb::stdlib::field_conversion::convert_from_bn254_frs<Builder, T>(frs);
    }

    template <typename T> static std::vector<DataType> serialize(const T& element)
    {
        return bb::stdlib::field_conversion::convert_to_bn254_frs<Builder, T>(element);
    }
};

using UltraStdlibTranscript = BaseTranscript<StdlibTranscriptParams<UltraCircuitBuilder>>;
using MegaStdlibTranscript = BaseTranscript<StdlibTranscriptParams<MegaCircuitBuilder>>;
} // namespace bb::stdlib::recursion::honk
