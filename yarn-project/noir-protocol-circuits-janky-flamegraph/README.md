# protocol-circuits-janky-flamegraph

## Aim

To help you quickly identify which sections of your circuit are costing you the most constraints.

## Intro

Here's a janky (but possibly good-enough) way to get a breakdown of constraint counts for individual sections of code _within_ a `main` protocol circuit.

This is the output you'll get:

```sh
SUMMARY:
Note: the `approxSize` field shows the _cumulative_ cost of that section of code, if it's called multiple times; not just the cost of a single call to that section of code.


[
  { packageName: 'rollup_merge', size: 45970 },
  {
    filePath: 'rollup-lib/src/merge/merge_rollup_inputs.nr',
    identifier: 'compute_txs_effects_hash',
    approxSize: 4987
  },
  {
    filePath: 'types/src/hash.nr',
    identifier: 'sha256_to_field',
    approxSize: 42790
  }
]
```

It's telling us:

- The `rollup_merge` protocol circuit is currently 45970 constraints.
- 4987 constraints can be owed to the section of code labelled `compute_txs_effects_hash` (see below how to label sections of code).
- 42790 constraints can be owed to the section of code labelled `sha256_to_field` (see below how to label sections of code).

> Q: why doesn't the sum of the parts equal the whole? (4987 + 42790 != 45970).
> A: probably because lookup tables skew constraint measurements.

## To use:

To measure the cost of a section of code, you need to:

- Add a test to your `main` file
- Tell the tool about the package name that you want to measure
- 'bookend' the section of code with some very specific `println`s and comments;

### Add a test to your `main` file:

The test should just call `main`. That's it. But it MUST be called `test_fg`.

```
// Here's an example.
#[test]
fn test_fg() {
    let inputs = MergeRollupInputs::empty();
    main(inputs);
}
```

### Tell the tool about the package name that you want to measure

There's an array of package names at the very bottom of `index.js`. Add package names to it.

```js
// CONFIGURE THIS TO INCLUDE ALL THE PROTOCOL CIRCUITS YOU WANT TO MEASURE!!!
// Notice: use underscores; not dashes, as per the package's Nargo.toml.
const circuitPackageNames = ['rollup_merge'];
```

### 'bookend' the section of code

BEFORE:

This is the section of code that we want to measure:

```rust
let txs_effects_hash = components::compute_txs_effects_hash(self.previous_rollup_data);
```

AFTER:

```rust
println("fg::in::rollup-lib/src/merge/merge_rollup_inputs.nr");
println("fg::start::compute_txs_effects_hash");
// fg::replace_with:
// let txs_effects_hash: Field = 1;
let txs_effects_hash = components::compute_txs_effects_hash(self.previous_rollup_data); // <-- ORIGINAL LINE
println("fg::end::compute_txs_effects_hash");
```

Line by line:

- `println("fg::in::rollup-lib/src/merge/merge_rollup_inputs.nr");`
  - Tells the tool which files it needs to care about. It MUST come first.
  - `fg::in::` is saying "this println relates to the janky flamegraph tool, and here's the filePath we are "`in`".
  - The filePath MUST be relative to the `crate/`.
- `println("fg::start::compute_txs_effects_hash");`
  - This delineates the start of the code snippet we care about, and establishes a name for the code snippet.
  - You can choose whatever (unique) name you want, that'll help you interpret the output summary.
  - It MUST come after the previous line.
- ```
  // fg::replace_with:
  // let txs_effects_hash: Field = 1;
  ```
  - A contiguous section of comments (no gaps) whose first line MUST be the exact string `fg::replace_with:`
  - Subsequent lines (within the comment) should be replacement lines that will successfully compile, when the tool removes the lines that you want to measure.
- Then the original lines that you want to measure.
- `println("fg::end::compute_txs_effects_hash");`
  - This delineates the end of the code snippet.

## To run

`cd yarn-project/noir-protocol-circuits-janky-flamegraph`

`yarn start`

## TODO

It currently does everything sequentially. It would be nice if it could re-compile the circuits in parallel, but it's more difficult to achieve, because the `dest` workspace (which is currently a copy of the src workspace) would need to be modified to introduce new temp packages for each of the code modifications, to avoid read/write collisions between processes.
