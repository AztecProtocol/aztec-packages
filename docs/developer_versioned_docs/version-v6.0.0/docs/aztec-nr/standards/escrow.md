---
title: Escrow
sidebar_position: 4
description: Minimal token and NFT custody contract with salt-based authorization.
---

[Source](https://github.com/AztecProtocol/aztec-standards/tree/v6.0.0/src/escrow_contract)

The Escrow standard provides a minimal contract for holding tokens or NFTs on behalf of a single owner. Rather than storing the owner in mutable private state — which would require note discovery and decryption on every authorization check — the owner is encoded in the contract's own `salt` and thus baked into the contract address at deploy time. This makes authorization a simple field comparison against immutable deployment parameters: cheaper, simpler, and impossible to front-run.

## Escrow contract

```rust
#[aztec]
pub contract Escrow {
    #[external("private")]
    fn withdraw(token: AztecAddress, amount: u128, recipient: AztecAddress) {
        self.internal._assert_msg_sender();
        self.call(Token::at(token).transfer_private_to_private(self.address, recipient, amount, 0));
    }

    #[external("private")]
    fn withdraw_nft(nft: AztecAddress, token_id: Field, recipient: AztecAddress) {
        self.internal._assert_msg_sender();
        self.call(NFT::at(nft).transfer_private_to_private(self.address, recipient, token_id, 0));
    }

    #[internal("private")]
    fn _assert_msg_sender() {
        let msg_sender = self.msg_sender();
        let escrow_instance: ContractInstance = get_contract_instance(self.address);
        assert(AztecAddress::from_field(escrow_instance.salt) == msg_sender, "Not Authorized");
    }
}
```

The authorization check in `_assert_msg_sender` reads the `salt` field of the escrow's own `ContractInstance` and compares it against `msg_sender`. Because the `ContractInstance` is fixed at deployment time, this check cannot be spoofed by manipulating storage after deployment.

## Escrow logic library

A DeFi protocol (like a lending market or DEX) often needs to give each user a personal escrow to hold collateral or pending settlements. The standard ships a companion library that lets the parent contract deterministically compute escrow addresses from its own address and a secret key, with no onchain deployment transaction required:

```rust
/// @notice Returns the escrow address that corresponds to the given secret key and class ID.
/// @param context The private context
/// @param escrow_class_id The contract class id of the escrow contract
/// @param secret_key The secret key used to derive master secret keys and public keys
/// @return The escrow address
#[contract_library_method]
pub fn _get_escrow(
    context: &mut PrivateContext,
    escrow_class_id: Field,
    secret_key: Field,
) -> AztecAddress {
    // Compute the public keys from the secret key (sk -> msks -> pks)
    let computed_public_keys: PublicKeys = secret_key_to_public_keys(secret_key);

    let escrow_instance = ContractInstance {
        salt: context.this_address().to_field(),
        deployer: AztecAddress::from_field(0),
        original_contract_class_id: ContractClassId::from_field(escrow_class_id),
        initialization_hash: 0,
        immutables_hash: 0,
        public_keys: computed_public_keys,
    };

    escrow_instance.to_address()
}

/// @notice Shares the escrow details needed to find and use the escrow contract
/// @dev Emits a private log with the escrow details
/// @param context The private context
/// @param account The address of the account that will use the escrow
/// @param escrow The address of the escrow
/// @param secret_key The secret key used to derive master secret keys and public keys
#[contract_library_method]
pub fn _share_escrow(
    context: &mut PrivateContext,
    account: AztecAddress,
    escrow: AztecAddress,
    secret_key: Field,
) {
    let event_struct = EscrowDetailsLogContent { escrow, secret_key };

    emit_event_in_private(context, event_struct).deliver_to(
        account,
        MessageDelivery::onchain_constrained(),
    );
}
```

`_get_escrow` reconstructs the escrow address deterministically from the calling contract's address (used as the salt) and a secret key, from which it derives the escrow's public keys. `_share_escrow` emits an encrypted log so that the designated `account` can discover the escrow address and the secret key needed to access its notes. Without this notification, the user's PXE would have no way to find the escrow or decrypt notes held there. Constrained delivery proves the log's encryption and tagging in the circuit, so the calling contract cannot emit a log that the recipient's PXE fails to find or decrypt.
