const SHOP_ITEMS = [
  { id: "avatar-star", name: "Lucky Star", category: "avatar", icon: "⭐", description: "A bright badge for your player avatar.", price: 5 },
  { id: "avatar-ballcap", name: "Ballpark Cap", category: "avatar", icon: "🧢", description: "Show your baseball side wherever you play.", price: 15 },
  { id: "avatar-shield", name: "Tactical Shield", category: "avatar", icon: "🛡️", description: "A little Siege-inspired flair for your profile.", price: 18 },
  { id: "title-quiz-whiz", name: "Quiz Whiz", category: "title", icon: "✦", value: "Quiz Whiz", description: "Add a clever title under your player name.", price: 20 },
  { id: "title-dugout-mvp", name: "Dugout MVP", category: "title", icon: "⚾", value: "Dugout MVP", description: "A title for the baseball experts.", price: 25 },
  { id: "title-clutch-caller", name: "Clutch Caller", category: "title", icon: "🎯", value: "Clutch Caller", description: "For players who deliver under pressure.", price: 30 },
  { id: "theme-sunset", name: "Sunset Arcade", category: "theme", icon: "🌇", value: "theme-sunset", description: "Warm sunset colors across the app.", price: 30 },
  { id: "theme-ocean", name: "Deep Ocean", category: "theme", icon: "🌊", value: "theme-ocean", description: "Cool blue accents for your next quiz.", price: 35 },
  { id: "theme-emerald", name: "Emerald Field", category: "theme", icon: "💚", value: "theme-emerald", description: "Fresh green accents for your profile.", price: 35 }
];

function shopPointsForQuiz(correctAnswers) {
  const correct = Math.max(0, Math.floor(Number(correctAnswers) || 0));
  return 5 + Math.min(20, correct);
}

module.exports = { SHOP_ITEMS, shopPointsForQuiz };
