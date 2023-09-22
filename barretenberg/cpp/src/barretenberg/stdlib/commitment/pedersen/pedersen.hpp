#pragma once
#include "../../primitives/byte_array/byte_array.hpp"
#include "../../primitives/field/field.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

namespace proof_system::plonk::stdlib {

template <typename ComposerContext> class pedersen_commitment {
  private:
    using bool_t = stdlib::bool_t<ComposerContext>;
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

    // TODO: kill?
    static field_t compress(type_is<field_t> auto&&... inputs)
    {
        std::vector<field_t> elements({ std::forward<typeof(inputs)>(inputs)... });
        return compress(elements);
    }

    /**
     * Compress a byte_array.
     *
     * If the input values are all zero, we return the array length instead of "0\"
     * This is because we require the inputs to regular pedersen compression function are nonzero (we use this method to
     * hash the base layer of our merkle trees)
     */
    static field_t compress(const byte_array<ComposerContext>& input)
    {
        const size_t num_bytes = input.size();
        const size_t bytes_per_element = 31;
        size_t num_elements = (num_bytes % bytes_per_element != 0) + (num_bytes / bytes_per_element);

        std::vector<field_t> elements;
        for (size_t i = 0; i < num_elements; ++i) {
            size_t bytes_to_slice = 0;
            if (i == num_elements - 1) {
                bytes_to_slice = num_bytes - (i * bytes_per_element);
            } else {
                bytes_to_slice = bytes_per_element;
            }
            auto element = static_cast<field_t>(input.slice(i * bytes_per_element, bytes_to_slice));
            elements.emplace_back(element);
        }
        field_t compressed = compress(elements, 0);

        bool_t is_zero(true);
        for (const auto& element : elements) {
            is_zero = is_zero && element.is_zero();
        }

        field_t output = field_t::conditional_assign(is_zero, field_t(num_bytes), compressed);
        return output;
    }
};

EXTERN_STDLIB_TYPE(pedersen_commitment);

} // namespace proof_system::plonk::stdlib