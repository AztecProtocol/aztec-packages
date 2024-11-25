#include <fstream>
#include <iostream>
#include <string>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/uint/uint.hpp"

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

using Builder = StandardCircuitBuilder;
using bool_t = bb::stdlib::bool_t<Builder>;
using field_t = bb::stdlib::field_t<Builder>;
using witness_t = bb::stdlib::witness_t<Builder>;
using public_witness_t = bb::stdlib::public_witness_t<Builder>;
using bigfield_t = bb::stdlib::bigfield<Builder, bb::Bn254FqParams>;

int main()
{
    Builder builder;

    uint256_t nlimb0_value = 0;
    uint256_t nlimb0_max = 0;
    uint256_t nlimb1_value = (uint256_t(1) << 68);
    uint256_t nlimb1_max = (uint256_t(1) << 68);
    uint256_t nlimb2_value = 0;
    uint256_t nlimb2_max = 0;
    uint256_t nlimb3_value = 0;
    uint256_t nlimb3_max = 0;
    uint256_t nlimb_prime = 0;

    uint256_t dlimb0_value = 1;
    uint256_t dlimb0_max = 1;
    uint256_t dlimb1_value = 0;
    uint256_t dlimb1_max = 0;
    uint256_t dlimb2_value = 0;
    uint256_t dlimb2_max = 0;
    uint256_t dlimb3_value = 0;
    uint256_t dlimb3_max = 0;
    uint256_t dlimb_prime = 0;

    // try to initialize like that
    // TODO: think about this t value that is r_max0 + r_max1 << 68 // 1 << 136 and theen borrow it to lo from hi
    // also numerator is 0 for some reason

    bigfield_t w0 = bigfield_t::from_witness(&builder, bb::fq(0));
    w0.binary_basis_limbs[0].element = witness_t(&builder, dlimb0_value);
    w0.binary_basis_limbs[1].element = witness_t(&builder, dlimb1_value);
    w0.binary_basis_limbs[2].element = witness_t(&builder, dlimb2_value);
    w0.binary_basis_limbs[3].element = witness_t(&builder, dlimb3_value);
    w0.binary_basis_limbs[0].maximum_value = dlimb0_max;
    w0.binary_basis_limbs[1].maximum_value = dlimb1_max;
    w0.binary_basis_limbs[2].maximum_value = dlimb2_max;
    w0.binary_basis_limbs[3].maximum_value = dlimb3_max;
    w0.prime_basis_limb = witness_t(&builder, dlimb_prime);

    bigfield_t w1 = bigfield_t::from_witness(&builder, bb::fq(0));
    w1.binary_basis_limbs[0].element = witness_t(&builder, nlimb0_value);
    w1.binary_basis_limbs[1].element = witness_t(&builder, nlimb1_value);
    w1.binary_basis_limbs[2].element = witness_t(&builder, nlimb2_value);
    w1.binary_basis_limbs[3].element = witness_t(&builder, nlimb3_value);
    w1.binary_basis_limbs[0].maximum_value = nlimb0_max;
    w1.binary_basis_limbs[1].maximum_value = nlimb1_max;
    w1.binary_basis_limbs[2].maximum_value = nlimb2_max;
    w1.binary_basis_limbs[3].maximum_value = nlimb3_max;
    w1.prime_basis_limb = witness_t(&builder, nlimb_prime);

    info("numerator = ", w1.prime_basis_limb);
    info("numerator = ", w1);

    info("denominator = ", w0.prime_basis_limb);
    info("denominator = ", w0);
    info(builder.get_num_gates());
    info(builder.get_num_gates());

    bigfield_t w2 = w1 / w0;
    (void)w2;
    info(CircuitChecker::check(builder));
}