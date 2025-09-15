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
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#include "barretenberg/transcript/transcript.hpp"
namespace bb::stdlib::recursion::honk {

template <typename Builder> struct StdlibTranscriptParams {
    using DataType = stdlib::field_t<Builder>;
    using Proof = std::vector<DataType>;

    static inline DataType hash(const std::vector<DataType>& data)
    {

        ASSERT(!data.empty());
        return stdlib::poseidon2<Builder>::hash(data);
    }
    /**
     * @brief Split a challenge field element into two half-width challenges
     * @details `lo` is 128 bits and `hi` is 126 bits.
     * This should provide significantly more than our security parameter bound: 100 bits
     *
     * @param challenge
     * @return std::array<DataType, 2>
     */
    static inline std::array<DataType, 2> split_challenge(const DataType& challenge)
    {
        // Note: Current choice of bit splitting is somewhat arbitrary and based on historic use of cycle_scalar.
        const size_t lo_bits = 128;
        const size_t hi_bits = 126;
        const auto [lo, hi] = challenge.split_at(lo_bits);
        // WORKTODO: are these range constraints necessary?
        lo.create_range_constraint(lo_bits);
        hi.create_range_constraint(hi_bits);
        return std::array<DataType, 2>{ lo, hi };
    }
    template <typename T> static inline T convert_challenge(const DataType& challenge)
    {
        Builder* builder = challenge.get_context();
        return bb::stdlib::field_conversion::convert_challenge<Builder, T>(*builder, challenge);
    }

    template <typename T> static constexpr size_t calc_num_data_types()
    {
        return bb::stdlib::field_conversion::calc_num_bn254_frs<Builder, T>();
    }

    template <typename T> static inline T deserialize(std::span<const DataType> frs)
    {
        ASSERT(!frs.empty());
        ASSERT(frs[0].get_context() != nullptr);
        Builder* builder = frs[0].get_context();
        return bb::stdlib::field_conversion::convert_from_bn254_frs<Builder, T>(*builder, frs);
    }

    template <typename T> static inline std::vector<DataType> serialize(const T& element)
    {
        return bb::stdlib::field_conversion::convert_to_bn254_frs<Builder, T>(element);
    }
};

using UltraStdlibTranscript = BaseTranscript<StdlibTranscriptParams<UltraCircuitBuilder>>;
using MegaStdlibTranscript = BaseTranscript<StdlibTranscriptParams<MegaCircuitBuilder>>;
} // namespace bb::stdlib::recursion::honk
