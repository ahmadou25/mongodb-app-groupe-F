import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB, getDB } from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

async function startServer() {
  // ⚡ Connecte la DB au démarrage
  const db = await connectDB();
  if (!db) {
    console.error("Impossible de se connecter à MongoDB. Arrêt du serveur.");
    process.exit(1);
  }

  // Routes
  app.get("/", async (req, res) => {
    try {
      const db = getDB(); // récupère la DB déjà connectée
      const collection = db.collection("documents");
      const docs = await collection.find({}).toArray();
      res.json(docs); // retourne JSON pour test
    } catch (error) {
      console.error(error);
      res.status(500).send("Erreur serveur");
    }
  });

  // Ici tu peux ajouter tes routes pour /api/auth etc.

  // Démarre le serveur
  app.listen(PORT, () => {
    console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
  });
}

// Lancement du serveur
startServer();
