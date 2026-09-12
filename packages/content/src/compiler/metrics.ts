export interface ContentMetrics {
  wordCount: number;
  readingTimeSeconds: number;
}

const WORDS_PER_MINUTE = 200;

export function calculateMetrics(plainText: string): ContentMetrics {
  const trimmed = plainText.trim();
  if (!trimmed) {
    return { wordCount: 0, readingTimeSeconds: 0 };
  }

  // Count words matching unicode alphanumeric clusters
  const words = trimmed.match(/[\p{L}\p{N}]+/gu);
  const wordCount = words ? words.length : 0;
  const readingTimeSeconds = Math.ceil((wordCount / WORDS_PER_MINUTE) * 60);

  return {
    wordCount,
    readingTimeSeconds,
  };
}
