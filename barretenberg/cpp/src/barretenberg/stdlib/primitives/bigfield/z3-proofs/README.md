# Field Emulation Proofs

This repository contains Z3 based proofs for verifying arithmetic circuits. It
relies on Hoare triples to structure proofs of correctness and to provide
compositional reasoning about intermediate lemmas.

These files ported from https://github.com/VeridiseAuditing/field-emulation-proofs

## Developer Setup

1. Install [Poetry](https://python-poetry.org/docs/#installation).
2. Install dependencies and create the virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install --upgrade pip poetry
   deactivate ; source .venv/bin/activate
   poetry install
   ```

## Performing Verification

The verified statements are encoded as tests. For a more detailed description, see
the relevant subdirectory below:
- Aztec bigfield: [aztec](./field_emulation_proofs/aztec/README.md)

Tests are written with `pytest` and can be run with:

```bash
pytest
```

## Proving Workflow

Proofs follow the structure of a Hoare Triple `{P} C {Q}` where `P` is the
precondition, `C` is the implementation encoded as Z3 constraints and `Q` is the
postcondition. Each proof exposes an `evaluate` method that constructs the Z3
representation of `C` and two methods returning the pre- and postconditions.

Sometimes auxiliary lemmas are required to simplify reasoning. These lemmas are
proven once using the solver and subsequently assumed to hold when proving the
main validity expression. Once a lemma is proven valid it is added to the
antecedent of later proofs, meaning it never needs to be considered again.
This allows later checks to ignore lemmas and replace function invocations
with a simple `Implies(P, Q)`.
