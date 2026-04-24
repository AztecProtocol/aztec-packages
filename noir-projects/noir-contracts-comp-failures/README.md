## Noir Contracts Compilation Failures

Aztec-nr contracts that are expected to fail to compile. Each case asserts that compilation fails *and* that the full set of `error:` diagnostics nargo emits matches a committed snapshot, so an unrelated regression that breaks compilation for a different reason does not silently pass.

### Layout

Each contract lives in `contracts/<case>/` with:

- `Nargo.toml` — `type = "contract"`, depends on `aztec = { path = "../../../aztec-nr/aztec" }`.
- `src/main.nr` — the intentionally invalid contract.
- `expected_error` — one line per nargo `error:` headline (stripped of the `error: ` prefix), in emission order. An empty file means the contract is expected to compile successfully; see its `src/main.nr` doc comment for context.

### Running

```sh
./bootstrap.sh test                          # all cases
./bootstrap.sh test reserved_public_dispatch # one case
./bootstrap.sh test 'panic_on_*'             # glob subset
```

For each contract the runner:

1. Runs `nargo compile --silence-warnings` and asserts it fails.
2. Extracts every `error: <headline>` line from stderr in order and strips the `error: ` prefix.
3. Requires the extracted list to equal, line for line, the non-blank lines of `expected_error`. Any difference — text, count, or order — fails the test.

### Updating expected errors

When a compiler or macro error message changes intentionally, regenerate snapshots locally:

```sh
ACCEPT_SNAPSHOTS=1 ./bootstrap.sh test
```

The runner extracts each `error: ` headline, strips the prefix, and writes one per line — no manual trimming needed. If nargo emits no `error: ` diagnostics (e.g. an internal compiler panic), the full stderr is written and a `⚠` warning is printed; those cases need a manual trim before committing.

CI refuses to run with `ACCEPT_SNAPSHOTS` set (`CI=1 ACCEPT_SNAPSHOTS=1` exits non-zero), so any drift between committed snapshots and actual stderr must be resolved intentionally by a developer.
