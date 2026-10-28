const assert = require("node:assert/strict");
const { test } = require("node:test");
const { shopPointsForQuiz } = require("../lib/shop");

test("completed quizzes award shop points based on correct answers with a cap", () => {
  assert.equal(shopPointsForQuiz(0), 5);
  assert.equal(shopPointsForQuiz(10), 15);
  assert.equal(shopPointsForQuiz(500), 25);
  assert.equal(shopPointsForQuiz(-1), 5);
});
