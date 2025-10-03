#include "hardware_concurrency.hpp"
#include <barretenberg/common/throw_or_abort.hpp>
#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>

#ifndef NO_MULTITHREADING
#include <thread>
#endif

extern "C" {

uint32_t env_hardware_concurrency()
{
#ifdef NO_MULTITHREADING
    return 1;
#else
    return std::thread::hardware_concurrency();
#endif
}
}
