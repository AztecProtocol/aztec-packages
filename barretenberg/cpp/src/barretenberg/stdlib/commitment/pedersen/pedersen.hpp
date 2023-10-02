#pragma once
#include "../../primitives/byte_array/byte_array.hpp"
#include "../../primitives/field/field.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

namespace proof_system::plonk::stdlib {

template <typename CircuitBuilder> class pedersen_commitment {
  private:
    using bool_t = stdlib::bool_t<CircuitBuilder>;
    using field_t = stdlib::field_t<CircuitBuilder>;
    using EmbeddedCurve = typename cycle_group<CircuitBuilder>::Curve;
    using GeneratorContext = crypto::GeneratorContext<EmbeddedCurve>;

  public:
    static cycle_group<CircuitBuilder> commit(const std::vector<field_t>& inputs, GeneratorContext context = {});
};

EXTERN_STDLIB_TYPE(pedersen_commitment);

} // namespace proof_system::plonk::stdlib