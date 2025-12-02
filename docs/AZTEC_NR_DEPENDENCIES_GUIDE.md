# Aztec.nr dependencies guide

This document is a practical guide for configuring Aztec.nr dependencies
in your `Nargo.toml` when working with Aztec contracts inside this
monorepo or in external projects.

It is meant to complement the official “Importing Aztec.nr” reference in
the online documentation.

---

## 1. Where Aztec.nr libraries live

Aztec.nr libraries are provided as Noir packages that can be imported
from your `Nargo.toml` under the `[dependencies]` or `[workspace]`
sections, depending on your project layout.

At a high level, you will typically use:

- core Aztec.nr libraries for:
  - account contracts
  - public and private function helpers
  - state and note management
- additional utility crates for patterns that are reused across example
  projects

You should always refer to the current “Importing Aztec.nr” docs to
confirm:

- the recommended dependency names
- the correct paths
- any version or tag requirements for a given Aztec release line

---

## 2. Basic `Nargo.toml` structure

A minimal `Nargo.toml` for an Aztec contract usually looks like this:

```toml
[package]
name = "my_aztec_contract"
type = "contract"
authors = ["you@example.com"]
compiler_version = ">=0.33.0"

[dependencies]
aztec = { path = "../../noir-projects/aztec-nr" }
