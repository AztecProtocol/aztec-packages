#pragma once
#include "../../primitives/byte_array/byte_array.hpp"
#include "../../primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "../../primitives/field/field.hpp"
#include "../../primitives/point/point.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"

namespace proof_system::plonk {
namespace stdlib {

constexpr uint64_t WNAF_MASK = crypto::generators::WNAF_MASK;

template <typename CircuitBuilder> class pedersen_commitment {
  private:
    typedef stdlib::field_t<CircuitBuilder> field_t;
    typedef stdlib::point<CircuitBuilder> point;
    typedef stdlib::byte_array<CircuitBuilder> byte_array;
    typedef stdlib::bool_t<CircuitBuilder> bool_t;

  public:
    static point commit(const std::vector<field_t>& inputs, const size_t hash_index = 0);

    static field_t compress_unsafe(const field_t& left,
                                   const field_t& right,
                                   const size_t hash_index,
                                   const bool validate_input_is_in_field);

    static field_t compress(const field_t& left, const field_t& right, const size_t hash_index = 0)
    {
        return compress_unsafe(left, right, hash_index, true);
    }

    static field_t compress(const std::vector<field_t>& inputs, const size_t hash_index = 0);

    template <size_t T> static field_t compress(const std::array<field_t, T>& inputs)
    {
        std::vector<field_t> in(inputs.begin(), inputs.end());
        return compress(in);
    }
};

EXTERN_STDLIB_TYPE(pedersen_commitment);

} // namespace stdlib
} // namespace proof_system::plonk