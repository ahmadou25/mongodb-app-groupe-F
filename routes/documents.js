const express = require("express");
const router = express.Router();
const connectDB = require("../db");
const { ObjectId } = require("mongodb");

let db;

router.use(async (req, res, next) => {
  if (!db) db = await connectDB();
  next();
});

// Liste de tous les documents
router.get("/", async (req, res) => {
  const docs = await db.collection("documents").find({}).toArray();
  res.json(docs);
});

// Emprunter / Retourner un document en utilisant FIELD9
router.post("/:id/toggle", async (req, res) => {
  const id = req.params.id;
  const doc = await db.collection("documents").findOne({ _id: new ObjectId(id) });
  if (!doc) return res.status(404).send("Document non trouvé");

  const newValue = doc.FIELD9 === "emprunté" ? "disponible" : "emprunté";
  await db.collection("documents").updateOne({ _id: doc._id }, { $set: { FIELD9: newValue } });

  res.json({ FIELD9: newValue });
});

module.exports = router;
