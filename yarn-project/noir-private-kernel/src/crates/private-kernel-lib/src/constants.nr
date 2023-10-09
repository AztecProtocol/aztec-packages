/**
 * Enumerate the hash_indices which are used for pedersen hashing.
 * We start from 1 to avoid the default generators. The generator indices are listed
 * based on the number of elements each index hashes. The following conditions must be met:
 *
 * +-----------+-------------------------------+----------------------+
 * | Hash size | Number of elements hashed (n) | Condition to use     |
 * |-----------+-------------------------------+----------------------|
 * | LOW       | n ≤ 8                         | 0 < hash_index ≤ 32  |
 * | MID       | 8 < n ≤ 16                    | 32 < hash_index ≤ 40 |
 * | HIGH      | 16 < n ≤ 48                   | 40 < hash_index ≤ 48 |
 * +-----------+-------------------------------+----------------------+
 *
 * Note: When modifying, modify `GeneratorIndexPacker` in packer.hpp accordingly.
 */
mod generator_index {
    // Indices with size ≤ 8
    global COMMITMENT : Field = 1;               // Size = 7 (unused)
    global COMMITMENT_NONCE : Field = 2;         // Size = 2
    global UNIQUE_COMMITMENT : Field = 3;        // Size = 2
    global SILOED_COMMITMENT : Field = 4;        // Size = 2
    global NULLIFIER : Field = 5;                // Size = 4 (unused)
    global INITIALISATION_NULLIFIER : Field = 6; // Size = 2 (unused)
    global OUTER_NULLIFIER : Field = 7;          // Size = 2
    global PUBLIC_DATA_READ : Field = 8;         // Size = 2
    global PUBLIC_DATA_UPDATE_REQUEST : Field = 9;   // Size = 3
    global FUNCTION_DATA : Field = 10;           // Size = 4
    global FUNCTION_LEAF : Field = 11;           // Size = 5
    global CONTRACT_DEPLOYMENT_DATA : Field = 12; // Size = 4
    global CONSTRUCTOR : Field = 13;             // Size = 3
    global CONSTRUCTOR_ARGS : Field = 14;        // Size = 8
    global CONTRACT_ADDRESS : Field = 15;        // Size = 4
    global CONTRACT_LEAF : Field = 16;           // Size = 3
    global CALL_CONTEXT : Field = 17;            // Size = 6
    global CALL_STACK_ITEM : Field = 18;         // Size = 3
    global CALL_STACK_ITEM_2 : Field = 19;       // Size = ? (unused) // TODO see function where it's used for explanation
    global L1_TO_L2_MESSAGE_SECRET : Field = 20;  // Size = 1
    global L2_TO_L1_MSG : Field = 21;            // Size = 2 (unused)
    global TX_CONTEXT : Field = 22;              // Size = 4
    global PUBLIC_LEAF_INDEX : Field = 23;       // Size = 2 (unused)
    global PUBLIC_DATA_LEAF : Field = 24;        // Size = ? (unused) // TODO what's the expected size? Assuming ≤ 8
    global SIGNED_TX_REQUEST : Field = 25;       // Size = 7
    global GLOBAL_VARIABLES : Field = 26;        // Size = 4
    global PARTIAL_ADDRESS : Field = 27;         // Size = 7
    global BLOCK_HASH : Field = 28;              // Size = 6

    // Indices with size ≤ 16
    global TX_REQUEST : Field = 33;              // Size = 14
    global SIGNATURE_PAYLOAD : Field = 34;       // Size = 13

    // Indices with size ≤ 44
    global VK : Field = 41;                      // Size = 35
    global PRIVATE_CIRCUIT_PUBLIC_INPUTS : Field = 42; // Size = 45
    global PUBLIC_CIRCUIT_PUBLIC_INPUTS : Field = 43;  // Size = 32 (unused)
    global FUNCTION_ARGS : Field = 44;           // Size ≤ 40
}

// Per call constants
mod per_call {
    global MAX_READ_REQUESTS_PER_CALL : Field = 32;

    global MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL : Field = 4;

    global MAX_NEW_COMMITMENTS_PER_CALL : Field = 16;

    global MAX_NEW_NULLIFIERS_PER_CALL : Field = 16;
    
    global MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL : Field = 4;
    
    global MAX_NEW_L2_TO_L1_MSGS_PER_CALL : Field = 2;

    global MAX_PUBLIC_DATA_READS_PER_CALL : Field = 16;

    global MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL : Field = 16;
}

// Per transaction constants
mod per_transaction{

    global MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX : Field = 8;
    global MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX : Field = 8;
    global MAX_NEW_L2_TO_L1_MSGS_PER_TX : Field = 2;
    global MAX_NEW_CONTRACTS_PER_TX : Field = 1;
    global MAX_OPTIONALLY_REVEALED_DATA_LENGTH_PER_TX : Field = 4;
    global MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX : Field = 16;
    global MAX_PUBLIC_DATA_READS_PER_TX : Field = 16;

    // constexpr size_t MAX_READ_REQUESTS_PER_TX = MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL * MAX_READ_REQUESTS_PER_CALL;
    global MAX_READ_REQUESTS_PER_TX : Field = 128;
    
    // constexpr size_t MAX_NEW_COMMITMENTS_PER_TX = MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL * MAX_NEW_COMMITMENTS_PER_CALL;
    global MAX_NEW_COMMITMENTS_PER_TX : Field = 64;

    // constexpr size_t MAX_NEW_NULLIFIERS_PER_TX = MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL * MAX_NEW_NULLIFIERS_PER_CALL;
    global MAX_NEW_NULLIFIERS_PER_TX : Field = 64;


    #[test]
    fn max_read_request_per_tx() {
        assert(MAX_READ_REQUESTS_PER_TX == crate::constants::per_call::MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL * crate::constants::per_call::MAX_READ_REQUESTS_PER_CALL);
    }

    #[test]
    fn max_new_commitments_per_tx() {
        assert(MAX_NEW_COMMITMENTS_PER_TX == crate::constants::per_call::MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL * crate::constants::per_call::MAX_NEW_COMMITMENTS_PER_CALL);
    }

    #[test]
    fn max_new_nullifiers_per_tx() {
        assert(MAX_NEW_NULLIFIERS_PER_TX == crate::constants::per_call::MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL * crate::constants::per_call::MAX_NEW_NULLIFIERS_PER_CALL);
    }
}

mod misc {
    // sha256 hash is stored in two fields to accommodate all 256-bits of the hash
    global NUM_FIELDS_PER_SHA256 : Field = 2;

    global RETURN_VALUES_LENGTH : Field = 4;

    global EMPTY_NULLIFIED_COMMITMENT : Field = 1000000;
}

// Trees related constants
mod trees {
    global VK_TREE_HEIGHT : Field = 3;
    global CONTRACT_TREE_HEIGHT : Field = 16;
    global FUNCTION_TREE_HEIGHT : Field = 4;
    global PRIVATE_DATA_TREE_HEIGHT : Field = 32;
}