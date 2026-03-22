/**
 * diffText — word-level LCS diff.
 *
 * Splits both strings into word tokens (preserving whitespace as separate
 * tokens so the reconstructed text is identical to the input), then computes
 * the longest common subsequence. Returns a flat array of DiffOp entries
 * where each entry covers a single token.
 *
 * No external dependencies — pure TypeScript.
 */

export type DiffOp =
  | { type: "keep";   text: string }
  | { type: "delete"; text: string }
  | { type: "insert"; text: string };

/**
 * Split a string into tokens that, when concatenated, reproduce the original.
 * Tokens alternate between "word" and "whitespace" chunks.
 */
function tokenise(text: string): string[] {
  // Split on whitespace boundaries but keep the delimiters
  return text.split(/(\s+)/).filter(t => t.length > 0);
}

/**
 * Myers / classic LCS on token arrays.
 * Returns the diff as an array of DiffOp.
 */
export function diffText(a: string, b: string): DiffOp[] {
  const tokA = tokenise(a);
  const tokB = tokenise(b);
  const lenA = tokA.length;
  const lenB = tokB.length;

  // Build LCS table
  // lcs[i][j] = length of LCS of tokA[0..i-1] and tokB[0..j-1]
  const lcs: number[][] = Array.from({ length: lenA + 1 }, () =>
    new Array<number>(lenB + 1).fill(0),
  );

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      if (tokA[i - 1] === tokB[j - 1]) {
        lcs[i]![j] = lcs[i - 1]![j - 1]! + 1;
      } else {
        lcs[i]![j] = Math.max(lcs[i - 1]![j]!, lcs[i]![j - 1]!);
      }
    }
  }

  // Backtrack to produce ops
  const ops: DiffOp[] = [];
  let i = lenA;
  let j = lenB;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && tokA[i - 1] === tokB[j - 1]) {
      ops.push({ type: "keep", text: tokA[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcs[i]![j - 1]! >= lcs[i - 1]![j]!)) {
      ops.push({ type: "insert", text: tokB[j - 1]! });
      j--;
    } else {
      ops.push({ type: "delete", text: tokA[i - 1]! });
      i--;
    }
  }

  ops.reverse();
  return ops;
}
