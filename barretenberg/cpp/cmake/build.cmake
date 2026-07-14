if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE "Release" CACHE STRING "Choose the type of build." FORCE)
endif()
message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")

if(CMAKE_BUILD_TYPE STREQUAL "RelWithAssert")
  # zig cc/c++ maps -O1/-O2/-O3/-Os to its Release modes, which inject -DNDEBUG at the driver
  # level. remove_definitions() cannot cancel that (it only drops add_definitions() entries), so
  # the -UNDEBUG must follow -O3 on the command line to keep assertions — and the AVM column
  # information gated on !defined(NDEBUG) — enabled in this build type.
  add_compile_options(-O3 -UNDEBUG)
endif()