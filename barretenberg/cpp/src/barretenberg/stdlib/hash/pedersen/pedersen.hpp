#pragma once
#include "../../primitives/field/field.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

#include "../../primitives/circuit_builders/circuit_builders.hpp"

namespace proof_system::plonk::stdlib {

using namespace barretenberg;
/**
 * @brief stdlib class that evaluates in-circuit pedersen hashes, consistent with behavior in
 * crypto::pedersen_hash
 *
 * @tparam ComposerContext
 */
template <typename ComposerContext> class pedersen_hash {

  private:
    using field_t = stdlib::field_t<ComposerContext>;
    using bool_t = stdlib::bool_t<ComposerContext>;
    using EmbeddedCurve = typename cycle_group<ComposerContext>::Curve;
    using GeneratorContext = crypto::GeneratorContext<EmbeddedCurve>;

  public:
    static field_t hash(const std::vector<field_t>& in, GeneratorContext context = {});

    // TODO health warnings!
    static field_t hash_skip_field_validation(const std::vector<field_t>& in, GeneratorContext context = {});
};

EXTERN_STDLIB_TYPE(pedersen_hash);

} // namespace proof_system::plonk::stdlib
