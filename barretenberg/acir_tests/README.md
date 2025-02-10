# Acir Test Vector Runner

The aim is to verify acir tests verify through a given backend binary. "Backend binaries" can include e.g.:

- bb (native CLI)
- bb.js (typescript CLI)
- bb.js-dev (symlink in your PATH that runs the typescript CLI via ts-node)
- bb.js.browser (script in `headless-test` that runs a test through bb.js in a browser instance via playwright)

## Building the tests.

To build all the tests:

```
./bootstrap.sh
```

This will clone the acir test vectors from the noir repo, removing any that are not relevent.
It will then compile them all using local repo versions of nargo and bb (used for generating recursive inputs).

## Running the tests.

```
./bootstrap.sh test
```

This will run all the tests as returned by `./bootstrap.sh test-cmds`.

To run a single test you can:

```
./run_test.sh <test name>
```

By default this will use the native binary `../cpp/build/bin/bb` and the `prove_and_verify` flow.

You can substitute the backend binary using the `BIN` environment variable.
You can turn on logging with `VERBOSE` environment variable.
You can specify which proving system to use with the `SYS` variable (ultra_honk, ultra_rollup_honk, mega_honk).
If not specified it defaults to plonk (TODO: Make explicit).

```
$ SYS=ultra_honk BIN=bb.js VERBOSE=1 ./run_test.sh 1_mul
```

You can use a relative path to an executable. e.g. if bb.js-dev is not symlinked into your PATH:

```
$ BIN=../ts/bb.js-dev VERBOSE=1 ./run_test.sh 1_mul
```

```
$ BIN=./headless-test/bb.js.browser VERBOSE=1 ./run_test.sh 1_mul
```

You can specify a different testing "flow" with `FLOW` environment variable. Flows are in the `flows` dir.
The default flow is `prove_and_verify`, which is the quickest way to... prove and verify. It's used to test the acir
test vectors actually all pass in whichever version of the backend is being run.
The `all_cmds` flow tests all the supported commands on the binary. Slower, but is there to test the cli.

```
$ FLOW=all_cmds ./run_acir_tests.sh 1_mul
```

We currently have to use a separate flow script to run client_ivc scheme as opposed to just setting `SYS` due to
how cli commands are handled non-uniformly.
