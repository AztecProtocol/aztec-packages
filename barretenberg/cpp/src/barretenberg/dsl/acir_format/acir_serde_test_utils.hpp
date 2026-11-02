#pragma once

#include "barretenberg/serialize/msgpack_impl.hpp"
#include "serde/index.hpp"

#include <cstdint>
#include <vector>

namespace acir_format::test {

/**
 * @brief Serialize a single-function program in the msgpack-compact wire format: ARRAY[ARRAY[circuit], NIL].
 * @details ProgramWithoutBrillig::msgpack_pack cannot be used because std::monostate lacks a pack adaptor.
 */
inline std::vector<uint8_t> serialize_program_with_circuit(const Acir::Circuit& circuit)
{
    msgpack::sbuffer sbuf;
    msgpack::packer<msgpack::sbuffer> packer(sbuf);

    // ProgramWithoutBrillig = ARRAY[functions, unconstrained_functions]
    packer.pack_array(2);

    // functions = ARRAY[circuit]
    packer.pack_array(1);
    packer.pack(circuit);

    // unconstrained_functions = NIL (std::monostate — ignored by ProgramWithoutBrillig::msgpack_unpack)
    packer.pack_nil();

    // Prepend format marker 0x03 (FORMAT_MSGPACK_COMPACT)
    std::vector<uint8_t> buf;
    buf.reserve(1 + sbuf.size());
    buf.push_back(0x03);
    buf.insert(buf.end(), sbuf.data(), sbuf.data() + sbuf.size());
    return buf;
}

} // namespace acir_format::test
