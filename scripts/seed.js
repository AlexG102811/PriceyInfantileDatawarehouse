const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const quizzes = [
  {
    title: "Curious Minds",
    topic: "Science",
    difficulty: "easy",
    timeLimit: null,
    questions: [
      ["Which planet is known as the Red Planet?", "Venus", "Mars", "Jupiter", "Mercury", "b"],
      ["What gas do plants absorb from the air?", "Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen", "c"],
      ["What is the center of an atom called?", "Nucleus", "Cell", "Core", "Electron", "a"],
      ["How many legs does an insect have?", "Four", "Six", "Eight", "Ten", "b"],
      ["At what temperature does water freeze in Celsius?", "0°", "10°", "32°", "100°", "a"],
      ["Which organ pumps blood around the human body?", "Lung", "Brain", "Heart", "Kidney", "c"],
      ["What force pulls objects toward Earth?", "Friction", "Magnetism", "Gravity", "Pressure", "c"],
      ["Which part of a plant usually absorbs water?", "Flower", "Roots", "Leaves", "Stem", "b"],
      ["What is the closest star to Earth?", "Sirius", "The Sun", "Polaris", "Proxima Centauri", "b"],
      ["Which state of matter has a fixed shape and volume?", "Gas", "Liquid", "Plasma", "Solid", "d"]
    ]
  },
  {
    title: "History Detectives",
    topic: "World History",
    difficulty: "easy_medium",
    timeLimit: null,
    questions: [
      ["Which ancient civilization built the pyramids at Giza?", "Romans", "Ancient Egyptians", "Mayans", "Persians", "b"],
      ["In which year did World War II end?", "1918", "1939", "1945", "1950", "c"],
      ["Which city was divided by a wall during the Cold War?", "Berlin", "Paris", "Rome", "Vienna", "a"],
      ["Who was the first president of the United States?", "Thomas Jefferson", "John Adams", "George Washington", "James Madison", "c"],
      ["The Renaissance began in which country?", "Italy", "France", "England", "Greece", "a"],
      ["Which ship famously sank on its maiden voyage in 1912?", "Lusitania", "Titanic", "Mayflower", "Endeavour", "b"],
      ["The Magna Carta was signed in which country?", "Spain", "England", "Germany", "Portugal", "b"],
      ["Who was the first woman to fly solo across the Atlantic Ocean?", "Amelia Earhart", "Bessie Coleman", "Harriet Quimby", "Sally Ride", "a"],
      ["Which empire was ruled from the city of Tenochtitlan?", "Inca", "Aztec", "Mongol", "Ottoman", "b"],
      ["What was the name of the trade route linking China with the Mediterranean?", "Spice Road", "Amber Road", "Silk Road", "Royal Road", "c"]
    ]
  },
  {
    title: "Around the World",
    topic: "Geography",
    difficulty: "medium",
    timeLimit: 600,
    questions: [
      ["What is the capital of Japan?", "Kyoto", "Osaka", "Tokyo", "Sapporo", "c"],
      ["Which is the world's largest ocean?", "Atlantic", "Indian", "Arctic", "Pacific", "d"],
      ["The Andes mountains are primarily on which continent?", "Africa", "South America", "Asia", "Europe", "b"],
      ["Which river flows through Egypt?", "Nile", "Amazon", "Danube", "Yangtze", "a"],
      ["What is the smallest country in the world by area?", "Monaco", "San Marino", "Vatican City", "Liechtenstein", "c"],
      ["Which African country has the largest population?", "Egypt", "Ethiopia", "Nigeria", "South Africa", "c"],
      ["Mount Kilimanjaro is in which country?", "Kenya", "Tanzania", "Uganda", "Rwanda", "b"],
      ["Which strait separates Spain from Morocco?", "Bering Strait", "Strait of Hormuz", "Strait of Gibraltar", "Bosporus", "c"],
      ["What is the capital of Canada?", "Toronto", "Ottawa", "Vancouver", "Montreal", "b"],
      ["Which desert covers much of northern Africa?", "Gobi", "Kalahari", "Sahara", "Atacama", "c"]
    ]
  },
  {
    title: "Words & Worlds",
    topic: "Literature",
    difficulty: "hard",
    timeLimit: 720,
    questions: [
      ["Who wrote the novel '1984'?", "Aldous Huxley", "George Orwell", "Ray Bradbury", "H. G. Wells", "b"],
      ["In which Shakespeare play do Rosencrantz and Guildenstern appear?", "Macbeth", "King Lear", "Hamlet", "Othello", "c"],
      ["Who wrote 'One Hundred Years of Solitude'?", "Jorge Luis Borges", "Isabel Allende", "Gabriel García Márquez", "Pablo Neruda", "c"],
      ["Which novel begins with 'Call me Ishmael'?", "Moby-Dick", "The Old Man and the Sea", "Treasure Island", "The Scarlet Letter", "a"],
      ["Who created the fictional detective Hercule Poirot?", "Arthur Conan Doyle", "Agatha Christie", "Dorothy L. Sayers", "Dashiell Hammett", "b"],
      ["In Dante's 'Divine Comedy', who guides Dante through Paradise?", "Virgil", "Beatrice", "Lucia", "Francesca", "b"],
      ["Which author wrote 'Things Fall Apart'?", "Chinua Achebe", "Wole Soyinka", "Ngũgĩ wa Thiong'o", "Ben Okri", "a"],
      ["What is the name of the narrator in 'The Great Gatsby'?", "Jay Gatsby", "Tom Buchanan", "Nick Carraway", "George Wilson", "c"],
      ["Which epic poem tells of Odysseus's journey home?", "The Aeneid", "The Iliad", "The Odyssey", "Beowulf", "c"],
      ["Who wrote the play 'A Doll's House'?", "August Strindberg", "Henrik Ibsen", "Anton Chekhov", "Bertolt Brecht", "b"]
    ]
  },
  {
    title: "Future & Technology",
    topic: "Technology",
    difficulty: "expert",
    timeLimit: 900,
    questions: [
      ["What does HTTP stand for?", "HyperText Transfer Protocol", "High Transmission Text Process", "Hyperlink Transfer Program", "Host Text Transport Protocol", "a"],
      ["Which data structure follows first-in, first-out ordering?", "Stack", "Queue", "Tree", "Heap", "b"],
      ["What is the time complexity of binary search on a sorted array?", "O(1)", "O(n)", "O(log n)", "O(n²)", "c"],
      ["Which cryptographic algorithm is commonly used for password hashing?", "AES", "bcrypt", "RSA", "Diffie–Hellman", "b"],
      ["What does DNS translate domain names into?", "MAC addresses", "IP addresses", "Port numbers", "File paths", "b"],
      ["In a relational database, what uniquely identifies a row?", "Foreign key", "Index", "Primary key", "View", "c"],
      ["What is the main purpose of a CPU cache?", "Long-term storage", "Reduce access time to frequently used data", "Connect to a network", "Cool the processor", "b"],
      ["Which protocol provides encrypted web connections?", "FTP", "SMTP", "HTTPS", "Telnet", "c"],
      ["What does ACID describe in database transactions?", "Four network layers", "Transaction reliability properties", "A password format", "An encryption standard", "b"],
      ["Which machine-learning method learns by receiving rewards or penalties?", "Supervised learning", "Reinforcement learning", "Clustering", "Dimensionality reduction", "b"]
    ]
  }
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
