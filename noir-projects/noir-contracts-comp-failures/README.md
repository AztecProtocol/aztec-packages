## Noir Contracts Compilation Failures

Aztec-nr contracts that are expected to fail to compile. Each case asserts both that compilation fails *and* that the error message contains the expected substring, so an unrelated regression that breaks compilation for a different reason does not silently pass.

### Layout

Each contract lives in `contracts/<case>/` with:

- `Nargo.toml` — `type = "contract"`, depends on `aztec = { path = "../../../aztec-nr/aztec" }`.
- `src/main.nr` — the intentionally invalid contract.
- `expected_error` — a substring that must appear in `nargo compile` stderr.

### Running

```sh
./bootstrap.sh test
```

Runs `nargo compile --silence-warnings` in each contract directory, asserts it fails, and `grep -F`s the captured stderr for the `expected_error` substring.

### Updating expected errors

When a compiler or macro error message changes intentionally, regenerate snapshots locally:

```sh
ACCEPT_SNAPSHOTS=1 ./bootstrap.sh test
```

This writes the full stderr from each case into its `expected_error` file. Before committing, trim each file down to a stable substring — typically the error headline — because raw stderr includes paths and line numbers that churn across refactors.

CI refuses to run with `ACCEPT_SNAPSHOTS` set (`CI=true ACCEPT_SNAPSHOTS=1` exits non-zero), so any drift between committed snapshots and actual stderr must be resolved intentionally by a developer.
