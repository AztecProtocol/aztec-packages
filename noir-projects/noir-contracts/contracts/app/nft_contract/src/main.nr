// docs:start:imports
mod types;
mod test;

use aztec::macros::aztec;

// Minimal NFT implementation with `AuthWit` support that allows minting in public-only and transfers in both public
// and private.
#[aztec]
pub contract NFT {
    use crate::types::nft_note::{NFTNote, PartialNFTNote};
    use aztec::{
        authwit::auth::{
            compute_authwit_nullifier,
        },
        context::{PrivateContext, PublicContext},
        macros::{
            events::event,
            functions::{authorize_once, initializer, internal, private, public, utility, view},
            storage::storage,
        },
        messages::logs::note::encode_and_encrypt_note,
        note::{
            constants::MAX_NOTES_PER_PAGE, note_getter_options::NoteGetterOptions,
            note_interface::NoteProperties, note_viewer_options::NoteViewerOptions,
        },
        protocol_types::{address::AztecAddress, traits::ToField},
        state_vars::{Map, PrivateSet, PublicImmutable, PublicMutable},
        utils::comparison::Comparator,
    };
    use compressed_string::FieldCompressedString;
    use std::meta::ctstring::AsCtString;

    // docs:end:imports

    // TODO(#8467): Rename this to Transfer - calling this NFTTransfer to avoid export conflict with the Transfer event
    // in the Token contract.
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
    #[authorize_once("from", "authwit_nonce")]
    #[public]
    fn transfer_in_public(
        from: AztecAddress,
        to: AztecAddress,
        token_id: Field,
        authwit_nonce: Field,
    ) {
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
        let sender_and_completer = context.msg_sender();

        // We setup a partial note with unpopulated/zero token id for 'to'.
        let partial_note = NFTNote::partial(
            to,
            storage.private_nfts.at(to).storage_slot,
            context,
            to,
            sender_and_completer,
            sender_and_completer,
        );

        partial_note
    }
    // docs:end:prepare_private_balance_increase

    /// Finalizes a transfer of NFT with `token_id` from public balance of `msg_sender` to a private balance of `to`.
    /// The transfer must be prepared by calling `prepare_private_balance_increase` from `msg_sender` account and the
    /// resulting `partial_note` must be passed as an argument to this function.
    ///
    /// Note that this contract does not protect against a `partial_note` being used multiple times and it is up to
    /// the caller of this function to ensure that it doesn't happen. If the same `partial_note` is used multiple
    /// times, the NFT with `token_id` would most likely get lost (the partial note log processing functionality
    /// would fail to find the pending partial note when trying to complete it).
    // docs:start:finalize_transfer_to_private
    #[public]
    fn finalize_transfer_to_private(token_id: Field, partial_note: PartialNFTNote) {
        // Completer is the entity that can complete the partial note. In this case, it's the same as the account
        // `from` from whose account the token is being transferred.
        let from_and_completer = context.msg_sender();
        _finalize_transfer_to_private(
            from_and_completer,
            token_id,
            partial_note,
            &mut context,
            storage,
        );
    }
    // docs:end:finalize_transfer_to_private

    // docs:start:finalize_transfer_to_private_unsafe
    /// This is a wrapper around `_finalize_transfer_to_private` placed here so that a call
    /// to `_finalize_transfer_to_private` can be enqueued. Called unsafe as it does not check `from_and_completer`
    /// (this has to be done in the calling function).
    #[public]
    #[internal]
    fn _finalize_transfer_to_private_unsafe(
        from_and_completer: AztecAddress,
        token_id: Field,
        partial_note: PartialNFTNote,
    ) {
        _finalize_transfer_to_private(
            from_and_completer,
            token_id,
            partial_note,
            &mut context,
            storage,
        );
    }
    // docs:end:finalize_transfer_to_private_unsafe

    // In all the flows in this contract, `from` (the account from which we're transferring the NFT) and `completer`
    // (the entity that can complete the partial note) are the same so we represent them with a single argument.
    #[contract_library_method]
    fn _finalize_transfer_to_private(
        from_and_completer: AztecAddress,
        token_id: Field,
        partial_note: PartialNFTNote,
        context: &mut PublicContext,
        storage: Storage<&mut PublicContext>,
    ) {
        let public_owners_storage = storage.public_owners.at(token_id);
        assert(public_owners_storage.read().eq(from_and_completer), "invalid NFT owner");

        // Set the public NFT owner to zero
        public_owners_storage.write(AztecAddress::zero());

        // We finalize the transfer by completing the partial note.
        partial_note.complete(context, from_and_completer, token_id);
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
    #[authorize_once("from", "authwit_nonce")]
    #[private]
    fn transfer_in_private(
        from: AztecAddress,
        to: AztecAddress,
        token_id: Field,
        authwit_nonce: Field,
    ) {
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
    #[authorize_once("from", "authwit_nonce")]
    #[private]
    fn transfer_to_public(
        from: AztecAddress,
        to: AztecAddress,
        token_id: Field,
        authwit_nonce: Field,
    ) {
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
