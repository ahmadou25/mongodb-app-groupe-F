import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

// Votre URI complète avec mot de passe
const uri = process.env.MONGODB_URI;

let client = null;
let db = null;

export async function connectDB() {
  try {
    if (!client) {
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
    }
    
    // Utiliser la base 'bibliothequedb'
    db = client.db("bibliothequedb");
    console.log(`📁 Base de données: ${db.databaseName}`);
    
    // Vérifier et créer la collection si nécessaire
    await ensureCollectionExists();
    
    return db;
    
  } catch (err) {
    console.error("❌ Erreur de connexion MongoDB :", err.message);
    console.log("\n🔍 Dépannage :");
    console.log("1. Vérifiez votre mot de passe dans .env");
    console.log("2. Allez sur MongoDB Atlas → Network Access");
    console.log("3. Ajoutez 'Allow Access From Anywhere' (0.0.0.0/0)");
    console.log("4. Attendez 1-2 minutes que les changements prennent effet");
    return null;
  }
}

async function ensureCollectionExists() {
  try {
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    console.log(`📚 Collections disponibles: ${collectionNames.join(', ') || 'Aucune'}`);
    
    // Créer la collection 'documents' si elle n'existe pas
    if (!collectionNames.includes("documents")) {
      await db.createCollection("documents");
      console.log("📄 Collection 'documents' créée");
      
      // Insérer des données d'exemple
      await insertSampleData();
    } else {
      // Vérifier le nombre de documents
      const count = await db.collection("documents").countDocuments();
      console.log(`📖 ${count} documents dans la collection`);
    }
    
    // Créer la collection 'users' pour plus tard
    if (!collectionNames.includes("users")) {
      await db.createCollection("users");
      console.log("👥 Collection 'users' créée");
    }
    
  } catch (error) {
    console.error("Erreur lors de l'initialisation:", error.message);
  }
}

async function insertSampleData() {
  const sampleDocuments = [
    {
      titre: "Le Petit Prince",
      auteur: "Antoine de Saint-Exupéry",
      type_de_document: "Livre",
      annee: 1943,
      disponible: true,
      reservations: 245,
      FIELD9: "disponible",
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
      FIELD9: "emprunté",
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
      FIELD9: "disponible",
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
      FIELD9: "disponible",
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
      FIELD9: "emprunté",
      emprunte_par: "étudiant002",
      date_emprunt: new Date("2024-01-25")
    }
  ];
  
  try {
    const result = await db.collection("documents").insertMany(sampleDocuments);
    console.log(`📚 ${result.insertedCount} documents d'exemple insérés`);
  } catch (error) {
    console.error("Erreur insertion données:", error.message);
  }
}

export function getDB() {
  if (!db) {
    throw new Error("Base de données non connectée. Appelez connectDB() d'abord.");
  }
  return db;
}

export async function closeDB() {
  if (client) {
    await client.close();
    console.log("🔌 Connexion MongoDB fermée");
    client = null;
    db = null;
  }
}

// Test rapide de connexion (optionnel)
export async function testConnection() {
  try {
    const testClient = new MongoClient(uri);
    await testClient.connect();
    console.log("✅ Test de connexion réussi");
    await testClient.close();
    return true;
  } catch (error) {
    console.error("❌ Test de connexion échoué:", error.message);
    return false;
  }
}