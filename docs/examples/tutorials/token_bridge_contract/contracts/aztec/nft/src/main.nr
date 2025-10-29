// docs:start:contract_setup
use aztec::macros::aztec;
pub mod nft;

#[aztec]
pub contract NFTPunk {
    use dep::aztec::{
        macros::{storage::storage, functions::{external, utility, initializer, only_self}},
        protocol_types::{address::AztecAddress},
        state_vars::{PrivateSet, PublicImmutable, delayed_public_mutable::DelayedPublicMutable, Map}
    };
    use crate::nft::NFTNote;
    use dep::aztec::messages::message_delivery::MessageDelivery;
    use aztec::note::{note_getter_options::NoteGetterOptions, note_interface::NoteProperties, note_viewer_options::NoteViewerOptions};
    use aztec::utils::comparison::Comparator;

    #[storage]
    struct Storage<Context> {
        admin: PublicImmutable<AztecAddress, Context>,
        minter: PublicImmutable<AztecAddress, Context>,
        nfts: Map<Field, DelayedPublicMutable<bool, 2, Context>, Context>,
        owners: Map<AztecAddress, PrivateSet<NFTNote, Context>, Context>,
    }
    #[external("public")]
    #[initializer]
    fn constructor(admin: AztecAddress) {
        self.storage.admin.initialize(admin);
    }
    // docs:end:contract_setup

    // docs:start:set_minter
    #[external("public")]
    fn set_minter(minter: AztecAddress) {
        assert(self.storage.admin.read().eq(self.msg_sender().unwrap()), "caller is not admin");
        self.storage.minter.initialize(minter);
    }
    // docs:end:set_minter

    // docs:start:mark_nft_exists
    #[external("public")]
    #[only_self]
    fn _mark_nft_exists(token_id: Field, exists: bool) {
        self.storage.nfts.at(token_id).schedule_value_change(exists);
    }
    // docs:end:mark_nft_exists

    // docs:start:mint
    #[external("private")]
    fn mint(to: AztecAddress, token_id: Field) {
        assert(self.storage.minter.read().eq(self.msg_sender().unwrap()), "caller is not the authorized minter");

        // we create an NFT note and insert it to the PrivateSet - a collection of notes meant to be read in private
        let new_nft = NFTNote::new(to, token_id);
        self.storage.owners.at(to).insert(new_nft).emit( to, MessageDelivery.CONSTRAINED_ONCHAIN);

        // calling the internal public function above to indicate that the NFT is taken
        NFTPunk::at(self.address)._mark_nft_exists(token_id, true).enqueue(self.context);
    }
    // docs:end:mint

    // docs:start:notes_of
    #[utility]
    unconstrained fn notes_of(from: AztecAddress) -> Field {
        let notes = self.storage.owners.at(from).view_notes(NoteViewerOptions::new());
        notes.len() as Field
    }
    // docs:end:notes_of

    // docs:start:burn
    #[external("private")]
    fn burn(from: AztecAddress, token_id: Field) {
        assert(self.storage.minter.read().eq(self.msg_sender().unwrap()), "caller is not the authorized minter");

        // from the NFTNote properties, selects token_id and compares it against the token_id to be burned
        let options = NoteGetterOptions::new().select(NFTNote::properties().token_id, Comparator.EQ, token_id).set_limit(1);
        let notes = self.storage.owners.at(from).pop_notes(options);
        assert(notes.len() == 1, "NFT not found");

        NFTPunk::at(self.address)._mark_nft_exists(token_id, false).enqueue(self.context);
    }
    // docs:end:burn
}
