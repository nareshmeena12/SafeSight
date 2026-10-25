/** Quick-check options in a random order, with the answer index following its option (models tend to put it first). */
export function shuffleOptions<T extends { options: string[]; answer: number }>(check: T, random = Math.random): T {
  const order = check.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...check, options: order.map((i) => check.options[i]), answer: order.indexOf(check.answer) };
}
