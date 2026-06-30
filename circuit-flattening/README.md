# Circuit flattening — single-file circuit artifacts for bug hunting

**This is an experiment.** The idea is to flatten each protocol circuit —
normally spread across many files, libraries, and generic helpers in
`noir-projects/noir-protocol-circuits/` — into a single self-contained file,
on the theory that one concrete, fully-resolved file is easier for an AI to
audit end-to-end than source code scattered across a dependency tree. It may
turn out that none of these views beats reading the original source; that is
part of what we are trying to find out. The originals are the source of truth
and are never modified by this work.

## The three outputs

Two views per circuit, plus one file that chains several circuits together.
None is compilable Noir — they are reading artifacts.

| Output | Scope | What it is | When to reach for it |
|---|---|---|---|
| `*.monomorphized-readable.nr` | one circuit | The compiler's monomorphized AST, printed with names restored. Every reachable function appears as its **own definition**; calls stay as calls. | Default starting point. Read one function at a time with its real name, then follow calls to other definitions in the same file. |
| `*.monomorphized-inlined.nr` | one circuit | The **same** named view as `-readable.nr` but after an inlining pass collapses the constrained call tree into `main`, so the circuit reads top-to-bottom as one body. | When you want to trace data flow through a circuit without jumping between function definitions. |
| `chain-example.inlined.nr` | a chain of circuits | The inlined `main` of each stage of one example kernel→rollup composition, concatenated in order with the hand-offs marked. | Cross-circuit reading: trace a value across folds and spot checks that fall *between* circuits. |

**`-readable` and `-inlined` are the same view, differing only by one pass**,
and the author has no preference between them — both exist to find out which
serves an auditor better. `-readable` is the monomorphized program as-is
(`nargo compile --show-monomorphized`); `-inlined` is that same program after
its constrained call tree is flattened into `main` (add `--inline-monomorphized`).
Same names, same legend, same desugaring — `-inlined` just pastes most function
bodies into their call sites. Both cover one entire circuit: every function
reachable from `main`, with generics resolved to concrete sizes and globals to
concrete values.

## `*.monomorphized-readable.nr`

The base view: the compiler's monomorphized AST for one circuit, names
restored, every reachable function printed as its own definition with calls
left as calls — you follow a call by jumping to its definition elsewhere in the
file.

Reading guide:

- A **legend** at the top maps every source-level struct/enum/alias name to
  the structural tuple it monomorphized to. Function signatures use the
  source-level names; a type claimed by several distinct names (e.g. two
  single-`Field` wrapper structs) prints structurally instead, so a name in a
  signature is always trustworthy.
- **Field accesses are named** (`self.vk_data.leaf_index`), recovered from the
  HIR at monomorphization time — not guessed.
- **`unsafe { ... }` marks every call from constrained code into an
  unconstrained function.** Nothing inside the callee emits gates, so any
  value it returns is prover-supplied and must be re-checked by constrained
  code nearby — a prime place for bugs to hide. `unconstrained fn` definitions
  are also labeled.
- This output is faithful by construction (it is the compiler's own IR), but
  it is **not compilable Noir** — structs are tuples, `match`es are
  desugared, and legend lines such as `type Foo<Bar, 64> = ...` are not valid
  syntax.

Caveats:

- Compiler-synthesized accesses (closure environments, function tuples) still
  print positionally (`.0`, `.1`).
- A tuple-destructure `let (a, b) = e;` desugars to a temp plus field
  extractions, printed as `let _ = e; let a = _.0; let b = _.1;`. The `_` is
  the temp (the monomorphizer names the extraction idents by index; they are
  rendered as `_` so `_.0` does not read as the float `0.0` — Noir has no
  float literals).
- `if (!is_unconstrained()) { ... }` guards and `should_validate_output()`
  come from the simulated/constrained code sharing; in the constrained
  circuit the guard body is live.

## `*.monomorphized-inlined.nr`

The `-readable` view after the inlining pass (see the at-a-glance note above
for how the two relate). Each constrained call is replaced by the callee's
body pasted in at the call site: where `-readable.nr` shows `main` calling
`validate_x(...)` defined further down, `-inlined.nr` has `validate_x`'s body
inline in `main`, so the circuit reads top-to-bottom as one body. Details of
the inlined form:

- Each inlined call site appears as a scope block opening with a
  `// >>> inlined call: <function>` marker, then `let <param> = <arg>;`
  bindings, then the callee body. Where an argument expression mentions a
  name equal to a callee parameter name, arguments are first bound to
  `__arg_N` temporaries so the printed text cannot read as capturing the
  wrong variable.
- **Not inlined, by design:** unconstrained functions (they remain
  `unsafe { ... }` calls — nothing in them is constrained),
  `#[fold]`/`#[no_predicates]` functions (separate compilation units), and
  functions called from several constrained call sites with large bodies
  (crypto primitives and generated `eq`-style helpers — inlining them would
  bury protocol logic under duplicated primitive bodies). Those remain as
  named functions after `main`.
- Verification: the inlined AST is the program that actually compiles when
  the flag is set, so generation doubles as validation. For
  `private_kernel_inner`: full `nargo info` opcode/gate table is identical
  with and without the flag, and execution outputs match on test programs.
  (Bytecode bytes differ only in witness numbering order.)

## `chain-example.inlined.nr`

A **separate experiment**: a combined, **non-compilable** artifact for
cross-circuit reading — tracing a value across folds to find a check that
should span a hand-off but is owned by no single circuit. `build_chain.py`
takes the `-inlined` `main` of each stage of one example composition, in order
— `init → inner → reset → inner → reset-tail-to-public → hiding-to-public →
rollup-tx-base-public` — renames each to `main__<stage>`, joins them with
`// STAGE` / `// JOIN` markers, and appends one deduplicated set of the shared
type legend, globals, and helper definitions. (It reads the `-inlined` files,
so generate those first; `flatten-circuits.sh` does both.)

It does **not** fuse the stages into one circuit — they stay separate proofs.
The hand-offs (`return_data` of one stage == `call_data` of the next) are
enforced by barretenberg's CHONK databus + recursion, **not** by any Noir
assert, hence the `// JOIN` markers; and the prover chooses the composition, so
this is ONE legal instance, not the only shape. Verify any finding against the
real per-circuit source. (The two `inner` stages are byte-identical.) The
`-inlined` inputs are trimmed via `--no-inline-fns` so sha256, the AVM column
map, and `Serialize` plumbing stay as single named definitions instead of being
duplicated inline.

## Regenerating

All generated `.nr` files land in `output/`, alongside
`circuits-source-commit.txt` — a small record of the repo commit the artifacts
were generated from (the outer repo's `HEAD`, which fixes both the circuit
source and the noir pin). `flatten-circuits.sh` uses it to tell you whether
your checkout has moved since the artifacts were last generated.

Three scripts, deliberately separate:

- **`./apply-patch.sh`** — first-time setup. Applies the generator patch to the
  noir submodule working tree (where the generator lives but is not committed),
  so nargo can be built with the extra flags. Safe to re-run: it reports and
  exits if the patch is already applied, and stops with a pointer to the
  recovery instructions if the patch no longer fits.
- **`./flatten-circuits.sh`** — the common path. Rebuilds nargo, regenerates
  both per-circuit variants (`-readable` and `-inlined`) for every circuit in
  its list, and reassembles `chain-example.inlined.nr` from the `-inlined`
  files — so a full run produces all three output types. Before doing the work
  it compares your current commit against the one recorded in
  `output/circuits-source-commit.txt`, tells you whether your checkout is newer,
  older, or diverged, and asks whether to bother regenerating (`--yes` skips the
  prompt; non-interactive runs proceed). A successful full run rewrites that
  record. Pass package names to limit it (e.g.
  `./flatten-circuits.sh private_kernel_inner`); a subset run skips the prompt
  and leaves the record unchanged. It never touches the patch.
- **`./export-patch.sh`** — maintainer-only, the inverse of `apply-patch.sh`.
  Re-exports the generator from the submodule working tree into
  `noir-circuit-flattening.patch`. Run it after ANY edit to the submodule's
  monomorphization/driver code so the patch cannot drift. Two guards: it refuses
  to write an empty/tiny diff (so a clean submodule can't clobber the patch),
  and it asks for confirmation before overwriting. Pass `--yes` to skip the
  prompt in automation; run non-interactively without it and it refuses rather
  than guess.

So a fresh setup is just:

```bash
cd circuit-flattening
./apply-patch.sh
./flatten-circuits.sh
```

The patch is recorded against submodule commit
`c57152f91260ecdb9faad4efc20abb14b6d2ece7`. The rest of this section shows the
underlying per-package commands `flatten-circuits.sh` runs, for one-offs or
debugging.

The **readable** variant is just `--show-monomorphized`:

```bash
cd noir-projects/noir-protocol-circuits
../../noir/noir-repo/target/release/nargo compile \
    --package private_kernel_inner --show-monomorphized --silence-warnings \
    > ../../circuit-flattening/output/private-kernel-inner.monomorphized-readable.nr
```

For the **inlined** variant, add `--inline-monomorphized`. Also pass
`--no-inline-fns` with the comma-separated keep-as-calls list — without it,
crypto and serialization bodies (sha256, the AVM column map, `Serialize`
plumbing) get duplicated inline at every call site and bury the protocol
logic. Use the exact list from the `NO_INLINE` variable in
`flatten-circuits.sh` so the output matches the committed file:

```bash
cd noir-projects/noir-protocol-circuits
../../noir/noir-repo/target/release/nargo compile \
    --package private_kernel_inner --inline-monomorphized \
    --no-inline-fns "sha256_var,sha256_compression,...<see NO_INLINE in flatten-circuits.sh>" \
    --show-monomorphized --silence-warnings \
    > ../../circuit-flattening/output/private-kernel-inner.monomorphized-inlined.nr
```

Finally, assemble the chain artifact from the per-circuit `-inlined` files
(this step is **not** needed if you ran `./flatten-circuits.sh`, which does it
for you; run it by hand only when regenerating the inlined files manually):

```bash
cd circuit-flattening
python3 build_chain.py
```

The patch changes (all in the noir submodule):

- `monomorphization/ast.rs`: `ExtractTupleField` and `LValue::MemberAccess`
  carry the original struct field name (`Option<String>`, printing only).
- `monomorphization/mod.rs`: lowering populates those names; a thread-local
  recorder captures `type name -> structural type` for every converted
  struct/enum/alias plus the HIR signature names of every monomorphized
  function (enabled only for `--show-monomorphized`).
- `monomorphization/printer.rs`: `show_field_names` + `readable_type_names`
  options, the legend, name substitution in signatures/globals, reliable
  `unsafe { }` marking of constrained->unconstrained calls, and a fix for
  doubled semicolons.
- `monomorphization/inliner.rs`: the inlining pass behind
  `--inline-monomorphized` (runs before codegen, so compiling validates it).
- `noirc_driver/src/lib.rs`: `--show-monomorphized` uses the readable printer;
  `--inline-monomorphized` runs the inliner on the program that compiles.

## If the patch no longer applies

The patch is a unified diff — a text record of "remove these lines, add those"
at specific places in 17 noir files, each hunk anchored by a few lines of
surrounding context. `git apply` replays those hunks onto the current files.
When the noir submodule advances to a new commit and upstream edits land near
the patched code, the recorded context stops matching and `git apply` rejects
the affected hunks instead of guessing — the apply fails with messages like
`error: patch failed: ... ` / `error: ... patch does not apply`. That is what
"the patch is outdated" means: the diff is fine, it just no longer lines up
with the new files. You then reconcile it, much like resolving a merge.

The patch was recorded against submodule commit
`c57152f91260ecdb9faad4efc20abb14b6d2ece7` (see above). If a plain
`git apply` fails after the submodule moves, recover in this order:

1. **3-way merge (try this first).** The patch carries blob hashes
   (`index <old>..<new>` lines), so git can merge it against the new files
   the same way it merges branches:

   ```bash
   cd noir/noir-repo
   git apply --3way ../../circuit-flattening/noir-circuit-flattening.patch
   ```

   Hunks that still fit apply silently. Where upstream changed the same
   region, git leaves ordinary `<<<<<<< / ======= / >>>>>>>` conflict markers
   in the file — open each one, keep both intents (the upstream change *and*
   the patch's change), and delete the markers. This needs the patch's base
   blobs in the object store; they are, since it's the same submodule history.

2. **Reject files (fallback if `--3way` can't merge).** Apply every hunk that
   still fits and write the failures out as `.rej` files:

   ```bash
   cd noir/noir-repo
   git apply --reject ../../circuit-flattening/noir-circuit-flattening.patch
   ```

   Each `<file>.rej` lists the hunks that did not apply; edit those changes
   into the corresponding file by hand, then delete the `.rej` files. The
   "patch changes" list above tells you the intent of each file's edits, so
   you know what the rejected hunk was trying to achieve.

3. **Re-validate and re-record.** Once the working tree compiles, re-export
   the patch from the now-reconciled working tree, then rebuild and regenerate
   the artifacts:

   ```bash
   cd circuit-flattening
   ./export-patch.sh        # patch now anchored to the new files
   ./flatten-circuits.sh    # rebuild nargo + regenerate all three outputs
   ```

   Then update the recorded base-commit hash in this README (the
   `c571...` value above) to the submodule commit you reconciled against, so
   the next person starts from an accurate anchor. Commit the refreshed
   `noir-circuit-flattening.patch` together with that README change.

If upstream has restructured the monomorphizer enough that a hunk no longer
has a sensible home, treat the "patch changes" list as the spec and re-apply
that *intent* to the new code rather than forcing the old text in — then
re-export as above.
