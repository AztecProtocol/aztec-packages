mod types;

use aztec::macros::aztec;

// Minimal token contract. Do not use
// For demonstration purposes in playground only
// If you change the names of these functions, please also update them in playground/src/components/contract/contract.ts

#[aztec]
pub contract SimpleToken {
    use std::ops::{Add, Sub};

    use compressed_string::FieldCompressedString;

    use aztec::{
        authwit::auth::compute_authwit_nullifier,
        context::{PrivateCallInterface, PrivateContext, PublicContext},
        macros::{
            events::event,
            functions::{authorize_once, external, initializer, only_self, view},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        protocol_types::address::AztecAddress,
        state_vars::{Map, PublicImmutable, PublicMutable},
    };

    use uint_note::uint_note::{PartialUintNote, UintNote};

    use crate::types::balance_set::BalanceSet;

    global INITIAL_TRANSFER_CALL_MAX_NOTES: u32 = 2;
    global RECURSIVE_TRANSFER_CALL_MAX_NOTES: u32 = 8;

    #[event]
    struct Transfer {
        from: AztecAddress,
        to: AztecAddress,
        amount: u128,
    }

    #[storage]
    struct Storage<Context> {
        balances: Map<AztecAddress, BalanceSet<Context>, Context>,
        total_supply: PublicMutable<u128, Context>,
        public_balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
        symbol: PublicImmutable<FieldCompressedString, Context>,
        name: PublicImmutable<FieldCompressedString, Context>,
        decimals: PublicImmutable<u8, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(name: str<31>, symbol: str<31>, decimals: u8) {
        self.storage.name.initialize(FieldCompressedString::from_string(name));
        self.storage.symbol.initialize(FieldCompressedString::from_string(symbol));
        self.storage.decimals.initialize(decimals);
    }

    #[external("public")]
    #[view]
    fn public_get_name() -> FieldCompressedString {
        self.storage.name.read()
    }

    #[external("public")]
    #[view]
    fn public_get_symbol() -> pub FieldCompressedString {
        self.storage.symbol.read()
    }

    #[external("public")]
    #[view]
    fn public_get_decimals() -> pub u8 {
        self.storage.decimals.read()
    }

    #[external("public")]
    #[view]
    fn public_total_supply() -> u128 {
        self.storage.total_supply.read()
    }

    #[external("public")]
    #[view]
    fn public_balance_of(owner: AztecAddress) -> u128 {
        self.storage.public_balances.at(owner).read()
    }

    #[external("utility")]
    unconstrained fn private_balance_of(owner: AztecAddress) -> u128 {
        self.storage.balances.at(owner).balance_of()
    }

    #[external("public")]
    fn mint_publicly(to: AztecAddress, amount: u128) {
        let new_balance = self.storage.public_balances.at(to).read().add(amount);
        let supply = self.storage.total_supply.read().add(amount);
        self.storage.public_balances.at(to).write(new_balance);
        self.storage.total_supply.write(supply);
    }

    #[authorize_once("from", "authwit_nonce")]
    #[external("public")]
    fn public_transfer(from: AztecAddress, to: AztecAddress, amount: u128, authwit_nonce: Field) {
        let from_balance = self.storage.public_balances.at(from).read().sub(amount);
        self.storage.public_balances.at(from).write(from_balance);
        let to_balance = self.storage.public_balances.at(to).read().add(amount);
        self.storage.public_balances.at(to).write(to_balance);
    }

    #[authorize_once("from", "authwit_nonce")]
    #[external("public")]
    fn burn_public(from: AztecAddress, amount: u128, authwit_nonce: Field) {
        let from_balance = self.storage.public_balances.at(from).read().sub(amount);
        self.storage.public_balances.at(from).write(from_balance);
        let new_supply = self.storage.total_supply.read().sub(amount);
        self.storage.total_supply.write(new_supply);
    }

    #[authorize_once("from", "authwit_nonce")]
    #[external("private")]
    fn transfer_from_private_to_public(
        from: AztecAddress,
        to: AztecAddress,
        amount: u128,
        authwit_nonce: Field,
    ) {
        self.storage.balances.at(from).sub(from, amount).emit(
            from,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
        SimpleToken::at(self.address)._increase_public_balance(to, amount).enqueue(self.context);
    }

    #[external("private")]
    fn private_transfer(to: AztecAddress, amount: u128) {
        let from = self.msg_sender().unwrap();

        let change = subtract_balance(
            self.context,
            self.storage,
            from,
            amount,
            INITIAL_TRANSFER_CALL_MAX_NOTES,
        );
        self.storage.balances.at(from).add(from, change).emit(
            from,
            MessageDelivery.UNCONSTRAINED_ONCHAIN,
        );
        self.storage.balances.at(to).add(to, amount).emit(to, MessageDelivery.UNCONSTRAINED_ONCHAIN);

        self.emit(Transfer { from, to, amount }, to, MessageDelivery.UNCONSTRAINED_ONCHAIN);
    }

    #[authorize_once("from", "authwit_nonce")]
    #[external("private")]
    fn burn_private(from: AztecAddress, amount: u128, authwit_nonce: Field) {
        self.storage.balances.at(from).sub(from, amount).emit(
            from,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
        SimpleToken::at(self.address)._reduce_total_supply(amount).enqueue(self.context);
    }

    #[external("private")]
    fn transfer_from_public_to_private(to: AztecAddress, amount: u128) {
        let from = self.msg_sender().unwrap();
        let token = SimpleToken::at(self.address);

        let partial_note = _prepare_private_balance_increase(to, self.context, self.storage);
        token._finalize_transfer_to_private_unsafe(from, amount, partial_note).enqueue(self.context);
    }

    #[external("private")]
    fn prepare_private_balance_increase(to: AztecAddress, from: AztecAddress) -> PartialUintNote {
        _prepare_private_balance_increase(to, self.context, self.storage)
    }

    #[contract_library_method]
    fn _prepare_private_balance_increase(
        to: AztecAddress,
        context: &mut PrivateContext,
        storage: Storage<&mut PrivateContext>,
    ) -> PartialUintNote {
        let partial_note = UintNote::partial(
            to,
            storage.balances.at(to).set.storage_slot,
            context,
            to,
            context.msg_sender().unwrap(),
        );

        partial_note
    }

    #[external("public")]
    fn finalize_transfer_to_private(amount: u128, partial_note: PartialUintNote) {
        let from_and_completer = self.msg_sender().unwrap();
        _finalize_transfer_to_private(
            from_and_completer,
            amount,
            partial_note,
            self.context,
            self.storage,
        );
    }

    #[external("public")]
    #[only_self]
    fn _finalize_transfer_to_private_unsafe(
        from_and_completer: AztecAddress,
        amount: u128,
        partial_note: PartialUintNote,
    ) {
        _finalize_transfer_to_private(
            from_and_completer,
            amount,
            partial_note,
            self.context,
            self.storage,
        );
    }

    #[contract_library_method]
    fn _finalize_transfer_to_private(
        from_and_completer: AztecAddress,
        amount: u128,
        partial_note: PartialUintNote,
        context: &mut PublicContext,
        storage: Storage<&mut PublicContext>,
    ) {
        let from_balance = storage.public_balances.at(from_and_completer).read().sub(amount);
        storage.public_balances.at(from_and_completer).write(from_balance);

        partial_note.complete(context, from_and_completer, amount);
    }

    #[external("private")]
    fn mint_privately(from: AztecAddress, to: AztecAddress, amount: u128) {
        let token = SimpleToken::at(self.address);
        let partial_note = _prepare_private_balance_increase(to, self.context, self.storage);
        token
            ._finalize_mint_to_private_unsafe(self.msg_sender().unwrap(), amount, partial_note)
            .enqueue(self.context);
    }

    #[external("public")]
    fn finalize_mint_to_private(amount: u128, partial_note: PartialUintNote) {
        _finalize_mint_to_private(
            self.msg_sender().unwrap(),
            amount,
            partial_note,
            self.context,
            self.storage,
        );
    }

    #[external("public")]
    #[only_self]
    fn _finalize_mint_to_private_unsafe(
        minter_and_completer: AztecAddress,
        amount: u128,
        partial_note: PartialUintNote,
    ) {
        _finalize_mint_to_private(
            minter_and_completer,
            amount,
            partial_note,
            self.context,
            self.storage,
        );
    }

    #[contract_library_method]
    fn _finalize_mint_to_private(
        completer: AztecAddress,
        amount: u128,
        partial_note: PartialUintNote,
        context: &mut PublicContext,
        storage: Storage<&mut PublicContext>,
    ) {
        let supply = storage.total_supply.read().add(amount);
        storage.total_supply.write(supply);

        partial_note.complete(context, completer, amount);
    }

    #[external("public")]
    #[only_self]
    fn _increase_public_balance(to: AztecAddress, amount: u128) {
        _increase_public_balance_inner(to, amount, self.storage);
    }

    #[contract_library_method]
    fn _increase_public_balance_inner(
        to: AztecAddress,
        amount: u128,
        storage: Storage<&mut PublicContext>,
    ) {
        let new_balance = storage.public_balances.at(to).read().add(amount);
        storage.public_balances.at(to).write(new_balance);
    }

    #[external("public")]
    #[only_self]
    fn _reduce_total_supply(amount: u128) {
        let new_supply = self.storage.total_supply.read().sub(amount);
        self.storage.total_supply.write(new_supply);
    }

    #[external("private")]
    fn cancel_authwit(inner_hash: Field) {
        let on_behalf_of = self.msg_sender().unwrap();
        let nullifier = compute_authwit_nullifier(on_behalf_of, inner_hash);
        self.context.push_nullifier(nullifier);
    }

    #[contract_library_method]
    fn subtract_balance(
        context: &mut PrivateContext,
        storage: Storage<&mut PrivateContext>,
        account: AztecAddress,
        amount: u128,
        max_notes: u32,
    ) -> u128 {
        let subtracted = storage.balances.at(account).try_sub(amount, max_notes);
        assert(subtracted > 0 as u128, "Balance too low");
        if subtracted >= amount {
            subtracted - amount
        } else {
            let remaining = amount - subtracted;
            compute_recurse_subtract_balance_call(*context, account, remaining).call(context)
        }
    }

    #[no_predicates]
    #[contract_library_method]
    fn compute_recurse_subtract_balance_call(
        context: PrivateContext,
        account: AztecAddress,
        remaining: u128,
    ) -> PrivateCallInterface<25, u128> {
        SimpleToken::at(context.this_address())._recurse_subtract_balance(account, remaining)
    }

    #[only_self]
    #[external("private")]
    fn _recurse_subtract_balance(account: AztecAddress, amount: u128) -> u128 {
        subtract_balance(
            self.context,
            self.storage,
            account,
            amount,
            RECURSIVE_TRANSFER_CALL_MAX_NOTES,
        )
    }
}
