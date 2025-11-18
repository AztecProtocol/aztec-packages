#include "./bbmalloc.hpp"
#include "barretenberg/common/mem.hpp"
#include <cstdlib>

WASM_EXPORT void* bbmalloc(size_t size)
{
    return aligned_alloc(32, size);
}

WASM_EXPORT void bbfree(void* ptr)
{
    aligned_free(ptr);
}
