/**
 * NFC Forum Type 2 Tag (NTAG21x family) user-memory capacities, in bytes.
 *
 * Source: NXP NTAG213/215/216 datasheets. These are the raw user-memory
 * byte budgets available to an NDEF message + its TLV wrapper — i.e. the
 * ceiling that `totalTagBytes` in this benchmark suite must clear.
 *
 * AUDIT.md flagged that docs/lifetag_paper_draft.tex states "NTAG215/216
 * (504 bytes user memory)" — 504 B is correct for NTAG215 only; NTAG216
 * actually has 888 B. Do not conflate the two.
 */
export const NTAG_CAPACITY_BYTES = {
  NTAG213: 144,
  NTAG215: 504,
  NTAG216: 888,
} as const;

export type NtagModel = keyof typeof NTAG_CAPACITY_BYTES;
