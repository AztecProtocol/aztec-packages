// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/packed_byte_array/packed_byte_array.hpp"
#include "barretenberg/stdlib/primitives/uint/uint.hpp"
#include "sha256_plookup.hpp"
#include <array>
// namespace bb

namespace bb::stdlib {

template <typename Builder>
std::array<uint32<Builder>, 8> sha256_block(const std::array<uint32<Builder>, 8>& h_init,
                                            const std::array<uint32<Builder>, 16>& input);

template <typename Builder> byte_array<Builder> sha256_block(const byte_array<Builder>& input);
template <typename Builder> packed_byte_array<Builder> sha256(const packed_byte_array<Builder>& input);

template <typename Builder> field_t<Builder> sha256_to_field(const packed_byte_array<Builder>& input)
{
    std::vector<field_t<Builder>> slices = stdlib::sha256<Builder>(input).to_unverified_byte_slices(16);
    return slices[1] + (slices[0] * (uint256_t(1) << 128));
}

template <typename Builder> void generate_sha256_test_circuit(Builder& builder, size_t num_iterations);

} // namespace bb::stdlib
