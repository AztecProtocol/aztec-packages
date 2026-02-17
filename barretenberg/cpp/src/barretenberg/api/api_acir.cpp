#include "barretenberg/api/api_acir.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/dsl/acir_format/serde/index.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#ifndef __wasm__
#include <iostream>
#endif

namespace bb {

void acir_roundtrip(const std::filesystem::path& bytecode_path, const std::filesystem::path& output_path)
{
    auto buf = get_bytecode(bytecode_path.string());

    BB_ASSERT(!buf.empty(), "acir_roundtrip: bytecode buffer is empty");
    const uint8_t fmt = buf[0];
    BB_ASSERT(fmt == 2 || fmt == 3,
              "acir_roundtrip: expected msgpack format marker (2 or 3), got " + std::to_string(fmt));

    // Deserialize from msgpack to Acir::Program (including Brillig/unconstrained_functions)
    const char* data = reinterpret_cast<const char*>(buf.data() + 1);
    size_t data_size = buf.size() - 1;
    auto oh = msgpack::unpack(data, data_size);
    auto o = oh.get();
    BB_ASSERT(o.type == msgpack::type::ARRAY, "acir_roundtrip: expected ARRAY, got " + std::to_string(o.type));

    Acir::Program program;
#ifndef __wasm__
    try {
        o.convert(program);
    } catch (const msgpack::type_error& e) {
        std::cerr << "acir_roundtrip: failed to deserialize Program: " << e.what() << '\n';
        throw;
    }
#else
    o.convert(program);
#endif

    // Re-serialize to msgpack bytes
    msgpack::sbuffer sbuf;
    msgpack::packer<msgpack::sbuffer> packer(sbuf);
    packer.pack(program);

    // Build output: format marker byte followed by the msgpack payload
    std::vector<uint8_t> raw_bytes;
    raw_bytes.push_back(fmt);
    raw_bytes.insert(raw_bytes.end(), sbuf.data(), sbuf.data() + sbuf.size());

    write_file(output_path.string(), raw_bytes);
    vinfo("acir_roundtrip: wrote roundtripped bytecode to ", output_path);
}

} // namespace bb
