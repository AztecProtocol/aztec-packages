#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/stdlib/hash/poseidon2/sponge/sponge.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

#include "../../primitives/circuit_builders/circuit_builders.hpp"

namespace proof_system::plonk::stdlib {

using namespace barretenberg;
/**
 * @brief stdlib class that evaluates in-circuit poseidon2 hashes, consistent with behavior in
 * crypto::poseidon2_hash
 *
 * @tparam Builder
 */
template <typename Builder> class poseidon2_hash {

  private:
    using field_t = stdlib::field_t<Builder>;
    using bool_t = stdlib::bool_t<Builder>;
    using Params = crypto::Poseidon2Bn254ScalarFieldParams;
    using Sponge = FieldSponge<field_t, Params::t - 1, 1, Params::t, Builder>;

  public:
    static field_t hash(const std::vector<field_t>& in);
    static field_t hash_buffer(const stdlib::byte_array<Builder>& input);
};

EXTERN_STDLIB_TYPE(poseidon2_hash);

} // namespace proof_system::plonk::stdlib
