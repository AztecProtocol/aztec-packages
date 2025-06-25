// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/stdlib/primitives//circuit_builders/circuit_builders.hpp"

namespace bb::stdlib {

// indicates whether a witness index actually contains a constant
static constexpr uint32_t IS_CONSTANT = UINT32_MAX;

template <typename Builder> class witness_t {
  public:
    witness_t() = default;

    /**
     * @brief Construct a new witness object
     *
     * @param parent_context circuit builder/context
     * @param in bb:fr value to be used as a witness
     */
    witness_t(Builder* parent_context, const bb::fr& in)
        : witness(in)
        , context(parent_context)
    {
        witness_index = context->add_variable(witness);
    }

    /**
     * @brief Construct a new witness object from a constant boolean value
     *
     * @param parent_context circuit builder/context
     * @param in boolean value to be used as a witness
     */
    witness_t(Builder* parent_context, const bool in)
        : context(parent_context)
    {
        witness = in ? bb::fr::one() : bb::fr::zero();
        witness_index = context->add_variable(witness);
    }

    /**
     * @brief Construct a new witness object from an integral or enum type
     *
     * @param parent_context circuit builder/context
     * @param in integral or enum value to be used as a witness
     */
    witness_t(Builder* parent_context, IntegralOrEnum auto const in)
        : context(parent_context)
    {
        // The field constructor should handle integral or enum types correctly.
        witness = bb::fr(in);
        witness_index = context->add_variable(witness);
    }

    /**
     * @brief Create a constant witness object
     *
     * @param parent_context circuit builder/context
     * @param in bb::fr value to be used as a constant witness
     * @return witness_t<Builder> constant witness object
     *
     * @details This function creates a witness that is guaranteed to be constant, meaning it will not change during the
     * execution of the circuit. We enforce this by adding a gate that constrains in + q_c = 0, where selector q_c =
     * -in_value. Notice that the value `in` becomes public as selectors are public.
     */
    static witness_t create_constant_witness(Builder* parent_context, const bb::fr& in)
    {
        witness_t out(parent_context, in);
        parent_context->assert_equal_constant(out.witness_index, in, "Failed to create constant witness.");
        return out;
    }

    bb::fr witness;
    uint32_t witness_index = IS_CONSTANT;
    Builder* context = nullptr;
};

template <typename Builder> class public_witness_t : public witness_t<Builder> {
  public:
    using witness_t<Builder>::context;
    using witness_t<Builder>::witness;
    using witness_t<Builder>::witness_index;

    public_witness_t() = default;
    public_witness_t(Builder* parent_context, const bb::fr& in)
    {
        context = parent_context;
        witness = in;
        witness_index = context->add_public_variable(witness);
    }

    public_witness_t(Builder* parent_context, const bool in)
    {
        context = parent_context;
        witness = in ? bb::fr::one() : bb::fr::zero();
        witness_index = context->add_public_variable(witness);
    }

    template <typename T> public_witness_t(Builder* parent_context, T const in)
    {
        context = parent_context;
        // The field constructor should handle integral or enum types correctly.
        witness = bb::fr(in);
        witness_index = context->add_public_variable(witness);
    }
};

} // namespace bb::stdlib
