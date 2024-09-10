---
title: Key Rotation
tags: [accounts, keys]
---

## Prerequisite reading

- [Keys Concept](../../../../../aztec/concepts/accounts/keys.md)

## Introduction

It is possible for users to rotate their keys, which can be helpful if some of their keys are leaked. Key rotation allows users to continue using the same account without having to create a new one.

Because of this, notes are often associated with their `nullifier key` (through a nullifier public key hash, often called `npk_m_hash`) rather than any sort of 'owner' address.

It is still possible to nullify the notes with the old nullifier key even after the key rotation.

## `TokenNote` example

See the structure of the `TokenNote` below:

#include_code TokenNote noir-projects/noir-contracts/contracts/token_contract/src/types/token_note.nr rust

In the `TokenNote` type, you can see that the nullifer computation gets the nullifier secret key specific to the contract from the PXE, based on the stored `npk_m_hash`, so a `TokenNote` is not inherently or permanently linked to a specific Aztec account.

#include_code nullifier noir-projects/noir-contracts/contracts/token_contract/src/types/token_note.nr rust

## Things to consider

- When using the `npk_m_hash`, used to represent ownership, whoever has the nullifier secret can nullify a note.
- Consider how key rotation can affect account contracts, e.g. you can add additional security checks for who or how the key rotation is called

## Resources

- End to end tests for key rotation can be found [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/yarn-project/end-to-end/src/e2e_key_rotation.test.ts)

## Glossary

- `npk_m_hash`: master nullifying public key hash
- `nsk_app`: app nullifying secret key - the app-specific NSK (learn more about app-scoped keys [here](../../../../../aztec/concepts/accounts/keys.md#scoped-keys))
- `nsk_hash`: nullifying secret key hash
- `ivpk_m`: incoming view public key (master) (learn more about IVPKs [here](../../../../../aztec/concepts/accounts/keys.md#incoming-viewing-keys))
