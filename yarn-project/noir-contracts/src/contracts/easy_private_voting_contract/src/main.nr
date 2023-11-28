contract EasyPrivateVoting {
    // docs:start:imports
    use dep::aztec::{
	context::{PrivateContext, Context},
    oracle::get_secret_key::get_secret_key, // used to compute nullifier
    selector::compute_selector, // used to compute function selector for calling a function 
	 state_vars::{ map::Map, public_state::PublicState,}, 
     types::type_serialization::{ // serialization methods for using booleans and aztec addresses
	    bool_serialization::{BoolSerializationMethods, BOOL_SERIALIZED_LEN},
	    aztec_address_serialization::{AztecAddressSerializationMethods, AZTEC_ADDRESS_SERIALIZED_LEN},
        field_serialization::{ FieldSerializationMethods, FIELD_SERIALIZED_LEN},
	}, 
    types::address::{AztecAddress},
    constants_gen::EMPTY_NULLIFIED_COMMITMENT,
    };
    // docs:end:imports
    // docs:start:storage_struct
    struct Storage {
    admin: PublicState<AztecAddress, AZTEC_ADDRESS_SERIALIZED_LEN>, // admin can end vote
    tally: Map<PublicState<Field, FIELD_SERIALIZED_LEN>>, // we will store vote as key and number of votes as value
    voteEnded: PublicState<bool, BOOL_SERIALIZED_LEN>, // voteEnded is boolean
}
    // docs:end:storage_struct
    // docs:start:storage_impl
    impl Storage {
	fn init(context: Context) -> Self {
	    Storage {
		 admin: PublicState::new(
		    context, 
            1, // storage slot. this can be anything except 0. it is hashed, and hash on 0 = 0
            AztecAddressSerializationMethods,
		), 
        tally: Map::new(
		    context, 
            2, 
            |context, slot| {
			PublicState::new(
			    context,
                slot, 
                FieldSerializationMethods,
			)
		    },
		 ),
		  voteEnded: PublicState::new(
		    context, 
            3, 
            BoolSerializationMethods,
		)
	    } }
	}
    // docs:end:storage_impl
    // docs:start:constructor
    #[aztec(private)] // annotation to mark function as private and expose private context
    fn constructor(admin: AztecAddress) { // called when contract is deployed
        context.call_public_function(
            // we cannot update public state directly from private function but we can call public function (which queues it)
            context.this_address(),// address that calls public function. here we are using contract address for privacy
            compute_selector("_initialize((Field))"), // function selector
            [admin.address] // parameters for set_admin()
        );
    }
    // docs:end:constructor
    // docs:start:initialize
    #[aztec(public)] // annotation to mark function as public and expose public context
    internal fn _initialize(admin: AztecAddress) { // internal - can only be called by contract
        storage.admin.write(admin);
        storage.voteEnded.write(false);
    }
    // docs:end:initialize
    // docs:start:cast_vote
    #[aztec(private)] // annotation to mark function as private and expose private context
    fn cast_vote(voteId: Field) {
     // docs:end:cast_vote
     // docs:start:nullifier
        let secret = get_secret_key(context.msg_sender()); // get secret key of caller of function
        let nullifier = dep::std::hash::pedersen_hash([context.msg_sender(), secret.low, secret.high]); // compute nullifier with this secret key so others can't descrypt it
        context.push_new_nullifier(nullifier, EMPTY_NULLIFIED_COMMITMENT); // push nullifier
    // docs:end:nullifier
    // docs:start:call_add_to_tally_public
        context.call_public_function(
            context.this_address(), 
            compute_selector("add_to_tally_public(Field)"), 
            [voteId]);
    }
    // docs:end:call_add_to_tally_public

    // docs:start:add_to_tally_public
    #[aztec(public)]
    internal fn add_to_tally_public(voteId: Field) {
    // docs:end:add_to_tally_public
    // docs:start:assert_vote_not_ended
        assert(storage.voteEnded.read() == false, "Vote has ended"); // assert that vote has not ended
    // docs:end:assert_vote_not_ended
    // docs:start:add_vote_to_tally
        let new_tally = storage.tally.at(voteId).read() + 1;
        storage.tally.at(voteId).write(new_tally);
    }
    // docs:end:add_vote_to_tally

    // docs:start:end_vote
    #[aztec(public)] 
    fn end_vote() {
        assert(storage.admin.read().eq(AztecAddress::new(context.msg_sender())), "Only admin can end votes"); // assert that caller is admin
        storage.voteEnded.write(true);
    }
    // docs:end:end_vote
    // docs:start:get_vote
    unconstrained fn get_vote(voteId: Field) -> Field {
        storage.tally.at(voteId).read()
    }
    // docs:end:get_vote
    // docs:start:compute_note_hash_and_nullifier
     unconstrained fn compute_note_hash_and_nullifier(contract_address: Field, nonce: Field, storage_slot: Field, serialized_note: [Field; 0]) -> [Field; 4] {
        [0, 0, 0, 0]
    }
    // docs:end:compute_note_hash_and_nullifier
}