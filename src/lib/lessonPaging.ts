import { blockToText, countWords } from "@/components/BlockRenderer";

export const PAGE_SIZE = 5;

export interface Page<T> {
  blocks: T[];
  /** word offset (in concatenated readable text) of the first block on this page */
  wordOffset: number;
  /** number of words on this page */
  wordCount: number;
}

/** Split blocks into pages of up to PAGE_SIZE blocks; compute karaoke word offsets. */
export function paginate<T = any>(blocks: T[], pageSize = PAGE_SIZE): Page<T>[] {
  const pages: Page<T>[] = [];
  let off = 0;
  for (let i = 0; i < blocks.length; i += pageSize) {
    const slice = blocks.slice(i, i + pageSize);
    const wc = slice.reduce((acc, b) => acc + countWords(blockToText(b as any)), 0);
    pages.push({ blocks: slice, wordOffset: off, wordCount: wc });
    off += wc;
  }
  return pages;
}

/** Concatenate readable text for a single page (matches BlockRenderer word indexing). */
export function pageReadable(blocks: any[]): string {
  return blocks.map(b => blockToText(b)).filter(Boolean).join(" ");
}
