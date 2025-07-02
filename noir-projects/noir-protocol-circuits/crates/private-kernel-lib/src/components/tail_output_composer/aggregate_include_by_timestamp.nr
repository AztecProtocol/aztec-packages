use types::abis::include_by_timestamp_option::IncludeByTimestampOption;

pub fn aggregate_include_by_timestamp(
    previous_include_by_timestamp: IncludeByTimestampOption,
    custom_include_by_timestamp: u64,
) -> u64 {
    if previous_include_by_timestamp.is_none() {
        custom_include_by_timestamp
    } else {
        let prev_value = previous_include_by_timestamp.unwrap_unchecked();
        if prev_value < custom_include_by_timestamp {
            prev_value
        } else {
            custom_include_by_timestamp
        }
    }
}
