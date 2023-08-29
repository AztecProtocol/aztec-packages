#pragma once
#include "../../primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "../../primitives/field/field.hpp"
#include "../../primitives/point/point.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen_refactor.hpp"

namespace proof_system::plonk::stdlib {

using namespace barretenberg;
template <typename ComposerContext> class pedersen_hash_refactor {

  private:
    using field_t = stdlib::field_t<ComposerContext>;
    using point = stdlib::point<ComposerContext>;
    using bool_t = stdlib::bool_t<ComposerContext>;

  public:
    static field_t hash_multiple(
        const std::vector<field_t>& in,
        size_t hash_index = 0,
        const std::string& domain_separator =
            crypto::pedersen_commitment_refactor::generator_info_temp::DEFAULT_DOMAIN_SEPARATOR,
        bool validate_inputs_in_field = true);

    static field_t hash(const std::vector<field_t>& in,
                        size_t hash_index = 0,
                        const std::string& domain_separator =
                            crypto::pedersen_commitment_refactor::generator_info_temp::DEFAULT_DOMAIN_SEPARATOR,
                        bool validate_inputs_in_field = true)
    {
        return hash_multiple(in, hash_index, domain_separator, validate_inputs_in_field);
    }
};

EXTERN_STDLIB_TYPE(pedersen_hash_refactor);

} // namespace proof_system::plonk::stdlib
