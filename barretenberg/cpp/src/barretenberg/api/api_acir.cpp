#include "barretenberg/api/api_acir.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"

#include <utility>

namespace bb {

void acir_roundtrip(const std::filesystem::path& bytecode_path, const std::filesystem::path& output_path)
{
    auto buf = get_bytecode(bytecode_path.string());
    auto raw_bytes = acir_format::roundtrip_acir_bytecode(std::move(buf));
    write_file(output_path.string(), raw_bytes);
    vinfo("acir_roundtrip: wrote roundtripped bytecode to ", output_path);
}

} // namespace bb
