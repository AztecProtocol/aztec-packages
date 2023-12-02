use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, RANGE};

#[derive(Debug)]
pub struct NetSrs {
    pub data: Vec<u8>,
    pub g2_data: Vec<u8>,
    pub num_points: u32,
}

impl NetSrs {
    /// Creates a new NetSrs instance by downloading the required SRS data from Noir Cloud.
    ///
    /// # Arguments
    /// * `num_points` - Number of points required for G1 data.
    pub fn new(num_points: u32) -> Self {
        NetSrs {
            num_points,
            data: Self::download_g1_data(num_points),
            g2_data: Self::download_g2_data(),
        }
    }

    /// Downloads the G1 data from Noir Cloud based on the specified number of points.
    ///
    /// # Arguments
    /// * `num_points` - Number of points required for G1 data.
    ///
    /// # Returns
    /// * `Vec<u8>` - A byte vector containing the G1 data.
    fn download_g1_data(num_points: u32) -> Vec<u8> {
        const G1_START: u32 = 28;
        let g1_end: u32 = G1_START + num_points * 64 - 1;

        let mut headers = HeaderMap::new();
        headers.insert(RANGE, format!("bytes={}-{}", G1_START, g1_end).parse().unwrap());

        let response = Client::new()
            .get(
                "https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/monomial/transcript00.dat",
            )
            .headers(headers)
            .send()
            .unwrap();

        response.bytes().unwrap().to_vec()
    }

    /// Downloads the G2 data from Noir Cloud.
    ///
    /// # Returns
    /// * `Vec<u8>` - A byte vector containing the G2 data.
    fn download_g2_data() -> Vec<u8> {
        const G2_START: usize = 28 + 5040001 * 64;
        const G2_END: usize = G2_START + 128 - 1;

        let mut headers = HeaderMap::new();
        headers.insert(RANGE, format!("bytes={}-{}", G2_START, G2_END).parse().unwrap());

        let response = Client::new()
            .get(
                "https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/monomial/transcript00.dat",
            )
            .headers(headers)
            .send()
            .unwrap();

        response.bytes().unwrap().to_vec()
    }
}
