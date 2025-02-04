use crate::{
    abis::{log::Log, side_effect::{Ordered, scoped::Scoped}},
    address::AztecAddress,
    constants::{CONTRACT_CLASS_LOG_DATA_LENGTH, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS},
    traits::{Deserialize, Empty, Serialize},
    utils::{
        arrays::{
            array_concat, assert_exposed_sorted_transformed_value_array::get_order_hints::OrderHint,
            find_index_hint, find_index_hint_from_end,
        },
        reader::Reader,
    },
};

// TODO(MW): add new constant for this - the below is just the largest combination atm
pub type ContractClassLog = Log<CONTRACT_CLASS_LOG_SIZE_IN_FIELDS>;

// log_size is the actual length of the log we want to emit in fields.
// We use it to check is_empty() because checking 3k+ fields many times is expensive.
// We only need to constrain the log_size once (init and inner) , and can then use it in future kernels.
pub struct ContractClassLogData {
    pub log: ContractClassLog,
    pub counter: u32,
    pub log_size: u32,
}

impl Ordered for ContractClassLogData {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Eq for ContractClassLogData {
    fn eq(self, other: ContractClassLogData) -> bool {
        (self.log == other.log)
            & (self.counter == other.counter)
            & (self.log_size == other.log_size)
    }
}

impl Empty for ContractClassLogData {
    fn empty() -> Self {
        Self { log: ContractClassLog::empty(), counter: 0, log_size: 0 }
    }
}

impl ContractClassLogData {
    // WARNING: can only be used when log_size has been constrained to be the log length
    pub fn is_empty(self) -> bool {
        (self.log_size == 0) & (self.counter == 0)
    }

    pub fn with_log_size_hint(self) -> Self {
        /// Safety: this just returns a hint and is contrained elsewhere (in validate_log_size_hint(), called by each init and inner kernel)
        Self {
            log: self.log,
            counter: self.counter,
            log_size: unsafe { find_index_hint_from_end(self.log.fields, |f| f == 0) },
        }
    }

    // NB: 15k gates
    pub fn validate_log_size_hint(self) {
        // Constrain that length_hint is correct by checking all elts after length_hint are zero
        let mut check_zero = false;
        for j in 0..self.log.fields.len() {
            // 3 * N gates (= 9k)
            check_zero |= j == self.log_size;
            if check_zero {
                // 2 * N gates (= 6k)
                assert_eq(
                    self.log.fields[j],
                    0,
                    "found non-0 elt in contract class log after claimed length",
                );
            }
        }
        assert_eq(
            self.log_size,
            self.with_log_size_hint().log_size,
            "contract class log does not have correct size, try calling log.with_log_size_hint()",
        );
    }
}

impl Serialize<CONTRACT_CLASS_LOG_DATA_LENGTH> for ContractClassLogData {
    fn serialize(self) -> [Field; CONTRACT_CLASS_LOG_DATA_LENGTH] {
        array_concat(
            self.log.serialize(),
            [self.counter as Field, self.log_size as Field],
        )
    }
}

impl Deserialize<CONTRACT_CLASS_LOG_DATA_LENGTH> for ContractClassLogData {
    fn deserialize(fields: [Field; CONTRACT_CLASS_LOG_DATA_LENGTH]) -> Self {
        let mut reader = Reader::new(fields);
        Self {
            log: reader.read_struct(ContractClassLog::deserialize),
            counter: reader.read_u32(),
            log_size: reader.read_u32(),
        }
    }
}

impl ContractClassLogData {
    pub fn scope(self, contract_address: AztecAddress) -> Scoped<Self> {
        Scoped { inner: self, contract_address }
    }
}

impl Ordered for Scoped<ContractClassLogData> {
    fn counter(self) -> u32 {
        self.inner.counter
    }
}

impl Scoped<ContractClassLogData> {
    pub fn expose_to_public(self) -> Self {
        Scoped {
            inner: ContractClassLogData {
                log: self.inner.log,
                counter: 0,
                log_size: self.inner.log_size,
            },
            contract_address: self.contract_address,
        }
    }

    // WARNING: can only be used when log_size has been constrained to be the log length
    pub fn is_empty(self) -> bool {
        (self.inner.log_size == 0) & (self.inner.counter == 0) & (self.contract_address.is_zero())
    }
}

// Like assert_array_appended_and_scoped, but for contract class logs where we have the special is_empty
// and transformation of log.log_size from private_call to public_inputs
pub fn assert_contract_class_logs_appended_and_scoped<let N: u32, let M: u32>(
    dest: [Scoped<ContractClassLogData>; N],
    source: [ContractClassLogData; M],
    num_source_items: u32,
    num_prepended_items: u32,
    contract_address: AztecAddress,
) {
    let items_propagated = num_prepended_items + num_source_items;
    assert(items_propagated <= N, "number of total items exceeds limit");
    let mut should_check = false;
    let mut is_non_empty_item = true;
    for i in 0..dest.len() {
        should_check |= i == num_prepended_items;
        is_non_empty_item &= i != items_propagated;
        if should_check {
            if is_non_empty_item {
                assert_eq(
                    dest[i].inner,
                    source[i - num_prepended_items].with_log_size_hint(),
                    "source item does not append to dest",
                );
                assert_eq(
                    dest[i].contract_address,
                    contract_address,
                    "propagated contract address does not match",
                );
            } else {
                assert(dest[i].is_empty(), "output should be appended with empty items");
            }
            // We check every log, including empty ones, to constrain that log_size is correct
            dest[i].inner.validate_log_size_hint();
        }
    }
}

// Like assert_split_sorted_transformed_value_arrays, but for contract class logs where we have the special is_empty.
// Called in tail to public validation phase.
pub fn assert_split_sorted_transformed_contract_class_logs<let N: u32>(
    original_array: [Scoped<ContractClassLogData>; N],
    transformed_value_array: [Scoped<ContractClassLogData>; N],
    split_counter: u32,
    sorted_transformed_value_array_lt: [Scoped<ContractClassLogData>; N], // Values whose counters are less than the split counter.
    sorted_transformed_value_array_gte: [Scoped<ContractClassLogData>; N], // Values whose counters are greater than or equal to the split counter.
    sorted_counters_lt: [u32; N], // Counters of the values in sorted_transformed_value_array_lt.
    sorted_counters_gte: [u32; N], // Counters of the values in sorted_transformed_value_array_gte.
    index_hints: [u32; N], // The index of the item in the correspinding sorted_transformed_value_array_(lt/gte) for each item in the original_array.
    ascending: bool, // Whether the items in sorted_transformed_value_array_(lt/gte) is in ascending order.
) {
    let total_num = contract_class_log_array_length(original_array);

    let mut num_lt = 0;
    let mut num_gte = 0;
    let mut should_check = true;
    for i in 0..N {
        should_check &= i != total_num;
        if should_check {
            let original = original_array[i];
            let value = transformed_value_array[i];
            let sorted_index = index_hints[i];
            // NB: The array access/comparison here costs 15k gates per clause, though only around 3k values are compared
            if original.counter() < split_counter {
                assert_eq(
                    value,
                    sorted_transformed_value_array_lt[sorted_index],
                    "mismatch sorted values",
                );
                assert_eq(
                    original.counter(),
                    sorted_counters_lt[sorted_index],
                    "mismatch counters",
                );
                num_lt += 1;
            } else {
                assert_eq(
                    value,
                    sorted_transformed_value_array_gte[sorted_index],
                    "mismatch sorted values",
                );
                assert_eq(
                    original.counter(),
                    sorted_counters_gte[sorted_index],
                    "mismatch counters",
                );
                num_gte += 1;
            }
        }
    }

    for i in 1..N {
        if i < num_lt {
            let counter = sorted_counters_lt[i];
            let prev_counter = sorted_counters_lt[i - 1];
            assert(ascending == (counter > prev_counter), "value array must be sorted by counter");
            assert(counter != prev_counter, "counters must not be the same");
        }
        if i < num_gte {
            let counter = sorted_counters_gte[i];
            let prev_counter = sorted_counters_gte[i - 1];
            assert(ascending == (counter > prev_counter), "value array must be sorted by counter");
            assert(counter != prev_counter, "counters must not be the same");
        }
    }

    let num_non_empty_values_lt =
        validate_scoped_contract_class_log_array(sorted_transformed_value_array_lt);
    assert_eq(num_non_empty_values_lt, num_lt, "mismatch number of values lt");

    let num_non_empty_values_gte =
        validate_scoped_contract_class_log_array(sorted_transformed_value_array_gte);
    assert_eq(num_non_empty_values_gte, num_gte, "mismatch number of values gte");
}

// Like assert_exposed_sorted_transformed_value_array, but for contract class logs where we have the special is_empty.
// Called in tail validation phase.
// NB: 15k gates
pub fn assert_exposed_sorted_transformed_contract_class_logs<let N: u32>(
    original_array: [Scoped<ContractClassLogData>; N],
    exposed_sorted_transformed_value_array: [Scoped<ContractClassLogData>; N],
    hints: [OrderHint; N],
) {
    let num_non_empty_items = contract_class_log_array_length(original_array);
    let mut should_be_empty = false;
    for i in 0..N {
        should_be_empty |= i == num_non_empty_items;
        if should_be_empty {
            assert(
                exposed_sorted_transformed_value_array[i].is_empty(),
                "array must be padded with empty items",
            );
        } else {
            let original = original_array[i];
            let sorted_index = hints[i].sorted_index;
            let sorted = exposed_sorted_transformed_value_array[sorted_index];
            assert_eq(original.expose_to_public(), sorted, "incorrect transformed value");
            assert_eq(original.counter(), hints[sorted_index].counter, "incorrect hinted counter");
            if i != 0 {
                assert(
                    hints[i].counter > hints[i - 1].counter,
                    "value array must be sorted by counter in ascending order",
                );
            }
        }
    }
}

// Routine which validates that all zero values of an array form a contiguous region at the end, i.e.,
// of the form: [*,*,*...,0,0,0,0] where any * is non-zero. Note that a full array of non-zero values is
// valid.
// We can use log.is_empty() since the private call's log_size has been constrained in prev kernels.
fn validate_scoped_contract_class_log_array<let N: u32>(
    array: [Scoped<ContractClassLogData>; N],
) -> u32 {
    let mut seen_empty = false;
    let mut length = 0;
    for i in 0..N {
        if array[i].is_empty() {
            seen_empty = true;
        } else {
            assert(seen_empty == false, "invalid array");
            length += 1;
        }
    }
    length
}

pub fn validate_contract_class_log_array<let N: u32>(array: [ContractClassLogData; N]) -> u32 {
    let mut seen_empty = false;
    let mut length = 0;
    for i in 0..N {
        if array[i].is_empty() {
            seen_empty = true;
        } else {
            assert(seen_empty == false, "invalid array");
            length += 1;
        }
    }
    length
}

// We can use log.is_empty() since the private call's log_size has been constrained in prev kernels.
pub fn contract_class_log_array_length<let N: u32>(
    array: [Scoped<ContractClassLogData>; N],
) -> u32 {
    // We get the length by checking the index of the first empty element.
    /// Safety: This is safe because we have validated the array (or will shortly after this call)
    let length = unsafe { find_index_hint(array, |elem| elem.is_empty()) };
    if length != 0 {
        assert(!array[length - 1].is_empty());
    }
    if length != N {
        assert(array[length].is_empty());
    }
    length
}

// We can use log.is_empty() since the private call's log_size has been constrained in prev kernels.
pub fn contract_class_log_array_merge<let N: u32>(
    array1: [Scoped<ContractClassLogData>; N],
    array2: [Scoped<ContractClassLogData>; N],
) -> [Scoped<ContractClassLogData>; N] {
    /// Safety: we constrain this array below
    let result = unsafe { contract_class_log_array_merge_helper(array1, array2) };
    let left_len = contract_class_log_array_length(array1);
    let mut add_from_left = true;
    for i in 0..N {
        add_from_left &= i != left_len;
        if add_from_left {
            assert_eq(result[i], array1[i]);
        } else {
            assert_eq(result[i], array2[i - left_len]);
        }
    }
    result
}

unconstrained fn contract_class_log_array_merge_helper<let N: u32>(
    array1: [Scoped<ContractClassLogData>; N],
    array2: [Scoped<ContractClassLogData>; N],
) -> [Scoped<ContractClassLogData>; N] {
    let mut result: [Scoped<ContractClassLogData>; N] = array1;
    let mut i = contract_class_log_array_length(array1);
    for j in i..N {
        result[j] = array2[j - i];
    }
    result
}

#[test]
fn serialization_of_empty_contract_class_log() {
    let item = ContractClassLogData::empty();
    let serialized = item.serialize();
    let deserialized = ContractClassLogData::deserialize(serialized);
    assert(item.eq(deserialized));
}

#[test]
fn validation_of_contract_class_log_size_succeeds() {
    let log_fields = [7; 7];
    let logs = [
        ContractClassLogData::empty(),
        ContractClassLogData {
            log: ContractClassLog {
                fields: array_concat(log_fields, [0; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS - 7]),
            },
            counter: 0,
            log_size: 0,
        },
    ];
    let logs_with_hint = logs.map(|l| l.with_log_size_hint());
    assert_eq(logs_with_hint[0].log_size, 0);
    logs_with_hint[0].validate_log_size_hint();
    assert_eq(logs_with_hint[1].log_size, log_fields.len());
    logs_with_hint[1].validate_log_size_hint();
}

#[test(should_fail_with = "found non-0 elt in contract class log after claimed length")]
fn validation_of_contract_class_log_size_fails_too_long() {
    let log_fields = [7; 7];
    let log = ContractClassLogData {
        log: ContractClassLog {
            fields: array_concat(log_fields, [0; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS - 7]),
        },
        counter: 0,
        log_size: log_fields.len() - 2,
    };
    log.validate_log_size_hint();
}

#[test(should_fail_with = "contract class log does not have correct size, try calling log.with_log_size_hint()")]
fn validation_of_contract_class_log_size_fails_too_short() {
    let log_fields = [7; 7];
    let log = ContractClassLogData {
        log: ContractClassLog {
            fields: array_concat(log_fields, [0; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS - 7]),
        },
        counter: 0,
        log_size: log_fields.len() + 2,
    };
    log.validate_log_size_hint();
}
