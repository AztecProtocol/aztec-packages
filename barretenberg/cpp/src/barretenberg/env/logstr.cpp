#include <iostream>
#ifdef __linux__
#include <sys/resource.h>
#endif

extern "C" {

void logstr(char const* str)
{
    std::cerr << str;

#ifdef __linux__
    struct rusage usage;
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
        // ru_maxrss is in kilobytes on Linux
        // match the format in barretenberg/ts/src/barretenberg_wasm/index.ts
        std::cerr << " (mem: " << (usage.ru_maxrss / 1024) << " MiB)"; // NOLINT
    }
#endif

    std::cerr << std::endl;
}
}
