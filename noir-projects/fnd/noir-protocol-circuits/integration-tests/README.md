# integration-tests

Tests that prove the real protocol circuits end to end with bb, as opposed to the `nargo test`
unit tests inside the crates and the `nargo execute` runs over committed `Prover.toml` inputs.
Everything they need is generated from code in this repository, so they run without the labs
repository, and their inputs cannot go stale.

Each subdirectory is one test: its circuits under `crates/`, a driver script, and a README
explaining the flow. The crates are members of the protocol-circuits workspace, listed in
`Nargo.template.toml`, because nargo always resolves the topmost `Nargo.toml`; `build_integration_tests`
in the protocol-circuits `bootstrap.sh` compiles them and moves their artifacts into the test's own
`target/`, so they never reach the protocol artifacts. `integration_test_cmds` lists each test's
commands. To add a test: add the directory, its crates to the template, and its commands there.

- `verify-uh-proof-within-smart-contract`: an app that verifies an UltraHonk proof, folded by
  `private_kernel_init`, `private_kernel_reset_tail` and `hiding_kernel_to_rollup`.
