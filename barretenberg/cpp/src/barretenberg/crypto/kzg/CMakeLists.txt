# KZG module with c-kzg-4844 and blst
# We need custom handling because:
# 1. C source files (not just C++)
# 2. Need to exclude test/build/binding files
# 3. Need special include paths for c-kzg subdirectory
# 4. Need to disable strict warnings for third-party C code

# List only the source files we need
# C_KZG_SOURCE_DIR and C_KZG_BLST_DIR are set in cmake/c-kzg.cmake
set(SOURCES
    ${C_KZG_SOURCE_DIR}/ckzg.c
    ${C_KZG_BLST_DIR}/src/server.c
    c_bind.cpp
)

# Create object library
add_library(crypto_kzg_objects OBJECT
    ${SOURCES}
)

# Include directories - c-kzg files use relative includes from c-kzg/
target_include_directories(crypto_kzg_objects PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${C_KZG_SOURCE_DIR}
    ${C_KZG_BLST_DIR}/bindings
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
