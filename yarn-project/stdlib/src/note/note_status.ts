/**
 * The status of notes stored in the database.
 */
export enum NoteStatus {
  ACTIVE = 1,
  NULLIFIED = 2,
}

/**
 * The status filter used when querying notes.
 */
export type NoteStatusFilter = NoteStatus | 'ALL';
