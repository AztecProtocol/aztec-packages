export const GITHUB_OWNER = 'AztecProtocol';
export const GITHUB_REPO = 'aztec-packages';
export const GITHUB_TAG_PREFIX = 'aztec-packages';

/**
 * A Github release
 */
export type GithubRelease = {
  /** The Git tag of the release */
  tagName: string;
  /** When it was created as an ISO 8601 string */
  createdAt: string;
};

/**
 * Gets recent releases from the Aztec packages repository.
 * @returns a sorted list of Aztec packages releases (newest first)
 */
export async function getRecentAztecReleases(): Promise<ReadonlyArray<GithubRelease>> {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`);
  if (!response.ok) {
    return [];
  }

  const allReleases: Array<any> = await response.json();
  const aztecPackagesReleases = allReleases.filter((release: any) => release.tag_name.startsWith(GITHUB_TAG_PREFIX));
  const releases = aztecPackagesReleases.map<GithubRelease>((release: any) => ({
    tagName: release.tag_name,
    createdAt: release.created_at,
  }));

  releases.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return releases;
}
