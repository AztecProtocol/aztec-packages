/**
 * This directory contains the sender and recipient synchronization algorithms that use tagging.
 *
 * The objective of the sender sync algorithm is to determine which tags have already been used by a sender, thereby
 * deciding which tag should be used next.
 *
 * The objective of the recipient sync algorithm is to load and process the corresponding logs.
 *
 * @module tagging
 */

export { loadPrivateLogsForSenderRecipientPair } from './recipient_sync/load_private_logs_for_sender_recipient_pair.js';
export { syncSenderTaggingIndexes } from './sender_sync/sync_sender_tagging_indexes.js';
export { UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from './constants.js';
export { getAllPrivateLogsByTags, getAllPublicLogsByTagsFromContract } from './get_all_logs_by_tags.js';

// Re-export tagging-related types from stdlib
export { DirectionalAppTaggingSecret, Tag, SiloedTag } from '@aztec/stdlib/logs';
export { type PreTag } from '@aztec/stdlib/logs';
