/**
 * The relevant parts of a response from https://ethereum.github.io/beacon-APIs/?urls.primaryName=dev#/Beacon/getBlobSidecars
 */
export interface BlobJson {
  blob: string;
  index?: number;
  // eslint-disable-next-line camelcase
  kzg_commitment: string;
  // eslint-disable-next-line camelcase
  kzg_proof: string;
}
