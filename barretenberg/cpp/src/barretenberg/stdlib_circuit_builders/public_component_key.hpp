#pragma once
#include <barretenberg/serialize/msgpack.hpp>
#include <cstdint>

namespace bb {

// The data needed to reconstruct a public input component from its limbs stored in the public inputs
struct PublicComponentKey {
    uint32_t start_idx = 0;   // start index within public inputs array
    bool exists_flag = false; // flag indicating exitence of component in the PI

    bool operator==(const PublicComponentKey&) const = default;

    MSGPACK_FIELDS(start_idx, exists_flag);
};
} // namespace bb
