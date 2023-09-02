#include "./secp256r1.hpp"

namespace secp256r1 {

/* In case where prime bit length is 256, the method produces a generator, but only with one less bit of randomness than
the maximum possible, as the y coordinate in that case is determined by the x-coordinate. */
} // namespace secp256r1