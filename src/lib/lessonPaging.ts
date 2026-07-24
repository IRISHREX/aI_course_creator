import { blockToText, countWords } from "@/components/BlockRenderer";

export const PAGE_SIZE = 8;
const TARGET_WORDS = 500;
const MIN_WORDS = 280;

export interface Page<T> {
  blocks: T[];
  /** word offset (in concatenated readable text) of the first block on this page */
  wordOffset: number;
  /** number of words on this page */
  wordCount: number;
}

function blockWeight(block: any) {
  const words = countWords(blockToText(block));
  if (!block || typeof block !== "object") return Math.max(1, words);
  if (block.type === "image" || block.type === "flowchart" || block.type === "chart") return Math.max(words, 70);
  if (block.type === "code" || block.type === "table") return Math.max(words, 95);
  if (block.type === "timeline") return Math.max(words, 100);
  return Math.max(1, words);
}

function createPage<T>(blocks: T[], wordOffset: number): Page<T> {
  return {
    blocks,
    wordOffset,
    wordCount: blocks.reduce((acc, block) => acc + countWords(blockToText(block as any)), 0),
  };
}

/** Split blocks into balanced reading pages; compute karaoke word offsets. */
export function paginate<T = any>(blocks: T[], pageSize = PAGE_SIZE): Page<T>[] {
  const pages: Page<T>[] = [];
  if (!blocks.length) return pages;

  let off = 0;
  let pageBlocks: T[] = [];
  let weightedCount = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const weight = blockWeight(block);
    const remainingWeight = blocks.slice(i + 1).reduce((acc, item) => acc + blockWeight(item), 0);
    const nextWouldOverflow = pageBlocks.length > 0 && weightedCount + weight > TARGET_WORDS;
    const hasEnoughForPage = weightedCount >= MIN_WORDS;
    const hitBlockLimit = pageBlocks.length >= pageSize;
    const keepLastPageUseful = remainingWeight >= MIN_WORDS || pages.length === 0;

    if ((hitBlockLimit || (nextWouldOverflow && hasEnoughForPage && keepLastPageUseful)) && pageBlocks.length) {
      const page = createPage(pageBlocks, off);
      pages.push(page);
      off += page.wordCount;
      pageBlocks = [];
      weightedCount = 0;
    }

    pageBlocks.push(block);
    weightedCount += weight;
  }

  if (pageBlocks.length) pages.push(createPage(pageBlocks, off));
  return pages;
}

export function pageBalanceStats<T = any>(pages: Page<T>[]) {
  const counts = pages.map((page) => page.wordCount);
  const min = counts.length ? Math.min(...counts) : 0;
  const max = counts.length ? Math.max(...counts) : 0;
  return { min, max, spread: max - min, pages: pages.length };
}

/** Concatenate readable text for a single page (matches BlockRenderer word indexing). */
export function pageReadable(blocks: any[]): string {
  return blocks.map(b => blockToText(b)).filter(Boolean).join(" ");
}
