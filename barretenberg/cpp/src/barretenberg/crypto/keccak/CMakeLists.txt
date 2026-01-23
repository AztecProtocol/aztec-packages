barretenberg_module(crypto_keccak)
# Need -fPIC because it's linked into the nodejs_module shared library
set_target_properties(crypto_keccak_objects PROPERTIES POSITION_INDEPENDENT_CODE ON)
