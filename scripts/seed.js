const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const quizzes = [
  {
    title: "Baseball: The Basics",
    topic: "Baseball",
    difficulty: "easy",
    timeLimit: null,
    questions: [
      ["How many defensive players from one team are on the field in a standard baseball game?", "Seven", "Eight", "Nine", "Ten", "c"],
      ["How many innings are in a standard regulation MLB game?", "Seven", "Eight", "Nine", "Ten", "c"],
      ["How many outs end a team's half-inning?", "Two", "Four", "Five", "Three", "d"],
      ["How many strikes usually result in a strikeout?", "Three", "Four", "Two", "Five", "a"],
      ["How many balls earn a batter a walk?", "Three", "Four", "Five", "Six", "b"],
      ["Which player throws each pitch toward the batter?", "Catcher", "Pitcher", "Shortstop", "Center fielder", "b"],
      ["What is the name of the plate a batter stands beside and runners try to reach to score?", "First base", "Pitcher's plate", "Home plate", "On-deck circle", "c"],
      ["What is a ball hit beyond the outfield fence in fair territory usually called?", "Ground-rule double", "Sacrifice fly", "Foul tip", "Home run", "d"],
      ["What do the two foul lines mark?", "The boundary between fair and foul territory", "The edge of the outfield grass", "The pitcher's lane", "The batter's box", "a"],
      ["How many bases does a runner normally touch to score after hitting a home run?", "Two", "Four", "Three", "Five", "b"]
    ]
  },
  {
    title: "Baseball: Rules & Strategy",
    topic: "Baseball",
    difficulty: "easy_medium",
    timeLimit: null,
    questions: [
      ["What is a force out?", "A runner is tagged while standing on a base", "A batter hits a foul ball", "A fielder with the ball reaches a base before a forced runner", "A runner scores from third", "c"],
      ["When is a runner normally safe from being tagged out?", "When the pitcher releases the ball", "While standing on a base", "After a foul ball", "When the catcher throws to first", "b"],
      ["What does a batter do when bunting?", "Swings as hard as possible", "Drops the bat before the pitch", "Hits only to the opposite field", "Holds the bat out to tap the ball", "d"],
      ["What is a stolen base?", "A base awarded after a walk", "A fielder catching a fly ball", "A runner advancing to the next base without a hit", "A batter reaching first on an error", "c"],
      ["What is a sacrifice fly?", "A caught fly ball that can let a runner tag up and advance", "A foul ball caught behind home plate", "A home run with the bases empty", "A bunt that advances the runner", "a"],
      ["What is a double play?", "Two runners score on one hit", "A batter receives two strikes", "A game played as a doubleheader", "Two outs recorded during one continuous play", "d"],
      ["What is the purpose of a force play at a base?", "To make a pitcher throw from the stretch", "To stop a runner who must advance from reaching that base", "To keep a ball in foul territory", "To replace an injured fielder", "b"],
      ["What is a tag-up?", "A batter touching first base after a hit", "A catcher touching home plate with the ball", "A runner touching their base after a caught fly ball before advancing", "A pitcher checking a runner before a pitch", "c"],
      ["With runners on first and second and fewer than two outs, what does an infield fly rule help prevent?", "A runner stealing third", "A batter bunting for a hit", "A pitcher throwing a wild pitch", "A fielder intentionally dropping an easy pop-up to turn a double play", "d"],
      ["What is a pitcher's main goal when trying to pick off a runner?", "Catch the runner too far from a base", "Force the batter to bunt", "Signal a new defensive alignment", "End the inning without a pitch", "a"]
    ]
  },
  {
    title: "Baseball: History & Ballparks",
    topic: "Baseball",
    difficulty: "medium",
    timeLimit: null,
    questions: [
      ["What championship series determines the MLB champion?", "The All-Star Series", "The World Series", "The Pennant Cup", "The Spring Classic", "b"],
      ["Which former Brooklyn Dodgers player broke MLB's modern color barrier in 1947?", "Jackie Robinson", "Hank Aaron", "Willie Mays", "Satchel Paige", "a"],
      ["Which award is given annually to an outstanding pitcher in each MLB league?", "Gold Glove Award", "Cy Young Award", "Silver Slugger Award", "Rookie of the Year Award", "b"],
      ["Which Boston ballpark is known for its tall left-field wall called the Green Monster?", "Wrigley Field", "Fenway Park", "Dodger Stadium", "Yankee Stadium", "b"],
      ["What is the MLB championship series traditionally called?", "The Summer Cup", "The Diamond Finals", "The Fall Classic", "The Spring Series", "c"],
      ["Which position is commonly numbered 6 on a baseball scorecard?", "Pitcher", "First baseman", "Center fielder", "Shortstop", "d"],
      ["What does a baseball scorekeeper typically record in a scorebook?", "Only the final score", "Stadium attendance only", "Each play and player result", "The umpire crew's schedule", "c"],
      ["How many players from each team are on the field when that team is playing defense in standard baseball?", "Eight", "Ten", "Eleven", "Nine", "d"],
      ["What is the name of MLB's annual exhibition game featuring selected players from each league?", "The World Series", "The Home Opener", "The All-Star Game", "The Pennant Game", "c"],
      ["Which U.S. city is home to the National Baseball Hall of Fame and Museum?", "Cooperstown, New York", "Canton, Ohio", "Omaha, Nebraska", "Springfield, Massachusetts", "a"]
    ]
  },
  {
    title: "Rainbow Six Siege: Core Tactics",
    topic: "Rainbow Six Siege",
    difficulty: "medium",
    timeLimit: 600,
    questions: [
      ["In a standard 5v5 Siege round, what are the two team roles?", "Scouts and Snipers", "Medics and Engineers", "Attackers and Defenders", "Police and Civilians", "c"],
      ["What tool do Attackers use during preparation to scout rooms and locate objectives?", "A heartbeat monitor", "A drone", "A reinforcement kit", "A defuser", "b"],
      ["What can Defenders use to strengthen eligible breakable walls and hatches?", "Reinforcements", "Barricades", "Breach charges", "Smoke grenades", "a"],
      ["In Bomb mode, what must Attackers plant to begin the bomb-disarm sequence?", "A signal jammer", "A drone", "A shield", "A defuser", "d"],
      ["What is a major tactical use of soft-destroyable walls and floors?", "They automatically reveal enemy positions", "They block all sound", "They can create new lines of sight and routes", "They prevent objective play", "c"],
      ["What do window and door barricades primarily do for Defenders?", "Reinforce every wall on the map", "Slow or signal an entry by Attackers", "Disable attacker drones across the map", "Mark the objective for teammates", "b"],
      ["What kind of match structure does Siege use in its standard multiplayer modes?", "Lap-based", "Open-world missions", "One uninterrupted life", "Round-based", "d"],
      ["Why is sound awareness useful in Siege?", "Sound identifies every operator by name", "Sound makes reinforcements indestructible", "Footsteps and actions can reveal nearby activity", "Sound replaces map knowledge", "c"],
      ["What is the Defenders' general goal during a round?", "Plant the defuser", "Protect the objective and stop the Attackers", "Destroy every wall", "Escort the Attackers", "b"],
      ["What is the Attackers' general goal during a round?", "Reach and complete the objective", "Reinforce the objective room", "Keep every Defender alive", "Avoid using drones", "a"]
    ]
  },
  {
    title: "Rainbow Six Siege: Operators & Gadgets",
    topic: "Rainbow Six Siege",
    difficulty: "hard",
    timeLimit: 900,
    questions: [
      ["Which Attacker is known for using the Exothermic Charge to breach reinforced surfaces?", "Sledge", "Thermite", "Rook", "Kapkan", "b"],
      ["Which Defender uses signal jammers to disrupt nearby remote electronics?", "Doc", "Ash", "Mute", "Thatcher", "c"],
      ["What is Sledge's breaching tool primarily used for?", "Electrifying reinforced walls", "Healing teammates", "Finding traps through walls", "Breaking soft surfaces", "d"],
      ["What does Rook provide to teammates at the start of a round?", "A defuser", "Armor plates", "Signal jammers", "Breaching charges", "b"],
      ["Which Defender is known for placing entry traps on doors and windows?", "Thermite", "Sledge", "Kapkan", "Thatcher", "c"],
      ["What is Doc's signature gadget used for?", "Healing or reviving teammates with stim shots", "Reinforcing walls", "Disabling drones", "Breaching ceilings", "a"],
      ["What is the main role of Thatcher's EMP grenades?", "Creating a soft breach", "Deploying armor plates", "Blocking a doorway with a shield", "Disrupting electronic gadgets", "d"],
      ["What do Bandit's batteries do when placed on compatible reinforced surfaces?", "Make them transparent", "Electrify them", "Heal nearby players", "Open them automatically", "b"],
      ["What is a key purpose of an operator's unique gadget?", "Replace the round objective", "Make the operator immune to damage", "Give that operator a specialized tactical tool", "Reveal the entire map permanently", "c"],
      ["When choosing an operator, what should a team consider?", "How the operator's role and gadget support the plan", "Only the operator's uniform color", "Whether the operator can avoid the objective", "How many walls the operator can reinforce alone", "a"]
    ]
  }
];

const legacySeedTitles = [
  "Curious Minds",
  "History Detectives",
  "Around the World",
  "Words & Worlds",
  "Future & Technology"
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const quiz of quizzes) {
      const created = await pool.query(
        `INSERT INTO quizzes (title, topic, difficulty, is_published, time_limit_seconds)
         VALUES ($1, $2, $3, TRUE, $4)
         ON CONFLICT (title) DO UPDATE SET topic = EXCLUDED.topic, difficulty = EXCLUDED.difficulty,
           time_limit_seconds = EXCLUDED.time_limit_seconds
         RETURNING id`,
        [quiz.title, quiz.topic, quiz.difficulty, quiz.timeLimit]
      );
      const quizId = created.rows[0].id;
      const existing = await pool.query("SELECT COUNT(*)::int AS count FROM questions WHERE quiz_id = $1", [quizId]);
      if (existing.rows[0].count > 0) continue;
      for (const [index, row] of quiz.questions.entries()) {
        await pool.query(
          `INSERT INTO questions (quiz_id, question_text, choice_a, choice_b, choice_c, choice_d, correct_choice, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [quizId, row[0], row[1], row[2], row[3], row[4], row[5], index + 1]
        );
      }
      console.log(`Seeded ${quiz.questions.length} questions for ${quiz.title}.`);
    }

    await pool.query(
      "UPDATE quizzes SET is_published = FALSE WHERE title = ANY($1::text[])",
      [legacySeedTitles]
    );
    console.log("Archived the previous example quiz set without deleting its questions or history.");

    if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
      const username = process.env.ADMIN_USERNAME.trim();
      const email = (process.env.ADMIN_EMAIL || `${username}@quiz.local`).trim().toLowerCase();
      if (username.length < 3 || process.env.ADMIN_PASSWORD.length < 12) {
        throw new Error("ADMIN_USERNAME must be at least 3 characters and ADMIN_PASSWORD at least 12 characters.");
      }
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
      await pool.query(
        `INSERT INTO users (username, email, password_hash, role)
         VALUES ($1, $2, $3, 'admin')
         ON CONFLICT (username) DO UPDATE SET role = 'admin'`,
        [username, email, hash]
      );
      console.log(`Admin account "${username}" is ready.`);
    } else {
      console.log("Set ADMIN_USERNAME, ADMIN_PASSWORD, and optionally ADMIN_EMAIL to create the first admin.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
