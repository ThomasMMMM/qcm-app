# Descriptif Technique Exhaustif — Application Web QCM (PSE / Lycée Professionnel)

Ce document constitue le référentiel technique complet de l'application QCM (architecture des fichiers, routes API, schéma intégral des 12 tables de la base de données Cloudflare D1, fonctionnalités déployées et chantiers en cours). Il permet de reprendre immédiatement le développement dans une nouvelle session sans perte de contexte.

## 1. Infrastructure & Déploiement

* **Dépôt Git :** `https://github.com/ThomasMMMM/qcm-app.git` (branche `main`)
* **Hébergement Frontend & Backend :** Cloudflare Pages + Cloudflare Pages Functions (déploiement continu automatique à chaque `git push origin main`).
* **Base de données distante :** Cloudflare D1
  * **Nom de la base :** `qcm-db`
  * **UUID :** `6d01ac01-53aa-4b85-a031-9404ea3352ff`
* **Stack :** HTML5, CSS3, JavaScript Vanilla (ES6+), SQLite (D1), Wrangler CLI (`v4.158.0+`).

## 2. Arborescence Complète du Projet

```text
qcm-app/
├── .gitignore
├── package.json
├── package-lock.json
├── wrangler.toml                                       # Configuration Cloudflare Pages & binding D1 (qcm-db)
├── schema.sql                                          # Schéma initial historique (obsolète par rapport à la base D1 distante)
├── update.ps1                                          # Script utilitaire PowerShell de mise à jour
├── qrcode.png                                          # QR Code d'accès rapide à l'application élève
├── guide_et_script_de_transfert_pour_nouvelle_discussion.md
│
├── functions/
│   └── api/                                            # 14 endpoints serverless Cloudflare Pages Functions
│       ├── auth.js                                     # Authentification enseignant (inscription, connexion, hachage mot de passe + salt)
│       ├── banque.js                                   # CRUD de la banque de QCM (stockage JSON + document HTML associé)
│       ├── classes.js                                  # Gestion des classes, créneaux horaires, codes de partage et listes d'élèves
│       ├── eleve_espace.js                             # Espace personnel élève (historique, fiches synthèse accessibles)
│       ├── eleve_portal.js                             # Portail de connexion élève (par code individuel ou code de séance)
│       ├── eleve_quiz.js                               # Chargement du QCM actif côté élève (questions, document support, barème)
│       ├── evenement.js                                # Journalisation des événements de surveillance (sorties d'écran / perte de focus)
│       ├── fiches.js                                   # CRUD des matières et des fiches de synthèse HTML
│       ├── import_pronote.js                           # Importation des listes d'élèves / classes depuis un export Pronote
│       ├── prof_quiz.js                                # Gestion rapide de sessions quiz côté enseignant
│       ├── resultats.js                                # Récupération et filtrage des résultats et alertes de sortie pour le prof
│       ├── seances.js                                  # Création, activation/désactivation et planification des séances d'évaluation
│       ├── soumettre.js                                # Enregistrement d'une copie élève dans resultats_qcm (note brute + note proportionnelle)
│       └── valider_reponse.js                          # Validation côté serveur d'une réponse élève en cours de QCM
│
└── public/
    ├── index.html                                      # Interface Élève complète (connexion, QCM, chrono, anti-triche, soumission, parseur XML)
    ├── prof.html                                       # Tableau de bord Enseignant (7 rubriques principales)
    ├── css/
    │   ├── commun.css                                  # Styles partagés (typographie, boutons, cartes, modales)
    │   └── prof.css                                    # Styles spécifiques au tableau de bord enseignant
    └── js/
        └── prof/
            ├── auth.js                                 # Gestion de la session enseignant côté client (currentProf, déconnexion)
            ├── banque.js                               # Import XML Moodle/Pronote (avec support images base64/PLUGINFILE) & gestion banque QCM
            ├── classes.js                              # Interface de gestion des classes, élèves, PAP, codes individuels et import Pronote
            ├── export_pronote.js                       # Génération de l'export des notes compatible Pronote
            ├── fiches.js                               # Éditeur / importeur HTML de fiches de synthèse par matière
            ├── resultats.js                            # Tableau des copies, affichage note brute / note proportionnelle, alertes sorties d'écran
            ├── seances.js                              # Planification et pilotage des séances actives
            └── simulateur.js                           # Mode simulation permettant à l'enseignant de tester un QCM comme un élève
```

## 3. Schéma Intégral de la Base de Données D1 (`qcm-db`)

La base distante `qcm-db` comporte **12 tables** actives (les 3 tables de `schema.sql` en local ne reflètent plus l'état réel de production).

### 3.1 Utilisateurs, Classes et Matières

#### `professeurs`
Comptes enseignants authentifiés.
```sql
CREATE TABLE professeurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  password_hash TEXT,
  salt TEXT,
  nom TEXT,
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `classes`
Classes gérées par les enseignants, avec créneau habituel et code de partage inter-enseignants.
```sql
CREATE TABLE classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  prof_id INTEGER,
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  code_partage TEXT,
  jour_cours TEXT DEFAULT 'Lundi',
  horaire_cours TEXT DEFAULT '08h-09h'
);
```

#### `professeurs_classes`
Table de liaison permettant le partage de classes entre plusieurs enseignants.
```sql
CREATE TABLE professeurs_classes (
  prof_id INTEGER NOT NULL REFERENCES professeurs(id),
  classe_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (prof_id, classe_id)
);
```

#### `eleves`
Liste des élèves rattachés à une classe, avec code individuel unique et indicateur d'aménagement (`est_pap`).
```sql
CREATE TABLE eleves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  classe_id INTEGER NOT NULL,
  prenom TEXT NOT NULL,
  date_naissance TEXT,
  code_eleve TEXT NOT NULL UNIQUE,
  est_pap INTEGER DEFAULT 0,
  ordre INTEGER DEFAULT 0,
  nom TEXT
);
```

#### `matieres`
Matières enseignées (ex. `PSE`, etc.).
```sql
CREATE TABLE matieres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prof_id INTEGER,
  nom TEXT NOT NULL,
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `classes_matieres`
Table de liaison associant les matières aux classes.
```sql
CREATE TABLE classes_matieres (
  classe_id INTEGER NOT NULL,
  matiere_id INTEGER NOT NULL,
  PRIMARY KEY (classe_id, matiere_id)
);
```

### 3.2 Contenus Pédagogiques (Banque QCM & Fiches Synthèse)

#### `qcm_banque`
Stocke les questionnaires importés (format JSON normalisé) ainsi qu'un éventuel dossier/document HTML annexe (`document_html`).
```sql
CREATE TABLE qcm_banque (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prof_id INTEGER,
  titre TEXT NOT NULL,
  data_json TEXT NOT NULL,
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  document_html TEXT DEFAULT NULL
);
```

#### `fiches_synthese`
Fiches de révision HTML rattachées à une matière et consultables par les élèves.
```sql
CREATE TABLE fiches_synthese (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prof_id INTEGER,
  matiere_id INTEGER NOT NULL,
  titre TEXT NOT NULL,
  contenu_html TEXT NOT NULL,
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3.3 Séances, Copies et Résultats

#### `seances`
Séances planifiées ou actives associant un QCM (`qcm_id`), une classe (`classe_id`) et un code d'accès (`code_session`).
```sql
CREATE TABLE seances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_session TEXT UNIQUE NOT NULL,
  prof_id INTEGER NOT NULL REFERENCES professeurs(id),
  qcm_id INTEGER NOT NULL REFERENCES qcm_banque(id),
  classe_id INTEGER NOT NULL REFERENCES classes(id),
  actif INTEGER DEFAULT 1,
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_seance TEXT,
  horaire_seance TEXT
);
```

#### `quiz_sessions`
Sessions de quiz rapides (mode session directe par code).
```sql
CREATE TABLE quiz_sessions (
  code TEXT PRIMARY KEY,
  titre TEXT,
  data_json TEXT,
  actif INTEGER DEFAULT 1,
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  prof_id INTEGER REFERENCES professeurs(id)
);
```

#### `resultats_qcm` *(Table principale des copies et notes)*
Enregistre chaque copie soumise, les indicateurs anti-triche (`nb_sorties`, `duree_sorties`), la note brute et les indicateurs de progression proportionnelle.
```sql
CREATE TABLE resultats_qcm (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT,
  prenom TEXT,
  classe TEXT,
  qcm_titre TEXT,
  note REAL,
  total REAL,
  date_soumission DATETIME DEFAULT CURRENT_TIMESTAMP,
  session_code TEXT,
  seance_id INTEGER REFERENCES seances(id),
  nb_sorties INTEGER DEFAULT 0,
  duree_sorties INTEGER DEFAULT 0,
  questions_traitees INTEGER DEFAULT NULL,
  questions_totales INTEGER DEFAULT NULL,
  note_proportionnelle REAL DEFAULT NULL
);
```

#### `copies`
Table historique conservée pour rétrocompatibilité (remplacée en production par `resultats_qcm`).
```sql
CREATE TABLE copies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seance_id INTEGER,
  nom TEXT,
  prenom TEXT,
  session_code TEXT,
  note REAL,
  total REAL,
  nb_sorties INTEGER DEFAULT 0,
  date_soumission DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 4. Fonctionnalités Déployées & Logique Métier

### 4.1 Calcul de la Note Brute et de la Note Proportionnelle
* **Problématique :** Les élèves n'ayant pas le temps de finir toutes les questions d'un QCM recevaient une note brute pénalisante (questions non traitées comptées à `0`).
* **Implémentation actuelle :**
  * Dans `public/index.html`, chaque validation de question ajoute `currentQuestionIndex` dans `window.questionsValideesSet` (ligne ~2316).
  * Au moment du rendu (`fetch('/api/soumettre')`, lignes ~2483–2487), le frontend envoie :
    * `note` : note brute sur 20 (`(scoreFinal / possibleFinal) * 20`).
    * `questions_traitees` : nombre de questions validées (`questionsTraiteesCorrigees`).
    * `questions_totales` : nombre total de questions du QCM (`currentQuestions.length`).
    * `note_proportionnelle` : note sur 20 rapportée uniquement aux questions validées.
  * **Garde anti-F5 / rechargement :** Si un élève actualise sa page en cours de devoir (`window.questionsValideesSet` est remis à zéro alors que `totalScoreObtenu` est restauré), la formule impose `effectiveTraite = Math.max(possibleTraite, scoreFinal)`, ajuste `questionsTraiteesCorrigees` à `Math.ceil(effectiveTraite)` au minimum et borne `noteProp20` à `20.00` (`Math.min(20, ...)`).
  * Dans `public/index.html` / `public/js/prof/resultats.js`, la colonne **Note / Q. faites** affiche en vert `✓ X/Y Q.` si tout est fait, ou un badge ambré `⚠️ X/Y Q. faites` avec la note proportionnelle si le devoir est incomplet.

### 4.2 Intégration de Graphiques et Images dans les QCM XML
* **Parseur XML (`public/js/prof/banque.js` et `public/index.html`) :**
  * Supporte nativement les balises HTML `<img src="data:image/png;base64,...">` intégrées dans `<questiontext format="html">`.
  * Convertit automatiquement à l'import les balises non standard `<image_base64>` (générées par certaines IA) ainsi que les balises Moodle `<file encoding="base64">` référencées par `@@PLUGINFILE@@/...` en images HTML responsives (`max-width:100%; height:auto; border-radius:8px;`).
* **Cadrage pédagogique :** Documenté dans `CADRAGE_CREATION_QCM.md` (section 5).

## 5. Chantiers Prioritaires pour la Suite du Développement

1. **Résilience réseau & Rafraîchissement en direct des copies (`functions/api/resultats.js` & `public/js/prof/resultats.js`) :**
   * *Problème observé :* Lors de micro-coupures Wi-Fi en classe, l'appel initial à `/api/resultats` échoue ou affiche `0 copie` sur le tableau de bord (`prof.html`), obligeant à actualiser manuellement plusieurs fois.
   * *Correctif à appliquer :*
     * Ajouter `Cache-Control: no-store, no-cache` dans la réponse de `functions/api/resultats.js`.
     * Forcer le rechargement des copies au clic sur la tuile **Résultats** dans `prof.html`.
     * Ajouter un polling automatique silencieux toutes les **10 secondes** dans `public/js/prof/resultats.js` ainsi qu'un mécanisme de réessai (`retry`) en cas d'échec réseau.
2. **Persistance de `window.questionsValideesSet` dans `localStorage` (`public/index.html`) :**
   * Sauvegarder la liste des index de questions validées dans le `localStorage` de la session élève (et la restaurer au chargement) afin de conserver le compte exact des questions faites même en cas de F5.
3. **Amélioration du contraste dans le tableau des résultats :**
   * Assombrir légèrement les textes secondaires (`0 s`, `— (avant maj)`) pour garantir leur lisibilité sur les écrans Windows avec mode HDR actif.
4. **Synchronisation de `schema.sql` :**
   * Remplacer le contenu obsolète de `schema.sql` à la racine du dépôt par le schéma réel des 12 tables D1 documenté en section 3.

## 6. Commandes Utiles (PowerShell / Wrangler)

* **Autoriser les scripts PowerShell sur la session courante :**
  ```powershell
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  ```
* **Interroger la base D1 distante (`qcm-db`) :**
  ```powershell
  npx wrangler d1 execute qcm-db --remote --command "SELECT id, nom, classe, note, questions_traitees, questions_totales, note_proportionnelle FROM resultats_qcm ORDER BY id DESC LIMIT 10;"
  ```
* **Déployer les modifications sur Cloudflare Pages :**
  ```powershell
  git add .
  git commit -m "Message explicite"
  git push origin main
  ```