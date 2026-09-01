import type { NoteDao } from '@aztec/stdlib/note';

import type { NotesFilter } from '../../notes_filter.js';
import type { NoteStore } from './note_store.js';

/**
 * Reads notes in a change set opened and closed around the read. A test that reads and then rolls back needs this: the
 * store rejects a rollback while a change set is open.
 */
export async function readNotes(store: NoteStore, filter: NotesFilter): Promise<NoteDao[]> {
  const changeSetId = 'read-change-set';
  store.beginChangeSet(changeSetId);
  const notes = await store.getNotes(filter, changeSetId);
  store.discardChangeSet(changeSetId);
  return notes;
}
