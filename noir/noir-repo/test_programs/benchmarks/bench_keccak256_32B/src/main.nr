use dep::std;

fn main(message: [u8; 32]) -> pub [u8; 32] {
    std::hash::keccak256(message, 32)
}
