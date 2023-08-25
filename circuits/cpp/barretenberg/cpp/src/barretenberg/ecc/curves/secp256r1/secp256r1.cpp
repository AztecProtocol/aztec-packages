#include "./secp256r1.hpp"

namespace secp256r1 {

/* In case where prime bit length is 256, the method produces a generator, but only with one less bit of randomness than
the maximum possible, as the y coordinate in that case is determined by the x-coordinate. */
g1::affine_element get_generator(const size_t generator_index)
{
    return g1::get_secure_generator_from_index(generator_index, "secp256r1_default_generator");
}
} // namespace secp256r1