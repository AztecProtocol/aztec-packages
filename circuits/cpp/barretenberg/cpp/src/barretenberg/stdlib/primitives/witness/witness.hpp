#pragma once
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/proof_system/flavor/flavor.hpp"

namespace proof_system::plonk {
namespace stdlib {

// indicates whether a witness index actually contains a constant
static constexpr uint32_t IS_CONSTANT = UINT32_MAX;

template <typename ComposerContext> class witness_t {
  public:
    witness_t() = default;

    witness_t(ComposerContext* parent_context, const barretenberg::fr& in)
    {
        context = parent_context;
        witness = in;
        if constexpr (!IsSimulator<ComposerContext>) {
            witness_index = context->add_variable(witness);
        }
    }

    witness_t(ComposerContext* parent_context, const bool in)
    {
        context = parent_context;
        if (in) {
            barretenberg::fr::__copy(barretenberg::fr::one(), witness);
        } else {
            barretenberg::fr::__copy(barretenberg::fr::zero(), witness);
        }
        if constexpr (!IsSimulator<ComposerContext>) {
            witness_index = context->add_variable(witness);
        }
    }

    witness_t(ComposerContext* parent_context, IntegralOrEnum auto const in)
    {
        context = parent_context;
        witness = barretenberg::fr{ static_cast<uint64_t>(in), 0, 0, 0 }.to_montgomery_form();
        if constexpr (!IsSimulator<ComposerContext>) {
            witness_index = context->add_variable(witness);
        }
    }

    static witness_t create_constant_witness(ComposerContext* parent_context, const barretenberg::fr& in)
    {
        witness_t out(parent_context, in);
        if constexpr (IsSimulator<ComposerContext>) {
            parent_context->assert_equal_constant(out.witness, in, "Failed to create constant witness.");
        } else {
            parent_context->assert_equal_constant(out.witness_index, in, "Failed to create constant witness.");
        }
        return out;
    }

    barretenberg::fr witness;
    uint32_t witness_index = IS_CONSTANT;
    ComposerContext* context = nullptr;
};

template <typename ComposerContext> class public_witness_t : public witness_t<ComposerContext> {
  public:
    using witness_t<ComposerContext>::context;
    using witness_t<ComposerContext>::witness;
    using witness_t<ComposerContext>::witness_index;

    public_witness_t() = default;
    public_witness_t(ComposerContext* parent_context, const barretenberg::fr& in)
    {
        context = parent_context;
        barretenberg::fr::__copy(in, witness);
        if constexpr (!IsSimulator<ComposerContext>) {
            witness_index = context->add_public_variable(witness);
        }
    }

    public_witness_t(ComposerContext* parent_context, const bool in)
    {
        context = parent_context;
        if (in) {
            barretenberg::fr::__copy(barretenberg::fr::one(), witness);
        } else {
            barretenberg::fr::__copy(barretenberg::fr::zero(), witness);
        }
        witness_index = context->add_public_variable(witness);
    }

    template <typename T> public_witness_t(ComposerContext* parent_context, T const in)
    {
        context = parent_context;
        witness = barretenberg::fr{ static_cast<uint64_t>(in), 0, 0, 0 }.to_montgomery_form();
        if constexpr (!IsSimulator<ComposerContext>) {
            witness_index = context->add_public_variable(witness);
        }
    }
};

} // namespace stdlib
} // namespace proof_system::plonk
