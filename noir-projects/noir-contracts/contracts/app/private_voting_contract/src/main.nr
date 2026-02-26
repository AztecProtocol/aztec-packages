mod test;
use aztec::macros::aztec;

#[aztec]
pub contract PrivateVoting {
    // docs:start:imports
    use aztec::macros::{functions::{external, initializer, only_self, view}, storage::storage};
    use aztec::protocol::{address::AztecAddress, traits::{Deserialize, Serialize, ToField}};
    use aztec::state_vars::{Map, Owned, PublicImmutable, PublicMutable, SingleUseClaim};

    #[derive(Serialize, Deserialize)]
    pub struct ElectionId {
        id: Field,
    }

    impl ElectionId {
        pub fn new(id: Field) -> Self {
            Self { id }
        }
    }

    impl ToField for ElectionId {
        fn to_field(self) -> Field {
            self.id
        }
    }

    // docs:end:imports
    // docs:start:storage_struct
    #[storage]
    struct Storage<Context> {
        // admin can start and end elections
        admin: PublicMutable<AztecAddress, Context>,
        // election => candidate => number of votes
        tally: Map<ElectionId, Map<Field, PublicMutable<Field, Context>, Context>, Context>,
        // election => election ended
        vote_ended: Map<ElectionId, PublicMutable<bool, Context>, Context>,
        // election => election started at
        active_at_block: Map<ElectionId, PublicImmutable<u32, Context>, Context>,
        // election => voter => single use claim that ensures voter can at most vote once per election
        vote_claims: Map<ElectionId, Owned<SingleUseClaim<Context>, Context>, Context>,
    }
    // docs:end:storage_struct

    // docs:start:constructor
    #[external("public")]
    #[initializer]
    fn constructor(admin: AztecAddress) {
        self.storage.admin.write(admin);
    }
    // docs:end:constructor

    #[external("private")]
    fn cast_vote(election_id: ElectionId, candidate: Field) {
        self.storage.vote_claims.at(election_id).at(self.msg_sender()).claim();
        self.enqueue_self.add_to_tally_public(election_id, candidate);
    }

    // docs:start:nested_map_access
    #[external("public")]
    #[only_self]
    fn add_to_tally_public(election_id: ElectionId, candidate: Field) {
        assert(self.storage.active_at_block.at(election_id).read() <= self.context.block_number());
        assert(self.storage.vote_ended.at(election_id).read() == false, "Vote has ended"); // assert that vote has not ended
        let new_tally = self.storage.tally.at(election_id).at(candidate).read() + 1;
        self.storage.tally.at(election_id).at(candidate).write(new_tally);
    }
    // docs:end:nested_map_access

    #[external("public")]
    fn start_vote(election_id: ElectionId) {
        assert(self.storage.admin.read().eq(self.msg_sender()), "Only admin can start votes"); // assert that caller is admin
        self.storage.vote_ended.at(election_id).write(false);
        self.storage.active_at_block.at(election_id).initialize(self.context.block_number());
    }

    #[external("public")]
    fn end_vote(election_id: ElectionId) {
        assert(self.storage.admin.read().eq(self.msg_sender()), "Only admin can end votes"); // assert that caller is admin
        self.storage.vote_ended.at(election_id).write(true);
    }

    #[external("public")]
    #[view]
    fn get_tally(election_id: ElectionId, candidate: Field) -> Field {
        self.storage.tally.at(election_id).at(candidate).read()
    }
}
