# AVM relations and PIL development guide

## Overview

The Aztec Virtual Machine (AVM) is the subsystem that executes public transactions and proves that execution was correct.

The PIL files define what we call "relations". These relations are constrains on a trace (a matrix of columns and rows) that define the class of "valid" execution traces. These files are written in Polygon's Polynomial Identity Language.

## Use of PIL files in the AVM

PIL files are the source of truth for relation constraints but they are processed to generate C++ code.

**IMPORTANT**: Any change to PIL files requires an update to the C++ files.

1. Make sure the `bb-pilcom` (at the root of the project, usually `~aztec-packages/bb-pilcom/`) component is up to date.
   You can do this by running `bootstrap.sh` in the `bb-pilcom` directory.
   This is only needed once. Change to PIL files do not change the `bb-pilcom` binary.
2. Regenerate the C++ code by running: `./scripts/avm2_gen.sh` in the `barretenberg/cpp/` directory.
   You should watch the text output for any errors. If everything goes well, the files in the
   `barretenberg/cpp/vm2/generated/` directory will be updated with the new relation code.
3. If needed, recompile the AVM code using the instructions in @`barretenberg/cpp/vm2/CLAUDE.md`.
