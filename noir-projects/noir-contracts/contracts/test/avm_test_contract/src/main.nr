mod note;
mod fake_avm_oracle;
use aztec::macros::aztec;

#[aztec]
pub contract AvmTest {
    use crate::note::Note;

    global big_field_128_bits: Field = 0x001234567890abcdef1234567890abcdef;
    global big_field_136_bits: Field = 0x991234567890abcdef1234567890abcdef;
    global big_field_254_bits: Field = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;

    // Libs
    use crate::fake_avm_oracle::{avm_return, call, returndata_copy, returndata_size, revert, success_copy};
    use aztec::context::gas::GasOpts;
    use aztec::macros::{functions::{external, view}, storage::storage};
    use aztec::oracle::get_contract_instance::{
        get_contract_instance_class_id_avm, get_contract_instance_deployer_avm,
        get_contract_instance_immutables_hash_avm, get_contract_instance_initialization_hash_avm,
    };
    use aztec::protocol::abis::function_selector::FunctionSelector;
    use aztec::protocol::{address::{AztecAddress, EthAddress}, point::EmbeddedCurvePoint, scalar::Scalar};
    use aztec::protocol::{
        constants::{
            CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS, FEE_JUICE_ADDRESS, GRUMPKIN_ONE_X, GRUMPKIN_ONE_Y,
            MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS,
        },
        contract_class_id::ContractClassId,
        storage::map::derive_storage_slot_in_map,
        traits::{Empty, FromField, ToField},
    };
    use aztec::protocol::traits::Serialize;
    use aztec::standard_addresses::STANDARD_AUTH_REGISTRY_ADDRESS;
    use aztec::state_vars::Map;
    use aztec::state_vars::PublicMutable;
    use aztec::state_vars::StateVariable;
    use compressed_string::CompressedString;
    use std::embedded_curve_ops::multi_scalar_mul;

    use auth_contract::AuthRegistry;
    use aztec::context::PublicContext;
    use fee_juice::FeeJuice;
    use instance_contract::ContractInstanceRegistry;
    use std::ops::Add;

    #[storage]
    struct Storage<Context> {
        single: PublicMutable<Field, Context>,
        list: PublicMutable<Note, Context>,
        map: Map<AztecAddress, PublicMutable<u32, Context>, Context>,
    }

    #[external("public")]
    fn set_storage_single(a: Field) {
        _set_storage_single(self.storage, a);
    }

    #[contract_library_method]
    fn _set_storage_single(storage: Storage<PublicContext>, a: Field) {
        storage.single.write(a);
    }

    #[external("public")]
    fn read_storage_single() -> Field {
        _read_storage_single(self.storage)
    }

    #[contract_library_method]
    fn _read_storage_single(storage: Storage<PublicContext>) -> Field {
        storage.single.read()
    }

    #[external("public")]
    fn read_assert_storage_single(a: Field) {
        assert(a == self.storage.single.read(), "Storage value does not match input");
    }

    // should still be able to use ` -> pub *` for return type even though macro forces `pub`
    #[external("public")]
    fn set_read_storage_single(a: Field) -> pub Field {
        self.storage.single.write(a);
        self.storage.single.read()
    }

    #[external("public")]
    fn set_storage_list(a: Field, b: Field) {
        _set_storage_list(self.storage, a, b);
    }

    #[contract_library_method]
    fn _set_storage_list(storage: Storage<PublicContext>, a: Field, b: Field) {
        storage.list.write(Note { a, b });
    }

    #[external("public")]
    fn read_storage_list() -> [Field; 2] {
        _read_storage_list(self.storage)
    }

    #[contract_library_method]
    fn _read_storage_list(storage: Storage<PublicContext>) -> [Field; 2] {
        let note: Note = storage.list.read();
        note.serialize()
    }

    #[external("public")]
    fn set_storage_map(to: AztecAddress, amount: u32) -> Field {
        _set_storage_map(self.storage, to, amount)
    }

    #[contract_library_method]
    fn _set_storage_map(storage: Storage<PublicContext>, to: AztecAddress, amount: u32) -> Field {
        storage.map.at(to).write(amount);
        // returns storage slot for key
        derive_storage_slot_in_map(storage.map.get_storage_slot(), to)
    }

    #[external("public")]
    fn add_storage_map(to: AztecAddress, amount: u32) -> Field {
        _add_storage_map(self.storage, to, amount)
    }

    #[contract_library_method]
    fn _add_storage_map(storage: Storage<PublicContext>, to: AztecAddress, amount: u32) -> Field {
        let new_balance = storage.map.at(to).read().add(amount);
        storage.map.at(to).write(new_balance);
        // returns storage slot for key
        derive_storage_slot_in_map(storage.map.get_storage_slot(), to)
    }

    #[external("public")]
    fn read_storage_map(address: AztecAddress) -> u32 {
        _read_storage_map(self.storage, address)
    }

    #[contract_library_method]
    fn _read_storage_map(storage: Storage<PublicContext>, address: AztecAddress) -> u32 {
        storage.map.at(address).read()
    }

    #[external("public")]
    fn add_args_return(arg_a: Field, arg_b: Field) -> Field {
        add(arg_a, arg_b)
    }

    // Auxiliary method to test usage of contract library methods in public fns
    #[contract_library_method]
    unconstrained fn add(lhs: Field, rhs: Field) -> Field {
        lhs + rhs
    }

    #[external("public")]
    fn set_opcode_u8() -> u8 {
        8
    }

    #[external("public")]
    #[view]
    fn set_opcode_u8_view() -> u8 {
        8
    }

    #[external("public")]
    fn set_opcode_u32() -> u32 {
        1 << 30
    }

    #[external("public")]
    fn set_opcode_u64() -> u64 {
        1 << 60
    }

    #[external("public")]
    fn set_opcode_small_field() -> Field {
        big_field_128_bits
    }

    #[external("public")]
    fn set_opcode_big_field() -> Field {
        big_field_136_bits
    }

    #[external("public")]
    fn set_opcode_really_big_field() -> Field {
        big_field_254_bits
    }

    #[external("public")]
    fn add_u128(a: u128, b: u128) -> u128 {
        a + b
    }

    #[external("public")]
    fn modulo2(a: u64) -> u64 {
        a % 2
    }

    #[external("public")]
    fn elliptic_curve_add(lhs: EmbeddedCurvePoint, rhs: EmbeddedCurvePoint) -> EmbeddedCurvePoint {
        lhs + rhs
    }

    #[external("public")]
    fn elliptic_curve_add_and_double() -> EmbeddedCurvePoint {
        let g = EmbeddedCurvePoint { x: GRUMPKIN_ONE_X, y: GRUMPKIN_ONE_Y };

        let doubled = g + g;
        let added = g + doubled;
        added
    }

    #[external("public")]
    fn variable_base_msm(
        scalar_lo: Field,
        scalar_hi: Field,
        scalar2_lo: Field,
        scalar2_hi: Field,
    ) -> EmbeddedCurvePoint {
        let g = EmbeddedCurvePoint { x: GRUMPKIN_ONE_X, y: GRUMPKIN_ONE_Y };

        multi_scalar_mul(
            [g, g],
            [Scalar { lo: scalar_lo, hi: scalar_hi }, Scalar { lo: scalar2_lo, hi: scalar2_hi }],
        )
    }

    #[external("public")]
    fn pedersen_commit(x: Field, y: Field) -> EmbeddedCurvePoint {
        std::hash::pedersen_commitment_with_separator([x, y], 20)
    }

    #[external("public")]
    fn conditional_move(x: [Field; 1], y: [Field; 1], b: bool) -> [Field; 1] {
        if b {
            x
        } else {
            y
        }
    }

    #[contract_library_method]
    fn bitwise_ops(x: u32, y: u32) -> u32 {
        let mut result = x & y;
        result = result | x;
        result = result >> (x % 32);
        result = result << (y % 32);
        result ^ y
    }

    #[external("public")]
    fn u128_addition_overflow() -> u128 {
        let max_u128: u128 = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
        let one: u128 = 1;
        max_u128 + one
    }

    #[contract_library_method]
    fn integer_division(x: u8, y: u8) -> u8 {
        x / y
    }

    #[contract_library_method]
    fn field_division(x: Field, y: Field) -> Field {
        x / y
    }

    #[external("public")]
    fn to_le_bytes(input: Field) -> [u8; 10] {
        _to_le_bytes(input)
    }

    #[contract_library_method]
    fn _to_le_bytes(input: Field) -> [u8; 10] {
        input.to_le_bytes()
    }

    #[external("public")]
    fn to_le_bits(input: Field) -> [bool; 16] {
        _to_le_bits(input)
    }

    #[contract_library_method]
    fn _to_le_bits(input: Field) -> [bool; 16] {
        input.to_le_bits()
    }

    // Exercises Schnorr signature verification in public. The grumpkin-Poseidon2 variant
    // (schnorr v0.4.0+) only relies on EC arithmetic and Poseidon2, both of which the public AVM
    // supports. Inputs are parameters rather than constants; when bulk_testing routes them in
    // from calldata, Noir can't constant-fold the verify away and MSM+Poseidon2 actually execute.
    #[contract_library_method]
    fn _schnorr_verify_signature(
        pubkey_x: Field,
        pubkey_y: Field,
        sig_s_lo: Field,
        sig_s_hi: Field,
        sig_e_lo: Field,
        sig_e_hi: Field,
        message: Field,
    ) -> bool {
        let public_key = std::embedded_curve_ops::EmbeddedCurvePoint::new(pubkey_x, pubkey_y);
        let sig_s = std::embedded_curve_ops::EmbeddedCurveScalar::new(sig_s_lo, sig_s_hi);
        let sig_e = std::embedded_curve_ops::EmbeddedCurveScalar::new(sig_e_lo, sig_e_hi);
        schnorr::verify_signature(public_key, (sig_s, sig_e), message)
    }

    // Helper functions to demonstrate an internal call stack in error messages
    #[contract_library_method]
    fn inner_helper_with_failed_assertion() {
        let not_true = false;
        assert(not_true == true, "This assertion should fail!");
    }

    #[contract_library_method]
    fn helper_with_failed_assertion() {
        inner_helper_with_failed_assertion();
    }

    #[external("public")]
    fn assertion_failure() {
        helper_with_failed_assertion()
    }

    #[external("public")]
    fn external_call_to_assertion_failure() {
        self.call_self.assertion_failure();
    }

    #[external("public")]
    // Must be called with `denominator == 0`
    fn divide_by_zero(denominator: u8) -> u8 {
        1 / denominator
    }

    #[external("public")]
    fn external_call_to_divide_by_zero() {
        let _ = self.call_self.divide_by_zero(0);
    }

    #[external("public")]
    fn external_call_to_divide_by_zero_recovers() {
        // Be sure to allocate ~200k+ gas to this function~

        // Get the gas remaining and allocate some smaller amount to nested call.
        // We don't want to allocate too much to the nested call
        // since it will all be consumed on exceptional halt.
        let l2_gas_left = self.context.l2_gas_left();
        let da_gas_left = self.context.da_gas_left();
        let selector = FunctionSelector::from_signature("divide_by_zero(u8)");

        // Call without capturing a return value since call no longer returns success
        call(
            l2_gas_left - 200_000,
            da_gas_left - 200_000,
            self.address,
            [selector.to_field(), 0],
        );

        // Use SUCCESSCOPY to get the success status
        let success = success_copy();

        assert(!success, "Nested CALL instruction should return failure on exceptional halt");
        assert(returndata_size() == 0, "Returndata should be empty when nested call exceptionally halts");
    }

    #[external("public")]
    fn debug_logging() {
        aztec::oracle::logging::debug_log("just text");
        aztec::oracle::logging::debug_log_format("second: {1}", [1, 2, 3, 4]);
        aztec::oracle::logging::debug_log_format("whole array: {}", [1, 2, 3, 4]);
        aztec::oracle::logging::debug_log("tabs and newlines\n\t- first\n\t- second");
        aztec::oracle::logging::fatal_log("fatal error");
        aztec::oracle::logging::trace_log_format("trace format: {}", [1, 3, 3, 7]);
    }

    #[external("public")]
    fn assert_same(arg_a: Field, arg_b: Field) -> pub Field {
        assert(arg_a == arg_b, "Values are not equal");
        1
    }

    #[external("public")]
    fn assert_calldata_copy(args: [Field; 3], with_selector: bool) {
        let offset = with_selector as u32; // Skip the selector stored at i = 0 if used
        let cd: [Field; 3] = ::aztec::oracle::avm::calldata_copy(offset, 3);
        assert(cd == args, "Calldata copy failed");
    }

    #[external("public")]
    fn assert_calldata_copy_large(args: [Field; 300], with_selector: bool) {
        let offset = with_selector as u32; // Skip the selector stored at i = 0 if used
        let cd: [Field; 300] = ::aztec::oracle::avm::calldata_copy(offset, 300);
        assert(cd == args, "Calldata copy failed");
    }

    #[external("public")]
    fn returndata_copy_oracle() {
        let _ = self.call_self.return_oracle();
        let returndatasize = returndata_size();
        let returndata = returndata_copy(0, returndatasize);
        assert(returndata == @[1, 2, 3], "Returndata copy failed");
    }

    #[external("public")]
    fn return_oracle() -> [Field; 3] {
        avm_return([1, 2, 3]);
        [4, 5, 6] // Should not get here.
    }

    #[external("public")]
    fn revert_oracle() -> [Field; 3] {
        revert([1, 2, 3]);
        [4, 5, 6] // Should not get here.
    }

    // This function is called from avm/avm_simulator.test.ts to test retrieval
    #[external("public")]
    fn test_get_contract_instance(address: AztecAddress) {
        let deployer = get_contract_instance_deployer_avm(address);
        let class_id = get_contract_instance_class_id_avm(address);
        let initialization_hash = get_contract_instance_initialization_hash_avm(address);
        let immutables_hash = get_contract_instance_immutables_hash_avm(address);

        assert(deployer.is_some(), "Contract instance not found when getting DEPLOYER!");
        assert(class_id.is_some(), "Contract instance not found when getting CLASS_ID!");
        assert(initialization_hash.is_some(), "Contract instance not found when getting INIT_HASH!");
        assert(immutables_hash.is_some(), "Contract instance not found when getting IMMUTABLES_HASH!");

        // The values here should match those in `avm_simulator.test.ts`
        assert(deployer.unwrap().eq(AztecAddress::from_field(0x456)));
        assert(class_id.unwrap().eq(ContractClassId::from_field(0x789)));
        assert(initialization_hash.unwrap() == 0x101112);
        assert(immutables_hash.unwrap() == 0x202221);
    }

    #[external("public")]
    fn test_get_contract_instance_matches(
        address: AztecAddress,
        expected_deployer: AztecAddress,
        expected_class_id: ContractClassId,
        expected_initialization_hash: Field,
        expected_immutables_hash: Field,
    ) {
        _test_get_contract_instance_matches(
            address,
            expected_deployer,
            expected_class_id,
            expected_initialization_hash,
            expected_immutables_hash,
        );
    }

    #[contract_library_method]
    fn _test_get_contract_instance_matches(
        address: AztecAddress,
        expected_deployer: AztecAddress,
        expected_class_id: ContractClassId,
        expected_initialization_hash: Field,
        expected_immutables_hash: Field,
    ) {
        let deployer = get_contract_instance_deployer_avm(address);
        let class_id = get_contract_instance_class_id_avm(address);
        let initialization_hash = get_contract_instance_initialization_hash_avm(address);
        let immutables_hash = get_contract_instance_immutables_hash_avm(address);

        assert(deployer.is_some(), "Contract instance not found when getting DEPLOYER!");
        assert(class_id.is_some(), "Contract instance not found when getting CLASS_ID!");
        assert(initialization_hash.is_some(), "Contract instance not found when getting INIT_HASH!");
        assert(immutables_hash.is_some(), "Contract instance not found when getting IMMUTABLES_HASH!");

        // The values here should match those in `avm_simulator.test.ts`
        assert(deployer.unwrap().eq(expected_deployer));
        assert(class_id.unwrap().eq(expected_class_id));
        assert(initialization_hash.unwrap().eq(expected_initialization_hash));
        assert(immutables_hash.unwrap().eq(expected_immutables_hash));

        // Get a Protocol Contract and it should exist
        aztec::oracle::logging::debug_log("Get Contract Instance Protocol Contract Instance");
        let fee_juice_class_id = get_contract_instance_class_id_avm(FEE_JUICE_ADDRESS);
        assert(fee_juice_class_id.is_some(), "Protocol Contract instance not found when getting CLASS_ID!");
    }

    #[external("public")]
    fn get_address() -> AztecAddress {
        _get_address(self.address)
    }

    #[contract_library_method]
    fn _get_address(address: AztecAddress) -> AztecAddress {
        address
    }

    #[external("public")]
    fn get_sender() -> AztecAddress {
        _get_sender(self.context)
    }

    #[contract_library_method]
    fn _get_sender(context: PublicContext) -> AztecAddress {
        context.maybe_msg_sender().unwrap()
    }

    #[external("public")]
    fn get_transaction_fee() -> Field {
        _get_transaction_fee(self.context)
    }

    #[contract_library_method]
    fn _get_transaction_fee(context: PublicContext) -> Field {
        context.transaction_fee()
    }

    #[external("public")]
    fn get_chain_id() -> Field {
        _get_chain_id(self.context)
    }

    #[contract_library_method]
    fn _get_chain_id(context: PublicContext) -> Field {
        context.chain_id()
    }

    #[external("public")]
    fn get_version() -> Field {
        _get_version(self.context)
    }

    #[contract_library_method]
    fn _get_version(context: PublicContext) -> Field {
        context.version()
    }

    #[external("public")]
    fn get_block_number() -> u32 {
        _get_block_number(self.context)
    }

    #[contract_library_method]
    fn _get_block_number(context: PublicContext) -> u32 {
        context.block_number()
    }

    #[external("public")]
    fn get_timestamp() -> u64 {
        _get_timestamp(self.context)
    }

    #[contract_library_method]
    fn _get_timestamp(context: PublicContext) -> u64 {
        context.timestamp()
    }

    #[external("public")]
    fn get_fee_per_l2_gas() -> u128 {
        _get_fee_per_l2_gas(self.context)
    }

    #[contract_library_method]
    fn _get_fee_per_l2_gas(context: PublicContext) -> u128 {
        context.min_fee_per_l2_gas()
    }

    #[external("public")]
    fn get_fee_per_da_gas() -> u128 {
        _get_fee_per_da_gas(self.context)
    }

    #[contract_library_method]
    fn _get_fee_per_da_gas(context: PublicContext) -> u128 {
        context.min_fee_per_da_gas()
    }

    #[external("public")]
    fn get_l2_gas_left() -> u32 {
        _get_l2_gas_left(self.context)
    }

    #[contract_library_method]
    fn _get_l2_gas_left(context: PublicContext) -> u32 {
        context.l2_gas_left()
    }

    #[external("public")]
    fn get_da_gas_left() -> u32 {
        _get_da_gas_left(self.context)
    }

    #[contract_library_method]
    fn _get_da_gas_left(context: PublicContext) -> u32 {
        context.da_gas_left()
    }

    #[external("public")]
    fn get_args_hash(_a: u8, _fields: [Field; 3]) -> Field {
        self.context.get_args_hash()
    }

    #[external("public")]
    fn emit_public_log() {
        _emit_public_log(self.context);
    }

    #[contract_library_method]
    fn _emit_public_log(context: PublicContext) {
        context.emit_public_log_unsafe(0, /*message=*/ [10, 20, 30]);
        context.emit_public_log_unsafe(0, /*message=*/ "Hello, world!");
        let s: CompressedString<2, 44> = CompressedString::from_string("A long time ago, in a galaxy far far away...");
        context.emit_public_log_unsafe(0, /*message=*/ s);
        context.emit_public_log_unsafe(
            0,
            /*message=*/ [
                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
                29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42,
            ],
        ); // Large log
    }

    #[external("public")]
    fn note_hash_exists(note_hash: Field, leaf_index: u64) -> bool {
        _note_hash_exists(self.context, note_hash, leaf_index)
    }

    #[contract_library_method]
    fn _note_hash_exists(context: PublicContext, note_hash: Field, leaf_index: u64) -> bool {
        context.note_hash_exists(note_hash, leaf_index)
    }

    // Use the standard context interface to emit a new note hash
    #[external("public")]
    fn new_note_hash(note_hash: Field) {
        _new_note_hash(self.context, note_hash);
    }

    #[contract_library_method]
    fn _new_note_hash(context: PublicContext, note_hash: Field) {
        context.push_note_hash(note_hash);
    }

    // Use the standard context interface to emit a new nullifier
    #[external("public")]
    fn new_nullifier(nullifier: Field) {
        _new_nullifier(self.context, nullifier);
    }

    #[contract_library_method]
    fn _new_nullifier(context: PublicContext, nullifier: Field) {
        context.push_nullifier_unsafe(nullifier);
    }

    #[external("public")]
    fn n_storage_writes(num: u32) {
        for i in 0..num {
            self.storage.map.at(AztecAddress::from_field(i as Field)).write(i);
        }
    }

    #[external("public")]
    fn n_new_note_hashes(num: u32) {
        for i in 0..num {
            self.context.push_note_hash(i as Field);
        }
    }

    #[external("public")]
    fn n_new_nullifiers(num: u32) {
        for i in 0..num {
            self.context.push_nullifier_unsafe(i as Field);
        }
    }

    #[external("public")]
    fn n_new_l2_to_l1_msgs(num: u32) {
        for i in 0..num {
            self.context.message_portal(EthAddress::from_field(i as Field), i as Field)
        }
    }

    #[external("public")]
    fn raw_l2_to_l1_msg(recipient: EthAddress, content: Field) {
        self.context.message_portal(recipient, content)
    }

    #[external("public")]
    fn n_new_public_logs(num: u32) {
        for i in 0..num {
            self.context.emit_public_log_unsafe(0, /*message=*/ [i as Field]);
        }
    }

    // Use the standard context interface to check for a nullifier
    #[external("public")]
    fn nullifier_exists(nullifier: Field) -> bool {
        _nullifier_exists(self.context, self.address, nullifier)
    }

    #[contract_library_method]
    fn _nullifier_exists(context: PublicContext, address: AztecAddress, nullifier: Field) -> bool {
        context.nullifier_exists_unsafe(nullifier, address)
    }

    #[external("public")]
    fn assert_nullifier_exists(nullifier: Field) {
        assert(self.context.nullifier_exists_unsafe(nullifier, self.address), "Nullifier doesn't exist!");
    }

    // Use the standard context interface to emit a new nullifier
    #[external("public")]
    fn emit_nullifier_and_check(nullifier: Field) {
        self.context.push_nullifier_unsafe(nullifier);
        let exists = self.context.nullifier_exists_unsafe(nullifier, self.address);
        assert(exists, "Nullifier was just created, but its existence wasn't detected!");
    }

    // Create the same nullifier twice (shouldn't work!)
    #[external("public")]
    fn nullifier_collision(nullifier: Field) {
        self.context.push_nullifier_unsafe(nullifier);
        // Can't do this twice!
        self.context.push_nullifier_unsafe(nullifier);
    }

    #[external("public")]
    fn l1_to_l2_msg_exists(msg_hash: Field, msg_leaf_index: Field) -> bool {
        _l1_to_l2_msg_exists(self.context, msg_hash, msg_leaf_index)
    }

    #[contract_library_method]
    fn _l1_to_l2_msg_exists(context: PublicContext, msg_hash: Field, msg_leaf_index: Field) -> bool {
        context.l1_to_l2_msg_exists(msg_hash, msg_leaf_index)
    }

    #[external("public")]
    fn send_l2_to_l1_msg(recipient: EthAddress, content: Field) {
        _send_l2_to_l1_msg(self.context, recipient, content);
    }

    #[contract_library_method]
    fn _send_l2_to_l1_msg(context: PublicContext, recipient: EthAddress, content: Field) {
        context.message_portal(recipient, content)
    }

    #[external("public")]
    fn nested_call_to_nothing() {
        let garbageAddress = AztecAddress::from_field(42);
        self.call(AvmTest::at(garbageAddress).nested_call_to_nothing())
    }

    #[external("public")]
    fn nested_call_to_nothing_recovers() {
        let garbageAddress = AztecAddress::from_field(42);
        call(1, 1, garbageAddress, []);
        let success = success_copy();
        assert(!success, "Nested CALL instruction should return failure if target contract does not exist");
    }

    #[external("public")]
    fn nested_call_to_add_with_gas(arg_a: Field, arg_b: Field, l2_gas: u32, da_gas: u32) -> pub Field {
        // Note: can't use self.call_self here because we need .with_gas() chaining
        self.call(AvmTest::at(self.address).add_args_return(arg_a, arg_b).with_gas(GasOpts::new(l2_gas, da_gas)))
    }

    // Use the `call_public_function` wrapper to initiate a nested call to the add function
    #[external("public")]
    fn nested_call_to_add(arg_a: Field, arg_b: Field) -> pub Field {
        _nested_call_to_add(self.context, self.address, arg_a, arg_b)
    }

    #[contract_library_method]
    unconstrained fn _nested_call_to_add(
        context: PublicContext,
        address: AztecAddress,
        arg_a: Field,
        arg_b: Field,
    ) -> Field {
        AvmTest::at(address).add_args_return(arg_a, arg_b).call(context)
    }

    #[external("public")]
    fn nested_call_to_add_n_times_different_addresses(
        addrs: [AztecAddress; MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS + 2],
    ) {
        for i in 0..MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS + 2 {
            let addr = addrs[i];
            if addr != AztecAddress::empty() {
                let _ = self.call(AvmTest::at(addr).add_args_return(1, 2));
            }
        }
    }

    // Indirectly call_static the external call opcode to initiate a nested call to the add function
    #[external("public")]
    fn nested_static_call_to_add(arg_a: Field, arg_b: Field) -> pub Field {
        _nested_static_call_to_add(self.context, self.address, arg_a, arg_b)
    }

    #[contract_library_method]
    unconstrained fn _nested_static_call_to_add(
        context: PublicContext,
        address: AztecAddress,
        arg_a: Field,
        arg_b: Field,
    ) -> Field {
        let selector = comptime { FunctionSelector::from_signature("add_args_return(Field,Field)") };
        context.static_call_public_function(address, selector, [arg_a, arg_b], GasOpts::default())[0]
    }

    // Indirectly call_static `set_storage_single`. Should revert since it's accessing self.storage.
    #[external("public")]
    fn nested_static_call_to_set_storage() {
        let selector = comptime { FunctionSelector::from_signature("set_storage_single(Field)") };
        let args = [20 as Field];
        let _ = self.context.static_call_public_function(self.address, selector, args, GasOpts::default());
    }

    #[external("public")]
    fn create_same_nullifier_in_nested_call(nestedAddress: AztecAddress, nullifier: Field) {
        self.context.push_nullifier_unsafe(nullifier);
        self.call(AvmTest::at(nestedAddress).new_nullifier(nullifier));
    }

    #[external("public")]
    fn create_different_nullifier_in_nested_call(nestedAddress: AztecAddress, nullifier: Field) {
        self.context.push_nullifier_unsafe(nullifier);
        self.call(AvmTest::at(nestedAddress).new_nullifier(nullifier + 1));
    }

    #[external("public")]
    fn nested_call_to_assert_same(arg_a: Field, arg_b: Field) -> pub Field {
        self.call_self.assert_same(arg_a, arg_b)
    }

    // function with large array as calldata (for benchmarking call interface macros)
    #[external("public")]
    fn fn_w_large_calldata(_arr: [Field; 300]) -> pub Field {
        // do nothing and return...
        5
    }
    #[external("public")]
    fn nested_call_large_calldata(arr: [Field; 300]) -> pub Field {
        self.call_self.fn_w_large_calldata(arr)
    }

    #[external("private")]
    fn enqueue_public_from_private() {
        self.enqueue_self_static.set_opcode_u8_view();
        self.enqueue_self.set_read_storage_single(5);
    }

    #[external("public")]
    fn call_fee_juice() {
        _call_fee_juice(self.context, self.address);
    }

    #[contract_library_method]
    unconstrained fn _call_fee_juice(context: PublicContext, address: AztecAddress) {
        let _ = FeeJuice::at(FEE_JUICE_ADDRESS).balance_of_public(address).view(context);
    }

    #[external("public")]
    fn call_auth_registry() {
        let _ = AuthRegistry::at(STANDARD_AUTH_REGISTRY_ADDRESS).is_reject_all(self.address).view(self.context);
    }

    #[external("public")]
    fn call_instance_registry() {
        let _ = self.view(ContractInstanceRegistry::at(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS).get_update_delay());
    }

    // Exercises many functions in a single call. Only calls functions with side effects (or oracle calls - but not
    // blackboxes), otherwise the whole call would be optimized away.
    #[external("public")]
    fn bulk_testing(
        args_field: [Field; 10],
        args_u8: [u8; 10],
        get_instance_for_address: AztecAddress,
        expected_deployer: AztecAddress,
        expected_class_id: ContractClassId,
        expected_initialization_hash: Field,
        expected_immutables_hash: Field,
        schnorr_inputs: [Field; 7],
        skip_strictly_limited_side_effects: bool,
    ) {
        aztec::oracle::logging::debug_log("biwise_ops");
        let num = self.context.block_number();
        let _ = bitwise_ops(num, num);
        aztec::oracle::logging::debug_log("set_storage_single");
        _set_storage_single(self.storage, 30);
        aztec::oracle::logging::debug_log("set_storage_list");
        _set_storage_list(self.storage, 40, 50);
        aztec::oracle::logging::debug_log("read_storage_list");
        let _ = _set_storage_map(self.storage, self.address, 60);
        aztec::oracle::logging::debug_log("add_storage_map");
        let _ = _add_storage_map(self.storage, self.address, 10);
        aztec::oracle::logging::debug_log("read_storage_map");
        let _ = _read_storage_map(self.storage, self.address);
        aztec::oracle::logging::debug_log("keccak_hash");
        let _ = keccak256::keccak256(args_u8, args_u8.len());
        aztec::oracle::logging::debug_log("sha256_hash");
        let _ = sha256::sha256_var(args_u8, args_u8.len());
        aztec::oracle::logging::debug_log("poseidon2_hash");
        let _ = poseidon::poseidon2::Poseidon2::hash(args_field, args_field.len());
        aztec::oracle::logging::debug_log("schnorr_verify_signature");
        let schnorr_ok = _schnorr_verify_signature(
            schnorr_inputs[0],
            schnorr_inputs[1],
            schnorr_inputs[2],
            schnorr_inputs[3],
            schnorr_inputs[4],
            schnorr_inputs[5],
            schnorr_inputs[6],
        );
        assert(schnorr_ok, "Schnorr signature should verify");
        aztec::oracle::logging::debug_log("pedersen_hash");
        let _ = std::hash::pedersen_hash(args_field);
        aztec::oracle::logging::debug_log("pedersen_hash_with_index");
        let _ = std::hash::pedersen_hash_with_separator(args_field, /*index=*/ 20);
        aztec::oracle::logging::debug_log("integer_division");
        let _ = integer_division(args_u8[0], args_u8[1]);
        aztec::oracle::logging::debug_log("field_division");
        let _ = field_division(args_field[0], args_field[1]);
        aztec::oracle::logging::debug_log("test_get_contract_instance");
        _test_get_contract_instance_matches(
            get_instance_for_address,
            expected_deployer,
            expected_class_id,
            expected_initialization_hash,
            expected_immutables_hash,
        );
        aztec::oracle::logging::debug_log("get_address");
        let _ = _get_address(self.address);
        aztec::oracle::logging::debug_log("get_sender");
        let _ = _get_sender(self.context);
        aztec::oracle::logging::debug_log("get_transaction_fee");
        let _ = _get_transaction_fee(self.context);
        aztec::oracle::logging::debug_log("get_chain_id");
        let _ = _get_chain_id(self.context);
        aztec::oracle::logging::debug_log("get_version");
        let _ = _get_version(self.context);
        aztec::oracle::logging::debug_log("get_block_number");
        let _ = _get_block_number(self.context);
        aztec::oracle::logging::debug_log("get_timestamp");
        let _ = _get_timestamp(self.context);
        aztec::oracle::logging::debug_log("get_fee_per_l2_gas");
        let _ = _get_fee_per_l2_gas(self.context);
        aztec::oracle::logging::debug_log("get_fee_per_da_gas");
        let _ = _get_fee_per_da_gas(self.context);
        aztec::oracle::logging::debug_log("get_l2_gas_left");
        let _ = _get_l2_gas_left(self.context);
        aztec::oracle::logging::debug_log("get_da_gas_left");
        let _ = _get_da_gas_left(self.context);
        if !skip_strictly_limited_side_effects {
            aztec::oracle::logging::debug_log("emit_public_log");
            _emit_public_log(self.context);
        }
        aztec::oracle::logging::debug_log("note_hash_exists");
        let _ = _note_hash_exists(self.context, 1, 2);
        aztec::oracle::logging::debug_log("new_note_hash");
        _new_note_hash(self.context, 1);
        aztec::oracle::logging::debug_log("new_nullifier");
        _new_nullifier(self.context, args_field[0]);
        aztec::oracle::logging::debug_log("nullifier_exists");
        let _ = _nullifier_exists(self.context, self.address, 1);
        aztec::oracle::logging::debug_log("l1_to_l2_msg_exists");
        let _ = _l1_to_l2_msg_exists(self.context, 1, 2);
        if !skip_strictly_limited_side_effects {
            aztec::oracle::logging::debug_log("send_l2_to_l1_msg");
            _send_l2_to_l1_msg(self.context, EthAddress::from_field(0x2020), 1);
        }
        aztec::oracle::logging::debug_log("storage_read_and_write");
        _set_storage_single(self.storage, _read_storage_single(self.storage));
        aztec::oracle::logging::debug_log("nested_call_to_add");
        let _ = _nested_call_to_add(self.context, self.address, 1, 2);
        aztec::oracle::logging::debug_log("nested_static_call_to_add");
        let _ = _nested_static_call_to_add(self.context, self.address, 1, 2);
        aztec::oracle::logging::debug_log("nested_call_to_protocol_contract");
        _call_fee_juice(self.context, self.address);
        aztec::oracle::logging::debug_log("to_le_bytes");
        let first_byte = _to_le_bytes(args_field[0])[0];
        assert(first_byte != 0);
        aztec::oracle::logging::debug_log("to_le_bits");
        let first_bit = _to_le_bits(args_field[0])[0];
        assert(first_bit);
        //let _ = nested_call_to_nothing_recovers();
    }
}

mod test {
    use std::embedded_curve_ops::{EmbeddedCurvePoint, EmbeddedCurveScalar};

    // Pins the same vector as `_schnorr_verify_signature` in the contract above (mirroring the C++
    // pinned_test_vector_large) so a regression in the schnorr lib or noir submodule is caught at
    // `nargo test` time rather than only when running the AVM end-to-end test.
    #[test]
    unconstrained fn schnorr_pinned_vector_verifies() {
        let public_key = EmbeddedCurvePoint::new(
            0x065812e335a97c2108ea8cf4ccfe2f9dd6b117a0714f5e18461575be93f61da6,
            0x1a915003e8ec534f9a15d926a7ded478e178468ccc4f28e236e67450a55ac622,
        );
        let sig_s = EmbeddedCurveScalar::new(
            0xf3bc3b7147acb9c621fd9f72dbf15ffa,
            0x08599f379f0301dfefdbd0272554454d,
        );
        let sig_e = EmbeddedCurveScalar::new(
            0x97065383ebbbd76620398792bd259bc2,
            0x2ceaee87f45b7a417f0ffb05451a8c92,
        );
        let message: Field = 0x0123456789abcdef0fedcba9876543210123456789abcdef0fedcba987654321;
        assert(schnorr::verify_signature(public_key, (sig_s, sig_e), message));
    }
}
