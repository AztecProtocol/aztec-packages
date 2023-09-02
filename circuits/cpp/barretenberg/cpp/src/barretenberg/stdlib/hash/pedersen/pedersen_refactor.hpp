#pragma once
#include "../../primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "../../primitives/field/field.hpp"
#include "../../primitives/point/point.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen_refactor.hpp"

namespace proof_system::plonk::stdlib {

using namespace barretenberg;
/**
 * @brief stdlib class that evaluates in-circuit pedersen hashes, consistent with behavior in
 * crypto::pedersen_hash_refactor
 *
 * @tparam ComposerContext
 */
template <typename ComposerContext> class pedersen_hash_refactor {

  private:
    using field_t = stdlib::field_t<ComposerContext>;
    using point = stdlib::point<ComposerContext>;
    using bool_t = stdlib::bool_t<ComposerContext>;

  public:
    // TODO(@suyash67) as part of refactor project, can we remove this and replace with `hash`
    // (i.e. simplify the name as we no longer have a need for `hash_single`)
    static field_t hash_multiple(const std::vector<field_t>& in,
                                 size_t hash_index = 0,
                                 const std::string& domain_separator = grumpkin::g1::DEFAULT_DOMAIN_SEPARATOR,
                                 bool validate_inputs_in_field = true);

    static field_t hash(const std::vector<field_t>& in,
                        size_t hash_index = 0,
                        const std::string& domain_separator = grumpkin::g1::DEFAULT_DOMAIN_SEPARATOR,
                        bool validate_inputs_in_field = true);
};

EXTERN_STDLIB_TYPE(pedersen_hash_refactor);

} // namespace proof_system::plonk::stdlib
