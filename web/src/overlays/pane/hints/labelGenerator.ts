/** Generate short labels for hints (a-;, then aa, ab, ...). */

const HOME_ROW = ["a", "s", "d", "f", "j", "k", "l", ";"];

export function generateLabels(count: number): string[] {
  const labels: string[] = [];

  // First pass: home row single letters
  for (let i = 0; i < Math.min(count, HOME_ROW.length); i++) {
    labels.push(HOME_ROW[i]);
  }

  // Second pass: two-letter combinations (all 26 letters for second letter)
  const remaining = count - labels.length;
  for (let i = 0; i < remaining; i++) {
    const first = String.fromCharCode(97 + Math.floor(i / 26)); // a-z
    const second = String.fromCharCode(97 + (i % 26)); // a-z
    labels.push(first + second);
  }

  return labels;
}
