barretenberg_module(boomerang_value_detection stdlib_circuit_builders circuit_checker
                    stdlib_primitives numeric stdlib_aes128 stdlib_sha256 stdlib_blake2s
                    stdlib_blake3s stdlib_poseidon2 stdlib_honk_verifier stdlib_protogalaxy_verifier stdlib_merge_verifier
                    commitment_schemes)

option(ANALYZER_VERBOSE_DEBUG "Enable verbose debug output in StaticAnalyzer" OFF)

if (ANALYZER_VERBOSE_DEBUG)
    add_definitions(-DANALYZER_VERBOSE_DEBUG)
endif()
