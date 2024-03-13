# Domain Specific Language

This package adds support to use [ACIR](https://github.com/noir-lang/noir/tree/master/acvm-repo/acir) with barretenberg. 

## Breaking Changes

There are two types of breaking changes. One that alters that alters the internal ACIR structure passed to barretenberg, and one that changes the entire structure itself that is passed to barretenberg. 

1. Internal Structure Change

Go to the ACVM `acir` crate and re-run the [serde reflection test](../../../../../noir/noir-repo/acvm-repo/acir/src/lib.rs#L51). Remember to comment out the hash check to write the updated C++ serde file. Copy that file into the `dsl` package's [serde folder](./acir_format/serde/) where you will see an `acir.hpp` file. 

You will have to update a couple things in the new `acir.hpp`:
- Replace all `throw serde::deserialization_error` with `throw_or_abort`
- The top-level struct (such as `Program`) will still use its own namespace for its internal fields. This extra `Program::` can be removed from the top-level `struct Program { .. }` object,

2. Full Breaking Change

