barretenberg_module(crypto_sha256 common)
# Need -fPIC because it's linked into the nodejs_module shared library
set_target_properties(crypto_sha256_objects PROPERTIES POSITION_INDEPENDENT_CODE ON)
