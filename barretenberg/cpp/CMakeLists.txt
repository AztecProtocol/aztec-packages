# barretenberg
# copyright 2019 Spilsbury Holdings Ltd

cmake_minimum_required(VERSION 3.24 FATAL_ERROR)

project(
    Barretenberg
    DESCRIPTION "BN254 elliptic curve library, and PLONK SNARK prover"
    LANGUAGES CXX C
)

# Add doxygen build command
find_package(Doxygen)
if (DOXYGEN_FOUND)
add_custom_target(build_docs
COMMAND ${DOXYGEN_EXECUTABLE} ${PROJECT_SOURCE_DIR}/docs/Doxyfile
WORKING_DIRECTORY ${PROJECT_SOURCE_DIR}
COMMENT "Generate documentation with Doxygen")
endif(DOXYGEN_FOUND)

option(DISABLE_ASM "Disable custom assembly" OFF)
option(DISABLE_ADX "Disable ADX assembly variant" OFF)
option(DISABLE_AZTEC_VM "Don't build Aztec VM (acceptable if iterating on core proving)" OFF)
option(MULTITHREADING "Enable multi-threading" ON)
option(OMP_MULTITHREADING "Enable OMP multi-threading" OFF)
option(FUZZING "Build ONLY fuzzing harnesses" OFF)
option(ENABLE_PAR_ALGOS "Enable parallel algorithms" OFF)
option(COVERAGE "Enable collecting coverage from tests" OFF)
option(ENABLE_ASAN "Address sanitizer for debugging tricky memory corruption" OFF)
option(ENABLE_HEAVY_TESTS "Enable heavy tests when collecting coverage" OFF)
# Note: Must do 'sudo apt-get install libdw-dev' or equivalent
option(CHECK_CIRCUIT_STACKTRACES "Enable (slow) stack traces for check circuit" OFF)
option(ENABLE_TRACY "Enable low-medium overhead profiling for memory and performance with tracy" OFF)
option(ENABLE_PIC "Builds with position independent code" OFF)
option(SYNTAX_ONLY "only check syntax (-fsyntax-only)" OFF)

if(CMAKE_SYSTEM_PROCESSOR MATCHES "aarch64" OR CMAKE_SYSTEM_PROCESSOR MATCHES "arm64")
    message(STATUS "Compiling for ARM.")
    set(ARM ON)
    set(DISABLE_ASM ON)
    set(DISABLE_ADX ON)
    set(RUN_HAVE_STD_REGEX 0)
    set(RUN_HAVE_POSIX_REGEX 0)
endif()

if(CHECK_CIRCUIT_STACKTRACES)
    add_compile_options(-DCHECK_CIRCUIT_STACKTRACES)
endif()

if(ENABLE_TRACY OR ENABLE_TRACY_TIME_INSTRUMENTED)
    add_compile_options(-DTRACY_ENABLE)
    SET(TRACY_LIBS Tracy::TracyClient)
else()
    SET(TRACY_LIBS)
endif()


if(ENABLE_TRACY_TIME_INSTRUMENTED)
    add_compile_options(-DTRACY_INSTRUMENTED)
endif()

if(TRACY_PROFILE_MEMORY)
  add_compile_options(-DTRACY_MEMORY)
  add_compile_options(-DTRACY_INSTRUMENTED)
endif()

if(ENABLE_ASAN)
    add_compile_options(-fsanitize=address)
    add_link_options(-fsanitize=address)
    set(DISABLE_ASM ON)
endif()

if(FUZZING)
    add_definitions(-DULTRA_FUZZ)
    if(FUZZING_SHOW_INFORMATION)
        add_definitions(-DFUZZING_SHOW_INFORMATION)
    else()
        add_definitions(-DFUZZING_DISABLE_WARNINGS)
    endif()

    add_definitions(-DFUZZING=1)

    if(DISABLE_CUSTOM_MUTATORS)
        add_definitions(-DDISABLE_CUSTOM_MUTATORS=1)
    endif()

    set(MULTITHREADING OFF)
endif()

if(CMAKE_SYSTEM_PROCESSOR MATCHES "wasm32")
    message(STATUS "Compiling for WebAssembly.")
    set(WASM ON)
    set(DISABLE_ASM ON)
    set(OMP_MULTITHREADING OFF)
    set(ENABLE_PAR_ALGOS 0)
    add_compile_definitions(_WASI_EMULATED_PROCESS_CLOCKS=1)
endif()

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_EXTENSIONS ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED TRUE)
set(CMAKE_CXX_EXTENSIONS ON)

if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    add_compile_options(-fbracket-depth=512)
    if(CMAKE_CXX_COMPILER_VERSION VERSION_LESS "14")
        message(WARNING "Clang <14 is not supported")
    endif()
    # Disable std::execution parallel algorithms on AppleClang as it is not supported.
    if(CMAKE_CXX_COMPILER_ID MATCHES "AppleClang")
        set(ENABLE_PAR_ALGOS 0)
    endif()
elseif(CMAKE_CXX_COMPILER_ID MATCHES "GNU")
    if(CMAKE_CXX_COMPILER_VERSION VERSION_LESS "10")
        message(WARNING "GCC <10 is not supported")
    endif()
else()
    message(WARNING "Unsupported compiler, use Clang >14 or GCC >10")
endif()

if(COVERAGE)
    # We've only set up LLVM coverage
    if(NOT(CMAKE_CXX_COMPILER_ID MATCHES "Clang"))
        message(FATAL_ERROR "Creating coverage is only available for clang")
    endif()

    # Add profiling compile/link options and disable optimizations
    add_definitions(-fprofile-instr-generate -fcoverage-mapping)
    add_link_options(-fprofile-instr-generate -fcoverage-mapping)
endif()

include(cmake/build.cmake)
include(GNUInstallDirs)
include(cmake/arch.cmake)
include(cmake/threading.cmake)
include(cmake/tracy.cmake)
include(cmake/gtest.cmake)
include(cmake/benchmark.cmake)
include(cmake/module.cmake)
include(cmake/msgpack.cmake)
include(cmake/lmdb.cmake)
include(cmake/libdeflate.cmake)

# We do not need to bloat barretenberg.wasm with gzip functionality in a browser context as the browser can do this
if (NOT WASM)
    include(cmake/libdeflate.cmake)
else()
    set(DISABLE_AZTEC_VM ON)
endif()
if(DISABLE_AZTEC_VM)
    add_definitions(-DDISABLE_AZTEC_VM=1)
endif()
include(cmake/backward-cpp.cmake)

if (WASM)
    set(DISABLE_AZTEC_VM ON)
endif()
if(DISABLE_AZTEC_VM)
    add_definitions(-DDISABLE_AZTEC_VM=1)
endif()
add_subdirectory(src)
if (ENABLE_ASAN AND NOT(FUZZING))
    find_program(LLVM_SYMBOLIZER_PATH NAMES llvm-symbolizer-16)
    if (NOT(LLVM_SYMBOLIZER_PATH))
        message(WARNING "LLVM symbolizer not found, so ASAN output will be limited")
    else()
        message(AUTHOR_WARNING "Run `export ASAN_SYMBOLIZER_PATH=\"${LLVM_SYMBOLIZER_PATH}\"` before running tests for better ASAN output (at which lines the bugs are).")
    endif()
endif()

# adapted from https://gitlab.kitware.com/cmake/cmake/-/issues/21717
if(SYNTAX_ONLY)
  if (NOT ((CMAKE_CXX_COMPILER_ID STREQUAL "Clang") OR
    (CMAKE_CXX_COMPILER_ID STREQUAL "GNU")))
    message(FATAL_ERROR
      "only clang and gcc support -fsyntax-only, using ${CMAKE_CXX_COMPILER_ID}")
  endif()

  add_compile_options(-fsyntax-only)

  set(CMAKE_CXX_COMPILE_OBJECT "${CMAKE_CXX_COMPILE_OBJECT} && touch <OBJECT>")
  set(CMAKE_CXX_CREATE_SHARED_LIBRARY "touch <TARGET>")
  set(CMAKE_CXX_CREATE_SHARED_MODULE "touch <TARGET>")
  set(CMAKE_CXX_LINK_EXECUTABLE "touch <TARGET>")
  set(CMAKE_CXX_ARCHIVE_CREATE "touch <TARGET>")
  set(CMAKE_CXX_ARCHIVE_APPEND "touch <TARGET>")
  set(CMAKE_CXX_ARCHIVE_FINISH "touch <TARGET>")
  set(CMAKE_C_COMPILE_OBJECT "${CMAKE_CXX_COMPILE_OBJECT} && touch <OBJECT>")
  set(CMAKE_C_CREATE_SHARED_LIBRARY "touch <TARGET>")
  set(CMAKE_C_CREATE_SHARED_MODULE "touch <TARGET>")
  set(CMAKE_C_LINK_EXECUTABLE "touch <TARGET>")
  set(CMAKE_C_ARCHIVE_CREATE "touch <TARGET>")
  set(CMAKE_C_ARCHIVE_APPEND "touch <TARGET>")
  set(CMAKE_C_ARCHIVE_FINISH "touch <TARGET>")
endif()
