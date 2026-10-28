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
  },
  {
    title: "Baseball: Advanced Rules & Situations",
    topic: "Baseball",
    difficulty: "hard",
    timeLimit: null,
    questions: [
      ["With fewer than two outs and runners on first and second, an umpire calls an infield fly. What is the result?", "The batter is out and runners may advance at their own risk", "The ball is dead and every runner must return", "The batter may run to first if the ball drops", "The call is valid only after two outs", "a"],
      ["When may a batter try to reach first after an uncaught third strike?", "Only when the catcher throws the ball away", "When first base is unoccupied or there are two outs", "Only with a runner on third", "Whenever the pitch is in the dirt", "b"],
      ["With runners on base, what is the usual effect of a balk?", "The batter is automatically out", "The defense may replace its pitcher", "Each runner is awarded one base", "The count resets to no balls and no strikes", "c"],
      ["A runner tags up and scores on a caught fly ball with fewer than two outs. What may the batter be credited with?", "A fielder's choice", "A sacrifice fly", "A stolen base", "A ground-rule double", "b"],
      ["A batter becomes a runner and forces the runner from first to advance. How can the defense retire that runner at second on a force play?", "Tag the runner before the ball is hit", "Touch second base with the ball before the runner arrives", "Touch first base after the batter reaches it", "Throw the ball to the pitcher", "b"],
      ["After a fielder catches a fly ball, what must a runner do before advancing from their original base?", "Wait for the next pitch", "Touch home plate", "Retouch the original base after the catch", "Ask the umpire for permission", "c"],
      ["What is the main purpose of a pitcher's pickoff attempt?", "Make the batter leave the box", "Force a foul ball", "End a half-inning automatically", "Catch a runner too far from a base", "d"],
      ["With two strikes, what happens when a batter bunts the pitch foul?", "The count stays at two strikes", "The batter is awarded first base", "The batter is out on a third strike", "The foul ball becomes fair", "c"],
      ["What makes a force out different from a tag out?", "A force out requires the runner to touch home", "On a force play, touching the base with the ball can retire the runner", "A force out can only happen in the outfield", "A tag out does not require the ball", "b"],
      ["A runner leaves a base before a fly ball is caught. What must the runner do to avoid being doubled off?", "Run directly to the next base", "Wait for the ball to reach the infield", "Touch the pitcher's plate", "Return and retouch the base before advancing", "d"]
    ]
  },
  {
    title: "Baseball: Stats & Scoring Challenge",
    topic: "Baseball",
    difficulty: "hard",
    timeLimit: null,
    questions: [
      ["How is WHIP calculated?", "Home runs plus strikeouts per game", "Walks plus hits allowed, divided by innings pitched", "Wins divided by innings pitched", "Earned runs plus walks, divided by batters faced", "b"],
      ["What does OPS add together?", "Batting average and earned run average", "Hits and runs scored", "On-base percentage and slugging percentage", "Walks and strikeouts", "c"],
      ["What does a pitcher's ERA represent?", "Total runs allowed per start", "Earned runs allowed per nine innings", "Strikeouts per nine innings", "Walks allowed per game", "b"],
      ["How is slugging percentage calculated?", "Hits divided by at-bats", "Runs divided by plate appearances", "Home runs divided by hits", "Total bases divided by at-bats", "d"],
      ["Which set of outcomes contributes to a batter reaching base for on-base percentage?", "Hits, errors, and stolen bases", "Runs, walks, and strikeouts", "Hits, walks, and hit-by-pitches", "Hits, sacrifice bunts, and caught stealing", "c"],
      ["A hitter gets two singles and one double. How many total bases did the hitter earn?", "Four", "Three", "Six", "Five", "a"],
      ["What is the key difference between a perfect game and a no-hitter?", "A perfect game allows walks but no hits", "In a perfect game, no opposing batter reaches base", "A no-hitter requires no baserunners of any kind", "A perfect game is always shorter than nine innings", "b"],
      ["A batter reaches first because a fielder makes an error. How is that normally scored?", "As a hit and an at-bat", "As a walk", "As a hit-by-pitch", "Not as a hit; it generally counts as an at-bat", "d"],
      ["How many total bases does a home run count for in slugging percentage?", "One", "Two", "Four", "Three", "c"],
      ["A batter has one single, one double, and one home run in four at-bats. What is the slugging percentage?", "1.000", "1.500", "1.750", "2.000", "c"]
    ]
  },
  {
    title: "Rainbow Six Siege: Advanced Map Control",
    topic: "Rainbow Six Siege",
    difficulty: "hard",
    timeLimit: 900,
    questions: [
      ["What does vertical play use to pressure a site from another floor?", "Drones to map a different floor", "A reinforcement placed on a doorway", "Destructible floors or ceilings", "A second defuser", "c"],
      ["Why should attackers try to keep some drones alive after the preparation phase?", "Drones can reinforce walls", "A live drone can provide information later in the round", "A drone can plant the defuser", "A live drone prevents defenders from roaming", "b"],
      ["What does a roam clear aim to accomplish?", "Reinforce every wall on the map", "Move the objective to another room", "Use all attacker gadgets before entering", "Locate and displace defenders playing away from the objective", "d"],
      ["What is the purpose of a flank watch during an execute?", "Monitor routes defenders could use to approach from behind", "Reveal every defender through walls", "Prevent attackers from using their drones", "Keep the defuser in the preparation phase", "a"],
      ["What is a crossfire?", "Every teammate entering through the same doorway", "A defender reinforcing a soft wall", "Two teammates covering an area from different angles", "An attacker using a drone and a breach charge at once", "c"],
      ["After the defuser is planted, what is the attackers' main priority?", "Leave the building immediately", "Destroy every remaining reinforcement", "Pick up every unused gadget", "Protect access to the planted defuser and stop defenders disabling it", "d"],
      ["What does creating a rotation hole between defensive positions help a team do?", "Make reinforced walls indestructible", "Move between connected areas without using a doorway", "Prevent all sound from traveling", "Guarantee that attackers cannot enter the site", "b"],
      ["What does gaining map control generally give attackers?", "Safer routes, useful information, and pressure on defender rotations", "A guaranteed round win", "The ability to disable the round timer", "Automatic control of the objective", "a"],
      ["Why is it useful to drone an entry before an attacker commits to it?", "It makes the entry impossible to defend", "It prevents all defender gadgets from activating", "It automatically clears the room", "It can reveal immediate threats and help choose a safer entry", "d"],
      ["What is a common purpose of clearing defender utility before a coordinated push?", "Make the attackers invisible", "Extend the round timer", "Reduce the gadgets and obstacles that could stop the execute", "Force defenders to select new operators", "c"]
    ]
  },
  {
    title: "Rainbow Six Siege: Team Coordination Challenge",
    topic: "Rainbow Six Siege",
    difficulty: "hard",
    timeLimit: 900,
    questions: [
      ["What is a trade after a teammate is eliminated?", "Switching to a different operator mid-round", "Taking turns reinforcing the same wall", "Eliminating the opponent who just eliminated that teammate", "Using a drone to watch the preparation phase", "c"],
      ["Why should a team communicate enemy locations and gadget information?", "It increases every operator's health", "Shared information helps teammates make coordinated decisions", "It reveals the full map automatically", "It pauses the round timer", "b"],
      ["What is a key risk of all attackers entering through one predictable doorway?", "The defuser stops working", "The objective moves to another site", "Their drones become unusable", "They can be funneled into the same defended angles", "d"],
      ["What does anchoring describe for a defender?", "Staying on or near the objective site to defend it", "Attacking from outside the building", "Following an attacker drone around the map", "Leaving the objective undefended to chase eliminations", "a"],
      ["When should attackers generally attempt a defuser plant?", "Before scouting any nearby threats", "Only after every defender is eliminated", "When they have enough control and cover to protect the planting area", "As soon as the round starts, regardless of position", "c"],
      ["What is utility clearing intended to do before an execute?", "Restore defender gadgets", "Remove, disable, or use up defensive gadgets that could disrupt the push", "Replace the objective with a new one", "Stop attackers from making callouts", "b"],
      ["Why might attackers use soft destruction near an objective?", "To reinforce the site from outside", "To prevent teammates from rotating", "To make every wall indestructible", "To create sightlines or routes through destructible surfaces", "d"],
      ["What does a teammate watching a flank help prevent?", "An attacker drone reaching the site", "The defuser being planted", "A defender rotating into the attacking group unnoticed", "A reinforcement being placed", "c"],
      ["Why can a coordinated execute be stronger than several unconnected individual pushes?", "Teammates can apply pressure from multiple angles at the same time", "It removes the need to identify the objective", "It guarantees all gadgets are available", "It disables friendly fire", "a"],
      ["When the round is nearly over, what should attackers prioritize?", "Continuing to explore unrelated rooms", "A timely, coordinated attempt to complete the objective", "Saving every gadget for the next round", "Waiting outside until the round timer ends", "b"]
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
