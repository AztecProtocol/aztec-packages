#include <gtest/gtest.h>

#include "barretenberg/proof_system/circuit_builder/standard_circuit_builder.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

#include "barretenberg/smt_verification/circuit/circuit.hpp"
#include "barretenberg/smt_verification/util/smt_util.hpp"

using namespace bb;
using namespace smt_circuit;

using field_t = stdlib::field_t<StandardCircuitBuilder>;
using witness_t = stdlib::witness_t<StandardCircuitBuilder>;
using pub_witness_t = stdlib::public_witness_t<StandardCircuitBuilder>;

namespace {
auto& engine = numeric::get_debug_randomness();
}

class StandardCircuitBuilderSMT : public testing::TestWithParam<uint32_t> {
  public:
    StandardCircuitBuilder builder;
};

TEST_P(StandardCircuitBuilderSMT, range_constraint)
{
    uint32_t n = GetParam();
    field_t a = witness_t(&builder, static_cast<uint256_t>(fr::random_element()).slice(0, n));
    builder.set_variable_name(a.get_witness_index(), "a");
    a.create_range_constraint(n);

    auto circuit_info = unpack_from_buffer(builder.export_circuit());
    SolverConfiguration config = default_solver_config;
    // config.ff_solver = "split";
    Solver s = Solver(circuit_info.modulus, config);
    auto cirs = unique_witness(circuit_info, &s, TermType::FFTerm, { "a" });

    if (n == 4) {
        s.print_assertions();
    }

    info("Gates: ", builder.get_num_gates());
    info("Variables: ", builder.get_num_variables());
    bool res = smt_timer(&s);
    if (res) {
        default_model({ "a" }, cirs.first, cirs.second, &s, "standardcb_range_unique_witness.out");
    }
    ASSERT_FALSE(res);
}

TEST_P(StandardCircuitBuilderSMT, range_constraint_bv)
{
    uint32_t n = GetParam();
    field_t a = witness_t(&builder, static_cast<uint256_t>(fr::random_element()).slice(0, n));
    builder.set_variable_name(a.get_witness_index(), "a");
    a.create_range_constraint(n);

    auto circuit_info = unpack_from_buffer(builder.export_circuit());
    Solver s = Solver(circuit_info.modulus, default_solver_config, 16, 33);
    auto cirs = unique_witness(circuit_info, &s, TermType::BVTerm, { "a" });

    info("Gates: ", builder.get_num_gates());
    info("Variables: ", builder.get_num_variables());
    bool res = smt_timer(&s);
    if (n == 4) {
        s.print_assertions();
    }
    if (res) {
        default_model({ "a" }, cirs.first, cirs.second, &s, "standardcb_range_unique_witness.out");
    }
    ASSERT_FALSE(res);
}

INSTANTIATE_TEST_SUITE_P(RangeTest, StandardCircuitBuilderSMT, ::testing::Values(1, 2, 3, 4, 5, 6, 7, 8, 9, 10));