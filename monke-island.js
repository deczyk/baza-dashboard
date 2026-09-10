export const ISLAND_STAGES = [
  { stage: 0, bananasRequired: 0, decoration: 'campfire' },
  { stage: 1, bananasRequired: 10, decoration: 'grass' },
  { stage: 2, bananasRequired: 25, decoration: 'pond' },
  { stage: 3, bananasRequired: 50, decoration: 'palm' },
  { stage: 4, bananasRequired: 100, decoration: 'hut' },
];

export function islandStageForBananas(bananas) {
  let stage = 0;
  for (const entry of ISLAND_STAGES) {
    if (bananas >= entry.bananasRequired) stage = entry.stage;
  }
  return stage;
}

export function unlockedDecorations(bananas) {
  return ISLAND_STAGES.filter((entry) => bananas >= entry.bananasRequired).map((entry) => entry.decoration);
}

export function bananasToNextStage(bananas) {
  const next = ISLAND_STAGES.find((entry) => entry.bananasRequired > bananas);
  return next ? next.bananasRequired - bananas : null;
}
