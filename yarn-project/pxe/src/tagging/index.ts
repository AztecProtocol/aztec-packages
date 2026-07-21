/**
 * This directory contains the sender and recipient synchronization algorithms that use tagging.
 *
 * The objective of the sender sync algorithm is to determine which tags have already been used by a sender, thereby
 * deciding which tag should be used next.
 *
 * The objective of the recipient sync algorithm is to fetch and sync the corresponding logs.
 *
 * @module tagging
 */

export { syncTaggedPrivateLogs } from './recipient_sync/sync_tagged_private_logs.js';
export { syncSenderTaggingIndexes } from './sender_sync/sync_sender_tagging_indexes.js';
export { persistSenderTaggingIndexRangesForTx } from './persist_sender_tagging_index_ranges.js';
export { UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from './constants.js';
export { getAllPrivateLogsByTags, getAllPublicLogsByTagsFromContract } from './get_all_logs_by_tags.js';

// Re-export tagging-related types from stdlib
export { AppTaggingSecret, Tag, SiloedTag } from '@aztec/stdlib/logs';
export { type PreTag, type TaggingIndexRange } from '@aztec/stdlib/logs';
