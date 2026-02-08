import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient, ObjectId } from "mongodb";
import session from "express-session";
import "dotenv/config";

// Configuration ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'uel315_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24h
  }
}));

// Fonction de hash simple pour le projet (pas bcrypt pour éviter problèmes)
function hashPassword(password) {
  return Buffer.from(password + process.env.SESSION_SECRET).toString('base64');
}

function comparePassword(password, hashed) {
  return hashPassword(password) === hashed;
}

// Variable pour stocker la connexion DB
let db = null;
let client = null;

// Connexion à MongoDB
async function connectDB() {
  try {
    const uri = process.env.MONGODB_URI;
    
    client = new MongoClient(uri);
    await client.connect();
    db = client.db("bibliothequedb");
    console.log("✅ Connecté à MongoDB Atlas");
    
    // Initialiser les données
    await initializeDefaultData();
    
    return db;
  } catch (error) {
    console.error("❌ Erreur de connexion MongoDB:", error.message);
    return null;
  }
}

async function initializeDefaultData() {
  try {
    // Créer la collection utilisateurs si elle n'existe pas
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    if (!collectionNames.includes('utilisateurs')) {
      await db.createCollection('utilisateurs');
      console.log("✅ Collection 'utilisateurs' créée");
    }
    
    if (!collectionNames.includes('emprunts')) {
      await db.createCollection('emprunts');
      console.log("✅ Collection 'emprunts' créée");
    }
    
    // Vérifier si l'admin existe
    const adminExists = await db.collection('utilisateurs').findOne({ 
      email: 'admin@mediatheque.fr' 
    });
    
    if (!adminExists) {
      await db.collection('utilisateurs').insertOne({
        nom: 'Administrateur',
        email: 'admin@mediatheque.fr',
        password: hashPassword('admin123'),
        role: 'admin',
        date_creation: new Date(),
        limite_emprunts: 999,
        emprunts_actuels: 0
      });
      console.log("✅ Compte admin créé (admin@mediatheque.fr / admin123)");
    }
    
    // Créer un utilisateur test
    const userExists = await db.collection('utilisateurs').findOne({ 
      email: 'user@test.fr' 
    });
    
    if (!userExists) {
      await db.collection('utilisateurs').insertOne({
        nom: 'Utilisateur Test',
        email: 'user@test.fr',
        password: hashPassword('user123'),
        role: 'user',
        date_creation: new Date(),
        limite_emprunts: 3,
        emprunts_actuels: 0
      });
      console.log("✅ Compte test créé (user@test.fr / user123)");
    }
    
  } catch (error) {
    console.log("⚠️  Note: " + error.message);
  }
}

// Middleware d'authentification
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ 
      success: false, 
      error: 'Veuillez vous connecter' 
    });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      error: 'Accès administrateur requis' 
    });
  }
  next();
}

// ==================== ROUTES ====================

// Page d'accueil
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Page login
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Page admin
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Test de santé
app.get("/api/health", async (req, res) => {
  try {
    const status = {
      success: true,
      status: "OK",
      timestamp: new Date().toISOString(),
      server: "Express/Node.js",
      mongodb: db ? "connected" : "disconnected",
      database: "bibliothequedb",
      port: PORT,
      session: req.session.userId ? "authenticated" : "anonymous"
    };
    res.json(status);
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ==================== AUTHENTIFICATION ====================

// Inscription
app.post("/api/auth/register", async (req, res) => {
  try {
    if (!db) db = await connectDB();
    
    const { nom, email, password } = req.body;
    
    if (!nom || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tous les champs sont requis' 
      });
    }
    
    if (password.length < 3) {
      return res.status(400).json({ 
        success: false, 
        error: 'Mot de passe trop court' 
      });
    }
    
    const userExists = await db.collection('utilisateurs').findOne({ email });
    if (userExists) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email déjà utilisé' 
      });
    }
    
    const result = await db.collection('utilisateurs').insertOne({
      nom,
      email,
      password: hashPassword(password),
      role: 'user',
      date_creation: new Date(),
      limite_emprunts: 3,
      emprunts_actuels: 0
    });
    
    res.json({
      success: true,
      message: 'Compte créé avec succès',
      userId: result.insertedId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Connexion
app.post("/api/auth/login", async (req, res) => {
  try {
    if (!db) db = await connectDB();
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email et mot de passe requis' 
      });
    }
    
    const user = await db.collection('utilisateurs').findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Email ou mot de passe incorrect' 
      });
    }
    
    if (!comparePassword(password, user.password)) {
      return res.status(401).json({ 
        success: false, 
        error: 'Email ou mot de passe incorrect' 
      });
    }
    
    // Session
    req.session.userId = user._id.toString();
    req.session.email = user.email;
    req.session.nom = user.nom;
    req.session.role = user.role;
    
    res.json({
      success: true,
      message: 'Connexion réussie',
      user: {
        id: user._id,
        nom: user.nom,
        email: user.email,
        role: user.role,
        limite_emprunts: user.limite_emprunts,
        emprunts_actuels: user.emprunts_actuels || 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Déconnexion
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: 'Déconnecté' });
});

// Profil utilisateur
app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    if (!db) db = await connectDB();
    
    const user = await db.collection('utilisateurs').findOne({
      _id: new ObjectId(req.session.userId)
    });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'Utilisateur non trouvé' 
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        nom: user.nom,
        email: user.email,
        role: user.role,
        limite_emprunts: user.limite_emprunts,
        emprunts_actuels: user.emprunts_actuels || 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== DOCUMENTS ====================

// Récupérer tous les documents
app.get("/api/documents", async (req, res) => {
  try {
    if (!db) db = await connectDB();
    const documents = await db.collection("documents").find().toArray();
    res.json({
      success: true,
      count: documents.length,
      documents: documents
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Emprunter un document
app.post("/api/documents/:id/emprunter", requireAuth, async (req, res) => {
  try {
    if (!db) db = await connectDB();
    
    const userId = new ObjectId(req.session.userId);
    const documentId = new ObjectId(req.params.id);
    
    // Vérifier l'utilisateur
    const user = await db.collection('utilisateurs').findOne({ _id: userId });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'Utilisateur non trouvé' 
      });
    }
    
    // Vérifier limite
    if (user.emprunts_actuels >= user.limite_emprunts) {
      return res.status(400).json({ 
        success: false, 
        error: `Limite d'emprunts atteinte (${user.limite_emprunts})` 
      });
    }
    
    // Vérifier document disponible
    const document = await db.collection("documents").findOne({ 
      _id: documentId,
      FIELD9: "disponible" 
    });
    
    if (!document) {
      return res.status(400).json({ 
        success: false, 
        error: "Document non disponible" 
      });
    }
    
    // Date de retour (30 jours)
    const dateRetour = new Date();
    dateRetour.setDate(dateRetour.getDate() + 30);
    
    // Mettre à jour document
    await db.collection("documents").updateOne(
      { _id: documentId },
      { 
        $set: { 
          FIELD9: "emprunté",
          disponible: false,
          emprunte_par: user.email,
          date_emprunt: new Date()
        },
        $inc: { reservations: 1 }
      }
    );
    
    // Créer emprunt
    await db.collection("emprunts").insertOne({
      document_id: documentId,
      document_titre: document.titre,
      utilisateur_id: userId,
      utilisateur_email: user.email,
      date_emprunt: new Date(),
      date_retour_prevu: dateRetour,
      date_retour_reel: null,
      statut: 'emprunté'
    });
    
    // Mettre à jour compteur utilisateur
    await db.collection("utilisateurs").updateOne(
      { _id: userId },
      { $inc: { emprunts_actuels: 1 } }
    );
    
    res.json({
      success: true,
      message: `Document emprunté. Retour avant le ${dateRetour.toLocaleDateString('fr-FR')}`
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Retourner un document
app.post("/api/documents/:id/retourner", requireAuth, async (req, res) => {
  try {
    if (!db) db = await connectDB();
    
    const userId = new ObjectId(req.session.userId);
    const documentId = new ObjectId(req.params.id);
    
    // Vérifier emprunt
    const emprunt = await db.collection("emprunts").findOne({
      document_id: documentId,
      utilisateur_id: userId,
      statut: 'emprunté'
    });
    
    if (!emprunt) {
      return res.status(400).json({ 
        success: false, 
        error: "Vous n'avez pas emprunté ce document" 
      });
    }
    
    // Mettre à jour document
    await db.collection("documents").updateOne(
      { _id: documentId },
      { 
        $set: { 
          FIELD9: "disponible",
          disponible: true,
          emprunte_par: null,
          date_emprunt: null
        }
      }
    );
    
    // Mettre à jour emprunt
    await db.collection("emprunts").updateOne(
      { _id: emprunt._id },
      { 
        $set: { 
          date_retour_reel: new Date(),
          statut: 'retourné'
        }
      }
    );
    
    // Mettre à jour compteur utilisateur
    await db.collection("utilisateurs").updateOne(
      { _id: userId },
      { $inc: { emprunts_actuels: -1 } }
    );
    
    res.json({
      success: true,
      message: "Document retourné avec succès"
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Statistiques
app.get("/api/stats", async (req, res) => {
  try {
    if (!db) db = await connectDB();
    
    const total = await db.collection("documents").countDocuments();
    const disponibles = await db.collection("documents").countDocuments({ 
      FIELD9: "disponible" 
    });
    const empruntes = await db.collection("documents").countDocuments({ 
      FIELD9: "emprunté" 
    });
    
    // Total réservations
    const aggResult = await db.collection("documents").aggregate([
      { $group: { _id: null, totalReservations: { $sum: "$reservations" } } }
    ]).toArray();
    
    const totalReservations = aggResult[0] ? aggResult[0].totalReservations : 0;

    res.json({
      success: true,
      stats: {
        total,
        disponibles,
        empruntes,
        totalReservations
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== ADMIN ====================

// Dashboard admin
app.get("/api/admin/dashboard", requireAdmin, async (req, res) => {
  try {
    if (!db) db = await connectDB();
    
    const totalDocuments = await db.collection("documents").countDocuments();
    const documentsDisponibles = await db.collection("documents").countDocuments({ 
      FIELD9: "disponible" 
    });
    const totalUtilisateurs = await db.collection("utilisateurs").countDocuments();
    const empruntsEnCours = await db.collection("emprunts").countDocuments({ 
      statut: 'emprunté' 
    });
    
    // Emprunts en retard
    const aujourdhui = new Date();
    const empruntsRetard = await db.collection("emprunts").countDocuments({
      statut: 'emprunté',
      date_retour_prevu: { $lt: aujourdhui }
    });
    
    res.json({
      success: true,
      dashboard: {
        totalDocuments,
        documentsDisponibles,
        totalUtilisateurs,
        empruntsEnCours,
        empruntsRetard
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Liste utilisateurs
app.get("/api/admin/utilisateurs", requireAdmin, async (req, res) => {
  try {
    if (!db) db = await connectDB();
    
    const utilisateurs = await db.collection("utilisateurs").find({}, {
      projection: { password: 0 }
    }).toArray();
    
    res.json({
      success: true,
      utilisateurs: utilisateurs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Ajouter document (admin)
app.post("/api/admin/documents", requireAdmin, async (req, res) => {
  try {
    if (!db) db = await connectDB();
    
    const { titre, auteur, type_de_document, annee } = req.body;
    
    if (!titre || !auteur) {
      return res.status(400).json({ 
        success: false, 
        error: 'Titre et auteur requis' 
      });
    }
    
    const document = {
      titre,
      auteur,
      type_de_document: type_de_document || 'Livre',
      annee: annee || new Date().getFullYear(),
      disponible: true,
      FIELD9: "disponible",
      reservations: 0,
      emprunte_par: null,
      date_emprunt: null,
      date_ajout: new Date()
    };
    
    const result = await db.collection("documents").insertOne(document);
    
    res.json({
      success: true,
      message: 'Document ajouté',
      documentId: result.insertedId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== UTILISATEUR ====================

// Mes emprunts
app.get("/api/utilisateur/emprunts", requireAuth, async (req, res) => {
  try {
    if (!db) db = await connectDB();
    
    const userId = new ObjectId(req.session.userId);
    
    const emprunts = await db.collection("emprunts").find({
      utilisateur_id: userId,
      statut: 'emprunté'
    }).sort({ date_emprunt: -1 }).toArray();
    
    res.json({
      success: true,
      emprunts: emprunts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== PAGES HTML ====================

// Page documents HTML
app.get("/documents-page", async (req, res) => {
  try {
    if (!db) db = await connectDB();
    const documents = await db.collection("documents").find().toArray();
    
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Documents - Médiathèque</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f8f9fa; }
          .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
          .header { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .doc-card { background: white; border-radius: 8px; padding: 15px; margin-bottom: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
          .dispo { color: green; font-weight: bold; }
          .empr { color: red; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="text-2xl font-bold text-gray-800 mb-2">
              <i class="fas fa-book mr-2"></i>Documents de la Médiathèque
            </h1>
            <p class="text-gray-600">${documents.length} documents trouvés</p>
            <a href="/" class="inline-block mt-4 text-blue-500 hover:text-blue-700">
              <i class="fas fa-arrow-left mr-1"></i>Retour à l'accueil
            </a>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    `;
    
    documents.forEach(doc => {
      const isAvailable = doc.FIELD9 === 'disponible';
      html += `
            <div class="doc-card">
              <h3 class="font-bold text-lg mb-2">${doc.titre || 'Sans titre'}</h3>
              <p class="text-gray-600 mb-2">${doc.auteur || 'Auteur inconnu'}</p>
              <div class="text-sm text-gray-500 space-y-1">
                <p><i class="fas fa-tag mr-2"></i>${doc.type_de_document || 'Non spécifié'}</p>
                <p><i class="fas fa-calendar mr-2"></i>${doc.annee || 'N/A'}</p>
                <p><i class="fas fa-chart-line mr-2"></i>${doc.reservations || 0} réservations</p>
                <p class="${isAvailable ? 'dispo' : 'empr'}">
                  <i class="fas ${isAvailable ? 'fa-check-circle' : 'fa-user-clock'} mr-2"></i>
                  ${isAvailable ? 'Disponible' : 'Emprunté'}
                </p>
              </div>
            </div>
      `;
    });
    
    html += `
          </div>
          <div class="mt-8 text-center text-gray-500 text-sm">
            <p>Généré le ${new Date().toLocaleString('fr-FR')}</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    res.send(html);
  } catch (error) {
    res.status(500).send(`<h1>Erreur</h1><p>${error.message}</p>`);
  }
});

// Page statistiques HTML
app.get("/stats-page", async (req, res) => {
  try {
    if (!db) db = await connectDB();
    
    const total = await db.collection("documents").countDocuments();
    const disponibles = await db.collection("documents").countDocuments({ FIELD9: "disponible" });
    const empruntes = await db.collection("documents").countDocuments({ FIELD9: "emprunté" });
    
    const aggResult = await db.collection("documents").aggregate([
      { $group: { _id: null, totalReservations: { $sum: "$reservations" } } }
    ]).toArray();
    
    const totalReservations = aggResult[0] ? aggResult[0].totalReservations : 0;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Statistiques - Médiathèque</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f8f9fa; }
          .container { max-width: 800px; margin: 0 auto; padding: 20px; }
          .stat-card { background: white; border-radius: 10px; padding: 25px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
          .stat-number { font-size: 3rem; font-weight: bold; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="text-center mb-8">
            <h1 class="text-3xl font-bold text-gray-800 mb-2">
              <i class="fas fa-chart-bar mr-2"></i>Statistiques de la Médiathèque
            </h1>
            <p class="text-gray-600">Vue d'ensemble des documents</p>
            <a href="/" class="inline-block mt-4 text-blue-500 hover:text-blue-700">
              <i class="fas fa-arrow-left mr-1"></i>Retour à l'accueil
            </a>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="stat-card border-l-4 border-blue-500">
              <h3 class="text-gray-600 mb-2">Total Documents</h3>
              <div class="stat-number text-blue-600">${total}</div>
              <p class="text-gray-500">Documents dans la base</p>
            </div>
            
            <div class="stat-card border-l-4 border-green-500">
              <h3 class="text-gray-600 mb-2">Disponibles</h3>
              <div class="stat-number text-green-600">${disponibles}</div>
              <p class="text-gray-500">Documents disponibles</p>
            </div>
            
            <div class="stat-card border-l-4 border-yellow-500">
              <h3 class="text-gray-600 mb-2">Empruntés</h3>
              <div class="stat-number text-yellow-600">${empruntes}</div>
              <p class="text-gray-500">Documents empruntés</p>
            </div>
            
            <div class="stat-card border-l-4 border-purple-500">
              <h3 class="text-gray-600 mb-2">Réservations totales</h3>
              <div class="stat-number text-purple-600">${totalReservations}</div>
              <p class="text-gray-500">Nombre total de réservations</p>
            </div>
          </div>
          
          <div class="mt-8 text-center text-gray-500 text-sm">
            <p>Généré le ${new Date().toLocaleString('fr-FR')}</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    res.send(html);
  } catch (error) {
    res.status(500).send(`<h1>Erreur</h1><p>${error.message}</p>`);
  }
});

// Page santé HTML
app.get("/health-page", async (req, res) => {
  const isDBConnected = db ? true : false;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Santé - Médiathèque</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f8f9fa; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .status-card { background: white; border-radius: 10px; padding: 25px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-gray-800 mb-2">
            <i class="fas fa-heartbeat mr-2"></i>État du système
          </h1>
          <p class="text-gray-600">Vérification de la santé du serveur</p>
          <a href="/" class="inline-block mt-4 text-blue-500 hover:text-blue-700">
            <i class="fas fa-arrow-left mr-1"></i>Retour à l'accueil
          </a>
        </div>
        
        <div class="status-card">
          <h2 class="text-xl font-bold text-gray-800 mb-4">Services</h2>
          <div class="space-y-4">
            <div class="flex items-center justify-between p-3 ${isDBConnected ? 'bg-green-50' : 'bg-red-50'} rounded-lg">
              <div class="flex items-center">
                <i class="fas ${isDBConnected ? 'fa-check-circle text-green-500' : 'fa-times-circle text-red-500'} text-xl mr-3"></i>
                <div>
                  <p class="font-medium">MongoDB Atlas</p>
                  <p class="text-sm text-gray-600">Base de données</p>
                </div>
              </div>
              <span class="px-3 py-1 ${isDBConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} rounded-full text-sm font-medium">
                ${isDBConnected ? 'Connecté' : 'Déconnecté'}
              </span>
            </div>
            
            <div class="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div class="flex items-center">
                <i class="fas fa-check-circle text-green-500 text-xl mr-3"></i>
                <div>
                  <p class="font-medium">Serveur Express</p>
                  <p class="text-sm text-gray-600">Serveur web Node.js</p>
                </div>
              </div>
              <span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">En ligne</span>
            </div>
          </div>
        </div>
        
        <div class="status-card">
          <h2 class="text-xl font-bold text-gray-800 mb-4">Informations</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-gray-50 p-4 rounded-lg">
              <p class="text-sm text-gray-500">Port</p>
              <p class="font-medium">${PORT}</p>
            </div>
            <div class="bg-gray-50 p-4 rounded-lg">
              <p class="text-sm text-gray-500">Base de données</p>
              <p class="font-medium">bibliothequedb</p>
            </div>
            <div class="bg-gray-50 p-4 rounded-lg">
              <p class="text-sm text-gray-500">Environnement</p>
              <p class="font-medium">${process.env.NODE_ENV || 'développement'}</p>
            </div>
            <div class="bg-gray-50 p-4 rounded-lg">
              <p class="text-sm text-gray-500">Heure serveur</p>
              <p class="font-medium">${new Date().toLocaleString('fr-FR')}</p>
            </div>
          </div>
        </div>
        
        <div class="mt-8 text-center text-gray-500 text-sm">
          <p>Médiathèque - Groupe F - UEL 315 Bases de données</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  res.send(html);
});

// ==================== DÉMARRAGE ====================

async function startServer() {
  console.log('='.repeat(60));
  console.log('🚀 Médiathèque UEL 315 - Groupe F');
  console.log('='.repeat(60));
  
  try {
    // Connexion à MongoDB
    await connectDB();
    
    // Démarrer le serveur
    app.listen(PORT, () => {
      console.log(`✅ Serveur: http://localhost:${PORT}`);
      console.log(`🔐 Connexion: http://localhost:${PORT}/login`);
      console.log(`⚙️  Admin: http://localhost:${PORT}/admin`);
      console.log(`📊 Stats: http://localhost:${PORT}/stats-page`);
      console.log(`📖 Documents: http://localhost:${PORT}/documents-page`);
      console.log('='.repeat(60));
      console.log('👑 Admin: admin@mediatheque.fr / admin123');
      console.log('👤 User: user@test.fr / user123');
      console.log('='.repeat(60));
    });
    
  } catch (error) {
    console.error("❌ Erreur:", error.message);
    process.exit(1);
  }
}

startServer();