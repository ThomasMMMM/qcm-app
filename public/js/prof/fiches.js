let listeMatieresMemoire = [];
let listeFichesMemoire = [];

async function chargerMatieresProf() {
  if (!currentProf) return;
  try {
    const res = await fetch(`/api/fiches?mode=matieres_only&prof_id=${currentProf.id}`);
    listeMatieresMemoire = await res.json();

    // 1. Alimenter le select pour ajouter une fiche
    const selAjout = document.getElementById('selectMatiereFiche');
    if (selAjout) {
      if (listeMatieresMemoire.length === 0) {
        selAjout.innerHTML = '<option value="">-- Aucune matière (créez-en une d abord) --</option>';
      } else {
        selAjout.innerHTML = '<option value="">-- Sélectionner une matière --</option>' +
          listeMatieresMemoire.map(m => `<option value="${m.id}">${m.nom}</option>`).join('');
      }
    }

    // 2. Alimenter le filtre des fiches
    const selFiltre = document.getElementById('filtreMatiereFicheSelect');
    if (selFiltre) {
      selFiltre.innerHTML = '<option value="">Toutes les matières</option>' +
        listeMatieresMemoire.map(m => `<option value="${m.id}">${m.nom}</option>`).join('');
    }

    // 3. Alimenter le select dans la banque QCM (pour lier une fiche en dossier ressource)
    const selDocQcm = document.getElementById('selectFichePourQcm');
    if (selDocQcm) {
      selDocQcm.innerHTML = '<option value="">-- Aucun ou HTML manuel ci-dessous --</option>' +
        listeFichesMemoire.map(f => `<option value="${f.id}">[${f.matiere_nom}] ${f.titre}</option>`).join('');
    }

    // 4. Liste des badges/matières éditables
    const contMatieres = document.getElementById('listeBadgesMatieres');
    if (contMatieres) {
      contMatieres.innerHTML = listeMatieresMemoire.length === 0 
        ? "<span style='color:#94a3b8; font-size:0.85rem; font-style:italic;'>Aucune matière créée pour l'instant.</span>"
        : listeMatieresMemoire.map(m => `
          <span class="badge" style="background:#e0f2fe; color:#0369a1; padding:5px 10px; font-size:0.85rem; display:inline-flex; align-items:center; gap:6px;">
            ${m.nom}
            <i class="fa-solid fa-xmark" style="cursor:pointer; color:#b91c1c;" onclick="supprimerMatiere(${m.id}, '${m.nom}')" title="Supprimer la matière"></i>
          </span>
        `).join(' ');
    }
  } catch(e) {}
}

async function creerNouvelleMatiere() {
  const input = document.getElementById('nouvelleMatiereInput');
  const nom = input.value.trim();
  if (!nom) {
    alert("Veuillez indiquer le nom de la matière (ex: Microbiologie, SMS, Mathématiques).");
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

    // Actualiser le sélecteur dans le module banque QCM
    const selDocQcm = document.getElementById('selectFichePourQcm');
    if (selDocQcm) {
      selDocQcm.innerHTML = '<option value="">-- Aucun ou HTML manuel ci-dessous --</option>' +
        listeFichesMemoire.map(f => `<option value="${f.id}">[${f.matiere_nom}] ${f.titre}</option>`).join('');
    }
  } catch(e) {}
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
    ? "<tr><td colspan='4' style='text-align:center; color:#94a3b8; padding:14px;'>Aucune fiche synthèse enregistrée.</td></tr>"
    : fiches.map(f => `
      <tr>
        <td><span class="badge" style="background:#e0f2fe; color:#0369a1;">${f.matiere_nom}</span></td>
        <td><strong>${f.titre}</strong></td>
        <td style="text-align:center;">${new Date(f.date_creation).toLocaleDateString()}</td>
        <td style="text-align:center; display:flex; gap:6px; justify-content:center;">
          <button type="button" class="btn btn-simu" style="padding:4px 8px; font-size:0.75rem;" onclick="previsualiserFiche(${f.id})">👁️ Voir</button>
          <button type="button" class="btn btn-danger" style="padding:4px 8px; font-size:0.75rem;" onclick="supprimerFiche(${f.id}, '${f.titre}')">Suppr</button>
        </td>
      </tr>
    `).join('');
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
    
    // Si le titre de la fiche est encore vide, on prend le nom du fichier
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
      contenu_html: contenuHtml
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
  } catch(e) {}
}

function fermerApercuFiche() {
  document.getElementById('modalApercuFiche').style.display = 'none';
}
