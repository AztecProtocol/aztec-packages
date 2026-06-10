---
title: Escrow
sidebar_position: 4
description: Minimal token and NFT custody contract with salt-based authorization.
---

[Source](https://github.com/defi-wonderland/aztec-standards/tree/dev/src/escrow_contract)

The Escrow standard provides a minimal contract for holding tokens or NFTs on behalf of a single owner. Rather than storing the owner in mutable private state — which would require note discovery and decryption on every authorization check — the owner is encoded in the contract's own `salt` and thus baked into the contract address at deploy time. This makes authorization a simple field comparison against immutable deployment parameters: cheaper, simpler, and impossible to front-run.

## Escrow contract

```rust
#[aztec]
pub contract Escrow {
    #[external("private")]
    fn withdraw(token: AztecAddress, amount: u128, recipient: AztecAddress) {
        self.internal._assert_msg_sender();
        self.call(Token::at(token).transfer_private_to_private(
            self.address, recipient, amount, 0,
        ));
    }

    #[external("private")]
    fn withdraw_nft(nft: AztecAddress, token_id: Field, recipient: AztecAddress) {
        self.internal._assert_msg_sender();
        self.call(NFT::at(nft).transfer_private_to_private(
            self.address, recipient, token_id, 0,
        ));
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

A DeFi protocol (like a lending market or DEX) often needs to give each user a personal escrow to hold collateral or pending settlements. The standard ships a companion library that lets the parent contract deterministically compute escrow addresses from its own address and the user's keys — no onchain deployment transaction required:

```rust
#[contract_library_method]
pub fn _get_escrow(
    context: &mut PrivateContext,
    escrow_class_id: Field,
    master_secret_keys: MasterSecretKeys,
) -> AztecAddress {
    let computed_public_keys: PublicKeys = _secret_keys_to_public_keys(master_secret_keys);
    let escrow_instance = ContractInstance {
        salt: context.this_address().to_field(),
        deployer: AztecAddress::from_field(0),
        contract_class_id: ContractClassId::from_field(escrow_class_id),
        initialization_hash: 0,
        public_keys: computed_public_keys,
    };
    escrow_instance.to_address()
}

#[contract_library_method]
pub fn _share_escrow(
    context: &mut PrivateContext,
    account: AztecAddress,
    escrow: AztecAddress,
    master_secret_keys: MasterSecretKeys,
) {
    let event_struct = EscrowDetailsLogContent { escrow, master_secret_keys };
    emit_event_in_private(context, event_struct).deliver_to(
        account, MessageDelivery::onchain_constrained().with_sender(account),
    );
}
```

`_get_escrow` reconstructs the escrow address deterministically from the calling contract's address (used as the salt) and a set of master secret keys. `_share_escrow` emits an encrypted log so that the designated `account` can discover the escrow address and the keys needed to access its notes. Without this notification, the user's PXE would have no way to find the escrow or decrypt notes held there. The `ONCHAIN_CONSTRAINED` delivery mode ensures the log is validated against the note hash tree before the recipient's PXE trusts it.
