#pragma once

/* start of #define NVP:
 * expands to name-value pairs (NVPs), e.g. NVP(x,y,z) -> "x", x, "y", y", "z", z
 * used in msgpack serialization. */

// hacky counting of variadic macro params:
#define VA_NARGS_IMPL(_1,                                                                                              \
                      _2,                                                                                              \
                      _3,                                                                                              \
                      _4,                                                                                              \
                      _5,                                                                                              \
                      _6,                                                                                              \
                      _7,                                                                                              \
                      _8,                                                                                              \
                      _9,                                                                                              \
                      _10,                                                                                             \
                      _11,                                                                                             \
                      _12,                                                                                             \
                      _13,                                                                                             \
                      _14,                                                                                             \
                      _15,                                                                                             \
                      _16,                                                                                             \
                      _17,                                                                                             \
                      _18,                                                                                             \
                      _19,                                                                                             \
                      _20,                                                                                             \
                      _21,                                                                                             \
                      _22,                                                                                             \
                      _23,                                                                                             \
                      _24,                                                                                             \
                      _25,                                                                                             \
                      _26,                                                                                             \
                      _27,                                                                                             \
                      _28,                                                                                             \
                      _29,                                                                                             \
                      _30,                                                                                             \
                      _31,                                                                                             \
                      _32,                                                                                             \
                      _33,                                                                                             \
                      _34,                                                                                             \
                      _35,                                                                                             \
                      _36,                                                                                             \
                      _37,                                                                                             \
                      _38,                                                                                             \
                      _39,                                                                                             \
                      _40,                                                                                             \
                      N,                                                                                               \
                      ...)                                                                                             \
    N
// AD: support for 40 fields!? one may ask. Well, after 30 not being enough...
#define VA_NARGS(...)                                                                                                  \
    VA_NARGS_IMPL(__VA_ARGS__,                                                                                         \
                  40,                                                                                                  \
                  39,                                                                                                  \
                  38,                                                                                                  \
                  37,                                                                                                  \
                  36,                                                                                                  \
                  35,                                                                                                  \
                  34,                                                                                                  \
                  33,                                                                                                  \
                  32,                                                                                                  \
                  31,                                                                                                  \
                  30,                                                                                                  \
                  29,                                                                                                  \
                  28,                                                                                                  \
                  27,                                                                                                  \
                  26,                                                                                                  \
                  25,                                                                                                  \
                  24,                                                                                                  \
                  23,                                                                                                  \
                  22,                                                                                                  \
                  21,                                                                                                  \
                  20,                                                                                                  \
                  19,                                                                                                  \
                  18,                                                                                                  \
                  17,                                                                                                  \
                  16,                                                                                                  \
                  15,                                                                                                  \
                  14,                                                                                                  \
                  13,                                                                                                  \
                  12,                                                                                                  \
                  11,                                                                                                  \
                  10,                                                                                                  \
                  9,                                                                                                   \
                  8,                                                                                                   \
                  7,                                                                                                   \
                  6,                                                                                                   \
                  5,                                                                                                   \
                  4,                                                                                                   \
                  3,                                                                                                   \
                  2,                                                                                                   \
                  1)

// name-value pair expansion for variables
// used in msgpack map expansion
// n<=3 case
#define _NVP1(F, G, x) F(#x), G(x)
#define _NVP2(F, G, x, y) F(#x), G(x), F(#y), G(y)
#define _NVP3(F, G, x, y, z) F(#x), G(x), F(#y), G(y), F(#z), G(z)
// n>3 cases
#define _NVP4(F, G, x, ...) _NVP1(F, G, x), _NVP3(F, G, __VA_ARGS__)
#define _NVP5(F, G, x, ...) _NVP1(F, G, x), _NVP4(F, G, __VA_ARGS__)
#define _NVP6(F, G, x, ...) _NVP1(F, G, x), _NVP5(F, G, __VA_ARGS__)
#define _NVP7(F, G, x, ...) _NVP1(F, G, x), _NVP6(F, G, __VA_ARGS__)
#define _NVP8(F, G, x, ...) _NVP1(F, G, x), _NVP7(F, G, __VA_ARGS__)
#define _NVP9(F, G, x, ...) _NVP1(F, G, x), _NVP8(F, G, __VA_ARGS__)
#define _NVP10(F, G, x, ...) _NVP1(F, G, x), _NVP9(F, G, __VA_ARGS__)
#define _NVP11(F, G, x, ...) _NVP1(F, G, x), _NVP10(F, G, __VA_ARGS__)
#define _NVP12(F, G, x, ...) _NVP1(F, G, x), _NVP11(F, G, __VA_ARGS__)
#define _NVP13(F, G, x, ...) _NVP1(F, G, x), _NVP12(F, G, __VA_ARGS__)
#define _NVP14(F, G, x, ...) _NVP1(F, G, x), _NVP13(F, G, __VA_ARGS__)
#define _NVP15(F, G, x, ...) _NVP1(F, G, x), _NVP14(F, G, __VA_ARGS__)
#define _NVP16(F, G, x, ...) _NVP1(F, G, x), _NVP15(F, G, __VA_ARGS__)
#define _NVP17(F, G, x, ...) _NVP1(F, G, x), _NVP16(F, G, __VA_ARGS__)
#define _NVP18(F, G, x, ...) _NVP1(F, G, x), _NVP17(F, G, __VA_ARGS__)
#define _NVP19(F, G, x, ...) _NVP1(F, G, x), _NVP18(F, G, __VA_ARGS__)
#define _NVP20(F, G, x, ...) _NVP1(F, G, x), _NVP19(F, G, __VA_ARGS__)
#define _NVP21(F, G, x, ...) _NVP1(F, G, x), _NVP20(F, G, __VA_ARGS__)
#define _NVP22(F, G, x, ...) _NVP1(F, G, x), _NVP21(F, G, __VA_ARGS__)
#define _NVP23(F, G, x, ...) _NVP1(F, G, x), _NVP22(F, G, __VA_ARGS__)
#define _NVP24(F, G, x, ...) _NVP1(F, G, x), _NVP23(F, G, __VA_ARGS__)
#define _NVP25(F, G, x, ...) _NVP1(F, G, x), _NVP24(F, G, __VA_ARGS__)
#define _NVP26(F, G, x, ...) _NVP1(F, G, x), _NVP25(F, G, __VA_ARGS__)
#define _NVP27(F, G, x, ...) _NVP1(F, G, x), _NVP26(F, G, __VA_ARGS__)
#define _NVP28(F, G, x, ...) _NVP1(F, G, x), _NVP27(F, G, __VA_ARGS__)
#define _NVP29(F, G, x, ...) _NVP1(F, G, x), _NVP28(F, G, __VA_ARGS__)
#define _NVP30(F, G, x, ...) _NVP1(F, G, x), _NVP29(F, G, __VA_ARGS__)
#define _NVP31(F, G, x, ...) _NVP1(F, G, x), _NVP30(F, G, __VA_ARGS__)
#define _NVP32(F, G, x, ...) _NVP1(F, G, x), _NVP31(F, G, __VA_ARGS__)
#define _NVP33(F, G, x, ...) _NVP1(F, G, x), _NVP32(F, G, __VA_ARGS__)
#define _NVP34(F, G, x, ...) _NVP1(F, G, x), _NVP33(F, G, __VA_ARGS__)
#define _NVP35(F, G, x, ...) _NVP1(F, G, x), _NVP34(F, G, __VA_ARGS__)
#define _NVP36(F, G, x, ...) _NVP1(F, G, x), _NVP35(F, G, __VA_ARGS__)
#define _NVP37(F, G, x, ...) _NVP1(F, G, x), _NVP36(F, G, __VA_ARGS__)
#define _NVP38(F, G, x, ...) _NVP1(F, G, x), _NVP37(F, G, __VA_ARGS__)
#define _NVP39(F, G, x, ...) _NVP1(F, G, x), _NVP38(F, G, __VA_ARGS__)
#define _NVP40(F, G, x, ...) _NVP1(F, G, x), _NVP39(F, G, __VA_ARGS__)

#define CONCAT(a, b) a##b
#define _NVP_N(n) CONCAT(_NVP, n)
#define NVPFG(F, G, ...) _NVP_N(VA_NARGS(__VA_ARGS__))(F, G, __VA_ARGS__)
#define NVP(...) NVPFG(, , __VA_ARGS__)
// end of #define NVP
