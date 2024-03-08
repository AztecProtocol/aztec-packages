#pragma once
#include "barretenberg/proof_system/circuit_builder/goblin_ultra_circuit_builder.hpp"

namespace bb {

class MockCircuits {
  public:
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Point = Curve::AffineElement;

    /**
     * @brief Populate a builder with a specified number of arithmetic gates; includes a PI
     *
     * @param builder
     * @param num_gates
     */
    static void construct_arithmetic_circuit(GoblinUltraCircuitBuilder& builder, size_t log_num_gates = 0)
    {
        size_t num_gates = 1 << log_num_gates;
        // For good measure, include a gate with some public inputs
        {
            FF a = FF::random_element();
            FF b = FF::random_element();
            FF c = FF::random_element();
            FF d = a + b + c;
            uint32_t a_idx = builder.add_public_variable(a);
            uint32_t b_idx = builder.add_variable(b);
            uint32_t c_idx = builder.add_variable(c);
            uint32_t d_idx = builder.add_variable(d);

            builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, FF(1), FF(1), FF(1), FF(-1), FF(0) });
        }

        // Add arbitrary arithmetic gates to obtain a total of num_gates-many gates
        FF a = FF::random_element();
        FF b = FF::random_element();
        FF c = FF::random_element();
        FF d = a + b + c;
        uint32_t a_idx = builder.add_variable(a);
        uint32_t b_idx = builder.add_variable(b);
        uint32_t c_idx = builder.add_variable(c);
        uint32_t d_idx = builder.add_variable(d);

        for (size_t i = 0; i < num_gates - 1; ++i) {
            builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, FF(1), FF(1), FF(1), FF(-1), FF(0) });
        }
    }

    /**
     * @brief Populate a builder with some arbitrary goblinized ECC ops
     *
     * @param builder
     */
    static void construct_goblin_ecc_op_circuit(GoblinUltraCircuitBuilder& builder)
    {
        // Add a mul accum op and an equality op
        auto point = Point::one() * FF::random_element();
        auto scalar = FF::random_element();
        builder.queue_ecc_mul_accum(point, scalar);
        builder.queue_ecc_eq();
    }
};
} // namespace bb