
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

#include "barretenberg/dsl/acir_format/block_constraint.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"

#include <cstdint>
#include <gtest/gtest.h>
#include <vector>

using namespace acir_format;

template <typename Builder> class ROMTestingFunctions {
    using MemoryConstraint = BlockConstraint;

    struct Tampering {
      public:
        enum class Mode : uint8_t { None };
        static std::vector<Mode> get_all() { return { Mode::None }; };
        static std::vector<std::string> get_labels() { return { "None" }; };
    };

    /**
     * @brief Generate valid ECDSA constraint with witness predicate equal to true
     */
    static void generate_constraints(MemoryConstraint& memory_constraint, WitnessVector& witness_values)
    {
        // 1. Create initial memory values
        std::vector<bb::fr> init_values = { bb::fr(0), bb::fr(10), bb::fr(20), bb::fr(30), bb::fr(40) };

        // 2. Add these values to witness_values and track their indices
        std::vector<poly_triple> init_polys;
        for (const auto& val : init_values) {
            uint32_t value_index = static_cast<uint32_t>(witness_values.size());
            witness_values.emplace_back(val); // Add actual value to witness

            // Create a poly_triple that represents this value
            poly_triple pt = { .a = value_index, // Index pointing to the value we just added in `witness_values`.
                               .b = 0,
                               .c = 0,
                               .q_m = 0,
                               .q_l = 1, // Just return 1*a = value
                               .q_r = 0,
                               .q_o = 0,
                               .q_c = 0 };
            init_polys.push_back(pt);
        }

        // 3. Create memory operations (read from index 2, which should give value 30)
        std::vector<MemOp> trace;

        // Add index witness
        uint32_t index_for_read = static_cast<uint32_t>(witness_values.size());
        witness_values.emplace_back(bb::fr(2)); // Read from index 2

        // Add value witness
        uint32_t value_for_read = static_cast<uint32_t>(witness_values.size());
        witness_values.emplace_back(bb::fr(30)); // Expected value at index 2

        MemOp read_op = { .access_type = 0, // READ
                          .index = poly_triple{ .a = index_for_read,
                                                .b = 0,
                                                .c = 0,
                                                .q_m = 0,
                                                .q_l = 1, // Just return the index value
                                                .q_r = 0,
                                                .q_o = 0,
                                                .q_c = 0 },
                          .value = poly_triple{ .a = value_for_read,
                                                .b = 0,
                                                .c = 0,
                                                .q_m = 0,
                                                .q_l = 1, // Just return the value
                                                .q_r = 0,
                                                .q_o = 0,
                                                .q_c = 0 } };
        trace.push_back(read_op);

        // 4. Create the BlockConstraint
        memory_constraint = BlockConstraint{ .init = init_polys, .trace = trace, .type = BlockType::ROM };
    }
};
