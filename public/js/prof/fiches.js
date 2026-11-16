let listeMatieresMemoire = [];
let listeFichesMemoire = [];
let matiereEnCoursEditionCompId = null;

async function chargerMatieresProf() {
  if (!currentProf) return;
  try {
    const res = await fetch(`/api/fiches?mode=matieres_only&prof_id=${currentProf.id}`);
    listeMatieresMemoire = await res.json();

    const selAjout = document.getElementById('selectMatiereFiche');
    if (selAjout) {
      if (listeMatieresMemoire.length === 0) {
        selAjout.innerHTML = '<option value="">-- Aucune matière (créez-en une d abord) --</option>';
      } else {
        selAjout.innerHTML = '<option value="">-- Sélectionner une matière --</option>' +
          listeMatieresMemoire.map(m => `<option value="${m.id}">${m.nom}</option>`).join('');
      }
    }

    const selFiltre = document.getElementById('filtreMatiereFicheSelect');
    if (selFiltre) {
      selFiltre.innerHTML = '<option value="">Toutes les matières</option>' +
        listeMatieresMemoire.map(m => `<option value="${m.id}">${m.nom}</option>`).join('');
    }

    const selDocQcm = document.getElementById('selectFichePourQcm');
    if (selDocQcm) {
      selDocQcm.innerHTML = '<option value="">-- Aucun ou HTML manuel ci-dessous --</option>' +
        listeFichesMemoire.map(f => `<option value="${f.id}">[${f.matiere_nom}] ${f.titre}</option>`).join('');
    }

    const contMatieres = document.getElementById('listeBadgesMatieres');
    if (contMatieres) {
      contMatieres.innerHTML = listeMatieresMemoire.length === 0
        ? "<span style='color:#94a3b8; font-size:0.85rem; font-style:italic;'>Aucune matière créée pour l'instant.</span>"
        : listeMatieresMemoire.map(m => {
          const nbComp = Array.isArray(m.competences) ? m.competences.length : 0;
          return `
            <span class="badge" style="background:#e0f2fe; color:#0369a1; padding:6px 10px; font-size:0.85rem; display:inline-flex; align-items:center; gap:8px;">
              <strong>${m.nom}</strong>
              <button type="button" onclick="ouvrirModalCompetencesMatiere(${m.id})" style="background:#0284c7; color:white; border:none; border-radius:4px; padding:2px 7px; font-size:0.75rem; cursor:pointer; font-weight:600;" title="Configurer les compétences">
                🎯 ${nbComp} comp.
              </button>
              <i class="fa-solid fa-xmark" style="cursor:pointer; color:#b91c1c;" onclick="supprimerMatiere(${m.id}, '${m.nom.replace(/'/g, "\\'")}')" title="Supprimer la matière"></i>
            </span>
          `;
        }).join(' ');
    }

    if (typeof alimenterSelectMatieresBanque === 'function') {
      alimenterSelectMatieresBanque();
    }
    if (typeof afficherTableauBanqueQcm === 'function') {
      afficherTableauBanqueQcm();
    }
    if (typeof afficherTableauFiches === 'function') {
      afficherTableauFiches();
    }
  } catch (e) {}
}

function ouvrirModalCompetencesMatiere(matiereId) {
  const mat = listeMatieresMemoire.find(m => Number(m.id) === Number(matiereId));
  if (!mat) return;
  matiereEnCoursEditionCompId = mat.id;
  document.getElementById('titreModalCompetencesMatiere').innerText = mat.nom;

  const cont = document.getElementById('listeEditeurCompetences');
  const comps = Array.isArray(mat.competences) ? mat.competences : [];
  cont.innerHTML = "";
  comps.forEach(c => ajouterLigneCompetenceEditeur(c.code, c.libelle));
  if (comps.length === 0) ajouterLigneCompetenceEditeur("C1", "");

  document.getElementById('modalCompetencesMatiere').style.display = 'flex';
}

function fermerModalCompetencesMatiere() {
  document.getElementById('modalCompetencesMatiere').style.display = 'none';
  matiereEnCoursEditionCompId = null;
}

function ajouterLigneCompetenceEditeur(code = "", libelle = "") {
  const cont = document.getElementById('listeEditeurCompetences');
  if (!cont) return;
  const idx = cont.children.length + 1;
  const div = document.createElement('div');
  div.className = "ligne-comp-editeur";
  div.style.cssText = "display:flex; gap:8px; align-items:center;";
  div.innerHTML = `
    <input type="text" class="input-field comp-code-in" value="${code || 'C' + idx}" placeholder="Code (ex: C1)" style="width:75px; margin:0; font-weight:bold; text-transform:uppercase;">
    <input type="text" class="input-field comp-lib-in" value="${String(libelle || '').replace(/"/g, '&quot;')}" placeholder="Intitulé de la compétence..." style="flex:1; margin:0;">
    <button type="button" class="btn btn-danger" style="padding:7px 10px; margin:0;" onclick="this.parentElement.remove()" title="Retirer">✖</button>
  `;
  cont.appendChild(div);
}

async function sauvegarderCompetencesMatiere() {
  if (!matiereEnCoursEditionCompId) return;
  const lignes = document.querySelectorAll('#listeEditeurCompetences .ligne-comp-editeur');
  const competences = [];
  lignes.forEach(l => {
    const code = l.querySelector('.comp-code-in').value.trim().toUpperCase();
    const libelle = l.querySelector('.comp-lib-in').value.trim();
    if (code && libelle) competences.push({ code, libelle });
  });

  const res = await fetch('/api/fiches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: "update_competences_matiere",
      matiere_id: matiereEnCoursEditionCompId,
      competences
    })
  });

  if (res.ok) {
    fermerModalCompetencesMatiere();
    await chargerMatieresProf();
  } else {
    alert("Erreur lors de l'enregistrement des compétences.");
  }
}

async function creerNouvelleMatiere() {
  const input = document.getElementById('nouvelleMatiereInput');
  const nom = input.value.trim();
  if (!nom) {
    alert("Veuillez indiquer le nom de la matière (ex: PSE, Microbiologie, SMS).");
    return;
  }

  const res = await fetch('/api/fiches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: "creer_matiere", prof_id: currentProf.id, nom })
  });

  if (res.ok) {
    input.value = "";
    await chargerMatieresProf();
    await chargerFichesProf();
  } else {
    alert("Erreur lors de la création de la matière.");
  }
}

async function supprimerMatiere(matiereId, nom) {
  if (!confirm(`Supprimer la matière "${nom}" ?\n\n⚠️ Toutes les fiches synthèse associées à cette matière seront également supprimées.`)) return;
  await fetch(`/api/fiches?type=matiere&id=${matiereId}`, { method: 'DELETE' });
  await chargerMatieresProf();
  await chargerFichesProf();
}

async function chargerFichesProf() {
  if (!currentProf) return;
  try {
    const res = await fetch(`/api/fiches?prof_id=${currentProf.id}`);
    listeFichesMemoire = await res.json();
    afficherTableauFiches();

    const selDocQcm = document.getElementById('selectFichePourQcm');
    if (selDocQcm) {
      selDocQcm.innerHTML = '<option value="">-- Aucun ou HTML manuel ci-dessous --</option>' +
        listeFichesMemoire.map(f => `<option value="${f.id}">[${f.matiere_nom}] ${f.titre}</option>`).join('');
    }
  } catch (e) {}
}

function majSelectCompetencesFiche() {
  const matId = document.getElementById('selectMatiereFiche')?.value;
  const selComp = document.getElementById('selectCompetenceFiche');
  if (!selComp) return;

  const mat = listeMatieresMemoire.find(m => String(m.id) === String(matId));
  if (!mat || !Array.isArray(mat.competences) || mat.competences.length === 0) {
    selComp.innerHTML = '<option value="">-- Aucune compétence spécifique --</option>';
    return;
  }

  selComp.innerHTML = '<option value="">-- Fiche générale (sans badge) --</option>' +
    mat.competences.map(c => `<option value="${c.code}">${c.code} — ${c.libelle}</option>`).join('');
}

async function modifierCompetenceFiche(ficheId, nouveauCode) {
  try {
    const res = await fetch('/api/fiches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: "update_fiche_competence",
        fiche_id: ficheId,
        competence_code: nouveauCode
      })
    });
    if (res.ok) {
      const f = listeFichesMemoire.find(item => Number(item.id) === Number(ficheId));
      if (f) f.competence_code = nouveauCode || null;
    }
  } catch (e) {}
}

function afficherTableauFiches() {
  const filtreMatiereId = document.getElementById('filtreMatiereFicheSelect')?.value;
  let fiches = listeFichesMemoire;
  if (filtreMatiereId) {
    fiches = fiches.filter(f => f.matiere_id == filtreMatiereId);
  }

  const tbody = document.getElementById('tableFichesBody');
  if (!tbody) return;

  tbody.innerHTML = fiches.length === 0
    ? "<tr><td colspan='5' style='text-align:center; color:#94a3b8; padding:14px;'>Aucune fiche synthèse enregistrée.</td></tr>"
    : fiches.map(f => {
      const mat = listeMatieresMemoire.find(m => Number(m.id) === Number(f.matiere_id));
      let comps = [];
      if (mat && Array.isArray(mat.competences)) {
        comps = mat.competences;
      } else if (mat && mat.competences_json) {
        try { comps = JSON.parse(mat.competences_json); } catch (e) {}
      }
      if (comps.length === 0 && /pr[ée]vention|pse/i.test(f.matiere_nom || "")) {
        comps = [
          { code: "C1", libelle: "Traiter l'information" },
          { code: "C2", libelle: "Appliquer une démarche d'analyse" },
          { code: "C3", libelle: "Expliquer un phénomène / enjeu en lien avec la prévention" },
          { code: "C4", libelle: "Proposer une solution pour résoudre un problème" },
          { code: "C5", libelle: "Argumenter un choix" }
        ];
      }
      const codeActuel = String(f.competence_code || "").toUpperCase();
      const optionsComp = `<option value="">— Générale —</option>` +
        comps.map(c => `<option value="${c.code}" ${String(c.code).toUpperCase() === codeActuel ? 'selected' : ''}>🎯 ${c.code} — ${c.libelle}</option>`).join('');

      return `
        <tr>
          <td><span class="badge" style="background:#e0f2fe; color:#0369a1;">${f.matiere_nom}</span></td>
          <td>
            <select class="input-field" style="margin:0; padding:4px 6px; font-size:0.8rem;" onchange="modifierCompetenceFiche(${f.id}, this.value)">
              ${optionsComp}
            </select>
          </td>
          <td><strong>${f.titre}</strong></td>
          <td style="text-align:center;">${new Date(f.date_creation).toLocaleDateString()}</td>
          <td style="text-align:center; display:flex; gap:6px; justify-content:center;">
            <button type="button" class="btn btn-simu" style="padding:4px 8px; font-size:0.75rem;" onclick="previsualiserFiche(${f.id})">👁️ Voir</button>
            <button type="button" class="btn btn-danger" style="padding:4px 8px; font-size:0.75rem;" onclick="supprimerFiche(${f.id}, '${f.titre.replace(/'/g, "\\'")}')">Suppr</button>
          </td>
        </tr>
      `;
    }).join('');
}

function importerFichierHtmlFiche(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const fullContent = e.target.result;
    const doc = new DOMParser().parseFromString(fullContent, 'text/html');
    const bodyHtml = (doc.body && doc.body.innerHTML.trim().length > 0) ? doc.body.innerHTML.trim() : fullContent.trim();
    document.getElementById('ficheHtmlInput').value = bodyHtml;

    const inputTitre = document.getElementById('ficheTitreInput');
    if (!inputTitre.value.trim()) {
      inputTitre.value = file.name.replace(/\.[^/.]+$/, "");
    }
    alert(`✓ Fichier "${file.name}" chargé dans le contenu de la fiche !`);
  };
  reader.readAsText(file, "UTF-8");
  input.value = "";
}

function insererImageDansFiche(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64Data = e.target.result;
    const tagImg = `\n<img src="${base64Data}" alt="Illustration" style="max-width:100%; height:auto; border-radius:6px; margin:10px 0; border:1px solid #cbd5e1; display:block;">\n`;
    const textarea = document.getElementById('ficheHtmlInput');
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + tagImg + textarea.value.substring(end);
      alert("Image insérée dans la fiche !");
    }
  };
  reader.readAsDataURL(file);
  input.value = "";
}

async function enregistrerNouvelleFiche() {
  const matiereId = document.getElementById('selectMatiereFiche').value;
  const competenceCode = document.getElementById('selectCompetenceFiche')?.value || '';
  const titre = document.getElementById('ficheTitreInput').value.trim();
  const contenuHtml = document.getElementById('ficheHtmlInput').value.trim();

  if (!matiereId) {
    alert("Veuillez obligatoirement sélectionner une matière pour cette fiche.");
    return;
  }
  if (!titre) {
    alert("Veuillez indiquer un titre pour la fiche.");
    return;
  }
  if (!contenuHtml) {
    alert("Le contenu HTML de la fiche ne peut pas être vide.");
    return;
  }

  const res = await fetch('/api/fiches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: "creer_fiche",
      prof_id: currentProf.id,
      matiere_id: parseInt(matiereId),
      titre,
      contenu_html: contenuHtml,
      competence_code: competenceCode
    })
  });

  if (res.ok) {
    alert(`✓ Fiche synthèse "${titre}" enregistrée avec succès !`);
    document.getElementById('ficheTitreInput').value = "";
    document.getElementById('ficheHtmlInput').value = "";
    await chargerFichesProf();
  } else {
    alert("Erreur lors de l'enregistrement de la fiche.");
  }
}

async function supprimerFiche(ficheId, titre) {
  if (!confirm(`Voulez-vous supprimer la fiche synthèse "${titre}" ?`)) return;
  await fetch(`/api/fiches?type=fiche&id=${ficheId}`, { method: 'DELETE' });
  await chargerFichesProf();
}

async function previsualiserFiche(ficheId) {
  try {
    const res = await fetch(`/api/fiches?fiche_id=${ficheId}`);
    const fiche = await res.json();
    if (!fiche) return;

    document.getElementById('titreModalApercuFiche').innerText = `[${fiche.matiere_nom}] ${fiche.titre}`;
    document.getElementById('corpsModalApercuFiche').innerHTML = fiche.contenu_html;
    document.getElementById('modalApercuFiche').style.display = 'flex';
  } catch (e) {}
}

function fermerApercuFiche() {
  document.getElementById('modalApercuFiche').style.display = 'none';
}