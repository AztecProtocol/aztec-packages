#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2 {

using AztecAddress = FF;
using ContractClassId = FF;
using AffinePoint = grumpkin::g1::affine_element;

struct PublicKeys {
    AffinePoint nullifier_key;
    AffinePoint incoming_viewing_key;
    AffinePoint outgoing_viewing_key;
    AffinePoint tagging_key;

    std::vector<FF> to_fields() const
    {
        return { nullifier_key.x,        nullifier_key.y,        incoming_viewing_key.x, incoming_viewing_key.y,
                 outgoing_viewing_key.x, outgoing_viewing_key.y, tagging_key.x,          tagging_key.y };
    }

    bool operator==(const PublicKeys& other) const = default;
};

struct ContractInstance {
    FF salt;
    AztecAddress deployer_addr;
    ContractClassId current_class_id;
    ContractClassId original_class_id;
    FF initialisation_hash;
    PublicKeys public_keys;

    bool operator==(const ContractInstance& other) const = default;
};

struct ContractClass {
    FF artifact_hash;
    FF private_function_root;
    FF public_bytecode_commitment;
    std::vector<uint8_t> packed_bytecode;
};

} // namespace bb::avm2
