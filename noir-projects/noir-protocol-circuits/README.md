# Noir Protocol Circuits

## Commands

You might find these commands handy. (Make sure you've bootstrapped the whole repo first).

From within `noir-protocol-circuits/`:

To list all circuits that have been compiled, for easier copy-pasting of their names:
`./scripts/flamegraph.sh -l`

To recompile a single circuit:
`./bootstrap.sh compile private_kernel_inner`

To get the constraints of that recompiled circuit:
`../../barretenberg/cpp/build/bin/bb gates -b target/private_kernel_inner.json --scheme client_ivc`

To get a flamegraph for all circuits:
`./scripts/flamegraph.sh -a -s -p 3000` (-a=all circuits, -s=server, -p=port)

To get a flamegraph for a selection of circuits:
`./scripts/flamegraph.sh private_kernel_inner private_kernel_init -s -p 3000` (two circuits listed here)

To unravel the huge input and output structs of these circuits, for human readability:
`node ./scripts/unravel_struct.js target/private_kernel_init.json PrivateCallDataWithoutPublicInputs`
(Doesn't currently work for intermediate structs: only params and returns to `main.nr`).

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


## Legibility

It can be quite difficult to navigate the filing structure.
E.g. the private kernel inner is split across these places (and more):

Some Q's people will ask:
- Why is the `main` function basically empty?
- Why does the orchestration live in  `private_kernel_lib/src/private_kernel_inner.nr` instead of `main.nr`?
- Why is `.execute()` a method of the private inputs, instead of a free function?
- Why is some logic in `private_kernel_lib/src/components/previous_kernel_validator.nr`, but other logic is within its own file within `private_kernel_lib/src/components/previous_kernel_validator/`. What rules are followed to decide in which of those two places the code should live?
- Is `output` always the `public_inputs` of the circuit? Maybe be consistent with naming everything `output`?
- What are the `...-simulated/` dirs for?
- Should the stuff in `private_kernel_lib/src/abis/` be moved to `types/src/abis/`?
- It would make navigation a bit easier if the directories that contain the `main` files were nested into their own `mains/` dir, so that they're not mixed-in with the `...-lib/` dirs
    - (Or, alternatively, if the `...-lib/` dirs were nested inside a `libs/` dir).
- It's confusing that there's a `private_kernel_lib` and a `reset_kernel_lib`, both of which contain stuff relating to the reset circuit.

A suggestion for re-filing the contents of `private-kernel-lib/`:

```
noir-protocol-circuits/
├─ crates/
│  └─ private-kernel-lib/
│     └─ src/
│        └─ components/
│           └─ ... // nothing at this level except mod.nr
│           └─ previous_kernel/
│              └─ previous_kernel_validator/
│                 └─ previous_kernel_validator.nr
│                 └─ previous_kernel_validator_hints.nr
│           └─ init_and_inner/
│              └─ private_call_data_validator/
│                 └─ private_call_data_valifator.nr
│              └─ output/
│                 └─ private_kernel_circuit_public_inputs_composer.nr // rename to private_kernel_circuit_output_composer
│                 └─ private_kernel_circuit_output_validator.nr
│           └─ reset/
│              └─ output/
│                 └─ reset_output_composer.nr
│                 └─ reset_output_validator.nr
│              └─ processing/ // bringing things in from the `reset-kernel-lib/` too.
│                 └─ note_hash_read_request_reset.nr
│                 └─ nullifier_read_request_reset.nr
│                 └─ private_validation_requests_processor.nr
│                 └─ key_validation_request.nr
│                 └─ read_request.nr
│                 └─ transient_data.nr
│           └─ tail/
│              └─ private_only_tail/
│                 └─ output/
│                    └─ tail_output_composer/
│                    └─ tail_output_validator/
│              └─ tail_to_public/
│                 └─ output/
│                    └─ tail_to_public_output_composer/
│                    └─ tail_to_public_output_validator/
├─ types/
│  └─ src/
│     └─ abis/
│     └─ utils/
│        └─ arrays/
```

Example of finding files relating to the Private Kernel Inner, currently:
```
noir-protocol-circuits/
├─ crates/
│  ├─ private-kernel-inner/
│  │  └─ main.nr
│  └─ private-kernel-lib/
│     └─ src/
│        └─ private_kernel_inner.nr
│        └─ components/
│           └─ previous_kernel_validator.nr
│           └─ previous_kernel_validator/
│              └─ previous_kernel_validator_hints.nr
│           └─ private_call_data_validator.nr
│           └─ private_call_data_validator/
│              └─ find_index_of_first_fully_revertible_private_call_request.nr
│              └─ validate_contract_address.nr
│              └─ validate_min_revertible_side_effect_counter.nr
│           └─ private_kernel_circuit_public_inputs_composer.nr
│           └─ private_kernel_circuit_output_validator.nr
│        └─ abis/
├─ types/
│  └─ src/
│     └─ abis/
│     └─ utils/
│        └─ arrays/

```

### Overloaded types:

Just keeping a log of overloading of types, in case we can think of better approaches in future.

An index of `N` is sometimes used to mean "nullish index".

`.counter: u32`:
- Nullish value is `MAX_U32_VALUE`.
- `0` means ???
- A nonzero counter implies the item is nonempty.

`log.note_hash_counter: u32`:
- `0` means: "this log does not relate to a note"

`transient_or_propagated_note_hash_index_for_each_log` can point to an index in one of two arrays (either an array of transient note_hashes or an array of "kept" note_hashes).

`transient_note_hash_index_for_each_nullifier` - there's no "null" value, so how do we distinguish between "null" and transient note_hash index 0?

A `contract_address` field is added to non-empty nullifiers, to create a ScopedNullifier.
`contract_address` empty implies the ScopedNullifier is empty.
Consider abstracting such emptiness checks behind a method of `Scoped`. Or, consider adding a `bool` to `Scoped` to convey this more clearly.
It appears that beyond a certain point (`assert_split_transformed_padded_arrays.nr`), the `contract_address` of each item in `padded_unique_siloed_sorted_kept_note_hashes` is being set to `0` to convey "this item has been siloed". That's potentially confusing, and we might be better creating an extra property to track this.
