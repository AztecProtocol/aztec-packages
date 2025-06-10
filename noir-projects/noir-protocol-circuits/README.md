# Noir Protocol Circuits

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
