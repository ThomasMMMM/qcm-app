# Descriptif Technique Exhaustif — Application Web QCM (PSE / Lycée Professionnel)

Ce document constitue le référentiel technique complet de l'application QCM (architecture des fichiers, routes API, schéma intégral des 12 tables de la base de données Cloudflare D1, fonctionnalités déployées et pistes d'évolution). Il permet de reprendre immédiatement le développement dans une nouvelle session sans perte de contexte.

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
│       ├── banque.js                                   # CRUD de la banque de QCM (JSON, document HTML, matiere_id, competence_code)
│       ├── classes.js                                  # Gestion des classes, créneaux horaires, codes de partage et listes d'élèves
│       ├── eleve_espace.js                             # Espace personnel élève (historique, devoirs, fiches, calcul arbre de compétences & badges)
│       ├── eleve_portal.js                             # Portail de connexion élève (par code individuel ou code de séance)
│       ├── eleve_quiz.js                               # Chargement du QCM actif côté élève (questions, document support, barème)
│       ├── evenement.js                                # Journalisation des événements de surveillance (sorties d'écran / perte de focus)
│       ├── fiches.js                                   # CRUD des matières (avec competences_json), fiches de synthèse et liaison classes_matieres
│       ├── import_pronote.js                             # Importation des listes d'élèves / classes depuis un export Pronote
│       ├── prof_quiz.js                                # Gestion rapide de sessions quiz côté enseignant
│       ├── resultats.js                                # Récupération/filtrage des copies (GET) et marquage d'export Pronote en lot (POST)
│       ├── seances.js                                  # Création, activation/désactivation et planification des séances d'évaluation
│       ├── soumettre.js                                # Enregistrement d'une copie élève dans resultats_qcm (note brute + note proportionnelle)
│       └── valider_reponse.js                          # Validation côté serveur d'une réponse élève en cours de QCM
│
└── public/
    ├── index.html                                      # Interface Élève complète (menu latéral, QCM, fiches, résultats, arbre de compétences)
    ├── prof.html                                       # Tableau de bord Enseignant (7 rubriques principales, modales Pronote & Compétences)
    ├── css/
    │   ├── commun.css                                  # Styles partagés (typographie, boutons, cartes, modales)
    │   └── prof.css                                    # Styles spécifiques au tableau de bord enseignant
    └── js/
        └── prof/
            ├── auth.js                                 # Session enseignant, KPIs accueil (dont compteur de copies restant à exporter vers Pronote)
            ├── banque.js                               # Import XML Moodle/Pronote, association Matière + Compétence (import & édition inline)
            ├── classes.js                              # Gestion des classes, élèves, PAP, codes individuels, import Pronote et matières par classe
            ├── export_pronote.js                       # Modale d'export Pronote (presse-papier / CSV) et case « Import Pronote fait »
            ├── fiches.js                               # Gestion des matières, éditeur de compétences par matière et fiches de synthèse HTML
            ├── resultats.js                            # Tableau des copies (date + heure, statut Export Pronote, filtre copies non exportées)
            ├── seances.js                              # Planification et pilotage des séances actives
            └── simulateur.js                           # Mode simulation permettant à l'enseignant de tester un QCM comme un élève
```

## 3. Schéma Intégral de la Base de Données D1 (`qcm-db`)

La base distante `qcm-db` comporte **12 tables** actives. Les colonnes ajoutées lors des dernières évolutions sont intégrées ci-dessous.

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
Matières enseignées (ex. `Prévention Santé Environnement`, `Enseignement Professionnel`), incluant la définition JSON des compétences associées (`competences_json`).
```sql
CREATE TABLE matieres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prof_id INTEGER,
  nom TEXT NOT NULL,
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  competences_json TEXT DEFAULT NULL
);
```

#### `classes_matieres`
Table de liaison associant les matières aux classes (source de vérité pour l'affichage des matières, fiches et arbres de compétences côté élève).
```sql
CREATE TABLE classes_matieres (
  classe_id INTEGER NOT NULL,
  matiere_id INTEGER NOT NULL,
  PRIMARY KEY (classe_id, matiere_id)
);
```

### 3.2 Contenus Pédagogiques (Banque QCM & Fiches Synthèse)

#### `qcm_banque`
Stocke les questionnaires importés (format JSON normalisé), un éventuel dossier/document HTML annexe (`document_html`), ainsi que le rattachement à une matière (`matiere_id`) et à une compétence (`competence_code`).
```sql
CREATE TABLE qcm_banque (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prof_id INTEGER,
  titre TEXT NOT NULL,
  data_json TEXT NOT NULL,
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  document_html TEXT DEFAULT NULL,
  matiere_id INTEGER DEFAULT NULL,
  competence_code TEXT DEFAULT NULL
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
Enregistre chaque copie soumise, les indicateurs anti-triche (`nb_sorties`, `duree_sorties`), la note brute, les indicateurs de progression proportionnelle et le statut d'export vers Pronote (`exporte_pronote`).
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
  note_proportionnelle REAL DEFAULT NULL,
  exporte_pronote INTEGER DEFAULT 0
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
  * Dans `public/index.html`, chaque validation de question ajoute `currentQuestionIndex` dans `window.questionsValideesSet`.
  * Au moment du rendu (`fetch('/api/soumettre')`), le frontend envoie :
    * `note` : note brute sur 20 (`(scoreFinal / possibleFinal) * 20`).
    * `questions_traitees` : nombre de questions validées (`questionsTraiteesCorrigees`).
    * `questions_totales` : nombre total de questions du QCM (`currentQuestions.length`).
    * `note_proportionnelle` : note sur 20 rapportée uniquement aux questions validées.
  * **Garde anti-F5 / rechargement :** Si un élève actualise sa page en cours de devoir, la formule impose `effectiveTraite = Math.max(possibleTraite, scoreFinal)` et borne `noteProp20` à `20.00` (`Math.min(20, ...)`).
  * Dans `public/js/prof/resultats.js`, la colonne **Note / Q. faites** affiche en vert `✓ X/Y Q.` si tout est fait, ou un badge ambré `⚠️ X/Y Q. faites` avec la note proportionnelle si le devoir est incomplet.

### 4.2 Intégration de Graphiques et Images dans les QCM XML
* **Parseur XML (`public/js/prof/banque.js` et `public/index.html`) :**
  * Supporte nativement les balises HTML `<img src="data:image/png;base64,...">` intégrées dans `<questiontext format="html">`.
  * Convertit automatiquement à l'import les balises non standard `<image_base64>` ainsi que les balises Moodle `<file encoding="base64">` référencées par `@@PLUGINFILE@@/...` en images HTML responsives.

### 4.3 Suivi des Exports Pronote & Affichage Date/Heure (`resultats.js`, `export_pronote.js`, `auth.js`)
* **Colonne `exporte_pronote` (`INTEGER DEFAULT 0`) dans `resultats_qcm` :**
  * L'endpoint `POST /api/resultats` (`action: "marquer_export_pronote"`) permet de marquer ou démarquer en lot une liste d'identifiants de copies (`copie_ids`).
  * L'endpoint `GET /api/resultats` renvoie systématiquement `COALESCE(r.exporte_pronote, 0) AS exporte_pronote` avec l'en-tête `Cache-Control: no-store, no-cache`.
* **Modale d'export (`public/js/prof/export_pronote.js` & `public/prof.html`) :**
  * Intégration d'une case à cocher **« Import Pronote fait »** (`checkboxImportPronoteFait`) en bas de l'aperçu d'export, synchronisant immédiatement en base D1 et en mémoire locale toutes les copies présentes dans la sélection exportée.
* **Tableau des résultats (`public/js/prof/resultats.js`) :**
  * **Date et heure :** La première colonne **Date / Heure** affiche la date (`toLocaleDateString('fr-FR')`) au-dessus de l'heure (`toLocaleTimeString('fr-FR')`).
  * **Statut d'export :** Nouvelle colonne **Export Pronote** affichant un badge vert `✓ Exportée` ou ambré `⏳ À exporter`.
  * **Filtre rapide :** Case à cocher **« Afficher seulement les copies non exportées »** (`filtreNonExporteesCheckbox`) à côté des sélecteurs de classe et de séance.
* **Indicateur sur l'accueil enseignant (`public/js/prof/auth.js`) :**
  * La tuile KPI **Résultats & Copies** et le badge de navigation latéral indiquent en temps réel le nombre de copies restant à exporter vers Pronote (`X copie(s) à exporter vers Pronote` ou `✓ Toutes exportées vers Pronote`).

### 4.4 Système de Compétences par Matière & Arbre de Badges à 4 Niveaux
* **Référentiel par matière (`matieres.competences_json` & `functions/api/fiches.js`) :**
  * Chaque matière possède sa propre liste JSON de compétences. Par défaut, les **5 compétences officielles de PSE (Bac Pro / CAP)** évaluables par QCM sont pré-configurées :
    * `C1` : Traiter l'information
    * `C2` : Appliquer une démarche d'analyse
    * `C3` : Expliquer un phénomène / enjeu en lien avec la prévention
    * `C4` : Proposer une solution pour résoudre un problème
    * `C5` : Argumenter un choix
  * Dans l'espace enseignant (rubrique **Fiches Synthèse**), un bouton **`🎯 X comp.`** à côté de chaque matière ouvre la modale `modalCompetencesMatiere` permettant d'ajouter, modifier ou supprimer des compétences sur mesure pour n'importe quel enseignement.
* **Rattachement des QCM (`qcm_banque.matiere_id` & `qcm_banque.competence_code`) :**
  * Dans la **Banque QCM** (`public/js/prof/banque.js` & `functions/api/banque.js`), l'enseignant peut associer une **Matière** et une **Compétence** lors de l'import XML ou les modifier directement en ligne dans le tableau via des menus déroulants liés (`action: "update_competence"`).
* **Algorithme de déblocage des 4 niveaux de badges (`functions/api/eleve_espace.js`) :**
  * L'API récupère **strictement** les matières associées à la classe de l'élève via `classes_matieres` (garantissant l'affichage des matières et compétences dès la création de la classe, même avant toute évaluation, sans mélanger les filières).
  * Pour chaque compétence, le serveur analyse les copies soumises par l'élève sur cette matière et cette compétence (en retenant la `note_proportionnelle` si le QCM était incomplet) et calcule le niveau atteint :
    * **Niveau 1 — Bronze (`Initié`) :** au moins **1 QCM** réussi ($\text{note} \ge 10/20$).
    * **Niveau 2 — Argent (`Confirmé`) :** au moins **2 QCM** réussis ($\text{note} \ge 10/20$).
    * **Niveau 3 — Or (`Maîtrise`) :** au moins **3 QCM** réussis avec une moyenne $\ge 14/20$.
    * **Niveau 4 — Diamant (`Expert`) :** au moins **4 QCM** réussis avec une moyenne $\ge 16/20$.
  * Pour chaque compétence, le backend fournit également le message dynamique de l'objectif suivant (`objectif`).

### 4.5 Refonte Ergonomique de l'Espace Élève (`public/index.html`)
* **Menu latéral persistant (`.eleve-sidebar`) :**
  * Remplacement de l'ancien hub intermédiaire à tuiles et suppression des boutons *« Revenir à mon espace »*.
  * Sur ordinateur/tablette : barre latérale fixe à gauche permettant de naviguer en un clic entre **Évaluations**, **Fiches cours**, **Résultats** et **Compétences**, avec compteurs dynamiques (dont `X/Y` badges débloqués).
  * Sur mobile (`max-width: 780px`) : transformation automatique du menu latéral en une grille compacte 2×2 persistante en haut de l'écran.
* **Vue Arbre de Compétences (`#rubriqueEleveCompetences`) :**
  * Regroupe les compétences par matière enseignée à la classe, avec une piste visuelle à 4 nœuds par compétence (`Bronze`, `Argent`, `Or`, `Diamant`), statistiques de réussite/moyenne et indication de l'objectif pour le palier suivant.

## 5. Pistes d'Évolution & Points d'Attention

1. **Affichage des matières associées dans le tableau Classes (`public/js/prof/classes.js`) :**
   * Afficher directement les badges des matières associées (`classes_matieres`) sur chaque ligne de classe dans l'espace enseignant pour vérifier en un coup d'œil quelles classes ont leurs compétences configurées.
2. **Persistance de `window.questionsValideesSet` dans `localStorage` (`public/index.html`) :**
   * Sauvegarder la liste des index de questions validées dans le `localStorage` de la session élève afin de conserver le compte exact des questions faites même en cas de rechargement de page (F5).
3. **Notification visuelle de nouveau badge débloqué en fin de QCM :**
   * Comparer le niveau de badge avant et après soumission dans `viewEleveFin` pour féliciter l'élève lorsqu'il franchit un palier (Bronze, Argent, Or ou Diamant).
4. **Synchronisation de `schema.sql` :**
   * Mettre à jour le fichier local `schema.sql` à la racine du dépôt avec le schéma complet des 12 tables documenté en section 3.

## 6. Commandes Utiles (PowerShell / Wrangler)

* **Autoriser les scripts PowerShell sur la session courante :**
  ```powershell
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  ```
* **Interroger la base D1 distante (`qcm-db`) :**
  ```powershell
  npx wrangler d1 execute qcm-db --remote --command "SELECT id, nom, classe, note, note_proportionnelle, exporte_pronote FROM resultats_qcm ORDER BY id DESC LIMIT 10;"
  ```
* **Vérifier l'association Classes ↔ Matières ↔ Compétences :**
  ```powershell
  npx wrangler d1 execute qcm-db --remote --command "SELECT c.id AS classe_id, c.nom AS classe, m.id AS matiere_id, m.nom AS matiere FROM classes c LEFT JOIN classes_matieres cm ON c.id = cm.classe_id LEFT JOIN matieres m ON cm.matiere_id = m.id;"
  ```
* **Déployer les modifications sur Cloudflare Pages :**
  ```powershell
  git add .
  git commit -m "Message explicite"
  git push origin main
  ```