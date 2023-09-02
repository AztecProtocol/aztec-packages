#include "./secp256k1.hpp"

namespace secp256k1 {

/* In case where prime bit length is 256, the method produces a generator, but only with one less bit of randomness than
the maximum possible, as the y coordinate in that case is determined by the x-coordinate. */
// g1::affine_element get_generator(const size_t generator_index)
// {
//     if (!init_generators) {
//         generators = g1::derive_generators<max_num_generators>();
//         init_generators = true;
//     }
//     ASSERT(generator_index < max_num_generators);
//     return generators[generator_index];
// }
} // namespace secp256k1