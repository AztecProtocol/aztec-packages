use crate::constants::CHECKPOINT_END_PREFIX;

global NUM_BLOB_FIELDS_BIT_SIZE: u32 = 32;

/// Create the field that marks the end of a checkpoint. It's a concatenation of:
/// `CHECKPOINT_END_PREFIX` | `num_blob_fields`
///
/// `CHECKPOINT_END_PREFIX` occupies the bytes up to the point where `num_blob_fields` begins.
/// `num_blob_fields` occupies 4 bytes.
pub fn create_checkpoint_end_marker(num_blob_fields: u32) -> Field {
    let num_blob_fields_field = num_blob_fields as Field;
    num_blob_fields_field.assert_max_bit_size::<NUM_BLOB_FIELDS_BIT_SIZE>();
    let mut marker = num_blob_fields_field;
    let shift = (1 << NUM_BLOB_FIELDS_BIT_SIZE as u64) as Field;
    marker += CHECKPOINT_END_PREFIX * shift;
    marker
}

#[test]
fn correct_checkpoint_end_marker() {
    let num_blob_fields = 1234;
    let marker = create_checkpoint_end_marker(num_blob_fields);
    println(marker);

    let checkpoint_end_marker_from_ts =
        0x0000000000000000000000000000636865636b706f696e745f656e64000004d2;

    assert_eq(marker, checkpoint_end_marker_from_ts);
}

#[test]
fn large_value_in_checkpoint_end_marker_does_not_get_truncated() {
    let num_blob_fields = 0xffffffff;
    let marker = create_checkpoint_end_marker(num_blob_fields);

    let large_checkpoint_end_marker_from_ts =
        0x0000000000000000000000000000636865636b706f696e745f656e64ffffffff;

    assert_eq(marker, large_checkpoint_end_marker_from_ts);
}
