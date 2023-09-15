#include "./secp256r1.hpp"

namespace secp256r1 {
<<<<<<< HEAD:circuits/cpp/barretenberg/cpp/src/barretenberg/ecc/curves/secp256r1/secp256r1.cpp
=======
namespace {

constexpr size_t max_num_generators = 1 << 10;
// NOLINTNEXTLINE TODO(@zac-williamson) #1806 get rid of need for these static variables in Pedersen refactor!
static std::array<g1::affine_element, max_num_generators> generators;
// NOLINTNEXTLINE TODO(@zac-williamson) #1806 get rid of need for these static variables in Pedersen refactor!
static bool init_generators = false;

} // namespace
>>>>>>> origin/master:barretenberg/cpp/src/barretenberg/ecc/curves/secp256r1/secp256r1.cpp

/* In case where prime bit length is 256, the method produces a generator, but only with one less bit of randomness than
the maximum possible, as the y coordinate in that case is determined by the x-coordinate. */
} // namespace secp256r1