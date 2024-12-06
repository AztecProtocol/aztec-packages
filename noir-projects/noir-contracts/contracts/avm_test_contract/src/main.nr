use dep::aztec::protocol_types::traits::{Deserialize, Serialize};

pub struct Note {
    a: Field,
    b: Field,
}

impl Serialize<2> for Note {
    fn serialize(self) -> [Field; 2] {
        [self.a, self.b]
    }
}

impl Deserialize<2> for Note {
    fn deserialize(wire: [Field; 2]) -> Note {
        Note { a: wire[0], b: wire[1] }
    }
}

use dep::aztec::macros::aztec;

#[aztec]
contract AvmTest {
    use crate::Note;

    global big_field_128_bits: Field = 0x001234567890abcdef1234567890abcdef;
    global big_field_136_bits: Field = 0x991234567890abcdef1234567890abcdef;
    global big_field_254_bits: Field =
        0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;

    // Libs
    use dep::aztec::context::gas::GasOpts;
    use dep::aztec::context::public_context::call;
    use dep::aztec::macros::{functions::{private, public}, storage::storage};
    use dep::aztec::oracle::get_contract_instance::{
        get_contract_instance_class_id_avm, get_contract_instance_deployer_avm,
        get_contract_instance_initialization_hash_avm,
    };
    use dep::aztec::prelude::Map;
    use dep::aztec::protocol_types::{
        address::{AztecAddress, EthAddress},
        point::Point,
        scalar::Scalar,
    };
    use dep::aztec::protocol_types::{
        contract_class_id::ContractClassId, storage::map::derive_storage_slot_in_map,
    };
    use dep::aztec::state_vars::PublicMutable;
    use dep::compressed_string::CompressedString;
    use std::embedded_curve_ops::{EmbeddedCurvePoint, multi_scalar_mul};

    #[storage]
    struct Storage<Context> {
        single: PublicMutable<Field, Context>,
        list: PublicMutable<Note, Context>,
        map: Map<AztecAddress, PublicMutable<u32, Context>, Context>,
    }

    /************************************************************************
     * Storage
     ************************************************************************/
    #[public]
    fn set_storage_single(a: Field) {
        storage.single.write(a);
    }

    #[public]
    fn read_storage_single() -> Field {
        storage.single.read()
    }

    // should still be able to use ` -> pub *` for return type even though macro forces `pub`
    #[public]
    fn set_read_storage_single(a: Field) -> pub Field {
        storage.single.write(a);
        storage.single.read()
    }

    #[public]
    fn set_storage_list(a: Field, b: Field) {
        storage.list.write(Note { a, b });
    }

    #[public]
    fn read_storage_list() -> [Field; 2] {
        let note: Note = storage.list.read();
        note.serialize()
    }

    #[public]
    fn set_storage_map(to: AztecAddress, amount: u32) -> Field {
        storage.map.at(to).write(amount);
        // returns storage slot for key
        derive_storage_slot_in_map(storage.map.storage_slot, to)
    }

    #[public]
    fn add_storage_map(to: AztecAddress, amount: u32) -> Field {
        let new_balance = storage.map.at(to).read().add(amount);
        storage.map.at(to).write(new_balance);
        // returns storage slot for key
        derive_storage_slot_in_map(storage.map.storage_slot, to)
    }

    #[public]
    fn read_storage_map(address: AztecAddress) -> u32 {
        storage.map.at(address).read()
    }

    #[public]
    fn add_args_return(arg_a: Field, arg_b: Field) -> Field {
        arg_a + arg_b
    }

    /************************************************************************
     * General Opcodes
     ************************************************************************/
    #[public]
    fn set_opcode_u8() -> u8 {
        8 as u8
    }

    #[public]
    fn set_opcode_u32() -> u32 {
        1 << 30 as u8
    }

    #[public]
    fn set_opcode_u64() -> u64 {
        1 << 60 as u8
    }

    #[public]
    fn set_opcode_small_field() -> Field {
        big_field_128_bits
    }

    #[public]
    fn set_opcode_big_field() -> Field {
        big_field_136_bits
    }

    #[public]
    fn set_opcode_really_big_field() -> Field {
        big_field_254_bits
    }

    #[public]
    fn add_u128(a: U128, b: U128) -> U128 {
        a + b
    }

    #[public]
    fn modulo2(a: u64) -> u64 {
        a % 2
    }

    #[public]
    fn elliptic_curve_add(lhs: Point, rhs: Point) -> Point {
        lhs + rhs
    }

    #[public]
    fn elliptic_curve_add_and_double() -> Point {
        let g = Point {
            x: 1,
            y: 17631683881184975370165255887551781615748388533673675138860,
            is_infinite: false,
        };

        let doubled = g + g;
        let added = g + doubled;
        added
    }

    #[public]
    fn variable_base_msm() -> Point {
        let g = Point {
            x: 1,
            y: 17631683881184975370165255887551781615748388533673675138860,
            is_infinite: false,
        };
        let scalar = Scalar { lo: 3, hi: 0 };
        let scalar2 = Scalar { lo: 20, hi: 0 };
        let triple_g = multi_scalar_mul([g, g], [scalar, scalar2]);
        triple_g
    }

    #[public]
    fn pedersen_commit(x: Field, y: Field) -> EmbeddedCurvePoint {
        let commitment = dep::std::hash::pedersen_commitment_with_separator([x, y], 20);
        commitment
    }

    /************************************************************************
     * Misc
     ************************************************************************/

    #[public]
    fn u128_addition_overflow() -> U128 {
        let max_u128: U128 = U128::from_hex("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
        let one: U128 = U128::from_integer(1);
        max_u128 + one
    }

    #[public]
    fn u128_from_integer_overflow() -> U128 {
        let should_overflow: Field = 2.pow_32(128); // U128::max() + 1;
        U128::from_integer(should_overflow)
    }

    #[public]
    fn to_radix_le(input: Field) -> [u8; 10] {
        input.to_le_radix(/*base=*/ 2)
    }

    // Helper functions to demonstrate an internal call stack in error messages
    fn inner_helper_with_failed_assertion() {
        let not_true = false;
        assert(not_true == true, "This assertion should fail!");
    }
    fn helper_with_failed_assertion() {
        inner_helper_with_failed_assertion();
    }

    #[public]
    fn assertion_failure() {
        helper_with_failed_assertion()
    }

    #[public]
    fn external_call_to_assertion_failure() {
        AvmTest::at(context.this_address()).assertion_failure().call(&mut context);
    }

    #[public]
    fn divide_by_zero() -> u8 {
        1 / 0
    }

    #[public]
    fn external_call_to_divide_by_zero() {
        AvmTest::at(context.this_address()).divide_by_zero().call(&mut context);
    }

    #[public]
    fn debug_logging() {
        dep::aztec::oracle::debug_log::debug_log("just text");
        dep::aztec::oracle::debug_log::debug_log_format("second: {1}", [1, 2, 3, 4]);
        dep::aztec::oracle::debug_log::debug_log_format("whole array: {}", [1, 2, 3, 4]);
        dep::aztec::oracle::debug_log::debug_log("tabs and newlines\n\t- first\n\t- second");
    }

    #[public]
    fn assert_same(arg_a: Field, arg_b: Field) -> pub Field {
        assert(arg_a == arg_b, "Values are not equal");
        1
    }

    #[public]
    fn assert_calldata_copy(args: [Field; 3]) {
        let offset = 0;
        let cd: [Field; 3] = dep::aztec::context::public_context::calldata_copy(offset, 3);
        assert(cd == args, "Calldata copy failed");
    }

    #[public]
    fn returndata_copy_oracle() {
        AvmTest::at(context.this_address()).return_oracle().call(&mut context);
        let returndatasize = dep::aztec::context::public_context::returndata_size();
        let returndata = dep::aztec::context::public_context::returndata_copy(0, returndatasize);
        assert(returndata == &[1, 2, 3], "Returndata copy failed");
    }

    #[public]
    fn return_oracle() -> [Field; 3] {
        dep::aztec::context::public_context::avm_return([1, 2, 3]);
        [4, 5, 6] // Should not get here.
    }

    #[public]
    fn revert_oracle() -> [Field; 3] {
        dep::aztec::context::public_context::avm_revert([1, 2, 3]);
        [4, 5, 6] // Should not get here.
    }

    /************************************************************************
     * Hashing functions
     ************************************************************************/
    #[public]
    fn keccak_hash(data: [u8; 10]) -> [u8; 32] {
        std::hash::keccak256(data, data.len() as u32)
    }

    #[public]
    fn keccak_f1600(data: [u64; 25]) -> [u64; 25] {
        std::hash::keccak::keccakf1600(data)
    }

    #[public]
    fn poseidon2_hash(data: [Field; 10]) -> Field {
        std::hash::poseidon2::Poseidon2::hash(data, data.len())
    }

    #[public]
    fn sha256_hash(data: [u8; 10]) -> [u8; 32] {
        std::hash::sha256(data)
    }

    #[public]
    fn pedersen_hash(data: [Field; 10]) -> Field {
        std::hash::pedersen_hash(data)
    }

    #[public]
    fn pedersen_hash_with_index(data: [Field; 10]) -> Field {
        std::hash::pedersen_hash_with_separator(data, /*index=*/ 20)
    }

    /************************************************************************
     * Contract instance
     ************************************************************************/
    #[public]
    fn test_get_contract_instance(address: AztecAddress) {
        let deployer = get_contract_instance_deployer_avm(address);
        let class_id = get_contract_instance_class_id_avm(address);
        let initialization_hash = get_contract_instance_initialization_hash_avm(address);

        assert(deployer.is_some(), "Contract instance not found when getting DEPLOYER!");
        assert(class_id.is_some(), "Contract instance not found when getting CLASS_ID!");
        assert(
            initialization_hash.is_some(),
            "Contract instance not found when getting INIT_HASH!",
        );

        // The values here should match those in `avm_simulator.test.ts`
        assert(deployer.unwrap().eq(AztecAddress::from_field(0x456)));
        assert(class_id.unwrap().eq(ContractClassId::from_field(0x789)));
        assert(initialization_hash.unwrap() == 0x101112);
    }

    #[public]
    fn test_get_contract_instance_matches(
        address: AztecAddress,
        expected_deployer: AztecAddress,
        expected_class_id: ContractClassId,
        expected_initialization_hash: Field,
    ) {
        let deployer = get_contract_instance_deployer_avm(address);
        let class_id = get_contract_instance_class_id_avm(address);
        let initialization_hash = get_contract_instance_initialization_hash_avm(address);

        assert(deployer.is_some(), "Contract instance not found when getting DEPLOYER!");
        assert(class_id.is_some(), "Contract instance not found when getting CLASS_ID!");
        assert(
            initialization_hash.is_some(),
            "Contract instance not found when getting INIT_HASH!",
        );

        // The values here should match those in `avm_simulator.test.ts`
        assert(deployer.unwrap().eq(expected_deployer));
        assert(class_id.unwrap().eq(expected_class_id));
        assert(initialization_hash.unwrap().eq(expected_initialization_hash));
    }

    /************************************************************************
     * AvmContext functions
     ************************************************************************/
    #[public]
    fn get_address() -> AztecAddress {
        context.this_address()
    }

    #[public]
    fn get_sender() -> AztecAddress {
        context.msg_sender()
    }

    #[public]
    fn get_transaction_fee() -> Field {
        context.transaction_fee()
    }

    #[public]
    fn get_chain_id() -> Field {
        context.chain_id()
    }

    #[public]
    fn get_version() -> Field {
        context.version()
    }

    #[public]
    fn get_block_number() -> Field {
        context.block_number()
    }

    #[public]
    fn get_timestamp() -> u64 {
        context.timestamp()
    }

    #[public]
    fn get_fee_per_l2_gas() -> Field {
        context.fee_per_l2_gas()
    }

    #[public]
    fn get_fee_per_da_gas() -> Field {
        context.fee_per_da_gas()
    }

    #[public]
    fn get_l2_gas_left() -> Field {
        context.l2_gas_left()
    }

    #[public]
    fn get_da_gas_left() -> Field {
        context.da_gas_left()
    }

    #[public]
    fn assert_timestamp(expected_timestamp: u64) {
        let timestamp = context.timestamp();
        assert(timestamp == expected_timestamp, "timestamp does not match");
    }

    #[public]
    fn get_args_hash(_a: u8, _fields: [Field; 3]) -> Field {
        context.get_args_hash()
    }

    #[public]
    fn emit_unencrypted_log() {
        context.emit_unencrypted_log(/*message=*/ [10, 20, 30]);
        context.emit_unencrypted_log(/*message=*/ "Hello, world!");
        let s: CompressedString<2, 44> =
            CompressedString::from_string("A long time ago, in a galaxy far far away...");
        context.emit_unencrypted_log(/*message=*/ s);
    }

    #[public]
    fn note_hash_exists(note_hash: Field, leaf_index: Field) -> bool {
        context.note_hash_exists(note_hash, leaf_index)
    }

    // Use the standard context interface to emit a new note hash
    #[public]
    fn new_note_hash(note_hash: Field) {
        context.push_note_hash(note_hash);
    }

    // Use the standard context interface to emit a new nullifier
    #[public]
    fn new_nullifier(nullifier: Field) {
        context.push_nullifier(nullifier);
    }

    #[public]
    fn n_storage_writes(num: u32) {
        for i in 0..num {
            storage.map.at(AztecAddress::from_field(i as Field)).write(i);
        }
    }

    #[public]
    fn n_new_note_hashes(num: u32) {
        for i in 0..num {
            context.push_note_hash(i as Field);
        }
    }

    #[public]
    fn n_new_nullifiers(num: u32) {
        for i in 0..num {
            context.push_nullifier(i as Field);
        }
    }

    #[public]
    fn n_new_l2_to_l1_msgs(num: u32) {
        for i in 0..num {
            context.message_portal(EthAddress::from_field(i as Field), i as Field)
        }
    }

    #[public]
    fn n_new_unencrypted_logs(num: u32) {
        for i in 0..num {
            context.emit_unencrypted_log(/*message=*/ [i as Field]);
        }
    }

    // Use the standard context interface to check for a nullifier
    #[public]
    fn nullifier_exists(nullifier: Field) -> bool {
        context.nullifier_exists(nullifier, context.this_address())
    }

    #[public]
    fn assert_nullifier_exists(nullifier: Field) {
        assert(
            context.nullifier_exists(nullifier, context.this_address()),
            "Nullifier doesn't exist!",
        );
    }

    // Use the standard context interface to emit a new nullifier
    #[public]
    fn emit_nullifier_and_check(nullifier: Field) {
        context.push_nullifier(nullifier);
        let exists = context.nullifier_exists(nullifier, context.this_address());
        assert(exists, "Nullifier was just created, but its existence wasn't detected!");
    }

    // Create the same nullifier twice (shouldn't work!)
    #[public]
    fn nullifier_collision(nullifier: Field) {
        context.push_nullifier(nullifier);
        // Can't do this twice!
        context.push_nullifier(nullifier);
    }

    #[public]
    fn l1_to_l2_msg_exists(msg_hash: Field, msg_leaf_index: Field) -> bool {
        context.l1_to_l2_msg_exists(msg_hash, msg_leaf_index)
    }

    #[public]
    fn send_l2_to_l1_msg(recipient: EthAddress, content: Field) {
        context.message_portal(recipient, content)
    }

    /************************************************************************
     * Nested calls
     ************************************************************************/
    #[public]
    fn nested_call_to_nothing() {
        let garbageAddress = AztecAddress::from_field(42);
        AvmTest::at(garbageAddress).nested_call_to_nothing().call(&mut context)
    }

    #[public]
    fn nested_call_to_nothing_recovers() {
        let garbageAddress = AztecAddress::from_field(42);
        let gas = [1, 1];
        let success = call(gas, garbageAddress, &[]);
        assert(
            !success,
            "Nested CALL instruction should return failure if target contract does not exist",
        );
    }

    #[public]
    fn nested_call_to_add_with_gas(
        arg_a: Field,
        arg_b: Field,
        l2_gas: Field,
        da_gas: Field,
    ) -> pub Field {
        AvmTest::at(context.this_address())
            .add_args_return(arg_a, arg_b)
            .with_gas(GasOpts::new(l2_gas, da_gas))
            .call(&mut context)
    }

    // Use the `call_public_function` wrapper to initiate a nested call to the add function
    #[public]
    fn nested_call_to_add(arg_a: Field, arg_b: Field) -> pub Field {
        AvmTest::at(context.this_address()).add_args_return(arg_a, arg_b).call(&mut context)
    }

    // Indirectly call_static the external call opcode to initiate a nested call to the add function
    #[public]
    fn nested_static_call_to_add(arg_a: Field, arg_b: Field) -> pub Field {
        AvmTest::at(context.this_address()).add_args_return(arg_a, arg_b).view(&mut context)
    }

    // Indirectly call_static `set_storage_single`. Should revert since it's accessing storage.
    #[public]
    fn nested_static_call_to_set_storage() {
        AvmTest::at(context.this_address()).set_storage_single(20).view(&mut context);
    }

    #[public]
    fn create_same_nullifier_in_nested_call(nestedAddress: AztecAddress, nullifier: Field) {
        context.push_nullifier(nullifier);
        AvmTest::at(nestedAddress).new_nullifier(nullifier).call(&mut context);
    }

    #[public]
    fn create_different_nullifier_in_nested_call(nestedAddress: AztecAddress, nullifier: Field) {
        context.push_nullifier(nullifier);
        AvmTest::at(nestedAddress).new_nullifier(nullifier + 1).call(&mut context);
    }

    #[public]
    fn nested_call_to_assert_same(arg_a: Field, arg_b: Field) -> pub Field {
        AvmTest::at(context.this_address()).assert_same(arg_a, arg_b).call(&mut context)
    }

    /**
     * Enqueue a public call from private
     */
    #[private]
    fn enqueue_public_from_private() {
        AvmTest::at(context.this_address()).set_opcode_u8().enqueue_view(&mut context);
        AvmTest::at(context.this_address()).set_read_storage_single(5).enqueue(&mut context);
    }

    /************************************************************************
     * Bulk testing: exercise many functions in a single call.
     * It only makes sense to call functions with side effects (or oracle
     * calls - but not blackboxes!), since otherwise the whole call will
     * be optimized away.
     ************************************************************************/
    #[public]
    fn bulk_testing(args_field: [Field; 10], args_u8: [u8; 10]) {
        dep::aztec::oracle::debug_log::debug_log("set_storage_single");
        set_storage_single(30);
        dep::aztec::oracle::debug_log::debug_log("set_storage_list");
        set_storage_list(40, 50);
        dep::aztec::oracle::debug_log::debug_log("read_storage_list");
        let _ = set_storage_map(context.this_address(), 60);
        dep::aztec::oracle::debug_log::debug_log("add_storage_map");
        let _ = add_storage_map(context.this_address(), 10);
        dep::aztec::oracle::debug_log::debug_log("read_storage_map");
        let _ = read_storage_map(context.this_address());
        dep::aztec::oracle::debug_log::debug_log("keccak_hash");
        let _ = keccak_hash(args_u8);
        dep::aztec::oracle::debug_log::debug_log("sha256_hash");
        let _ = sha256_hash(args_u8);
        dep::aztec::oracle::debug_log::debug_log("poseidon2_hash");
        let _ = poseidon2_hash(args_field);
        dep::aztec::oracle::debug_log::debug_log("pedersen_hash");
        let _ = pedersen_hash(args_field);
        dep::aztec::oracle::debug_log::debug_log("pedersen_hash_with_index");
        let _ = pedersen_hash_with_index(args_field);
        dep::aztec::oracle::debug_log::debug_log("test_get_contract_instance");
        test_get_contract_instance(AztecAddress::from_field(args_field[0]));
        dep::aztec::oracle::debug_log::debug_log("get_address");
        let _ = get_address();
        dep::aztec::oracle::debug_log::debug_log("get_sender");
        let _ = get_sender();
        dep::aztec::oracle::debug_log::debug_log("get_transaction_fee");
        let _ = get_transaction_fee();
        dep::aztec::oracle::debug_log::debug_log("get_chain_id");
        let _ = get_chain_id();
        dep::aztec::oracle::debug_log::debug_log("get_version");
        let _ = get_version();
        dep::aztec::oracle::debug_log::debug_log("get_block_number");
        let _ = get_block_number();
        dep::aztec::oracle::debug_log::debug_log("get_timestamp");
        let _ = get_timestamp();
        dep::aztec::oracle::debug_log::debug_log("get_fee_per_l2_gas");
        let _ = get_fee_per_l2_gas();
        dep::aztec::oracle::debug_log::debug_log("get_fee_per_da_gas");
        let _ = get_fee_per_da_gas();
        dep::aztec::oracle::debug_log::debug_log("get_l2_gas_left");
        let _ = get_l2_gas_left();
        dep::aztec::oracle::debug_log::debug_log("get_da_gas_left");
        let _ = get_da_gas_left();
        dep::aztec::oracle::debug_log::debug_log("emit_unencrypted_log");
        let _ = emit_unencrypted_log();
        dep::aztec::oracle::debug_log::debug_log("note_hash_exists");
        let _ = note_hash_exists(1, 2);
        dep::aztec::oracle::debug_log::debug_log("new_note_hash");
        let _ = new_note_hash(1);
        dep::aztec::oracle::debug_log::debug_log("new_nullifier");
        let _ = new_nullifier(1);
        dep::aztec::oracle::debug_log::debug_log("nullifier_exists");
        let _ = nullifier_exists(1);
        dep::aztec::oracle::debug_log::debug_log("l1_to_l2_msg_exists");
        let _ = l1_to_l2_msg_exists(1, 2);
        dep::aztec::oracle::debug_log::debug_log("send_l2_to_l1_msg");
        let _ = send_l2_to_l1_msg(EthAddress::from_field(0x2020), 1);
        //dep::aztec::oracle::debug_log::debug_log("nested_call_to_add");
        //let _ = nested_call_to_add(1, 2);
        //dep::aztec::oracle::debug_log::debug_log("nested_static_call_to_add");
        //let _ = nested_static_call_to_add(1, 2);
        //let _ = nested_call_to_nothing_recovers();
    }
}
