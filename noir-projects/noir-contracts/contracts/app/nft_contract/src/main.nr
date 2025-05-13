// docs:start:imports
mod types;
mod test;

use dep::aztec::macros::aztec;

// Minimal NFT implementation with `AuthWit` support that allows minting in public-only and transfers in both public
// and private.
#[aztec]
pub contract NFT {
    use crate::types::nft_note::{NFTNote, PartialNFTNote};
    use dep::authwit::auth::{
        assert_current_call_valid_authwit, assert_current_call_valid_authwit_public,
        compute_authwit_nullifier,
    };
    use dep::aztec::{
        macros::{
            events::event,
            functions::{initializer, internal, private, public, utility, view},
            storage::storage,
        },
        messages::logs::note::encode_and_encrypt_note,
        note::{constants::MAX_NOTES_PER_PAGE, note_interface::NoteProperties},
        prelude::{
            AztecAddress, Map, NoteGetterOptions, NoteViewerOptions, PrivateContext, PrivateSet,
            PublicContext, PublicImmutable, PublicMutable,
        },
        protocol_types::traits::Serialize,
        utils::comparison::Comparator,
    };
    use dep::compressed_string::FieldCompressedString;
    use aztec::protocol_types::traits::ToField;
    use std::meta::derive;

    // docs:end:imports

    // TODO(#8467): Rename this to Transfer - calling this NFTTransfer to avoid export conflict with the Transfer event
    // in the Token contract.
    #[derive(Serialize)]
    #[event]
    struct NFTTransfer {
        from: AztecAddress,
        to: AztecAddress,
        token_id: Field,
    }

    // docs:start:storage_struct
    #[storage]
    struct Storage<Context> {
        // The symbol of the NFT
        symbol: PublicImmutable<FieldCompressedString, Context>,
        // The name of the NFT
        name: PublicImmutable<FieldCompressedString, Context>,
        // The admin of the contract
        admin: PublicMutable<AztecAddress, Context>,
        // Addresses that can mint
        minters: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        // Contains the NFTs owned by each address in private.
        private_nfts: Map<AztecAddress, PrivateSet<NFTNote, Context>, Context>,
        // A map from token ID to a boolean indicating if the NFT exists.
        nft_exists: Map<Field, PublicMutable<bool, Context>, Context>,
        // A map from token ID to the public owner of the NFT.
        public_owners: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
    }
    // docs:end:storage_struct

    // docs:start:constructor
    #[public]
    #[initializer]
    fn constructor(admin: AztecAddress, name: str<31>, symbol: str<31>) {
        assert(!admin.is_zero(), "invalid admin");
        storage.admin.write(admin);
        storage.minters.at(admin).write(true);
        storage.name.initialize(FieldCompressedString::from_string(name));
        storage.symbol.initialize(FieldCompressedString::from_string(symbol));
    }
    // docs:end:constructor

    // docs:start:set_admin
    #[public]
    fn set_admin(new_admin: AztecAddress) {
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not an admin");
        storage.admin.write(new_admin);
    }
    // docs:end:set_admin

    // docs:start:set_minter
    #[public]
    fn set_minter(minter: AztecAddress, approve: bool) {
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not an admin");
        storage.minters.at(minter).write(approve);
    }
    // docs:end:set_minter

    // docs:start:mint
    #[public]
    fn mint(to: AztecAddress, token_id: Field) {
        assert(token_id != 0, "zero token ID not supported");
        assert(storage.minters.at(context.msg_sender()).read(), "caller is not a minter");
        assert(storage.nft_exists.at(token_id).read() == false, "token already exists");

        storage.nft_exists.at(token_id).write(true);

        storage.public_owners.at(token_id).write(to);
    }
    // docs:end:mint

    #[public]
    #[view]
    fn public_get_name() -> pub FieldCompressedString {
        storage.name.read()
    }

    #[private]
    #[view]
    fn private_get_name() -> pub FieldCompressedString {
        storage.name.read()
    }

    #[public]
    #[view]
    fn public_get_symbol() -> pub FieldCompressedString {
        storage.symbol.read()
    }

    #[private]
    #[view]
    fn private_get_symbol() -> pub FieldCompressedString {
        storage.symbol.read()
    }

    // docs:start:admin
    #[public]
    #[view]
    fn get_admin() -> Field {
        storage.admin.read().to_field()
    }
    // docs:end:admin

    // docs:start:is_minter
    #[public]
    #[view]
    fn is_minter(minter: AztecAddress) -> bool {
        storage.minters.at(minter).read()
    }
    // docs:end:is_minter

    // docs:start:transfer_in_public
    #[public]
    fn transfer_in_public(from: AztecAddress, to: AztecAddress, token_id: Field, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let public_owners_storage = storage.public_owners.at(token_id);
        assert(public_owners_storage.read().eq(from), "invalid owner");

        public_owners_storage.write(to);
    }
    // docs:end:transfer_in_public

    // Transfers token with `token_id` from public balance of message sender to a private balance of `to`.
    // docs:start:transfer_to_private
    #[private]
    fn transfer_to_private(to: AztecAddress, token_id: Field) {
        let from = context.msg_sender();

        let nft = NFT::at(context.this_address());

        // We prepare the private balance increase.
        let partial_note = _prepare_private_balance_increase(to, &mut context, storage);

        // At last we finalize the transfer. Usage of the `unsafe` method here is safe because we set the `from`
        // function argument to a message sender, guaranteeing that he can transfer only his own NFTs.
        nft._finalize_transfer_to_private_unsafe(from, token_id, partial_note).enqueue(&mut context);
    }
    // docs:end:transfer_to_private

    /// Prepares an increase of private balance of `to` (partial note). The increase needs to be finalized by calling
    /// `finalize_transfer_to_private` with the returned partial note.
    // docs:start:prepare_private_balance_increase
    #[private]
    fn prepare_private_balance_increase(to: AztecAddress) -> PartialNFTNote {
        _prepare_private_balance_increase(to, &mut context, storage)
    }

    /// This function exists separately from `prepare_private_balance_increase` solely as an optimization as it allows
    /// us to have it inlined in the `transfer_to_private` function which results in one less kernel iteration.
    ///
    /// TODO(#9180): Consider adding macro support for functions callable both as an entrypoint and as an internal
    /// function.
    #[contract_library_method]
    fn _prepare_private_balance_increase(
        to: AztecAddress,
        context: &mut PrivateContext,
        storage: Storage<&mut PrivateContext>,
    ) -> PartialNFTNote {
        // We create a partial note with unpopulated/zero token id for 'to'
        let partial_note = NFTNote::partial(
            to,
            storage.private_nfts.at(to).storage_slot,
            context,
            to,
            context.msg_sender(),
        );

        NFT::at(context.this_address())._store_nft_set_partial_note(partial_note).enqueue(context);

        partial_note
    }
    // docs:end:prepare_private_balance_increase

    // docs:start:store_payload_in_transient_storage_unsafe
    #[public]
    #[internal]
    fn _store_nft_set_partial_note(partial_note: PartialNFTNote) {
        // We store the partial note in a slot equal to its commitment. This is safe because the commitment is computed
        // using a generator different from the one used to compute storage slots, so there can be no collisions.
        // We could consider storing all pending partial notes in e.g. some array, but ultimately this is pointless: all
        // we need to verify is that the note is valid.
        context.storage_write(partial_note.commitment(), true);
    }
    // docs:end:store_payload_in_transient_storage_unsafe
    /// Finalizes a transfer of NFT with `token_id` from public balance of `from` to a private balance of `to`.
    /// The transfer must be prepared by calling `prepare_private_balance_increase` first and the resulting
    /// `partial_note` must be passed as an argument to this function.
    // docs:start:finalize_transfer_to_private
    #[public]
    fn finalize_transfer_to_private(token_id: Field, partial_note: PartialNFTNote) {
        let from = context.msg_sender();
        _finalize_transfer_to_private(from, token_id, partial_note, &mut context, storage);
    }
    // docs:end:finalize_transfer_to_private

    // docs:start:finalize_transfer_to_private_unsafe
    #[public]
    #[internal]
    fn _finalize_transfer_to_private_unsafe(
        from: AztecAddress,
        token_id: Field,
        partial_note: PartialNFTNote,
    ) {
        _finalize_transfer_to_private(from, token_id, partial_note, &mut context, storage);
    }
    // docs:end:finalize_transfer_to_private_unsafe

    #[contract_library_method]
    fn _finalize_transfer_to_private(
        from: AztecAddress,
        token_id: Field,
        partial_note: PartialNFTNote,
        context: &mut PublicContext,
        storage: Storage<&mut PublicContext>,
    ) {
        let public_owners_storage = storage.public_owners.at(token_id);
        assert(public_owners_storage.read().eq(from), "invalid NFT owner");

        // Set the public NFT owner to zero
        public_owners_storage.write(AztecAddress::zero());

        // We verify that the partial note we're completing is valid (i.e. it uses the correct state variable's storage
        // slot, and it is internally consistent). We *could* clear the storage since each partial note should only be
        // used once, but since the AVM offers no gas refunds for doing so this would just make the transaction be more
        // expensive.
        assert(context.storage_read(partial_note.commitment()), "Invalid partial note");
        partial_note.complete(token_id, context);
    }

    /**
     * Cancel a private authentication witness.
     * @param inner_hash The inner hash of the authwit to cancel.
     */
    // docs:start:cancel_authwit
    #[private]
    fn cancel_authwit(inner_hash: Field) {
        let on_behalf_of = context.msg_sender();
        let nullifier = compute_authwit_nullifier(on_behalf_of, inner_hash);
        context.push_nullifier(nullifier);
    }
    // docs:end:cancel_authwit

    // docs:start:transfer_in_private
    #[private]
    fn transfer_in_private(from: AztecAddress, to: AztecAddress, token_id: Field, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let nfts = storage.private_nfts;

        let notes = nfts.at(from).pop_notes(NoteGetterOptions::new()
            .select(NFTNote::properties().token_id, Comparator.EQ, token_id)
            .set_limit(1));
        assert(notes.len() == 1, "NFT not found when transferring");

        let new_note = NFTNote::new(token_id, to);

        nfts.at(to).insert(new_note).emit(encode_and_encrypt_note(&mut context, to, from));
    }
    // docs:end:transfer_in_private

    // docs:start:transfer_to_public
    #[private]
    fn transfer_to_public(from: AztecAddress, to: AztecAddress, token_id: Field, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let notes = storage.private_nfts.at(from).pop_notes(NoteGetterOptions::new()
            .select(NFTNote::properties().token_id, Comparator.EQ, token_id)
            .set_limit(1));
        assert(notes.len() == 1, "NFT not found when transferring to public");

        NFT::at(context.this_address())._finish_transfer_to_public(to, token_id).enqueue(
            &mut context,
        );
    }
    // docs:end:transfer_to_public

    // docs:start:finish_transfer_to_public
    #[public]
    #[internal]
    fn _finish_transfer_to_public(to: AztecAddress, token_id: Field) {
        storage.public_owners.at(token_id).write(to);
    }
    // docs:end:finish_transfer_to_public

    // Returns zero address when the token does not have a public owner. Reverts if the token does not exist.
    #[public]
    #[view]
    fn owner_of(token_id: Field) -> AztecAddress {
        assert(storage.nft_exists.at(token_id).read(), "token does not exist");
        storage.public_owners.at(token_id).read()
    }

    /// Returns an array of token IDs owned by `owner` in private and a flag indicating whether a page limit was
    /// reached. Starts getting the notes from page with index `page_index`. Zero values in the array are placeholder
    /// values for non-existing notes.
    // docs:start:get_private_nfts
    #[utility]
    unconstrained fn get_private_nfts(
        owner: AztecAddress,
        page_index: u32,
    ) -> ([Field; MAX_NOTES_PER_PAGE], bool) {
        let offset = page_index * MAX_NOTES_PER_PAGE;
        let mut options = NoteViewerOptions::new();
        let notes = storage.private_nfts.at(owner).view_notes(options.set_offset(offset));

        let mut owned_nft_ids = [0; MAX_NOTES_PER_PAGE];
        for i in 0..options.limit {
            if i < notes.len() {
                owned_nft_ids[i] = notes.get_unchecked(i).token_id;
            }
        }

        let page_limit_reached = notes.len() == options.limit;
        (owned_nft_ids, page_limit_reached)
    }
    // docs:end:get_private_nfts
}
