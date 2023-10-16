#include "./mem.hpp"
#include "./slab_allocator.hpp"
#include "./wasm_export.hpp"

WASM_EXPORT void* bbmalloc(size_t size)
{
    return aligned_alloc(32, size);
}

WASM_EXPORT void bbfree(void* ptr)
{
    aligned_free(ptr);
}
