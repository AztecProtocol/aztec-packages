#pragma once
#include "../../primitives/byte_array/byte_array.hpp"
#include "../../primitives/field/field.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

namespace proof_system::plonk::stdlib {

template <typename ComposerContext> class pedersen_commitment {
  private:
    using field_t = stdlib::field_t<ComposerContext>;
    using EmbeddedCurve = typename cycle_group<ComposerContext>::Curve;
    using generator_data = crypto::generator_data<EmbeddedCurve>;

  public:
    static cycle_group<ComposerContext> commit(
        const std::vector<field_t>& inputs,
        size_t hash_index = 0,
        const generator_data* generator_context = generator_data::get_default_generators());

    static field_t compress(const std::vector<field_t>& inputs,
                            size_t hash_index = 0,
                            const generator_data* generator_context = generator_data::get_default_generators());
};

EXTERN_STDLIB_TYPE(pedersen_commitment);

} // namespace proof_system::plonk::stdlib