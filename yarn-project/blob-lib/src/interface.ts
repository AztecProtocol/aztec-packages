/**
 * The relevant parts of a response from https://ethereum.github.io/beacon-APIs/?urls.primaryName=dev#/Beacon/getBlobs
 */
export interface BlobJson {
  blob: string;
  kzg_commitment: string;
}
