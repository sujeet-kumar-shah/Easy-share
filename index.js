const express = require("express");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();
const shortid = require("shortid");
const path = require("path");

const app = express();
const port = 3000;

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// Set up SQLite database
const db = new sqlite3.Database("file_share.db");
db.run(
  "CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, fileName TEXT, fileType TEXT, textContent TEXT, timestamp INTEGER)",
);

// Set up view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Routes
app.get("/", (req, res) => {
  res.render("index");
});

// Middleware to delete old files
app.use((req, res, next) => {
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
  db.run(
    "DELETE FROM files WHERE timestamp < ?",
    [twentyFourHoursAgo],
    (err) => {
      if (err) {
        console.error("Error deleting old files:", err);
      }
    },
  );
  next();
});

app.post("/upload", upload.single("file"), (req, res) => {
  const id = shortid.generate();
  const fileName = req.file ? req.file.filename : null;
  const fileType = req.file ? req.file.mimetype : "text/plain";
  const textContent = req.body.text ? req.body.text : null;
  const timestamp = Date.now();

  db.run(
    "INSERT INTO files (id, fileName, fileType, textContent, timestamp) VALUES (?, ?, ?, ?, ?)",
    [id, fileName, fileType, textContent, timestamp],
    (err) => {
      if (err) {
        console.error(err);
        res.status(500).send("Error uploading file.");
      } else {
        res.redirect(`/file/${id}`);
      }
    },
  );
});

app.get("/file/:id", (req, res) => {
  const id = req.params.id;

  db.get("SELECT * FROM files WHERE id = ?", [id], (err, row) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error retrieving file.");
    } else {
      if (row) {
        res.render("file", { file: row });
      } else {
        res.status(404).send("File not found.");
      }
    }
  });
});

app.get("/download/:id", (req, res) => {
  const id = req.params.id;

  db.get("SELECT * FROM files WHERE id = ?", [id], (err, row) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error retrieving file.");
    } else {
      if (row) {
        const filePath = path.join(__dirname, "uploads", row.fileName);

        res.download(filePath, row.fileName, (err) => {
          if (err) {
            console.error(err);
            res.status(500).send("Error downloading file.");
          }
        });
      } else {
        res.status(404).send("File not found.");
      }
    }
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
