barretenberg_module(bbapi common client_ivc dsl crypto_kzg)

# bbapi_objects needs crypto_kzg include paths for bbapi_kzg.cpp to find c-kzg headers
target_link_libraries(bbapi_objects PUBLIC crypto_kzg)
