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

    static field_t compress(const std::vector<field_t>& inputs, GeneratorContext context = {});

    /**
     * Compress a byte_array.
     *
     * If the input values are all zero, we return the array length instead of "0\"
     * This is because we require the inputs to regular pedersen compression function are nonzero (we use this method to
     * hash the base layer of our merkle trees)
     */
    static field_t compress(const byte_array<CircuitBuilder>& input)
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