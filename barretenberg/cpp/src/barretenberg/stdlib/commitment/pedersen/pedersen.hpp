// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "../../primitives/field/field.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

namespace bb::stdlib {

/**
 * @brief In-circuit Pedersen commitment implementation
 *
 * @tparam Builder
 */
template <typename Builder> class pedersen_commitment {
  private:
    using field_t = stdlib::field_t<Builder>;                         // BN254 scalar field element
    using cycle_group = stdlib::cycle_group<Builder>;                 // Grumpkin curve point
    using EmbeddedCurve = typename cycle_group::Curve;                // Grumpkin curve type
    using cycle_scalar = typename cycle_group::cycle_scalar;          // Grumpkin scalar field element
    using GeneratorContext = crypto::GeneratorContext<EmbeddedCurve>; // Generator configuration

  public:
    static cycle_group commit(const std::vector<field_t>& inputs, GeneratorContext context = {});
};

} // namespace bb::stdlib
