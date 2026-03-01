const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const db = new sqlite3.Database("./cleaning.db");

// Initialize table
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

// Get history for all weeks
app.get("/history", (req, res) => {
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

// Update task completion
app.post("/history", (req, res) => {
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

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));