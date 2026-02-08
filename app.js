import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "./db.js";

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", async (req, res) => {
  const db = await connectDB();
  const collection = db.collection("documents"); // Nom de ta collection

  const docs = await collection.find({}).toArray(); // Récupère tous les documents
  console.log(docs); // Vérifie si tu reçois bien les documents dans la console

  // Pour l'instant on envoie juste JSON dans le navigateur
  res.send(docs);
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});
