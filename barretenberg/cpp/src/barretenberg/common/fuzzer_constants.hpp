#pragma once
#include <cstdint>

enum CircuitType : uint64_t { Standard = 1 << 0, Ultra = 1 << 1 };
enum BigCurveType : uint64_t { BN254 = 1 << 0, BN254_BF = 1 << 1, Secp256k1 = 1 << 2, Secp256r1 = 1 << 3 };
