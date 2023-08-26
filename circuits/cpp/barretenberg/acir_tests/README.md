# Acir Test Vector Runner

## run_acir_tests.sh

The aim is to verify acir tests verify through a given backend binary. To run:

```
$ ./run_acir_tests.sh
```

This will clone the acir test vectors from the noir repo, and will iterate over each one, running it through the
`../cpp/build/bin/bb` binary (by default) `prove_and_verify` command.

You can substitute the backend binary using the `BIN` environment variable.
You can turn on logging with `VERBOSE` environment variable.
You can specify a specific test to run.

```
$ BIN=bb.js VERBOSE=1 ./run_acir_tests.sh double_verify_proof
```

You can use a relative path to an executable.

```
$ BIN=../ts/bb.js-dev VERBOSE=1 ./run_acir_tests.sh double_verify_proof
```

You can specify a different testing "flow" with with `FLOW` environment variable. Flows are in the `flows` dir.
The `all_cmds` flow tests (almost) all the supported commands on the binary. Slower, but is there to test the cli.

```
$ FLOW=all_cmds ./run_acir_tests.sh double_verify_proof
```
