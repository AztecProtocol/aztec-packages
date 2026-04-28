set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

# Enable the following warnings project wide.
# If any compilation issues arise in the future, they should not be silenced here but rather in the
# module's own CMakeLists.txt by adding conditional compilation flags like the following
# ```
# if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
# target_compile_options(my_module_objects PRIVATE -Wno-error=shorten-64-to-32)
# endif()
# ```
# Specifying `-Wno-${ERROR_NAME}` will silence the error completely.
# To preserve the warning, but prevent them from causing the build to fail,
# use the flag `-Wno-error=${ERROR_NAME}`
add_compile_options(-Werror -Wall -Wextra -Wconversion -Wsign-conversion -Wfatal-errors)
# Needed until https://github.com/codeinred/tuplet/issues/37 is solved.
add_compile_options(-Wno-missing-braces)

# For MessagePack.
add_definitions(-DMSGPACK_NO_BOOST -DMSGPACK_USE_STD_VARIANT_ADAPTOR)

if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    add_compile_options(-fcolor-diagnostics -fconstexpr-steps=100000000)

    if(MEMORY_CHECKS)
        message(STATUS "Compiling with memory checks.")
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fsanitize=address")
    endif()

    # These flags are needed for all Clang variants (Apple Clang, Zig-wrapped Clang, etc.)
    add_compile_options(-Wno-missing-field-initializers)
    add_compile_options(-Wno-deprecated-declarations)

    if(CMAKE_CXX_COMPILER_VERSION VERSION_GREATER_EQUAL 18)
        # We target clang20 and need this, eventually warning should be fixed or this will be unconditional.
        add_compile_options(-Wno-vla-cxx-extension)
    endif()
endif()

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU")
    add_compile_options(-fconstexpr-ops-limit=100000000 -Wno-psabi)
endif()

# Optimisation defaults under Emscripten. -Oz skews the JS glue, so for
# release artifacts we keep -O3 (the toolchain already passes that). Debug
# stays at -O1 -g to avoid "local count too large" at link time.
if(WASM)
    set(CMAKE_CXX_FLAGS_DEBUG "-O1 -g")
    set(CMAKE_C_FLAGS_DEBUG "-O1 -g")
    set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG")
    set(CMAKE_C_FLAGS_RELEASE "-O3 -DNDEBUG")
    # Memory shape (initial / max / stack) is set by the Emscripten toolchain
    # via -sINITIAL_MEMORY / -sMAXIMUM_MEMORY / -sSTACK_SIZE.
endif()

include_directories(${CMAKE_CURRENT_SOURCE_DIR} ${MSGPACK_INCLUDE} ${TRACY_INCLUDE} ${LMDB_INCLUDE} ${LIBDEFLATE_INCLUDE} ${HTTPLIB_INCLUDE} ${BACKWARD_INCLUDE} ${NLOHMANN_JSON_INCLUDE})

# Add avm-transpiler include path when library is provided
if(AVM_TRANSPILER_LIB)
    include_directories(${AVM_TRANSPILER_INCLUDE})
endif()

# I feel this should be limited to ecc, however it's currently used in headers that go across libraries,
# and there currently isn't an easy way to inherit the DDISABLE_ASM parameter.
if(DISABLE_ASM)
    message("Using fallback non-assembly methods for field multiplications.")
    add_definitions(-DDISABLE_ASM=1)
else()
    message(STATUS "Using optimized assembly for field arithmetic.")
endif()

if (ENABLE_PIC AND CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  message("Building with Position Independent Code")
  set(CMAKE_CXX_FLAGS  "${CMAKE_CXX_FLAGS} -fPIC")
  set(CMAKE_C_FLAGS  "${CMAKE_C_FLAGS} -fPIC")
endif()

add_subdirectory(barretenberg/api)
add_subdirectory(barretenberg/bb)
add_subdirectory(barretenberg/bbapi)
add_subdirectory(barretenberg/benchmark)
add_subdirectory(barretenberg/boomerang_value_detection)
add_subdirectory(barretenberg/circuit_checker)
add_subdirectory(barretenberg/chonk)
add_subdirectory(barretenberg/commitment_schemes)
add_subdirectory(barretenberg/commitment_schemes_recursion)
add_subdirectory(barretenberg/common)
add_subdirectory(barretenberg/crypto)
add_subdirectory(barretenberg/dsl)
add_subdirectory(barretenberg/ecc)
add_subdirectory(barretenberg/eccvm)
add_subdirectory(barretenberg/env)
add_subdirectory(barretenberg/hypernova)
add_subdirectory(barretenberg/honk)
add_subdirectory(barretenberg/trace_to_polynomials)
add_subdirectory(barretenberg/ext/starknet/crypto)
add_subdirectory(barretenberg/ext/starknet/transcript)
add_subdirectory(barretenberg/flavor)
add_subdirectory(barretenberg/goblin)
add_subdirectory(barretenberg/goblin_avm)
add_subdirectory(barretenberg/grumpkin_srs_gen)
add_subdirectory(barretenberg/multilinear_batching)
add_subdirectory(barretenberg/numeric)
add_subdirectory(barretenberg/op_queue)
add_subdirectory(barretenberg/polynomials)
add_subdirectory(barretenberg/relations)
add_subdirectory(barretenberg/serialize)
add_subdirectory(barretenberg/solidity_helpers)
add_subdirectory(barretenberg/srs)
add_subdirectory(barretenberg/stdlib)
add_subdirectory(barretenberg/stdlib_circuit_builders)
add_subdirectory(barretenberg/sumcheck)
add_subdirectory(barretenberg/transcript)
add_subdirectory(barretenberg/translator_vm)
add_subdirectory(barretenberg/ultra_honk)
add_subdirectory(barretenberg/vm2_stub)

# wasm_threads_tests is a wasm-only regression suite for the bug class that
# motivated the toolchain migration (pool exhaustion + memory.grow under
# threads). The module compiles to a no-op outside the WASM preset.
if(WASM AND MULTITHREADING)
    add_subdirectory(barretenberg/wasm_threads_tests)
endif()

if(NOT BB_LITE)
    add_subdirectory(barretenberg/lmdblib)
endif()

if(NOT FUZZING AND NOT WASM AND NOT BB_LITE)
    # Fuzzing preset cannot be built with world_state as world_state cannot compile with MULTITHREADING=OFF
    # Mobile builds exclude these modules that require LMDB or aren't needed on mobile
    add_subdirectory(barretenberg/world_state)
    # NOTE: Do not conditionally base this on the AVM flag as it defines a necessary vm2_sim library.
    add_subdirectory(barretenberg/vm2)
    add_subdirectory(barretenberg/ipc)
    add_subdirectory(barretenberg/nodejs_module)
endif()

if(FUZZING_AVM)
    if(FUZZING)
        # Only add these if they weren't added above (when NOT FUZZING AND NOT WASM)
        add_subdirectory(barretenberg/world_state)
        add_subdirectory(barretenberg/vm2)
    endif()
    add_subdirectory(barretenberg/avm_fuzzer)
endif()

if(SMT)
    add_subdirectory(barretenberg/smt_verification)
    if(ACIR_FORMAL_PROOFS)
        add_subdirectory(barretenberg/acir_formal_proofs)
    endif()
endif()

include(GNUInstallDirs)

# For this library we include everything but the env module, as it is the responsibility of the
# consumer of this library to define how and in what environment its artifact will run.
# libbarretenberg + env = a native command/library, e.g. test binaries linked against the host runtime.
# Under the WASM preset, the Emscripten glue handles environment setup and we link an executable
# directly off libbarretenberg with no env shim required (Emscripten runs static ctors before any
# exported function becomes callable, so there is no `_initialize` handshake to perform).
message(STATUS "Compiling all-in-one barretenberg archive")

set(BARRETENBERG_TARGET_OBJECTS
    $<TARGET_OBJECTS:bbapi_objects>
    $<TARGET_OBJECTS:chonk_objects>
    $<TARGET_OBJECTS:commitment_schemes_objects>
    $<TARGET_OBJECTS:common_objects>
    $<TARGET_OBJECTS:crypto_aes128_objects>
    $<TARGET_OBJECTS:crypto_blake2s_objects>
    $<TARGET_OBJECTS:crypto_keccak_objects>
    $<TARGET_OBJECTS:crypto_pedersen_commitment_objects>
    $<TARGET_OBJECTS:crypto_pedersen_hash_objects>
    $<TARGET_OBJECTS:crypto_poseidon2_objects>
    $<TARGET_OBJECTS:crypto_sha256_objects>
    $<TARGET_OBJECTS:dsl_objects>
    $<TARGET_OBJECTS:ecc_objects>
    $<TARGET_OBJECTS:eccvm_objects>
    $<TARGET_OBJECTS:ext_starknet_crypto_poseidon_objects>
    $<TARGET_OBJECTS:trace_to_polynomials_objects>
    $<TARGET_OBJECTS:flavor_objects>
    $<TARGET_OBJECTS:goblin_objects>
    $<TARGET_OBJECTS:goblin_avm_objects>
    $<TARGET_OBJECTS:hypernova_objects>
    $<TARGET_OBJECTS:honk>
    $<TARGET_OBJECTS:multilinear_batching_objects>
    $<TARGET_OBJECTS:numeric_objects>
    $<TARGET_OBJECTS:op_queue_objects>
    $<TARGET_OBJECTS:polynomials_objects>
    $<TARGET_OBJECTS:relations_objects>
    $<TARGET_OBJECTS:srs_objects>
    $<TARGET_OBJECTS:stdlib_aes128_objects>
    $<TARGET_OBJECTS:stdlib_blake2s_objects>
    $<TARGET_OBJECTS:stdlib_blake3s_objects>
    $<TARGET_OBJECTS:stdlib_circuit_builders_objects>
    $<TARGET_OBJECTS:stdlib_eccvm_verifier_objects>
    $<TARGET_OBJECTS:stdlib_honk_verifier_objects>
    $<TARGET_OBJECTS:stdlib_keccak_objects>
    $<TARGET_OBJECTS:stdlib_poseidon2_objects>
    $<TARGET_OBJECTS:stdlib_primitives_objects>
    $<TARGET_OBJECTS:stdlib_sha256_objects>
    $<TARGET_OBJECTS:stdlib_translator_vm_verifier_objects>
    $<TARGET_OBJECTS:sumcheck_objects>
    $<TARGET_OBJECTS:transcript_objects>
    $<TARGET_OBJECTS:translator_vm_objects>
    $<TARGET_OBJECTS:ultra_honk_objects>)

# Save the core object list before adding lmdb/world_state (not needed by FFI consumers).
set(BB_EXTERNAL_TARGET_OBJECTS ${BARRETENBERG_TARGET_OBJECTS})

if(NOT WASM AND NOT FUZZING AND NOT BB_LITE)
    # enable merkle trees and lmdb (not for mobile builds)
    list(APPEND BARRETENBERG_TARGET_OBJECTS $<TARGET_OBJECTS:crypto_merkle_tree_objects>)
    list(APPEND BARRETENBERG_TARGET_OBJECTS $<TARGET_OBJECTS:lmdblib_objects>)
    list(APPEND BARRETENBERG_TARGET_OBJECTS $<TARGET_OBJECTS:api_objects>)
    list(APPEND BARRETENBERG_TARGET_OBJECTS $<TARGET_OBJECTS:world_state_objects>)
endif()

if(NOT WASM)
    add_library(
        barretenberg
        STATIC
        ${BARRETENBERG_TARGET_OBJECTS}
    )

    add_library(
        bb-external
        STATIC
        ${BB_EXTERNAL_TARGET_OBJECTS}
        $<TARGET_OBJECTS:env_objects>
        $<TARGET_OBJECTS:vm2_stub>
    )
endif()

if(WASM)
    # Under Emscripten the executable suffix is `.js` (set by the toolchain),
    # and Emscripten emits a sibling `.wasm` next to it. We therefore name the
    # CMake target `barretenberg` -- the artifacts on disk are
    # `bin/barretenberg.js` + `bin/barretenberg.wasm`.
    add_executable(
        barretenberg
        ${BARRETENBERG_TARGET_OBJECTS}
        # This is an object library, so doesn't need _objects.
        $<TARGET_OBJECTS:vm2_stub>
    )

    target_link_options(
        barretenberg
        PRIVATE
        # `-sEXPORT_ALL=1` keeps the WASM_EXPORT symbols on the Module object.
        # The toolchain already sets MODULARIZE / EXPORT_ES6 / EXPORT_NAME /
        # PTHREAD_POOL_SIZE / PTHREAD_POOL_SIZE_STRICT / PROXY_TO_PTHREAD /
        # ALLOW_BLOCKING_ON_MAIN_THREAD / MALLOC=mimalloc.
        "SHELL:-sEXPORT_ALL=1"
    )

    # Aliases to keep historical target names working. Downstream scripts
    # invoke `cmake --build --target barretenberg.wasm`; that resolves to the
    # main executable target which produces `barretenberg.wasm` as a sibling
    # of `barretenberg.js`.
    add_custom_target(barretenberg.wasm ALL DEPENDS barretenberg)
    add_custom_target(barretenberg-debug.wasm ALL DEPENDS barretenberg)

    # Gzipped artifacts for the bb.js packaging step.
    add_custom_command(
        OUTPUT ${CMAKE_BINARY_DIR}/bin/barretenberg.wasm.gz
        COMMAND gzip -kf ${CMAKE_BINARY_DIR}/bin/barretenberg.wasm
        DEPENDS barretenberg
        COMMENT "Creating gzipped version of barretenberg.wasm"
    )

    add_custom_target(
        barretenberg.wasm.gz ALL
        DEPENDS ${CMAKE_BINARY_DIR}/bin/barretenberg.wasm.gz
    )

    add_custom_command(
        OUTPUT ${CMAKE_BINARY_DIR}/bin/barretenberg-debug.wasm.gz
        COMMAND gzip -kf -c ${CMAKE_BINARY_DIR}/bin/barretenberg.wasm > ${CMAKE_BINARY_DIR}/bin/barretenberg-debug.wasm.gz
        DEPENDS barretenberg
        COMMENT "Creating gzipped debug copy of barretenberg.wasm"
    )

    add_custom_target(
        barretenberg-debug.wasm.gz ALL
        DEPENDS ${CMAKE_BINARY_DIR}/bin/barretenberg-debug.wasm.gz
    )

    if(ENABLE_STACKTRACES)
        target_link_libraries(
            barretenberg
            PUBLIC
            Backward::Interface
        )
        target_link_options(
            barretenberg
            PRIVATE
            -ldw -lelf
        )
    endif()
endif()
