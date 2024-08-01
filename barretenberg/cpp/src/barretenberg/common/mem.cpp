#include "barretenberg/common/mem.hpp"

void* operator new(std::size_t count)
{
    // NOLINTBEGIN(cppcoreguidelines-no-malloc)
    void* ptr = malloc(count);
    // NOLINTEND(cppcoreguidelines-no-malloc)
    TRACY_ALLOC(ptr, count);
    return ptr;
}

void operator delete(void* ptr) noexcept
{
    TRACY_FREE(ptr);
    // NOLINTBEGIN(cppcoreguidelines-no-malloc)
    free(ptr);
    // NOLINTEND(cppcoreguidelines-no-malloc)
}
