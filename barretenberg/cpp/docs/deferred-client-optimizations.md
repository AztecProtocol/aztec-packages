# Deferred client proving optimization

The compact ACIR streaming decoder rewrite is deferred to a later client optimization pass.
The source is commit `f47940223cb920782c981fb57e9b1ff93ab6eb65` in the original `avm-gain-series` study.
Run `git rev-parse f479402` in that checkout to resolve it.
The commit changes four files, with 901 insertions and 260 deletions, and includes reusable opcode and expression storage.

The original study measured 6.36% less time on the two native client flows and 1.77% less time on the five rollup workloads.
Those measurements include the effect of the rewrite on top of the study's other changes. They do not measure its effect on this BB branch.
Revisit the decoder layout, opcode conversion and witness-stack changes together.
Check decoding correctness, client proof generation and verification before measuring performance with the current code.
