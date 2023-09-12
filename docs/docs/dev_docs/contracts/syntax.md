# Aztec.nr Syntax

[Noir](https://noir-lang.org/) is a language which is agnostic to proof systems and use cases. Rather than baking Aztec-specific keywords and smart contract types directly into Noir (which would break this agnosticism), we have developed a framework -- written in Noir -- whose types and methods provide rich smart contract semantics.

On top of [Noir's stdlib](https://noir-lang.org/standard_library/array_methods), we provide [Aztec.nr](https://github.com/AztecProtocol/aztec-packages/tree/master/yarn-project/noir-libs) for writing contracts on Aztec.

Aztec.nr contains abstractions which remove the need to understand the low-level Aztec protocol. Notably, it provides:

- Public and private [state variable types](./types.md)
- Some pre-designed notes.
- Functions for [emitting](./events.md) encrypted and unencrypted logs
- [Oracle functions](./functions.md#oracle-calls) for accessing:
  - private state
  - secrets
- Functions for communicating with Ethereum L1

To import Aztec.nr into your Aztec contract project, simply include it as a dependency.

```toml
[package]
name = "my_noir_contract"
authors = [""]
compiler_version = "0.10.0"
type = "contract"

[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages", tag="master", directory="yarn-project/noir-libs/aztec-noir" }
```

Note: currently the dependency name ***MUST*** be `aztec`. The framework expects this namespace to be available when compiling into contracts. This limitation may be removed in the future.