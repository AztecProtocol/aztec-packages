#pragma once

// TODO(@zac-williamson #2341 delete this file and rename cycle_group to group once we migrate to new hash standard)
#include "../field/field.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include "../../hash/pedersen/pedersen.hpp"

namespace proof_system::plonk {
namespace stdlib {

template <typename ComposerContext> class group {
  public:
    template <size_t num_bits> static auto fixed_base_scalar_mul_g1(const field_t<ComposerContext>& in);
    static auto fixed_base_scalar_mul(const field_t<ComposerContext>& lo, const field_t<ComposerContext>& hi);

    template <size_t num_bits>
    static auto fixed_base_scalar_mul(const field_t<ComposerContext>& in, const size_t generator_index);
};
} // namespace stdlib
} // namespace proof_system::plonk