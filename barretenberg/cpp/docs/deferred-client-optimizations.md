# Deferred client proving optimization

The compact ACIR streaming decoder rewrite is reserved for a later client optimization pass.
Source commit: `f47940223cb920782c981fb57e9b1ff93ab6eb65` in the original `avm-gain-series` study (resolve with `git rev-parse f479402` there).
It changes four files, with 901 insertions and 260 deletions, and includes reusable opcode/expression storage.
The historical study measured 6.36% less time on the two native client flows and 1.77% on the five rollup workloads.
Those are incremental results on the original larger stack, not measurements on the distilled BB branch.
Revisit the decoder layout, opcode conversion and witness-stack changes together, with decoding correctness and
client proof/verification checks before measuring their effect on the current stack.
