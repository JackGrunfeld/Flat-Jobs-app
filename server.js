const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");

const app = express();

// ===== MIDDLEWARE =====
app.use(cors()); // Since frontend is served together, no need for strict origin
app.use(bodyParser.json());

// ===== DATABASE =====
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

// ===== API ROUTES =====
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

// ===== SERVE REACT FRONTEND =====
const frontendPath = path.join(__dirname, "frontend/build");
app.use(express.static(frontendPath));

// Redirect all non-API routes to React's index.html (React Router safe)
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// ===== START SERVER =====
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));