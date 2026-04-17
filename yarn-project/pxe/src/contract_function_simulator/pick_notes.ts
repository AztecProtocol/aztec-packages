import { Fr } from '@aztec/foundation/curves/bn254';
import { Comparator, type Note } from '@aztec/stdlib/note';

export interface PropertySelector {
  index: number;
  offset: number;
  length: number;
}

/**
 * Configuration for selecting values.
 */
export interface Select {
  /**
   * Selector of the field to select and match.
   */
  selector: PropertySelector;
  /**
   * Required value of the field.
   */
  value: Fr;
  /**
   * The comparator to use
   */
  comparator: Comparator;
}

/**
 * The order to sort an array.
 */
export enum SortOrder {
  NADA = 0,
  DESC = 1,
  ASC = 2,
}

/**
 * Configuration for sorting values.
 */
export interface Sort {
  /**
   * Selector of the field to sort.
   */
  selector: PropertySelector;
  /**
   * Order to sort the field.
   */
  order: SortOrder;
}

/**
 * Options for picking items from an array of BasicNoteData.
 */
interface GetOptions {
  /**
   * Configurations for selecting items.
   * Default: empty array.
   */
  selects?: Select[];
  /**
   * Configurations for sorting items.
   * Default: empty array.
   */
  sorts?: Sort[];
  /**
   * The number of items to retrieve per query.
   * Default: 0. No limit.
   */
  limit?: number;
  /**
   * The starting index for pagination.
   * Default: 0.
   */
  offset?: number;
}

/**
 * Data needed from to perform sort.
 */
interface ContainsNote {
  /**
   * The note.
   */
  note: Note;
}

const selectPropertyFromPackedNoteContent = (noteData: Fr[], selector: PropertySelector): Fr => {
  if (selector.index >= noteData.length) {
    throw new Error(`Property selector index ${selector.index} out of bounds for note with ${noteData.length} fields`);
  }
  if (selector.offset + selector.length > Fr.SIZE_IN_BYTES) {
    throw new Error(
      `Property selector range (offset=${selector.offset}, length=${selector.length}) exceeds Fr buffer size of ${Fr.SIZE_IN_BYTES} bytes`,
    );
  }
  const noteValueBuffer = noteData[selector.index].toBuffer();
  // Noir's PropertySelector counts offset from the LSB (last byte of the big-endian buffer),
  // so offset=0,length=Fr.SIZE_IN_BYTES reads the entire field, and offset=0,length=1 reads the last byte.
  const start = Fr.SIZE_IN_BYTES - selector.offset - selector.length;
  const end = Fr.SIZE_IN_BYTES - selector.offset;
  const noteValue = noteValueBuffer.subarray(start, end);
  // Left-pad to Fr.SIZE_IN_BYTES so Fr.fromBuffer interprets the value correctly.
  const padded = Buffer.alloc(Fr.SIZE_IN_BYTES);
  noteValue.copy(padded, Fr.SIZE_IN_BYTES - noteValue.length);
  return Fr.fromBuffer(padded);
};

const selectNotes = <T extends ContainsNote>(noteDatas: T[], selects: Select[]): T[] =>
  noteDatas.filter(noteData =>
    selects.every(({ selector, value, comparator }) => {
      const noteValueFr = selectPropertyFromPackedNoteContent(noteData.note.items, selector);
      const comparatorSelector = {
        [Comparator.EQ]: () => noteValueFr.equals(value),
        [Comparator.NEQ]: () => !noteValueFr.equals(value),
        [Comparator.LT]: () => noteValueFr.lt(value),
        [Comparator.LTE]: () => noteValueFr.lt(value) || noteValueFr.equals(value),
        [Comparator.GT]: () => !noteValueFr.lt(value) && !noteValueFr.equals(value),
        [Comparator.GTE]: () => !noteValueFr.lt(value),
      };

      const fn = comparatorSelector[comparator];
      if (!fn) {
        throw new Error(`Invalid comparator value: ${comparator}`);
      }
      return fn();
    }),
  );

const sortNotes = (a: Fr[], b: Fr[], sorts: Sort[], level = 0): number => {
  if (sorts[level] === undefined) {
    return 0;
  }

  const { selector, order } = sorts[level];
  if (order === (0 as SortOrder)) {
    return 0;
  }

  const aValue = selectPropertyFromPackedNoteContent(a, selector);
  const bValue = selectPropertyFromPackedNoteContent(b, selector);

  const dir = order === (1 as SortOrder) ? [-1, 1] : [1, -1];
  return aValue.toBigInt() === bValue.toBigInt()
    ? sortNotes(a, b, sorts, level + 1)
    : aValue.toBigInt() > bValue.toBigInt()
      ? dir[0]
      : dir[1];
};

/**
 * Pick from a note array a number of notes that meet the criteria.
 */
export function pickNotes<T extends ContainsNote>(
  noteDatas: T[],
  { selects = [], sorts = [], limit = 0, offset = 0 }: GetOptions,
): T[] {
  return selectNotes(noteDatas, selects)
    .sort((a, b) => sortNotes(a.note.items, b.note.items, sorts))
    .slice(offset, limit ? offset + limit : undefined);
}
