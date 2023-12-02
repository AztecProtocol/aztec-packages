use crate::rust_srs_init_srs;

use super::{parse_c_str, BackendError};

pub mod netsrs;

/// Initializes the SRS inside the C++ backend.
///
/// Uses the trusted setup data downloaded by the `NetSrs` struct and provides it to a C++ backend function to set up the SRS.
///
/// # Arguments
/// * `points_buf` - A byte slice containing the G1 data.
/// * `num_points` - Number of points used for the G1 data.
/// * `g2_point_buf` - A byte slice containing the G2 data.
///
/// # Returns
/// * `Result<(), BackendError>` - Returns an empty result if successful, otherwise returns a `BackendError`.
pub fn srs_init(
    points_buf: &[u8],
    num_points: u32,
    g2_point_buf: &[u8],
) -> Result<(), BackendError> {
    let error_msg_ptr =
        unsafe { rust_srs_init_srs(points_buf.as_ptr(), &num_points, g2_point_buf.as_ptr()) };
    if !error_msg_ptr.is_null() {
        return Err(BackendError::BindingCallError(format!(
            "C++ error: {}",
            unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string())
        )));
    }
    Ok(())
}
