#include "barretenberg/numeric/uintx/uintx.hpp"
#include "uintx_impl.hpp"

namespace bb::numeric {

template class uintx<numeric::uint256_t>;
template class uintx<uint512_t>;

// NOTE: this instantiation is only used to maintain a 1024 barrett reduction test.
// The simpler route would have been to delete that test as this modulus is otherwise not used, but this was more
// conservative.
constexpr uint512_t TEST_MODULUS(uint256_t{ "0x04689e957a1242c84a50189c6d96cadca602072d09eac1013b5458a2275d69b1" },
                                 uint256_t{ "0x0925c4b8763cbf9c599a6f7c0348d21cb00b85511637560626edfa5c34c6b38d" });

template std::pair<uint1024_t, uint1024_t> uintx<uint512_t>::barrett_reduction<TEST_MODULUS>() const;

} // namespace bb::numeric
