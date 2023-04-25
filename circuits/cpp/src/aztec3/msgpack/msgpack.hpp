#pragma once
/* Minimal header for msgpack. This should be included, *not* msgpack.hpp directly.
 * That should be treated as an implementation-only header./

/* start of #define NVP:
 * expands to key-value pairs, e.g. NVP(x,y,z) -> "x", x, "y", y", "z", z
 * used in msgpack serialization. */

// hacky counting of variadic macro params:
#define VA_NARGS_IMPL(_1, _2, _3, _4, _5, _6, _7, _8, _9, _10, N, ...) N
#define VA_NARGS(...) VA_NARGS_IMPL(__VA_ARGS__, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1)

// name-value pair expansion for variables
// used in msgpack map expansion
// n<=3 case
#define _NVP1(x) #x, x
#define _NVP2(x, y) #x, x, #y, y
#define _NVP3(x, y, z) #x, x, #y, y, #z, z
// n>3 cases
#define _NVP4(x, ...) _NVP1(x), _NVP3(__VA_ARGS__)
#define _NVP5(x, ...) _NVP1(x), _NVP4(__VA_ARGS__)
#define _NVP6(x, ...) _NVP1(x), _NVP5(__VA_ARGS__)
#define _NVP7(x, ...) _NVP1(x), _NVP6(__VA_ARGS__)
#define _NVP8(x, ...) _NVP1(x), _NVP7(__VA_ARGS__)
#define _NVP9(x, ...) _NVP1(x), _NVP8(__VA_ARGS__)
#define _NVP10(x, ...) _NVP(x), _NVP9(__VA_ARGS__)

#define CONCAT(a, b) a##b
#define _NVP_N(n) CONCAT(_NVP, n)
#define NVP(...) _NVP_N(VA_NARGS(__VA_ARGS__))(__VA_ARGS__)
// end of #define NVP

#define MSGPACK(...)                                                                                                   \
    void msgpack(auto pack_fn)                                                                                         \
    {                                                                                                                  \
        pack_fn(NVP(...));                                                                                             \
    }