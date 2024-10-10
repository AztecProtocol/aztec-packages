import { Fq, Fr, Point } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';

// Copied over from `noir-projects/aztec-nr/aztec/src/generators.nr`
const GENERATORS = [
  new Point(
    new Fr(0x30426e64aee30e998c13c8ceecda3a77807dbead52bc2f3bf0eae851b4b710c1n),
    new Fr(0x113156a068f603023240c96b4da5474667db3b8711c521c748212a15bc034ea6n),
    false,
  ),
  new Point(
    new Fr(0x2825c79cc6a5cbbeef7d6a8f1b6a12b312aa338440aefeb4396148c89147c049n),
    new Fr(0x129bfd1da54b7062d6b544e7e36b90736350f6fba01228c41c72099509f5701en),
    false,
  ),
  new Point(
    new Fr(0x0edb1e293c3ce91bfc04e3ceaa50d2c541fa9d091c72eb403efb1cfa2cb3357fn),
    new Fr(0x1341d675fa030ece3113ad53ca34fd13b19b6e9762046734f414824c4d6ade35n),
    false,
  ),
  new Point(
    new Fr(0x0e0dad2250583f2a9f0acb04ededf1701b85b0393cae753fe7e14b88af81cb52n),
    new Fr(0x0973b02c5caac339ee4ad5dab51329920f7bf1b6a07e1dabe5df67040b300962n),
    false,
  ),
  new Point(
    new Fr(0x2f3342e900e8c488a28931aae68970738fdc68afde2910de7b320c00c902087dn),
    new Fr(0x1bf958dc63cb09d59230603a0269ae86d6f92494da244910351f1132df20fc08n),
    false,
  ),
];

const G_SLOT = new Point(
  new Fr(0x041223147b680850dc82e8a55a952d4df20256fe0593d949a9541ca00f0abf15n),
  new Fr(0x0a8c72e60d0e60f5d804549d48f3044d06140b98ed717a9b532af630c1530791n),
  false,
);

/**
 * Computes a note hash as is done by the default implementation injected by macros.
 * @param storageSlot - The slot to which the note was inserted.
 * @param noteContent - The note content (e.g. note.items).
 * @returns A note hash.
 */
export function computeNoteHash(storageSlot: Fr, noteContent: Fr[]): Fr {
  const grumpkin = new Grumpkin();
  const noteHidingPointBeforeSlotting = noteContent
    .slice(1)
    .reduce(
      (acc, item, i) => grumpkin.add(acc, grumpkin.mul(GENERATORS[i + 1], new Fq(item.toBigInt()))),
      grumpkin.mul(GENERATORS[0], new Fq(noteContent[0].toBigInt())),
    );

  const slotPoint = grumpkin.mul(G_SLOT, new Fq(storageSlot.toBigInt()));
  const noteHidingPoint = grumpkin.add(noteHidingPointBeforeSlotting, slotPoint);
  return noteHidingPoint.x;
}
