use rustc_version::{version, Version};

fn check_rustc_version() {
    assert!(
        version().unwrap() >= Version::parse("1.73.0").unwrap(),
        "The minimal supported rustc version is 1.73.0."
    );
}

fn main() {
    check_rustc_version();
}
