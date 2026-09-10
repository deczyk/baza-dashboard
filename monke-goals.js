export function goalProgress(goal, doneForDay) {
  const done = goal.habitIds || [];
  const doneCount = done.filter((id) => {
    const variant = (doneForDay || {})[id];
    return variant === 'full' || variant === 'minimum';
  }).length;
  return { done: doneCount, total: done.length };
}
