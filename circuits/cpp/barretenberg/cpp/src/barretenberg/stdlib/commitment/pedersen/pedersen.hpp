#pragma once
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "../../primitives/composers/composers_fwd.hpp"
#include "../../primitives/field/field.hpp"
#include "../../primitives/point/point.hpp"
#include "../../primitives/byte_array/byte_array.hpp"

namespace proof_system::plonk {
namespace stdlib {

constexpr uint64_t WNAF_MASK = crypto::generators::WNAF_MASK;

template <typename ComposerContext> class pedersen_commitment {
  private:
    typedef stdlib::field_t<ComposerContext> field_t;
    typedef stdlib::point<ComposerContext> point;
    typedef stdlib::byte_array<ComposerContext> byte_array;
    typedef stdlib::bool_t<ComposerContext> bool_t;

  public:
    static point commit(const std::vector<field_t>& inputs, const size_t hash_index = 0);

    static point commit(const std::vector<field_t>& inputs,
                        const std::vector<crypto::generators::generator_index_t>& hash_generator_indices);

    static point commit(const std::vector<std::pair<field_t, crypto::generators::generator_index_t>>& input_pairs);

    static field_t compress_unsafe(const field_t& left,
                                   const field_t& right,
                                   const size_t hash_index,
                                   const bool validate_input_is_in_field);

    static field_t compress(const field_t& left, const field_t& right, const size_t hash_index = 0)
    {
        return compress_unsafe(left, right, hash_index, true);
    }

    static field_t compress(const std::vector<field_t>& inputs, const size_t hash_index = 0);

    static field_t compress(const std::vector<field_t>& inputs,
                            const std::vector<crypto::generators::generator_index_t>& hash_generator_indices);

    static field_t compress(const std::vector<std::pair<field_t, crypto::generators::generator_index_t>>& input_pairs);

    template <size_t T> static field_t compress(const std::array<field_t, T>& inputs)
    {
        std::vector<field_t> in(inputs.begin(), inputs.end());
        return compress(in);
    }

    static field_t compress(const byte_array& inputs);
};

EXTERN_STDLIB_TYPE(pedersen_commitment);

} // namespace stdlib
} // namespace proof_system::plonk