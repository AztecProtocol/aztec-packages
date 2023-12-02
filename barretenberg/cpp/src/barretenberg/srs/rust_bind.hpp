#include <barretenberg/common/wasm_export.hpp>
#include <cstdint>

extern "C" {
const char* rust_srs_init_srs(uint8_t const* points_buf, uint32_t const* num_points, uint8_t const* g2_point_buf);
}