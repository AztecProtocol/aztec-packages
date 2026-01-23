use dep::aztec::macros::aztec;

/**
 * WARNING: this is no-longer considered a good example of an Aztec contract,
 * because it touches low-level functions and concepts that oughtn't be 
 * seen by a typical user.
 * The syntax and user-experience of Aztec contracts has since improved, so you
 * should seek alternative examples, please.
 */
 
#[aztec]
pub contract PrivateVoting {
    use dep::aztec::keys::getters::get_public_keys;
    use dep::aztec::macros::{
        functions::{external, initializer, only_self},
        storage::storage,
    };
    use dep::aztec::state_vars::{Map, PublicImmutable, PublicMutable};
    use dep::aztec::protocol_types::{address::AztecAddress, hash::poseidon2_hash, traits::{Hash, ToField}};

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>, // admin can end vote
        tally: Map<Field, PublicMutable<Field, Context>, Context>, // we will store candidate as key and number of votes as value
        vote_ended: PublicMutable<bool, Context>, // vote_ended is boolean
        active_at_block: PublicImmutable<u32, Context>, // when people can start voting
    }

    #[external("public")]
    #[initializer]
    fn constructor(admin: AztecAddress) {
        self.storage.admin.write(admin);
        self.storage.vote_ended.write(false);
        self.storage.active_at_block.initialize(self.context.block_number());
    }

    #[external("private")]
    fn cast_vote(candidate: Field) {
        let msg_sender_npk_m_hash = get_public_keys(self.msg_sender()).npk_m.hash();

        let secret = self.context.request_nsk_app(msg_sender_npk_m_hash); // get secret key of caller of function
        let nullifier = poseidon2_hash([self.msg_sender().to_field(), secret]); // derive nullifier from sender and secret
        self.context.push_nullifier(nullifier);
        self.enqueue_self.add_to_tally_public(candidate);
    }

    #[external("public")]
    #[only_self]
    fn add_to_tally_public(candidate: Field) {
        assert(self.storage.vote_ended.read() == false, "Vote has ended"); // assert that vote has not ended
        let new_tally = self.storage.tally.at(candidate).read() + 1;
        self.storage.tally.at(candidate).write(new_tally);
    }

    #[external("public")]
    fn end_vote() {
        assert(self.storage.admin.read().eq(self.msg_sender()), "Only admin can end votes"); // assert that caller is admin
        self.storage.vote_ended.write(true);
    }

    #[external("utility")]
    unconstrained fn get_vote(candidate: Field) -> Field {
        self.storage.tally.at(candidate).read()
    }
}
