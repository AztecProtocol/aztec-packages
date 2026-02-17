# Noir Protocol Circuits

## Useful Commands

You might find these commands handy. (Make sure you've bootstrapped the whole repo first).

From within `noir-protocol-circuits/`:

To list all circuits that have been compiled, for easier copy-pasting of their names:
`./scripts/flamegraph.sh -l`

To recompile a single circuit:
`./bootstrap.sh compile private_kernel_inner`

To get the constraints of that recompiled circuit:
`../../barretenberg/cpp/build/bin/bb gates -b target/private_kernel_inner.json --scheme chonk`

To get a flamegraph for all circuits:
`./scripts/flamegraph.sh -a -s -p 3000` (-a=all circuits, -s=server, -p=port)

To get a flamegraph for a selection of circuits:
`./scripts/flamegraph.sh private_kernel_inner private_kernel_init -s -p 3000` (two circuits listed here)

To unravel the huge input and output structs of these circuits, for human readability:
`node ./scripts/unravel_struct.js target/private_kernel_init.json PrivateCallDataWithoutPublicInputs`
(Doesn't currently work for intermediate structs: only params and returns to `main.nr`).

## Running tests

To run the tests or compile the circuits, you actually only need nargo:
https://noir-lang.org/docs/getting_started/quick_start

Install noirup:
`curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash`

Install nargo with the version our commit points to:
`noirup --version nightly-2026-01-13`

Then in `./noir-protocol-circuits`:

Generate Nargo.toml from Nargo.template.toml:
`yarn && node ./scripts/generate_variants.js`

To run a test in a package with specific name:
`nargo test --package rollup_lib root::tests::blob_tests::start_blob_accumulator_is_not_empty`

To compile a circuit:
`nargo compile --skip-brillig-constraints-check --package rollup_root`

For most circuits, you will see its sample inputs Prover.toml in the folder. You can execute the circuits with these private inputs by running:
`nargo execute --package rollup_root`

## Naming Conventions

**What is a "Hint"**

If a variable is called a "hint", it is there to assist with validation. The outcome of a tx (TxEffects) shouldn't change if different hints were provided. However, a different hint will likely make a proof invalid.
Maybe equivelently, this definition of "hint" is data that's injected just for performance reasons.

**What does a `validate_` function do?**

It does not mutate. It validates something about an input or output of the circuit.

**What does a `verify_` function do?**

Reserved for verifying proofs, or signatures, or merkle membership proofs. For other things, we prefer "validate".

**What is a `...Composer` struct?**

For composing the output of a circuit. It is not constrained, as creating and modifying data is generally more expensive, especially when we want to make the code easy to read.

**What is a `...Validator` struct?**

It contains methods which validate the output of a `...Composer`, vs the private call data and/or previous kernel data and/or other user data, using the hints. Everything given to a validator should be immutable. The algorithm for the validation should be efficient as it's constrained.

The constructor (`new()`) of a `...Validator` should not be doing any validation or heavy computation.

**What is a `...Builder` struct?**

A helper struct that has nice apis to help construct data easily. We want to remove this type of structs, or just use them for tests. (We currently use them in `...Composer` structs).
What is a new function allowed to do? Can it do array validation (like generating array lengths or dense trimmed arrays).
