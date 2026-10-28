const assert = require("node:assert/strict");
const { test } = require("node:test");
const { rankInfo, rankedPointChange } = require("../lib/ranked");

test("Siege-style ranks use five divisions per tier and cap at Champion", () => {
  assert.equal(rankInfo(0).label, "Copper V");
  assert.equal(rankInfo(40).label, "Copper IV");
  assert.equal(rankInfo(199).label, "Copper I");
  assert.equal(rankInfo(200).label, "Bronze V");
  assert.equal(rankInfo(1399).label, "Diamond I");
  assert.equal(rankInfo(1400).label, "Champion");
  assert.equal(rankInfo(2500).label, "Champion");
  assert.equal(rankInfo(-15).label, "Copper V");
});

test("ranked point changes reward strong results and weight harder quizzes", () => {
  assert.equal(rankedPointChange(5, 10, "medium"), 0);
  assert.equal(rankedPointChange(10, 10, "easy"), 15);
  assert.equal(rankedPointChange(10, 10, "hard"), 23);
  assert.equal(rankedPointChange(0, 10, "hard"), -23);
  assert.equal(rankedPointChange(10, 10, "expert"), 26);
  assert.equal(rankedPointChange(1, 0, "expert"), 0);
});
