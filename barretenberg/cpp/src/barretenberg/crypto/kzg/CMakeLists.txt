# KZG module with c-kzg-4844 and blst
# We need custom handling because:
# 1. C source files (not just C++)
# 2. Need to exclude test/build/binding files
# 3. Need special include paths for c-kzg subdirectory
# 4. Need to disable strict warnings for third-party C code

# List only the source files we need
set(C_KZG_SOURCES
    c-kzg/ckzg.c
    c-kzg/common/alloc.c
    c-kzg/common/bytes.c
    c-kzg/common/ec.c
    c-kzg/common/fr.c
    c-kzg/common/lincomb.c
    c-kzg/common/utils.c
    c-kzg/eip4844/blob.c
    c-kzg/eip4844/eip4844.c
    c-kzg/setup/setup.c
)

# BLST: Use server.c which is a unity build (includes all necessary sources)
set(BLST_SOURCES
    c-kzg/blst/src/server.c
)

# C++ binding
set(CPP_SOURCES
    c_bind.cpp
)

# Create object library
add_library(crypto_kzg_objects OBJECT
    ${C_KZG_SOURCES}
    ${BLST_SOURCES}
    ${CPP_SOURCES}
)

# Include directories - c-kzg files use relative includes from c-kzg/
target_include_directories(crypto_kzg_objects PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/c-kzg
    ${CMAKE_CURRENT_SOURCE_DIR}/c-kzg/blst/bindings
)

# Disable strict warnings for third-party C code
target_compile_options(crypto_kzg_objects PRIVATE
    $<$<COMPILE_LANGUAGE:C>:-Wno-sign-conversion>
    $<$<COMPILE_LANGUAGE:C>:-Wno-conversion>
    $<$<COMPILE_LANGUAGE:C>:-Wno-unused-function>
    $<$<COMPILE_LANGUAGE:C>:-Wno-unused-parameter>
    $<$<COMPILE_LANGUAGE:C>:-Wno-implicit-function-declaration>
)

# Create static library
add_library(crypto_kzg STATIC $<TARGET_OBJECTS:crypto_kzg_objects>)

# Link with common (for WASM_EXPORT)
target_link_libraries(crypto_kzg PUBLIC common)
target_link_libraries(crypto_kzg_objects PUBLIC common)
