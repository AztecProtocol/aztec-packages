set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

# Enable the following warnings project wide.
# If any compilation issues arise in the future, they should not be silenced here but rather in the
# module's own CMakeLists.txt by adding conditional compilation flags like the following
# ```
# if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
# target_compile_options(crypto_blake3s_full_objects PRIVATE -Wno-error=shorten-64-to-32)
# endif()
# ```
# Specifying `-Wno-${ERROR_NAME}` will silence the error completely.
# To preserve the warning, but prevent them from causing the build to fail,
# use the flag `-Wno-error=${ERROR_NAME}`
add_compile_options(-Werror -Wall -Wextra -Wconversion -Wsign-conversion -Wfatal-errors)

if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    add_compile_options(-fcolor-diagnostics -fconstexpr-steps=100000000)

    if(MEMORY_CHECKS)
        message(STATUS "Compiling with memory checks.")
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fsanitize=address")
    endif()

    if(CMAKE_CXX_COMPILER_VERSION VERSION_GREATER_EQUAL 18)
        # We target clang18 and need this, eventually warning should be fixed or this will be unconditional.
        add_compile_options(-Wno-vla-cxx-extension)
        # This gets in the way of a partial object initialization (i.e. MyClass my_class{ .my_member = init_value })
        add_compile_options(-Wno-missing-field-initializers)
        # CLI11.hpp
        add_compile_options(-Wno-deprecated-declarations)
    endif()
endif()

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU")
    add_compile_options(-fconstexpr-ops-limit=100000000 -Wno-psabi)
endif()

# We enable -O1 level optimsations, even when compiling debug wasm, otherwise we get "local count too large" at runtime.
# We prioritize reducing size of final artifacts in release with -Oz.
if(WASM)
    set(CMAKE_CXX_FLAGS_DEBUG "-O1 -g")
    set(CMAKE_C_FLAGS_DEBUG "-O1 -g")
    set(CMAKE_CXX_FLAGS_RELEASE "-Oz -DNDEBUG")
    set(CMAKE_C_FLAGS_RELEASE "-Oz -DNDEBUG")
    add_link_options(-Wl,--export-memory,--import-memory,--stack-first,-z,stack-size=1048576,--max-memory=4294967296)
endif()

include_directories(${CMAKE_CURRENT_SOURCE_DIR} ${MSGPACK_INCLUDE} ${TRACY_INCLUDE} ${LMDB_INCLUDE} ${LIBDEFLATE_INCLUDE})

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
  add_subdirectory(barretenberg/nodejs_module)
endif()

add_subdirectory(barretenberg/api)
add_subdirectory(barretenberg/bb)
add_subdirectory(barretenberg/bbapi)
add_subdirectory(barretenberg/boomerang_value_detection)
add_subdirectory(barretenberg/circuit_checker)
add_subdirectory(barretenberg/client_ivc)
add_subdirectory(barretenberg/commitment_schemes)
add_subdirectory(barretenberg/commitment_schemes_recursion)
add_subdirectory(barretenberg/common)
add_subdirectory(barretenberg/crypto)
add_subdirectory(barretenberg/dsl)
add_subdirectory(barretenberg/ecc)
add_subdirectory(barretenberg/eccvm)
add_subdirectory(barretenberg/env)
add_subdirectory(barretenberg/honk)
add_subdirectory(barretenberg/trace_to_polynomials)
add_subdirectory(barretenberg/ext/starknet/crypto)
add_subdirectory(barretenberg/ext/starknet/transcript)
add_subdirectory(barretenberg/flavor)
add_subdirectory(barretenberg/goblin)
add_subdirectory(barretenberg/grumpkin_srs_gen)
add_subdirectory(barretenberg/lmdblib)
add_subdirectory(barretenberg/numeric)
add_subdirectory(barretenberg/op_queue)
add_subdirectory(barretenberg/polynomials)
add_subdirectory(barretenberg/protogalaxy)
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
add_subdirectory(barretenberg/wasi)
if(NOT FUZZING)
    add_subdirectory(barretenberg/world_state)
    add_subdirectory(barretenberg/vm2)
endif()

if(SMT)
    add_subdirectory(barretenberg/smt_verification)
endif()

if(SMT AND ACIR_FORMAL_PROOFS)
    add_subdirectory(barretenberg/acir_formal_proofs)
endif()

add_subdirectory(barretenberg/benchmark)

include(GNUInstallDirs)

# For this library we include everything but the env and wasi modules, as it is the responsibility of the
# consumer of this library to define how and in what environment its artifact will run.
# libbarretenberg + libwasi = a wasi "reactor" that implements it's own env (e.g. logstr), e.g. barretenberg.wasm.
# libbarretenberg + env = a wasi "command" that expects a full wasi runtime (e.g. wasmtime), e.g. test binaries.
message(STATUS "Compiling all-in-one barretenberg archive")

set(BARRETENBERG_TARGET_OBJECTS
    $<TARGET_OBJECTS:bbapi_objects>
    $<TARGET_OBJECTS:client_ivc_objects>
    $<TARGET_OBJECTS:commitment_schemes_objects>
    $<TARGET_OBJECTS:common_objects>
    $<TARGET_OBJECTS:crypto_aes128_objects>
    $<TARGET_OBJECTS:crypto_blake2s_objects>
    $<TARGET_OBJECTS:crypto_blake3s_objects>
    $<TARGET_OBJECTS:crypto_ecdsa_objects>
    $<TARGET_OBJECTS:crypto_keccak_objects>
    $<TARGET_OBJECTS:crypto_pedersen_commitment_objects>
    $<TARGET_OBJECTS:crypto_pedersen_hash_objects>
    $<TARGET_OBJECTS:crypto_poseidon2_objects>
    $<TARGET_OBJECTS:crypto_schnorr_objects>
    $<TARGET_OBJECTS:crypto_sha256_objects>
    $<TARGET_OBJECTS:dsl_objects>
    $<TARGET_OBJECTS:ecc_objects>
    $<TARGET_OBJECTS:eccvm_objects>
    $<TARGET_OBJECTS:ext_starknet_crypto_poseidon_objects>
    $<TARGET_OBJECTS:trace_to_polynomials_objects>
    $<TARGET_OBJECTS:flavor_objects>
    $<TARGET_OBJECTS:goblin_objects>
    $<TARGET_OBJECTS:honk>
    $<TARGET_OBJECTS:numeric_objects>
    $<TARGET_OBJECTS:op_queue_objects>
    $<TARGET_OBJECTS:polynomials_objects>
    $<TARGET_OBJECTS:protogalaxy_objects>
    $<TARGET_OBJECTS:relations_objects>
    $<TARGET_OBJECTS:srs_objects>
    $<TARGET_OBJECTS:stdlib_aes128_objects>
    $<TARGET_OBJECTS:stdlib_blake2s_objects>
    $<TARGET_OBJECTS:stdlib_blake3s_objects>
    $<TARGET_OBJECTS:stdlib_circuit_builders_objects>
    $<TARGET_OBJECTS:stdlib_client_ivc_verifier_objects>
    $<TARGET_OBJECTS:stdlib_eccvm_verifier_objects>
    $<TARGET_OBJECTS:stdlib_merge_verifier_objects>
    $<TARGET_OBJECTS:stdlib_honk_verifier_objects>
    $<TARGET_OBJECTS:stdlib_goblin_verifier_objects>
    $<TARGET_OBJECTS:stdlib_keccak_objects>
    $<TARGET_OBJECTS:stdlib_pedersen_commitment_objects>
    $<TARGET_OBJECTS:stdlib_pedersen_hash_objects>
    $<TARGET_OBJECTS:stdlib_poseidon2_objects>
    $<TARGET_OBJECTS:stdlib_primitives_objects>
    $<TARGET_OBJECTS:stdlib_protogalaxy_verifier_objects>
    $<TARGET_OBJECTS:stdlib_schnorr_objects>
    $<TARGET_OBJECTS:stdlib_sha256_objects>
    $<TARGET_OBJECTS:stdlib_translator_vm_verifier_objects>
    $<TARGET_OBJECTS:sumcheck_objects>
    $<TARGET_OBJECTS:transcript_objects>
    $<TARGET_OBJECTS:translator_vm_objects>
    $<TARGET_OBJECTS:ultra_honk_objects>)

if(NOT DISABLE_AZTEC_VM AND NOT FUZZING)
    # enable AVM
    list(APPEND BARRETENBERG_TARGET_OBJECTS $<TARGET_OBJECTS:vm2_objects>)
endif()

if(NOT WASM AND NOT FUZZING)
    # enable merkle trees and lmdb
    list(APPEND BARRETENBERG_TARGET_OBJECTS $<TARGET_OBJECTS:crypto_merkle_tree_objects>)
    list(APPEND BARRETENBERG_TARGET_OBJECTS $<TARGET_OBJECTS:lmdblib_objects>)
    list(APPEND BARRETENBERG_TARGET_OBJECTS $<TARGET_OBJECTS:api_objects>)
endif()

add_library(
    barretenberg
    STATIC
    ${BARRETENBERG_TARGET_OBJECTS}
)

if(WASM)
    # When building this wasm "executable", we include the wasi module but exclude the env module.
    # That's because we expect this wasm to be run as a wasi "reactor" and for the host environment
    # to implement the functions in env.
    add_executable(
        barretenberg-debug.wasm
        ${BARRETENBERG_TARGET_OBJECTS}
        $<TARGET_OBJECTS:wasi_objects>
    )

    target_link_options(
        barretenberg-debug.wasm
        PRIVATE
        -nostartfiles -Wl,--no-entry,--export-dynamic
    )

    # Strip debug info to create the release version.
    add_custom_command(
        OUTPUT ${CMAKE_BINARY_DIR}/bin/barretenberg.wasm
        COMMAND ${CMAKE_STRIP} ${CMAKE_BINARY_DIR}/bin/barretenberg-debug.wasm -o ${CMAKE_BINARY_DIR}/bin/barretenberg.wasm
        DEPENDS ${CMAKE_BINARY_DIR}/bin/barretenberg-debug.wasm
        COMMENT "Stripping debug info to create release version."
    )

    add_custom_target(
        barretenberg.wasm ALL
        DEPENDS ${CMAKE_BINARY_DIR}/bin/barretenberg.wasm
    )

    # Create a gzipped version of barretenberg-debug.wasm
    add_custom_command(
        OUTPUT ${CMAKE_BINARY_DIR}/bin/barretenberg-debug.wasm.gz
        COMMAND gzip -c ${CMAKE_BINARY_DIR}/bin/barretenberg-debug.wasm > ${CMAKE_BINARY_DIR}/bin/barretenberg-debug.wasm.gz
        DEPENDS ${CMAKE_BINARY_DIR}/bin/barretenberg-debug.wasm
        COMMENT "Creating gzipped version of barretenberg-debug.wasm"
    )

    add_custom_target(
        barretenberg-debug.wasm.gz ALL
        DEPENDS ${CMAKE_BINARY_DIR}/bin/barretenberg-debug.wasm.gz
    )

    # Create a gzipped version of barretenberg.wasm
    add_custom_command(
        OUTPUT ${CMAKE_BINARY_DIR}/bin/barretenberg.wasm.gz
        COMMAND gzip -c ${CMAKE_BINARY_DIR}/bin/barretenberg.wasm > ${CMAKE_BINARY_DIR}/bin/barretenberg.wasm.gz
        DEPENDS ${CMAKE_BINARY_DIR}/bin/barretenberg.wasm
        COMMENT "Creating gzipped version of barretenberg.wasm"
    )

    add_custom_target(
        barretenberg.wasm.gz ALL
        DEPENDS ${CMAKE_BINARY_DIR}/bin/barretenberg.wasm.gz
    )

    if(CHECK_CIRCUIT_STACKTRACES)
        target_link_libraries(
            barretenberg.wasm
            PUBLIC
            Backward::Interface
        )
        target_link_options(
            barretenberg.wasm
            PRIVATE
            -ldw -lelf
        )
    endif()
endif()
