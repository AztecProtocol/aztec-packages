import { type AppTaggingSecret, type PrivateLogsQuery, SiloedTag, type TagQuery } from '@aztec/stdlib/logs';

/** Computes the siloed tag */
export function computeSiloedTagForIndex(secret: AppTaggingSecret, index: number): Promise<SiloedTag> {
  return SiloedTag.compute({ extendedSecret: secret, index });
}

/** Extracts the bare-tag set from a query */
export function extractTags(query: PrivateLogsQuery): SiloedTag[] {
  return query.tags.map((entry: TagQuery<SiloedTag>) => (entry instanceof SiloedTag ? entry : entry.tag));
}
