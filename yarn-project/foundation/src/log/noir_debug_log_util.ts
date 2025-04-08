interface Printable {
  toString(): string;
}

/**
 * Format a debug string filling in `'{0}'` entries with their
 * corresponding values from the args array, amd `'{}'` with the whole array.
 *
 * @param formatStr - str of form `'this is a string with some entries like {0} and {1}'`
 * @param args - array of fields to fill in the string format entries with
 * @returns formatted string
 */
export function applyStringFormatting(formatStr: string, args: Printable[]): string {
  return formatStr
    .replace(/{(\d+)}/g, (match, index) => {
      return typeof args[index] === 'undefined' ? match : args[index].toString();
    })
    .replace(/{}/g, (_match, _index) => {
      return args.toString();
    });
}
