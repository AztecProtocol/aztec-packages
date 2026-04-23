use aztec::macros::aztec;

mod schnorr;
mod asserted_note;
mod effects;
mod validation;
mod delivery;
mod da;
mod balance;
mod content_hash;

#[aztec(::aztec::macros::AztecConfig::new().custom_message_handler(crate::delivery::note_handler))]
pub contract AssertedTokenContract {
    use crate::{
        asserted_note::AssertedNote,
        content_hash::{
            compute_stealth_recipient_hash, get_claim_content_hash, get_withdraw_content_hash,
            CONSTANT_SECRET,
        },
        da::{
            load_tee_metadata_da_capsule, load_tee_notes_da_capsule,
            load_tee_required_nullifiers_da_capsule, TEEMetadata,
        },
        delivery::deliver,
        effects::emit_nullification_effect,
    };
    use super::da::{
        TEE_METADATA_DA_TAG, TEE_NOTES_DA_TAG, TEE_REQUIRED_NULLIFIERS_DA_TAG, to_log_ciphertext,
    };
    use aztec::{
        macros::{functions::{external, initializer, internal, only_self}, storage::storage},
        note::{lifecycle::destroy_note, note_getter_options::NoteGetterOptions},
        protocol::{address::{AztecAddress, EthAddress}, hash::poseidon2_hash, traits::Serialize},
        state_vars::{Map, Owned, PrivateSet, PublicImmutable, PublicMutable},
    };

    global INITIAL_TRANSFER_CALL_MAX_NOTES: u32 = 2;
    global RECURSIVE_TRANSFER_CALL_MAX_NOTES: u32 = 8;

    #[storage]
    struct Storage<Context> {
        portal_address: PublicImmutable<EthAddress, Context>,
        balances: Owned<PrivateSet<AssertedNote, Context>, Context>,
        approved_signers: Map<Field, PublicMutable<bool, Context>, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(portal_address: EthAddress) {
        self.storage.portal_address.initialize(portal_address);
    }

    #[external("public")]
    fn add_approved_signer(pub_key_x: Field, pub_key_y: Field) {
        // TODO: read from l1.
        self.storage.approved_signers.at(poseidon2_hash([pub_key_x, pub_key_y])).write(true);
    }

    #[external("utility")]
    unconstrained fn balance_of_private(owner: AztecAddress) -> u128 {
        crate::balance::balance_of_with_offset(self.storage.balances.at(owner), 0)
    }

    #[external("private")]
    fn mint(to: AztecAddress, amount: u128) {
        deliver(
            self.context,
            self.storage.balances.at(to).insert(AssertedNote::create(self.context, amount)),
        );
    }

    // Consumes one L1 -> L2 claim message and credits `amount` into `recipient`'s
    // private balance. The caller must know `shared_secret` - the L1 depositor
    // derived `recipientHash` from the same shared_secret, so supplying the wrong
    // one produces a content hash that does not match any message in the inbox and
    // the `consume_l1_to_l2_message` call below reverts.
    //
    // The L1 content-hash encoding (`sha256("claim(bytes32,uint256)" || recipientHash
    // || amount)`) must match `Portal.sol::deposit` byte-for-byte. The token's
    // L1 portal is the depositor side of this message and is read from the
    // `portal_address` public immutable set at construction.
    #[external("private")]
    fn claim(
        recipient: AztecAddress,
        amount: u128,
        shared_secret: Field,
        message_leaf_index: Field,
    ) {
        let portal = self.storage.portal_address.read();

        let recipient_hash = compute_stealth_recipient_hash(
            shared_secret,
            recipient,
            portal,
            self.context.chain_id(),
        );

        let content_hash = get_claim_content_hash(recipient_hash, amount);

        self.context.consume_l1_to_l2_message(
            content_hash,
            CONSTANT_SECRET,
            portal,
            message_leaf_index,
        );

        deliver(
            self.context,
            self.storage.balances.at(recipient).insert(AssertedNote::create(self.context, amount)),
        );
    }

    // Debits `amount` from `from`'s private balance and emits an L2 -> L1 message the
    // L1 `Portal.withdraw` will consume. The caller's PXE must own enough notes under
    // `from` to cover `amount` - `_subtract_balance` will fail to find spendable notes
    // otherwise.
    #[external("private")]
    fn withdraw(from: AztecAddress, l1_recipient: EthAddress, amount: u128) {
        assert(from == self.msg_sender(), "caller must be sender");

        let portal = self.storage.portal_address.read();

        let change = self.internal._subtract_balance(from, amount, INITIAL_TRANSFER_CALL_MAX_NOTES);

        if change > 0 {
            deliver(
                self.context,
                self.storage.balances.at(from).insert(AssertedNote::create(self.context, change)),
            );
        }

        let content_hash = get_withdraw_content_hash(l1_recipient, amount);
        self.context.message_portal(portal, content_hash);
    }

    #[external("private")]
    fn transfer(from: AztecAddress, to: AztecAddress, amount: u128) {
        assert(from == self.msg_sender(), "caller must be sender");

        let change = self.internal._subtract_balance(from, amount, INITIAL_TRANSFER_CALL_MAX_NOTES);

        if change > 0 {
            deliver(
                self.context,
                self.storage.balances.at(from).insert(AssertedNote::create(self.context, change)),
            );
        }

        deliver(
            self.context,
            self.storage.balances.at(to).insert(AssertedNote::create(self.context, amount)),
        );
    }

    #[external("private")]
    fn publish_da() {
        // Safety: DA components are unconstrained.
        let tee_notes = unsafe { load_tee_notes_da_capsule(self.context.this_address()) };
        self.context.emit_private_log_unsafe(
            0, // We don't use tags
            to_log_ciphertext(TEE_NOTES_DA_TAG, tee_notes),
            tee_notes.len() + 1, // +1 for the da tag
        );
        // Safety: DA components are unconstrained.
        let tee_required_nullifiers =
            unsafe { load_tee_required_nullifiers_da_capsule(self.context.this_address()) };
        self.context.emit_private_log_unsafe(
            0, // We don't use tags
            to_log_ciphertext(TEE_REQUIRED_NULLIFIERS_DA_TAG, tee_required_nullifiers),
            tee_required_nullifiers.len() + 1, // +1 for the da tag
        );
        // Safety: DA components are unconstrained.
        let tee_metadata = unsafe { load_tee_metadata_da_capsule(self.context.this_address()) };
        self.context.emit_private_log_unsafe(
            0, // We don't use tags
            to_log_ciphertext(TEE_METADATA_DA_TAG, tee_metadata.serialize()),
            <TEEMetadata as Serialize>::N + 1, // +1 for the da tag
        );
    }

    #[external("private")]
    #[only_self]
    fn recurse_subtract_balance_internal(account: AztecAddress, amount: u128) -> u128 {
        self.internal._subtract_balance(account, amount, RECURSIVE_TRANSFER_CALL_MAX_NOTES)
    }

    #[internal("private")]
    fn _subtract_balance(account: AztecAddress, amount: u128, max_notes: u32) -> u128 {
        let mut subtracted: u128 = 0;
        let options = NoteGetterOptions::new().set_limit(max_notes);
        let confirmed_notes = self.storage.balances.at(account).get_notes(options);

        for i in 0..options.limit {
            if i < confirmed_notes.len() {
                let confirmed_note = confirmed_notes.get_unchecked(i);
                destroy_note(self.context, confirmed_note);
                // Safety: Offchain effects are by definition unconstrained.
                unsafe { emit_nullification_effect(confirmed_note) };

                subtracted += confirmed_note.note.amount;
            }
        }
        if subtracted >= amount {
            subtracted - amount
        } else {
            assert(subtracted > 0, "Balance too low");
            self.call_self.recurse_subtract_balance_internal(account, amount - subtracted)
        }
    }

}
