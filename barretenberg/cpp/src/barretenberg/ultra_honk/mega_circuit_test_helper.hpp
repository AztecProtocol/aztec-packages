#pragma once

#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"

namespace bb {

class MegaCircuitTestHelper {
  public:
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Point = Curve::AffineElement;

    static void add_some_ecc_op_gates(MegaCircuitBuilder& builder)
    {
        auto& engine = numeric::get_debug_randomness();

        for (size_t i = 0; i < 3; ++i) {
            auto point = Point::random_element(&engine);
            auto scalar = FF::random_element(&engine);
            builder.queue_ecc_add_accum(point);
            builder.queue_ecc_mul_accum(point, scalar);
        }
        builder.queue_ecc_eq();
    }

    static void construct_simple_circuit(MegaCircuitBuilder& builder)
    {
        add_some_ecc_op_gates(builder);
        MockCircuits::construct_arithmetic_circuit(builder);
        stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>::add_default(builder);
    }
};

} // namespace bb
