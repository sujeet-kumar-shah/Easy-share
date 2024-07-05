const express = require("express");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();
const shortid = require("shortid");
const path = require("path");
const mammoth = require("mammoth");
const { PDFDocument } = require("pdf-lib");
const { Document, Packer, Paragraph } = require("docx");
const fs = require("fs");

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
db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, fileName TEXT, fileType TEXT, textContent TEXT, timestamp INTEGER)",
  );
});

// Set up view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

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
      next();
    },
  );
});

// Routes
app.get("/", (req, res) => {
  res.render("index");
});

app.get("/contact", (req, res) => {
  res.render("contact.ejs");
});

app.get("/converter", (req, res) => {
  res.render("converter.ejs");
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
        res.render("file", {
          file: row,
          protocol: req.protocol,
          host: req.get("host"),
        });
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
        if (row.fileName) {
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
      } else {
        res.status(404).send("File not found.");
      }
    }
  });
});

app.post("/converter", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  const filePath = path.join(__dirname, "uploads", req.file.filename);
  const ext = path.extname(req.file.originalname).toLowerCase();
  const newFileName = `${shortid.generate()}${ext === ".pdf" ? ".docx" : ".pdf"}`;
  const newFilePath = path.join(__dirname, "uploads", newFileName);

  try {
    if (ext === ".pdf") {
      // PDF to DOCX
      const pdfDoc = await PDFDocument.load(fs.readFileSync(filePath));
      const text = await pdfDoc.getTextContent();
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: text.items.map((item) => new Paragraph(item.str)),
          },
        ],
      });
      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(newFilePath, buffer);
    } else if (ext === ".docx") {
      // DOCX to PDF
      const result = await mammoth.extractRawText({ path: filePath });
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      page.drawText(result.value);
      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(newFilePath, pdfBytes);
    } else {
      return res.status(400).send("Unsupported file type.");
    }

    res.download(newFilePath, newFileName, (err) => {
      if (err) {
        console.error(err);
        res.status(500).send("Error converting file.");
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing file.");
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
