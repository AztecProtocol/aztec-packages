# barretenberg
# copyright 2019 Spilsbury Holdings Ltd

cmake_minimum_required(VERSION 3.24 FATAL_ERROR)

project(
    Barretenberg
    DESCRIPTION "BN254 elliptic curve library, and PLONK SNARK prover"
    LANGUAGES CXX C
)

# aztec_constants.hpp is generated from the protocol's Noir constant definitions. Generation
# needs the surrounding monorepo; a checkout without it must provide the header by other means.
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../../protocol/constants-codegen/src/cli.ts")
    execute_process(
        COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/scripts/remake-constants.sh"
        RESULT_VARIABLE AZTEC_CONSTANTS_GEN_RESULT
    )
    if(NOT AZTEC_CONSTANTS_GEN_RESULT EQUAL 0)
        message(FATAL_ERROR "aztec_constants.hpp generation failed")
    endif()
endif()

# === Platform Guard Reference ===
# __wasm__  : Compiler-defined for WebAssembly. Guards threading, file I/O, networking.
# _WIN32    : Compiler-defined for Windows. Guards POSIX APIs (mmap, signals, IPC).
# BB_LITE   : CMake option. Excludes server-side subsystems (lmdb, world_state, ipc, nodejs_module).
#             Enabled for: iOS, Android, Windows cross-compiles.
# WASM      : CMake variable mirroring __wasm__ for CMake-level logic.

# Add doxygen build command
find_package(Doxygen)
if (DOXYGEN_FOUND)
add_custom_target(build_docs
COMMAND ${DOXYGEN_EXECUTABLE} ${PROJECT_SOURCE_DIR}/docs/Doxyfile
WORKING_DIRECTORY ${PROJECT_SOURCE_DIR}
COMMENT "Generate documentation with Doxygen")
endif(DOXYGEN_FOUND)

# Saves about 5 seconds of configuration time.
include(cmake/disable-compiler-checks.cmake)

option(DISABLE_ASM "Disable custom assembly" OFF)
option(DISABLE_ADX "Disable ADX assembly variant" OFF)
option(MULTITHREADING "Enable multi-threading" ON)
option(OMP_MULTITHREADING "Enable OMP multi-threading" OFF)
option(FUZZING "Build ONLY fuzzing harnesses" OFF)
option(ENABLE_PAR_ALGOS "Enable parallel algorithms" OFF)
option(COVERAGE "Enable collecting coverage from tests" OFF)
option(COVERAGE_AVM "Enable coverage filtered to AVM code only" OFF)
option(ENABLE_ASAN "Address sanitizer for debugging tricky memory corruption" OFF)
option(ENABLE_HEAVY_TESTS "Enable heavy tests when collecting coverage" OFF)
# Note: Must do 'sudo apt-get install libdw-dev' or equivalent
option(ENABLE_STACKTRACES "Enable stack traces on assertion" OFF)
option(ENABLE_TRACY "Enable low-medium overhead profiling for memory and performance with tracy" OFF)
option(ENABLE_PIC "Builds with position independent code" OFF)
option(SYNTAX_ONLY "only check syntax (-fsyntax-only)" OFF)
option(ENABLE_WASM_BENCH "Enable BB_BENCH benchmarking support in WASM builds (dev only, not for releases)" OFF)
option(AVM "enable building of vm2 module and bb-avm" ON)
option(BB_LITE "Exclude server-side subsystems: lmdb, world_state, ipc, nodejs_module" OFF)

if(CMAKE_SYSTEM_PROCESSOR MATCHES "aarch64" OR CMAKE_SYSTEM_PROCESSOR MATCHES "arm64")
    message(STATUS "Compiling for ARM.")
    set(ARM ON)
    set(DISABLE_ASM ON)
    set(DISABLE_ADX ON)
    set(RUN_HAVE_STD_REGEX 0)
    set(RUN_HAVE_POSIX_REGEX 0)
endif()

if(ENABLE_STACKTRACES)
    add_compile_options(-DCHECK_CIRCUIT_STACKTRACES -DSTACKTRACES)
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

if(COVERAGE_AVM)
    add_compile_options(-DCOVERAGE_AVM)
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
endif()

if(CMAKE_SYSTEM_PROCESSOR MATCHES "wasm32")
    message(STATUS "Compiling for WebAssembly.")
    set(WASM ON)
    set(DISABLE_ASM ON)
    set(OMP_MULTITHREADING OFF)
    set(ENABLE_PAR_ALGOS 0)
    add_compile_definitions(_WASI_EMULATED_PROCESS_CLOCKS=1)
    # Enable WebAssembly SIMD (v128 ops). Used by VectorField's quad stream
    # and available on all modern WASM runtimes (V8, SpiderMonkey, WAMR, ...)
    # since 2021. Defines `__wasm_simd128__` for headers that want to branch.
    add_compile_options(-msimd128)
    if(ENABLE_WASM_BENCH)
        message(STATUS "Enabling WASM benchmarking support (ENABLE_WASM_BENCH)")
        add_compile_definitions(ENABLE_WASM_BENCH)
    endif()
endif()

if(WIN32)
    message(STATUS "Cross-compiling for Windows (MinGW)")
    link_libraries(ws2_32 bcrypt psapi)
endif()

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_EXTENSIONS ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED TRUE)
set(CMAKE_CXX_EXTENSIONS ON)

if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    add_compile_options(-fbracket-depth=1024)
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
include(cmake/nlohmann_json.cmake)
include(cmake/httplib.cmake)
include(cmake/libdeflate.cmake)

if (NOT WASM AND NOT BB_LITE)
    include(cmake/lmdb.cmake)
endif()

if(AVM_TRANSPILER_LIB)
    include(cmake/avm-transpiler.cmake)
endif()

include(cmake/backward-cpp.cmake)

add_subdirectory(src)

# Generate fuzzer manifest after all modules have been processed
if(FUZZING)
    get_property(_manifest_entries GLOBAL PROPERTY BB_FUZZER_MANIFEST_ENTRIES)
    file(WRITE "${CMAKE_BINARY_DIR}/fuzzer_entries.txt" "")
    foreach(_entry ${_manifest_entries})
        file(APPEND "${CMAKE_BINARY_DIR}/fuzzer_entries.txt" "${_entry}\n")
    endforeach()

    set(_preset_name "${FUZZER_PRESET_NAME}")

    add_custom_target(fuzzer_manifest ALL
        COMMAND ${CMAKE_COMMAND} -E env python3
            ${CMAKE_SOURCE_DIR}/scripts/generate_fuzzer_manifest.py
            ${CMAKE_BINARY_DIR}/fuzzer_entries.txt
            ${CMAKE_BINARY_DIR}/bin/fuzzer_manifest.json
            ${_preset_name}
        COMMENT "Generating fuzzer manifest"
    )
endif()

if (ENABLE_ASAN AND NOT(FUZZING))
    find_program(LLVM_SYMBOLIZER_PATH NAMES llvm-symbolizer-20)
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
