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
};

struct ContractInstance {
    AztecAddress address;
    FF salt;
    AztecAddress deployer_addr;
    ContractClassId contract_class_id;
    FF initialisation_hash;
    PublicKeys public_keys;
};

struct ContractClass {
    FF artifact_hash;
    FF private_function_root;
    FF public_bytecode_commitment;
    std::vector<uint8_t> packed_bytecode;
};

} // namespace bb::avm2