contract Voting {
    // aztec core library imports
    use dep::aztec::{
	context::{PrivateContext, Context}, note::{ 
	    note_header::NoteHeader, utils as note_utils, // used to generate hashes and nullifiers
	},  
    oracle::get_secret_key::get_secret_key, // used to compute nullifier
    selector::compute_selector, // used to compute function selector for calling a function 
	 state_vars::{
	    map::Map, public_state::PublicState,
	}, types::type_serialization::{ // serialization methods for using booleans and aztec addresses
	    bool_serialization::{BoolSerializationMethods, BOOL_SERIALIZED_LEN},
	    aztec_address_serialization::{AztecAddressSerializationMethods, AZTEC_ADDRESS_SERIALIZED_LEN},
        field_serialization::{ FieldSerializationMethods, FIELD_SERIALIZED_LEN},
	}, 
    types::address::{AztecAddress},
    constants_gen::EMPTY_NULLIFIED_COMMITMENT,
    };

    // serialization methods for using u120
    // create storage struct
    // vars that will be stored in persistant state
    struct Storage {
    admin: PublicState<AztecAddress, AZTEC_ADDRESS_SERIALIZED_LEN>, // admin can end vote
    tally: Map<PublicState<Field, FIELD_SERIALIZED_LEN>>, // we will store vote as key and number of votes as value
    voteEnded: PublicState<bool, BOOL_SERIALIZED_LEN>, // voteEnded is boolean
}

    // implementation block for storage
    // required for now but soon to be abstracted
    // init function is called when you call storage from a function like storage.whatever
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

    #[aztec(private)] // annotation to mark function as private and expose private context
    fn constructor(admin: AztecAddress) { // called when contract is deployed
        context.call_public_function(
            // we cannot update public state directly from private function but we can call public function (which queues it)
            context.this_address(),// address that calls public function. here we are using contract address for privacy
            compute_selector("set_admin((Field))"), // selector of  set_admin()
            [admin.address] // parameters for set_admin()
        );
    }

    #[aztec(public)] // annotation to mark function as public and expose public context
    internal fn set_admin(admin: AztecAddress) { // internal - can only be called by contract
        storage.admin.write(admin);
        storage.voteEnded.write(false);
    }

    #[aztec(private)] // annotation to mark function as public and expose private context
    fn cast_vote(vote: Field) {
        let secret = get_secret_key(context.msg_sender()); // get secret key of caller of function
        let nullifier = dep::std::hash::pedersen_hash([context.msg_sender(), secret.low, secret.high]); // compute nullifier with this secret key so others can't descrypt it
        context.push_new_nullifier(nullifier, EMPTY_NULLIFIED_COMMITMENT); // push nullifier
        context.call_public_function(
            context.this_address(), 
            compute_selector("add_to_tally_public(Field)"), 
            [vote]);
    }

    #[aztec(public)] 
    internal fn add_to_tally_public(vote: Field) {
        assert(storage.voteEnded.read() == false, "Vote has ended"); // assert that vote has not ended
        let new_tally = storage.tally.at(vote).read() + 1;
        storage.tally.at(vote).write(new_tally);
    }

    #[aztec(public)] 
    fn end_vote() {
        assert(storage.admin.read().eq(AztecAddress::new(context.msg_sender())), "Only admin can end votes"); // assert that caller is admin
        storage.voteEnded.write(true);
    }

    unconstrained fn get_vote(vote: Field) -> Field {
        storage.tally.at(vote).read()
    }

    // compute_note_hash_and_nullifier fn required in all contracts that manipulate private state
     unconstrained fn compute_note_hash_and_nullifier(contract_address: Field, nonce: Field, storage_slot: Field, serialized_note: [Field; 0]) -> [Field; 4] {
        [0, 0, 0, 0]
    }
}