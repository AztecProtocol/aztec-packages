#pragma once
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"

class Add2Circuit {
  public:
    using Builder = bb::UltraCircuitBuilder;
    using public_witness_ct = bb::stdlib::public_witness_t<Builder>;
    using field_ct = bb::stdlib::field_t<Builder>;
    using IO = bb::stdlib::recursion::honk::DefaultIO<Builder>;

    // Three public inputs
    static Builder generate(uint256_t inputs[])
    {

        Builder builder;

        field_ct a(public_witness_ct(&builder, inputs[0]));
        field_ct b(public_witness_ct(&builder, inputs[1]));
        field_ct c(public_witness_ct(&builder, inputs[2]));
        c.assert_equal(a + b);

        IO::add_default(builder);

        return builder;
    }
};
