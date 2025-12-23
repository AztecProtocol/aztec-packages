/**
 * The relevant parts of a response from https://ethereum.github.io/beacon-APIs/?urls.primaryName=dev#/Beacon/getBlobSidecars
 */
export interface BlobJson {
  blob: string;
  kzg_commitment: string;
}
