const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors({
  origin: "https://flat-jobs-app-production.up.railway.app/", // Replace with your frontend URL
  methods: ["GET", "POST"],
}));
app.use(bodyParser.json());


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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`\n🚀 Server running on port ${PORT}`));