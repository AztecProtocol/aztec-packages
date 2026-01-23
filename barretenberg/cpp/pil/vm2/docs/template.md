---
tag: AVM circuit docs
subsystem: <insert_subsystem>
---

# <PIL NAME> Subtrace

[PIL Reference Implementation](https://github.com/AztecProtocol/aztec-packages/blob/master/barretenberg/cpp/pil/vm2/ecc.pil)

## Purpose
// What is this subtrace constraining

## Assumptions
// Assumptions this subtrace makes on it's inputs / outputs.

## Background
// Any expected knowledge the reader should know

## Usage
// How to use this subtrace
```pil
caller_sel { ... }
in
subtrace_sel {...}
```

## Interactions
// Table and/or Diagram

## High Level Approach To Constraining
// This should outline the high level approach that the pil file takes to constraining.
// While some maths is unavoidable, it should be kept to a minimum

# Appendix
## Subtrace Design
### Committed Columns
// Table for committed  columns

| Name | Type | Description |
|------|------|-------------|
| `sel` | boolean | Selector with which other subtraces will reference |

### Aliased Columns
// Table for aliases

| Name | Definition | Description |
|------|------------|-------------|
| `X_DIFF` | `q_x - p_x` | Difference of x coordinates |
| `Y_DIFF` | `q_y - p_y` | Difference of y coordinates |

