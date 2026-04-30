# Poseidon2 Quad Internal Round Relations

The canonical circuit-facing Poseidon2 documentation now lives in:

```text
barretenberg/cpp/src/barretenberg/stdlib/hash/poseidon2/README.md
```

That document covers:

- the sponge construction,
- Ultra and Mega permutation trace layouts,
- the Mega K=4 quad-internal encoding,
- the Vandermonde reconstruction,
- the entry/interior/terminal relations,
- the soundness argument,
- witness materialization, selectors, and file map.

This file is intentionally kept as a redirect because the relation source files are close to this
directory and older references may still point here.
