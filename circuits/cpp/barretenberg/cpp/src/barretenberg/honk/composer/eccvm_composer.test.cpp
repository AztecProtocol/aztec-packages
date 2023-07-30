#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>
#include <vector>

#include "barretenberg/honk/composer/eccvm_composer.hpp"
#include "barretenberg/honk/proof_system/prover.hpp"
#include "barretenberg/honk/sumcheck/relations/permutation_relation.hpp"
#include "barretenberg/honk/sumcheck/relations/relation_parameters.hpp"
#include "barretenberg/honk/sumcheck/sumcheck_round.hpp"
#include "barretenberg/honk/utils/grand_product_delta.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/proof_system/circuit_builder/eccvm/eccvm_circuit_builder.hpp"

using namespace proof_system::honk;

namespace test_standard_honk_composer {

class ECCVMComposerTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { barretenberg::srs::init_crs_factory("../srs_db/ignition"); }
};
namespace {
auto& engine = numeric::random::get_debug_engine();
}
proof_system::ECCVMCircuitConstructor<flavor::ECCVM> generate_trace(numeric::random::Engine* engine = nullptr)
{
    proof_system::ECCVMCircuitConstructor<flavor::ECCVM> result;

    grumpkin::g1::element a = grumpkin::get_generator(0);
    grumpkin::g1::element b = grumpkin::get_generator(1);
    grumpkin::g1::element c = grumpkin::get_generator(2);
    grumpkin::fr x = grumpkin::fr::random_element(engine);
    grumpkin::fr y = grumpkin::fr::random_element(engine);

    grumpkin::g1::element expected_1 = (a * x) + a + a + (b * y) + (b * x) + (b * x);
    grumpkin::g1::element expected_2 = (a * x) + c + (b * x);

    result.add_accumulate(a);
    result.mul_accumulate(a, x);
    result.mul_accumulate(b, x);
    result.mul_accumulate(b, y);
    result.add_accumulate(a);
    result.mul_accumulate(b, x);
    result.eq(expected_1);
    result.add_accumulate(c);
    result.mul_accumulate(a, x);
    result.mul_accumulate(b, x);
    result.eq(expected_2);
    result.mul_accumulate(a, x);
    result.mul_accumulate(b, x);
    result.mul_accumulate(c, x);

    return result;
}

TEST_F(ECCVMComposerTests, BaseCase)
{
    auto circuit_constructor = generate_trace(&engine);

    auto composer = ECCVMComposerHelper();
    auto prover = composer.create_prover(circuit_constructor);

    //    / size_t pidx = 0;
    // for (auto& p : prover.prover_polynomials) {
    //     size_t count = 0;
    //     for (auto& x : p) {
    //         std::cout << "poly[" << pidx << "][" << count << "] = " << x << std::endl;
    //         count++;
    //     }
    //     pidx++;
    // }
    auto proof = prover.construct_proof();
    auto verifier = composer.create_verifier(circuit_constructor);
    bool verified = verifier.verify_proof(proof);
    ASSERT_TRUE(verified);
}

TEST_F(ECCVMComposerTests, EqFails)
{
    auto circuit_constructor = generate_trace(&engine);
    // create an eq opcode that is not satisfied
    circuit_constructor.eq(grumpkin::g1::affine_one);
    auto composer = ECCVMComposerHelper();
    auto prover = composer.create_prover(circuit_constructor);

    auto proof = prover.construct_proof();
    auto verifier = composer.create_verifier(circuit_constructor);
    bool verified = verifier.verify_proof(proof);
    ASSERT_FALSE(verified);
}
} // namespace test_standard_honk_composer
