import { Fr } from '@aztec/foundation/fields';

export class ChoppedNoteError extends Error {
  constructor(public readonly siloedNoteHash: Fr) {
    const errorString = `We decrypted a log, but couldn't find a corresponding note in the tree.
This might be because the note was nullified in the same tx which created it.
In that case, everything is fine. To check whether this is the case, look back through
the logs for a notification
'important: chopped commitment for siloed inner hash note
${siloedNoteHash.toString()}'.
If you can see that notification. Everything's fine.
If that's not the case, and you can't find such a notification, something has gone wrong.
There could be a problem with the way you've defined a custom note, or with the way you're
serializing / deserializing / hashing / encrypting / decrypting that note.
Please see the following github issue to track an improvement that we're working on:
https://github.com/AztecProtocol/aztec-packages/issues/1641`;
    super(errorString);
  }
}
