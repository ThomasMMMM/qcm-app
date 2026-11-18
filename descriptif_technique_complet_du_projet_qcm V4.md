# Descriptif Technique Exhaustif — Application Web QCM (PSE / Lycée Professionnel)

Ce document constitue le référentiel technique complet de l'application QCM (architecture des fichiers, routes API, schéma intégral des 15 tables de la base de données Cloudflare D1, fonctionnalités déployées et pistes d'évolution). Il permet de reprendre immédiatement le développement dans une nouvelle session sans perte de contexte.

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
├── schema.sql                                          # Schéma initial historique (remplacé par la base D1 distante)
├── update.ps1                                          # Script utilitaire PowerShell de mise à jour
├── qrcode.png                                          # QR Code d'accès rapide à l'application élève
│
├── functions/
│   └── api/                                            # 16 endpoints serverless Cloudflare Pages Functions
│       ├── analyse.js                                  # Agrégation statistique par classe, matière, compétence et suivi PAP
│       ├── auth.js                                     # Authentification enseignant (inscription, connexion, PBKDF2 + salt)
│       ├── banque.js                                   # CRUD de la banque de QCM (JSON, document HTML, matiere_id, competence_code)
│       ├── classes.js                                  # Gestion des classes, créneaux horaires, codes de partage, PAP et élèves
│       ├── eleve_copie.js                              # Consultation détaillée et correction post-séance de la copie élève
│       ├── eleve_espace.js                             # Espace personnel élève (devoirs, cahier de texte, fiches, arbre de compétences)
│       ├── eleve_portal.js                             # Portail de connexion élève (par code individuel)
│       ├── eleve_quiz.js                               # Chargement du QCM actif côté élève (questions, document support, barème, PAP)
│       ├── evenement.js                                # Journalisation des événements de surveillance (sorties d'écran / perte de focus)
│       ├── fiches.js                                   # CRUD des matières (avec competences_json), fiches de synthèse et classes_matieres
│       ├── import_pronote.js                             # Importation des listes d'élèves / classes depuis un export Pronote
│       ├── prof_quiz.js                                # Gestion rapide de sessions quiz côté enseignant
│       ├── resultats.js                                # Récupération/filtrage des copies (GET) et marquage d'export Pronote en lot (POST)
│       ├── seances.js                                  # Création, planification, gestion des absences (toggle_absent) et clôture avec 0 auto
│       ├── soumettre.js                                # Enregistrement d'une copie élève dans resultats_qcm (note brute + proportionnelle + détails)
│       ├── suivi_direct.js                             # Suivi temps réel de la classe (GET état complet / POST pings élèves & sorties)
│       └── valider_reponse.js                          # Validation côté serveur d'une réponse élève en cours de QCM
│
└── public/
    ├── _headers                                        # Directives anti-cache Cloudflare Pages (/index.html, /prof.html, /js/*)
    ├── index.html                                      # Interface Élève complète (menu latéral, QCM multichoice/matching/cloze/ordering, fiches, résultats, compétences)
    ├── prof.html                                       # Tableau de bord Enseignant (rubriques, modale Suivi en direct, Pronote & Compétences)
    ├── css/
    │   ├── commun.css                                  # Styles partagés (typographie, boutons, cartes, modales)
    │   └── prof.css                                    # Styles spécifiques au tableau de bord enseignant
    └── js/
        └── prof/
            ├── analyse.js                              # Tableau de bord analytique (matrice Élèves × Compétences, suivi PAP)
            ├── auth.js                                 # Session enseignant, KPIs accueil (compteur de copies à exporter vers Pronote)
            ├── banque.js                               # Import XML Moodle/Pronote (multichoice, matching, cloze, ordering), association Matière + Compétence
            ├── classes.js                              # Gestion des classes, élèves, PAP, codes individuels, import Pronote et matières par classe
            ├── export_pronote.js                       # Modale d'export Pronote (presse-papier / CSV) et case « Import Pronote fait »
            ├── fiches.js                               # Gestion des matières, éditeur de compétences par matière et fiches de synthèse HTML
            ├── resultats.js                            # Tableau des copies (date + heure, statut Export Pronote, filtre copies non exportées)
            ├── seances.js                              # Planification, pilotage des séances actives et modale de Suivi en direct + Absences
            └── simulateur.js                           # Mode simulation permettant à l'enseignant de tester un QCM comme un élève
```

## 3. Schéma Intégral de la Base de Données D1 (`qcm-db`)

La base distante `qcm-db` comporte **15 tables** actives. Les tables et colonnes ajoutées lors des dernières évolutions sont intégrées ci-dessous.

### 3.1 Utilisateurs, Classes et Matières

#### `professeurs`
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
```sql
CREATE TABLE professeurs_classes (
  prof_id INTEGER NOT NULL REFERENCES professeurs(id),
  classe_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (prof_id, classe_id)
);
```

#### `eleves`
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
```sql
CREATE TABLE classes_matieres (
  classe_id INTEGER NOT NULL,
  matiere_id INTEGER NOT NULL,
  PRIMARY KEY (classe_id, matiere_id)
);
```

### 3.2 Contenus Pédagogiques (Banque QCM & Fiches Synthèse)

#### `qcm_banque`
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
```sql
CREATE TABLE fiches_synthese (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prof_id INTEGER,
  matiere_id INTEGER NOT NULL,
  titre TEXT NOT NULL,
  contenu_html TEXT NOT NULL,
  competence_code TEXT DEFAULT NULL,
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3.3 Séances, Suivi Temps Réel, Absences et Résultats

#### `seances`
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

#### `suivi_direct` *(Nouvelle table — Télémétrie temps réel en classe)*
Enregistre en temps réel la progression question par question (`reponses_json`), la question courante, le score provisoire et le statut d'écran (`hors_ecran`, `nb_sorties`, `duree_sorties_sec`) de chaque élève pendant la passation.
```sql
CREATE TABLE suivi_direct (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seance_id INTEGER NOT NULL,
  eleve_id INTEGER,
  code_eleve TEXT NOT NULL,
  nom_eleve TEXT,
  prenom_eleve TEXT,
  statut TEXT DEFAULT 'en_cours',
  question_courante INTEGER DEFAULT 1,
  total_questions INTEGER DEFAULT 1,
  score_actuel REAL DEFAULT 0,
  score_max_courant REAL DEFAULT 0,
  score_total_possible REAL DEFAULT 0,
  reponses_json TEXT DEFAULT '[]',
  hors_ecran INTEGER DEFAULT 0,
  nb_sorties INTEGER DEFAULT 0,
  duree_sorties_sec INTEGER DEFAULT 0,
  derniere_activite TEXT DEFAULT (datetime('now')),
  UNIQUE(seance_id, code_eleve)
);
```

#### `absences_seances` *(Nouvelle table — Appel en direct)*
Enregistre les élèves déclarés absents par l'enseignant pendant une séance afin de les exclure de l'attribution automatique du `0 / 20` à la clôture.
```sql
CREATE TABLE absences_seances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seance_id INTEGER NOT NULL,
  eleve_id INTEGER NOT NULL,
  UNIQUE(seance_id, eleve_id)
);
```

#### `sorties_ecran`
Journal global des pertes de focus (`page_masquee` / `retour_qcm`).
```sql
CREATE TABLE sorties_ecran (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eleve_id TEXT,
  type_evenement TEXT,
  horodatage DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `resultats_qcm` *(Table principale des copies et notes)*
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
  reponses_json TEXT DEFAULT NULL,
  exporte_pronote INTEGER DEFAULT 0
);
```

#### `quiz_sessions` & `copies`
Tables historiques conservées pour rétrocompatibilité (`quiz_sessions` pour les sessions rapides par code ; `copies` remplacée en production par `resultats_qcm`).

## 4. Fonctionnalités Déployées & Logique Métier

### 4.1 Types de Questions XML Moodle/Pronote Supportés
L'application importe, simule (`public/js/prof/simulateur.js`), fait passer côté élève (`public/index.html`) et corrige post-séance (`functions/api/eleve_copie.js`) **4 typologies de questions** :
1. **`multichoice` :** QCM à choix unique (`radio`) ou multiple (`checkbox`), avec fractions positives/négatives, feedbacks spécifiques par choix et images base64 intégrées.
2. **`matching` :** Appariement par listes déroulantes (`subquestions`).
3. **`cloze` (Texte à trous / Étapes d'analyse) :**
   * Détection automatique des balises Moodle `{1:MC:=Bonne~Fausse1~Fausse2}` et `{1:SA:=Réponse}` via `parserQuestionClozeMoodle()` (à l'import dans `banque.js` et à la volée dans `preparerQuestionCloze()` / `preparerQuestionClozeSimu()`).
   * Rendu sous forme de menus déroulants `<select>` (`eleve_cloze_field_0`, `1`, ...) ou champs texte `<input>`, avec pondération par étape (`poids`) et feedback détaillé par étape.
4. **`ordering` (Mise en ordre / Procédure avec intrus) :**
   * Interface tactile interactive à deux zones (`eleve_ordering_selected` et `eleve_ordering_pool`) avec boutons `▲`, `▼`, `✖` et gestion des distracteurs/intrus (`it.distracteur === true`) pénalisés s'ils sont classés.

### 4.2 Suivi en Direct de la Classe (`📡 Direct`) & Surveillance Anti-Triche
* **Côté Élève (`public/index.html`) :**
  * `async function envoyerPingSuiviDirect(extra = {})` utilise `currentSeanceId`, `sessionEleve.eleve.code_eleve` et `fetch(..., { keepalive: true })` pour transmettre :
    1. Le démarrage de l'épreuve (`statut: "en_cours"`, `question_courante: 1`).
    2. Chaque validation de question (`window.suiviDirectReponses[currentQuestionIndex]` avec état `juste` / `partiel` / `faux`, score cumulé et progression).
    3. Chaque sortie d'application ou changement d'onglet (`document.addEventListener("visibilitychange")`) avec signalement immédiat `hors_ecran: 1` puis calcul de la durée cumulée `duree_sorties_sec` au retour (`hors_ecran: 0`).
    4. La remise finale de la copie (`statut: "termine"`).
* **Côté Enseignant (`public/js/prof/seances.js` & `functions/api/suivi_direct.js`) :**
  * Rafraîchissement automatique toutes les **4 secondes** (`setInterval(rafraichirSuiviDirect, 4000)`).
  * **KPIs temps réel :** Connectés (`X / Effectif`), Terminés / En cours, Moyenne provisoire sur 20, et alertes de sorties d'application (`🚨 X dehors !` ou total des sorties).
  * **Radar de réussite par question :** Taux de réussite instantané `Q1..Qn` coloré (vert $\ge 70\%$, jaune $\ge 45\%$, rouge $< 45\%$).
  * **Grille individuelle élèves :** Case à cocher **Absent**, statut en direct, pastilles colorées `1..n` par question (reconstruites aussi depuis `resultats_qcm.reponses_json` pour les copies déjà remises), compteur/durée des sorties d'écran et note provisoire sur 20, avec tri dynamique (ordre alphabétique, alertes sorties, note croissante, avancement).

### 4.3 Gestion des Absents & Attribution Automatique de `0 / 20` à la Clôture
* **Pendant la séance (`📡 Direct`) :** L'enseignant coche la case **Absent** devant les élèves absents du jour (`POST /api/seances` avec `action: "toggle_absent"`), ce qui enregistre l'absence dans `absences_seances` et affiche le badge `🚫 Absent`.
* **À la clôture (`🔒 Fermer` $\rightarrow$ `toggleEtatSeance`) :**
  * L'endpoint `POST /api/seances` (`action: "toggle_actif"`, `actif: false`) parcourt tous les élèves de la classe :
    * **Élève ayant rendu une copie :** conserve sa note obtenue.
    * **Élève coché « Absent » :** reste sans copie (apparaît comme *Absent* dans l'export Pronote).
    * **Élève présent sans copie rendue :** reçoit automatiquement une copie à **`0 / 20`** (`[Code: XXXX] (Non rendu - 0 auto)`) dans `resultats_qcm`, immédiatement visible dans les résultats et exportable vers Pronote.

### 4.4 Politique Anti-Cache Navigateur (Mobile & Desktop)
* Ajout des balises `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">` dans `public/index.html` et `public/prof.html`.
* Fichier `public/_headers` configuré pour Cloudflare Pages afin d'imposer `Cache-Control: no-cache, no-store, must-revalidate` sur `/`, `/index.html`, `/prof.html` et `/js/*`, complété par le versioning `?v=...` des scripts JS dans `prof.html`.

### 4.5 Note Proportionnelle, Export Pronote, Compétences & PAP
* **Note proportionnelle :** Calculée sur les seules questions validées (`questions_traitees` / `questions_totales`) pour ne pas pénaliser un élève lent, tout en conservant la note brute.
* **Suivi des exports Pronote :** Colonne `exporte_pronote` dans `resultats_qcm`, case « Import Pronote fait » dans la modale d'export (`export_pronote.js`), filtre des copies non exportées et compteur KPI sur l'accueil enseignant.
* **Arbre de compétences à 4 niveaux :** Déblocage automatique des badges **Bronze** (1 QCM $\ge 10$), **Argent** (2 QCM $\ge 10$), **Or** (3 QCM, moy. $\ge 14$) et **Diamant** (4 QCM, moy. $\ge 16$) par matière associée à la classe (`classes_matieres`), avec fiches de synthèse liées.
* **Aménagement PAP (`est_pap = 1`) :** Réduction automatique de 25 % du nombre de questions dans `functions/api/eleve_quiz.js` et suivi dédié dans l'onglet Analyse.

## 5. Pistes d'Évolution & Points d'Attention

1. **Test en conditions réelles du suivi en direct & des absences :**
   * Vérifier lors de la prochaine séance en classe le comportement complet : coche des absents dans `📡 Direct`, suivi des pastilles `Q1..Qn`, alertes `hors_ecran` et attribution automatique des `0 / 20` au clic sur `🔒 Fermer`.
2. **Affichage des matières associées dans le tableau Classes (`public/js/prof/classes.js`) :**
   * Afficher directement les badges des matières associées (`classes_matieres`) sur chaque ligne de classe dans l'espace enseignant.
3. **Persistance de `window.questionsValideesSet` dans `localStorage` (`public/index.html`) :**
   * Sauvegarder la liste des index de questions validées dans le `localStorage` de la session élève afin de conserver le compte exact des questions faites même en cas de rechargement de page (F5).
4. **Notification visuelle de nouveau badge débloqué en fin de QCM :**
   * Comparer le niveau de badge avant et après soumission dans `viewEleveFin` pour féliciter l'élève lorsqu'il franchit un palier (Bronze, Argent, Or ou Diamant).

## 6. Commandes Utiles (PowerShell / Wrangler)

* **Autoriser les scripts PowerShell sur la session courante :**
  ```powershell
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  ```
* **Interroger les résultats et les copies `0 auto` dans D1 (`qcm-db`) :**
  ```powershell
  npx wrangler d1 execute qcm-db --remote --command "SELECT id, nom, prenom, classe, note, note_proportionnelle, exporte_pronote FROM resultats_qcm ORDER BY id DESC LIMIT 15;"
  ```
* **Consulter la table de suivi en direct (`suivi_direct`) :**
  ```powershell
  npx wrangler d1 execute qcm-db --remote --command "SELECT seance_id, code_eleve, prenom_eleve, statut, question_courante, hors_ecran, nb_sorties, duree_sorties_sec FROM suivi_direct ORDER BY id DESC LIMIT 15;"
  ```
* **Déployer les modifications sur Cloudflare Pages :**
  ```powershell
  git add .
  git commit -m "Message explicite"
  git push origin main
  ```