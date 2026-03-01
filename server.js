const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors({
  origin: "https://your-frontend-service.onrender.com", // Replace with your frontend URL
  methods: ["GET", "POST"],
}));
app.use(bodyParser.json());

// ============================================================
// 🔍 DEBUG: Print full directory structure on startup
// ============================================================
console.log("=== SERVER STARTUP DEBUG ===");
console.log("__dirname:", __dirname);
console.log("process.cwd():", process.cwd());

const dirsToCheck = [
  __dirname,
  path.join(__dirname, "frontend"),
  path.join(__dirname, "frontend/build"),
  path.join(__dirname, "../frontend/build"),
  path.join(process.cwd(), "frontend"),
  path.join(process.cwd(), "frontend/build"),
];

dirsToCheck.forEach((dir) => {
  const exists = fs.existsSync(dir);
  console.log(`\nDIR: ${dir}`);
  console.log(`  exists: ${exists}`);
  if (exists) {
    try {
      const contents = fs.readdirSync(dir);
      console.log(`  contents: [${contents.join(", ")}]`);
    } catch (e) {
      console.log(`  could not read: ${e.message}`);
    }
  }
});

console.log("\n=== END STARTUP DEBUG ===\n");
// ============================================================

// Ensure the database file exists
const dbPath = path.join(__dirname, "cleaning.db");
if (!fs.existsSync(dbPath)) {
  fs.closeSync(fs.openSync(dbPath, "w"));
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS history (
      week INTEGER,
      task TEXT,
      person TEXT,
      done INTEGER,
      PRIMARY KEY(week, task)
    )
  `);
});

// API routes FIRST
app.get("/history", (req, res) => {
  console.log("[GET /history] called");
  db.all("SELECT * FROM history", (err, rows) => {
    if (err) return res.status(500).send(err);
    const history = {};
    rows.forEach(({ week, task, person, done }) => {
      if (!history[week]) history[week] = {};
      history[week][task] = { person, done: !!done };
    });
    res.json(history);
  });
});

app.post("/history", (req, res) => {
  console.log("[POST /history] called with body:", req.body);
  const { week, task, person, done } = req.body;
  db.run(
    `INSERT INTO history (week, task, person, done)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(week, task) DO UPDATE SET person = ?, done = ?`,
    [week, task, person, done ? 1 : 0, person, done ? 1 : 0],
    function (err) {
      if (err) return res.status(500).send(err);
      res.json({ success: true });
    }
  );
});

// Try multiple possible build paths (Render working dir may differ)
const possibleBuildPaths = [
  path.join(__dirname, "frontend/build"),
  path.join(__dirname, "../frontend/build"),
  path.join(process.cwd(), "frontend/build"),
];

let buildPath = null;
for (const p of possibleBuildPaths) {
  if (fs.existsSync(p) && fs.existsSync(path.join(p, "index.html"))) {
    buildPath = p;
    console.log(`✅ Found build folder at: ${buildPath}`);
    break;
  } else {
    console.log(`❌ Build folder NOT found at: ${p}`);
  }
}

if (buildPath) {
  app.use(express.static(buildPath));
  app.get("*", (req, res) => {
    console.log(`[GET *] Serving index.html for: ${req.path}`);
    res.sendFile(path.join(buildPath, "index.html"));
  });
} else {
  console.error("🚨 No build folder found! Frontend will not be served.");
  // Fallback: show a diagnostic page so you can see the directory structure
  app.get("*", (req, res) => {
    res.status(500).send(`
      <h1>🚨 Build folder not found</h1>
      <p><strong>__dirname:</strong> ${__dirname}</p>
      <p><strong>cwd:</strong> ${process.cwd()}</p>
      <h2>Checked paths:</h2>
      <ul>${possibleBuildPaths.map((p) => `<li>${p} — exists: ${fs.existsSync(p)}</li>`).join("")}</ul>
      <h2>Contents of cwd:</h2>
      <pre>${JSON.stringify(fs.readdirSync(process.cwd()), null, 2)}</pre>
      <h2>Contents of __dirname:</h2>
      <pre>${JSON.stringify(fs.readdirSync(__dirname), null, 2)}</pre>
    `);
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n🚀 Server running on port ${PORT}`));