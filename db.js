import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGODB_URI;
let client = null;
let db = null;

/**
 * Connexion à MongoDB Atlas
 */
export async function connectDB() {
  if (db) return db; // déjà connecté

  try {
    console.log("🔄 Tentative de connexion à MongoDB Atlas...");

    // Options de connexion
    const options = {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    };

    client = new MongoClient(uri, options);
    await client.connect();

    // Tester la connexion
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Connexion MongoDB Atlas réussie !");

    // Utiliser la base 'bibliothequedb'
    db = client.db("bibliothequedb");
    console.log(`📁 Base de données: ${db.databaseName}`);

    // Initialisation des collections
    await ensureCollectionsExist();

    return db;

  } catch (err) {
    console.error("❌ Erreur de connexion MongoDB :", err.message);
    console.log("\n🔍 Vérifiez :");
    console.log("1. Mot de passe correct dans .env");
    console.log("2. Network Access autorisé (0.0.0.0/0) dans MongoDB Atlas");
    console.log("3. Attendre 1-2 minutes après les changements");
    return null;
  }
}

/**
 * Crée les collections si elles n'existent pas et insère des données d'exemple
 */
async function ensureCollectionsExist() {
  try {
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    console.log(`📚 Collections existantes: ${collectionNames.join(', ') || 'Aucune'}`);

    // Collection documents
    if (!collectionNames.includes("documents")) {
      await db.createCollection("documents");
      console.log("📄 Collection 'documents' créée");
      await insertSampleDocuments();
    }

    // Collection users
    if (!collectionNames.includes("users")) {
      await db.createCollection("users");
      console.log("👥 Collection 'users' créée");
    }

  } catch (error) {
    console.error("❌ Erreur lors de l'initialisation des collections:", error.message);
  }
}

/**
 * Insère des documents de test
 */
async function insertSampleDocuments() {
  const sampleDocuments = [
    {
      titre: "Le Petit Prince",
      auteur: "Antoine de Saint-Exupéry",
      type_de_document: "Livre",
      annee: 1943,
      disponible: true,
      reservations: 245,
      status: "disponible",
      emprunte_par: null,
      date_emprunt: null
    },
    {
      titre: "1984",
      auteur: "George Orwell",
      type_de_document: "Livre",
      annee: 1949,
      disponible: false,
      reservations: 189,
      status: "emprunté",
      emprunte_par: "étudiant001",
      date_emprunt: new Date("2024-01-20")
    },
    {
      titre: "Harry Potter à l'école des sorciers",
      auteur: "J.K. Rowling",
      type_de_document: "Livre",
      annee: 1997,
      disponible: true,
      reservations: 312,
      status: "disponible",
      emprunte_par: null,
      date_emprunt: null
    },
    {
      titre: "Introduction à MongoDB",
      auteur: "NoSQL Expert",
      type_de_document: "Livre technique",
      annee: 2023,
      disponible: true,
      reservations: 78,
      status: "disponible",
      emprunte_par: null,
      date_emprunt: null
    },
    {
      titre: "Node.js pour les débutants",
      auteur: "Développeur JS",
      type_de_document: "Livre",
      annee: 2022,
      disponible: false,
      reservations: 92,
      status: "emprunté",
      emprunte_par: "étudiant002",
      date_emprunt: new Date("2024-01-25")
    }
  ];

  try {
    const result = await db.collection("documents").insertMany(sampleDocuments);
    console.log(`📚 ${result.insertedCount} documents de test insérés`);
  } catch (error) {
    console.error("❌ Erreur insertion documents:", error.message);
  }
}

/**
 * Récupère la DB (après connexion)
 */
export function getDB() {
  if (!db) {
    throw new Error("Base de données non connectée. Appelez connectDB() d'abord.");
  }
  return db;
}

/**
 * Fermer la connexion
 */
export async function closeDB() {
  if (client) {
    await client.close();
    console.log("🔌 Connexion MongoDB fermée");
    client = null;
    db = null;
  }
}

/**
 * Test rapide de connexion
 */
export async function testConnection() {
  try {
    const testClient = new MongoClient(uri);
    await testClient.connect();
    console.log("✅ Test de connexion MongoDB réussi");
    await testClient.close();
    return true;
  } catch (error) {
    console.error("❌ Test de connexion échoué:", error.message);
    return false;
  }
}
