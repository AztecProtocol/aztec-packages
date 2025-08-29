// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/stdlib/hash/poseidon2/sponge/sponge.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb::stdlib {

/**
 * @brief stdlib class that evaluates in-circuit poseidon2 hashes, consistent with behavior in
 * crypto::poseidon2
 *
 * @tparam Builder
 */
template <typename Builder> class poseidon2 {

  private:
    using field_ct = stdlib::field_t<Builder>;
    using Params = crypto::Poseidon2Bn254ScalarFieldParams;
    using Permutation = Poseidon2Permutation<Builder>;
    using Sponge = FieldSponge<Builder>;

  public:
    static field_ct hash(const std::vector<field_ct>& in);
};

} // namespace bb::stdlib
