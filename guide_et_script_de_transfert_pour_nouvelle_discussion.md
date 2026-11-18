# Mémoire du Projet QCM Pronote — Reprise sur nouvelle discussion

Ce document contient la commande PowerShell à exécuter dans votre projet pour collecter automatiquement l'état du code, ainsi que le message type à coller dans votre nouvelle discussion pour reprendre le développement sans aucune perte de contexte.

---

## 1. Commande PowerShell à exécuter

Ouvrez un terminal PowerShell à la racine du projet (`C:\Users\Thoma\Documents\qcm-app`) et collez l'intégralité du bloc suivant :

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

Set-Content -Path generer_brief.js -Encoding UTF8 -Value @'
const fs = require('fs');
const path = require('path');

function listerFichiers(dir, liste = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (item === '.git' || item === 'node_modules') continue;
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      listerFichiers(full, liste);
    } else {
      liste.push(full.replace(/\\/g, '/'));
    }
  }
  return liste;
}

const fichiers = listerFichiers('.');

let brief = `=== PROJET QCM-APP (ARCHITECTURE & ÉTAT ACTUEL) ===\n\n`;
brief += `STACK TECHNIQUE :\n`;
brief += `- Hébergement : Cloudflare Pages (déploiement continu via branche main sur GitHub)\n`;
brief += `- Base de données : Cloudflare D1 (nom de la base : qcm-db)\n`;
brief += `- Backend : Cloudflare Pages Functions (dossier functions/api/)\n`;
brief += `- Frontend : Architecture modulaire HTML5 / Vanilla JS / CSS avec thème Pronote\n\n`;

brief += `STRUCTURE DU CODE :\n`;
brief += `- public/prof.html : Espace enseignant dédié (tableaux, gestion, imports)\n`;
brief += `- public/index.html : Espace élève dédié (connexion, moteur QCM, consultation fiches)\n`;
brief += `- public/css/ : commun.css, prof.css (et styles d'interface)\n`;
brief += `- public/js/prof/ : auth.js, classes.js, banque.js, seances.js, resultats.js, export_pronote.js, simulateur.js, fiches.js\n`;
brief += `- public/js/eleve/ : modules dédiés au portail et au quiz élève\n`;
brief += `- functions/api/ : auth.js, classes.js, seances.js, banque.js, resultats.js, soumettre.js, evenement.js, fiches.js\n\n`;

brief += `FICHIERS DU PROJET DÉTECTÉS :\n`;
fichiers.forEach(f => brief += ` - ${f}\n`);

brief += `\nTABLES D1 :\n`;
brief += `- profs (id, email, password, nom)\n`;
brief += `- classes (id, prof_id, nom, effectif, code_partage)\n`;
brief += `- eleves (id, classe_id, nom, prenom, date_naissance, code_eleve, est_pap)\n`;
brief += `- qcm_banque (id, prof_id, titre, questions, document_html)\n`;
brief += `- seances (id, prof_id, qcm_id, classe_id, code_session, date_seance, horaire_seance, actif)\n`;
brief += `- resultats_qcm (id, seance_id, nom, prenom, session_code, note, total, nb_sorties, duree_sorties, date_soumission)\n`;
brief += `- sorties_ecran (id, eleve_id, type_evenement, horodatage)\n`;
brief += `- matieres (id, prof_id, nom, date_creation)\n`;
brief += `- fiches_synthese (id, prof_id, matiere_id, titre, contenu_html, date_creation)\n`;
brief += `- classes_matieres (classe_id, matiere_id)\n\n`;

brief += `POINTS CLÉS DU COMPORTEMENT ACTUEL :\n`;
brief += `1. Calcul et affichage de la durée de sortie d'écran : enregistrée dans 'duree_sorties' et affichée dans la 7e colonne du tableau des copies (à droite des alertes).\n`;
brief += `2. Export Pronote : format CSV Windows ANSI (ISO-8859-1) avec deux colonnes ('Nom Prenom;Note') pour un collage/import direct sans décalage.\n`;
brief += `3. Fiches Synthèse : fiches HTML rattachées obligatoirement à une matière, associables aux classes via la table classes_matieres pour que les élèves ne voient que les fiches de leurs matières.\n`;

fs.writeFileSync('brief_projet.txt', brief, 'utf8');
console.log("✓ Le brief complet a été copié dans votre presse-papiers !");
'@

node generer_brief.js
Get-Content brief_projet.txt | Set-Clipboard
Remove-Item generer_brief.js
Remove-Item brief_projet.txt
```

---

## 2. Consigne à coller dans la nouvelle discussion

Dès que vous ouvrez une nouvelle discussion, collez simplement le contenu de votre presse-papiers (`Ctrl + V`) puis ajoutez le texte suivant en dessous :

> "Voici le récapitulatif technique et l'état exact de mon projet d'application QCM / Pronote hébergé sur Cloudflare Pages avec Cloudflare D1.
>
> Prends connaissance de cette architecture modulaire, des tables D1 existantes, des modules JavaScript dédiés (`public/js/prof/` et `public/js/eleve/`), ainsi que des fonctionnalités en place (durée hors écran, export Pronote, fiches synthèse ciblées par classe).
> 
> Nous reprenons le travail à partir de cette base. Dis-moi si tout est clair pour toi afin que je t'indique la prochaine tâche."