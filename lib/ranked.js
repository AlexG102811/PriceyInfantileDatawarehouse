const RANK_TIERS = ["Copper", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond", "Champion"];
const POINTS_PER_TIER = 200;
const POINTS_PER_DIVISION = 40;
const DIVISIONS = ["V", "IV", "III", "II", "I"];
const DIFFICULTY_MULTIPLIER = {
  easy: 0.75,
  easy_medium: 0.9,
  medium: 1,
  hard: 1.15,
  expert: 1.3
};

function rankInfo(rawPoints) {
  const points = Math.max(0, Math.floor(Number(rawPoints) || 0));
  const tierIndex = Math.floor(points / POINTS_PER_TIER);
  if (tierIndex >= RANK_TIERS.length - 1) {
    return {
      points,
      tier: "Champion",
      division: null,
      label: "Champion",
      progress: null,
      pointsToNext: null
    };
  }

  const tier = RANK_TIERS[tierIndex];
  const pointsInTier = points % POINTS_PER_TIER;
  const divisionIndex = Math.floor(pointsInTier / POINTS_PER_DIVISION);
  const division = DIVISIONS[divisionIndex];
  const divisionProgress = pointsInTier % POINTS_PER_DIVISION;
  return {
    points,
    tier,
    division,
    label: `${tier} ${division}`,
    progress: Math.round(divisionProgress / POINTS_PER_DIVISION * 100),
    pointsToNext: POINTS_PER_DIVISION - divisionProgress
  };
}

function rankedPointChange(points, totalQuestions, difficulty) {
  if (!Number.isInteger(totalQuestions) || totalQuestions <= 0) return 0;
  const scoreRatio = Math.max(0, Math.min(1, Number(points) / totalQuestions));
  const performance = (scoreRatio - 0.5) * 40;
  const multiplier = DIFFICULTY_MULTIPLIER[difficulty] || 1;
  return Math.max(-30, Math.min(30, Math.round(performance * multiplier)));
}

module.exports = { rankInfo, rankedPointChange };
