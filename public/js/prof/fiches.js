let listeMatieresMemoire = [];
let listeFichesMemoire = [];
let matiereEnCoursEditionCompId = null;

async function chargerMatieresProf() {
  if (!currentProf) return;
  try {
    const res = await fetch(`/api/fiches?mode=matieres_only&prof_id=${currentProf.id}&t=${Date.now()}`, { cache: "no-store" });
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

    alimenterFiltreClassesFiches();
    majCheckboxesClassesCreationFiche();

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

function alimenterFiltreClassesFiches() {
  const selClasse = document.getElementById('filtreClasseFicheSelect');
  if (!selClasse) return;
  const valActuelle = selClasse.value;
  const classes = (typeof listeClassesMemoire !== 'undefined' && Array.isArray(listeClassesMemoire)) ? listeClassesMemoire : [];
  selClasse.innerHTML = '<option value="">Toutes les classes</option>' +
    '<option value="__brouillon__">🔒 Brouillons (aucune classe)</option>' +
    classes.map(c => `<option value="${c.id}">${c.nom}</option>`).join('');
  if (valActuelle) selClasse.value = valActuelle;
}

function majCheckboxesClassesCreationFiche() {
  const cont = document.getElementById('zoneCheckboxesClassesCreationFiche');
  if (!cont) return;
  const classes = (typeof listeClassesMemoire !== 'undefined' && Array.isArray(listeClassesMemoire)) ? listeClassesMemoire : [];
  if (classes.length === 0) {
    cont.innerHTML = `<span style="font-size:0.8rem; color:#94a3b8; font-style:italic;">Aucune classe configurée.</span>`;
    return;
  }

  const matId = document.getElementById('selectMatiereFiche')?.value;
  const mat = listeMatieresMemoire.find(m => String(m.id) === String(matId));
  const idsMatiere = (mat && Array.isArray(mat.classe_ids)) ? mat.classe_ids.map(Number) : [];

  cont.innerHTML = classes.map(c => {
    const cid = Number(c.id);
    const cocheParDefaut = idsMatiere.length > 0 ? idsMatiere.includes(cid) : false;
    return `
      <label style="display:inline-flex; align-items:center; gap:6px; background:${cocheParDefaut ? '#dcfce7' : '#f8fafc'}; border:1px solid ${cocheParDefaut ? '#86efac' : '#cbd5e1'}; color:${cocheParDefaut ? '#166534' : '#475569'}; padding:5px 10px; border-radius:999px; font-size:0.8rem; font-weight:700; cursor:pointer; user-select:none; transition:all 0.15s;"
             onchange="this.style.background = this.querySelector('input').checked ? '#dcfce7' : '#f8fafc'; this.style.borderColor = this.querySelector('input').checked ? '#86efac' : '#cbd5e1'; this.style.color = this.querySelector('input').checked ? '#166534' : '#475569';">
        <input type="checkbox" class="chk-classe-creation-fiche" value="${cid}" ${cocheParDefaut ? 'checked' : ''} style="accent-color:#16a34a; cursor:pointer;">
        <span>${c.nom}</span>
      </label>
    `;
  }).join('');
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
    if ((!Array.isArray(listeClassesMemoire) || listeClassesMemoire.length === 0) && typeof chargerClassesProf === 'function') {
      await chargerClassesProf();
    }
    const res = await fetch(`/api/fiches?prof_id=${currentProf.id}&t=${Date.now()}`, { cache: "no-store" });
    listeFichesMemoire = await res.json();
    alimenterFiltreClassesFiches();
    majCheckboxesClassesCreationFiche();
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
  majCheckboxesClassesCreationFiche();

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

async function basculerAccesClasseFiche(ficheId, classeId, active) {
  const f = listeFichesMemoire.find(item => Number(item.id) === Number(ficheId));
  if (!f) return;

  // Mise à jour optimiste immédiate dans l'interface
  const anciensIds = getClassesAutoriseesPourFiche(f);
  const nouveauxIds = active
    ? Array.from(new Set([...anciensIds, Number(classeId)]))
    : anciensIds.filter(id => id !== Number(classeId));

  f.ciblage_classes = 1;
  f.classe_ids = nouveauxIds;
  afficherTableauFiches();
  const menu = document.getElementById('menu-classes-fiche-' + ficheId);
  if (menu) menu.style.display = 'block';

  try {
    const res = await fetch('/api/fiches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: "toggle_fiche_classe",
        fiche_id: ficheId,
        classe_id: classeId,
        active: active
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      f.classe_ids = data.classe_ids || nouveauxIds;
      afficherTableauFiches();
      const menuApres = document.getElementById('menu-classes-fiche-' + ficheId);
      if (menuApres) menuApres.style.display = 'block';
    } else {
      alert("Erreur serveur : " + (data.error || "Impossible de modifier l'accès."));
    }
  } catch (e) {
    alert("Erreur réseau lors de la mise à jour.");
  }
}

function getClassesAutoriseesPourFiche(f) {
  if (Array.isArray(f.classe_ids)) {
    return f.classe_ids.map(Number);
  }
  const mat = listeMatieresMemoire.find(m => Number(m.id) === Number(f.matiere_id));
  return (mat && Array.isArray(mat.classe_ids)) ? mat.classe_ids.map(Number) : [];
}

function toggleMenuClassesFiche(ficheId, event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('menu-classes-fiche-' + ficheId);
  if (!menu) return;
  const etaitOuvert = menu.style.display === 'block';
  document.querySelectorAll('.menu-classes-fiche-popover').forEach(el => el.style.display = 'none');
  if (!etaitOuvert) menu.style.display = 'block';
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.wrap-classes-fiche')) {
    document.querySelectorAll('.menu-classes-fiche-popover').forEach(el => el.style.display = 'none');
  }
});

function afficherTableauFiches() {
  const filtreMatiereId = document.getElementById('filtreMatiereFicheSelect')?.value;
  const filtreClasseId = document.getElementById('filtreClasseFicheSelect')?.value;
  const rechercheTxt = (document.getElementById('rechercheTitreFicheInput')?.value || "").trim().toLowerCase();
  const classes = (typeof listeClassesMemoire !== 'undefined' && Array.isArray(listeClassesMemoire)) ? listeClassesMemoire : [];
  const banqueQcms = (typeof listeBanqueQcmMemoire !== 'undefined' && Array.isArray(listeBanqueQcmMemoire)) ? listeBanqueQcmMemoire : [];

  let fiches = listeFichesMemoire;
  if (rechercheTxt) {
    fiches = fiches.filter(f =>
      String(f.titre || "").toLowerCase().includes(rechercheTxt) ||
      String(f.matiere_nom || "").toLowerCase().includes(rechercheTxt) ||
      String(f.competence_code || "").toLowerCase().includes(rechercheTxt)
    );
  }
  if (filtreMatiereId) {
    fiches = fiches.filter(f => String(f.matiere_id) === String(filtreMatiereId));
  }
  if (filtreClasseId) {
    if (filtreClasseId === "__brouillon__") {
      fiches = fiches.filter(f => getClassesAutoriseesPourFiche(f).length === 0);
    } else {
      const cidNum = Number(filtreClasseId);
      fiches = fiches.filter(f => getClassesAutoriseesPourFiche(f).includes(cidNum));
    }
  }

  const tbody = document.getElementById('tableFichesBody');
  if (!tbody) return;

  tbody.innerHTML = fiches.length === 0
    ? "<tr><td colspan='6' style='text-align:center; color:#94a3b8; padding:14px;'>Aucune fiche synthèse ne correspond à ces critères.</td></tr>"
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

      const idsAutorises = getClassesAutoriseesPourFiche(f);
      const classesActivesObjs = classes.filter(c => idsAutorises.includes(Number(c.id)));

      const pilulesClassesHtml = classes.length === 0
        ? `<span style="font-size:0.75rem; color:#94a3b8;">Aucune classe</span>`
        : `<div class="wrap-classes-fiche" style="position:relative; display:flex; gap:5px; flex-wrap:wrap; align-items:center;">
            ${classesActivesObjs.length === 0
              ? `<span style="font-size:0.74rem; color:#b45309; background:#fef3c7; border:1px solid #fde68a; padding:2px 8px; border-radius:999px; font-weight:700;">🔒 Brouillon</span>`
              : classesActivesObjs.map(c => `
                  <span style="display:inline-flex; align-items:center; gap:4px; background:#dcfce7; border:1px solid #86efac; color:#166534; border-radius:999px; padding:2px 8px; font-size:0.74rem; font-weight:700;">
                    ✓ ${c.nom}
                    <span onclick="basculerAccesClasseFiche(${f.id}, ${Number(c.id)}, false)" title="Retirer ${c.nom}" style="cursor:pointer; color:#15803d; font-weight:900; margin-left:2px;">×</span>
                  </span>
                `).join('')
            }
            <button type="button" onclick="toggleMenuClassesFiche(${f.id}, event)"
                    style="background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; border-radius:999px; padding:2px 8px; font-size:0.73rem; font-weight:700; cursor:pointer;">
              + Classes
            </button>
            <div id="menu-classes-fiche-${f.id}" class="menu-classes-fiche-popover"
                 style="display:none; position:absolute; top:100%; left:0; z-index:50; background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; box-shadow:0 10px 25px rgba(15,23,42,0.18); padding:8px 10px; min-width:190px; margin-top:4px;">
              <div style="font-size:0.74rem; font-weight:800; color:#334155; margin-bottom:6px; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">
                Publier aux classes :
              </div>
              ${classes.map(c => {
                const cid = Number(c.id);
                const estActive = idsAutorises.includes(cid);
                return `
                  <label style="display:flex; align-items:center; gap:7px; padding:3px 2px; font-size:0.8rem; cursor:pointer; color:#1e293b; font-weight:${estActive ? '700' : '500'};">
                    <input type="checkbox" ${estActive ? 'checked' : ''} onchange="basculerAccesClasseFiche(${f.id}, ${cid}, this.checked)" style="accent-color:#16a34a; cursor:pointer;">
                    <span>${c.nom}</span>
                  </label>
                `;
              }).join('')}
            </div>
          </div>`;

      return `
        <tr>
          <td><span class="badge" style="background:#e0f2fe; color:#0369a1;">${f.matiere_nom}</span></td>
          <td>
            <select class="input-field" style="margin:0; padding:4px 6px; font-size:0.8rem;" onchange="modifierCompetenceFiche(${f.id}, this.value)">
              ${optionsComp}
            </select>
          </td>
          <td>
            <strong>${f.titre}</strong>
            ${(() => {
              const qcmsLies = banqueQcms.filter(q => Number(q.fiche_id) === Number(f.id));
              if (qcmsLies.length === 0) return '';
              return `<div style="margin-top:4px; display:flex; gap:4px; flex-wrap:wrap;">` +
                qcmsLies.map(q => `<span style="font-size:0.71rem; background:#f3e8ff; color:#6b21a8; border:1px solid #e9d5ff; padding:1px 6px; border-radius:4px; font-weight:600;">🔗 QCM : ${q.titre}</span>`).join('') +
              `</div>`;
            })()}
          </td>
          <td>${pilulesClassesHtml}</td>
          <td style="text-align:center;">${new Date(f.date_creation).toLocaleDateString()}</td>
          <td style="text-align:center;">
            <div style="display:inline-flex; gap:5px; justify-content:center; flex-wrap:nowrap;">
              <button type="button" class="btn btn-simu" style="padding:4px 8px; font-size:0.75rem;" onclick="previsualiserFiche(${f.id})" title="Aperçu élève">👁️ Voir</button>
              <button type="button" class="btn" style="background:#0284c7; padding:4px 8px; font-size:0.75rem;" onclick="ouvrirModalEditionFiche(${f.id})" title="Modifier le titre, le contenu ou les classes">✏️ Modifier</button>
              <button type="button" class="btn btn-danger" style="padding:4px 8px; font-size:0.75rem;" onclick="supprimerFiche(${f.id}, '${f.titre.replace(/'/g, "\\'")}')">Suppr</button>
            </div>
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
  const classeIdsSelectionnees = Array.from(document.querySelectorAll('.chk-classe-creation-fiche:checked')).map(cb => parseInt(cb.value, 10));

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
      competence_code: competenceCode,
      classe_ids: classeIdsSelectionnees
    })
  });

  if (res.ok) {
    const msgStatut = classeIdsSelectionnees.length > 0
      ? `publiée pour ${classeIdsSelectionnees.length} classe(s)`
      : `enregistrée en brouillon (aucune classe cochée)`;
    alert(`✓ Fiche synthèse "${titre}" ${msgStatut} !`);
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

    const badgeEl = document.getElementById('badgeMatiereApercuFiche');
    if (badgeEl) {
      if (fiche.matiere_nom) { badgeEl.innerText = fiche.matiere_nom; badgeEl.style.display = 'inline-block'; }
      else { badgeEl.style.display = 'none'; }
    }

    document.getElementById('titreModalApercuFiche').innerText = fiche.titre;
    const corps = document.getElementById('corpsModalApercuFiche');
    corps.innerHTML = fiche.contenu_html;
    corps.scrollTop = 0;
    document.getElementById('modalApercuFiche').style.display = 'flex';
  } catch (e) {}
}

function fermerApercuFiche() {
  const modal = document.getElementById('modalApercuFiche');
  if (modal) modal.style.display = 'none';
}

function imprimerModalFicheProf() {
  const modal = document.getElementById('modalApercuFiche');
  if (!modal) return;
  document.body.classList.add('printing-fiche');
  modal.classList.add('fiche-print-active');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-fiche');
    modal.classList.remove('fiche-print-active');
  }, 300);
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermerApercuFiche(); });
// ==================== MODALE ÉDITION COMPLÈTE FICHE SYNTHÈSE ====================
let ficheEnCoursEditionId = null;

async function ouvrirModalEditionFiche(ficheId) {
  try {
    const res = await fetch(`/api/fiches?fiche_id=${ficheId}&t=${Date.now()}`, { cache: "no-store" });
    const fiche = await res.json();
    if (!fiche) {
      alert("Impossible de charger cette fiche.");
      return;
    }

    ficheEnCoursEditionId = Number(fiche.id);

    // 1. Alimenter le sélecteur de matière
    const selMat = document.getElementById('editFicheMatiereSelect');
    if (selMat) {
      selMat.innerHTML = listeMatieresMemoire.map(m =>
        `<option value="${m.id}" ${Number(m.id) === Number(fiche.matiere_id) ? 'selected' : ''}>${m.nom}</option>`
      ).join('');
    }

    // 2. Alimenter les compétences de cette matière
    majSelectCompetencesEditionFiche(fiche.competence_code || "");

    // 3. Titre et contenu HTML
    document.getElementById('editFicheTitreInput').value = fiche.titre || "";
    const txtHtml = document.getElementById('editFicheHtmlInput');
    txtHtml.value = fiche.contenu_html || "";
    actualiserApercuDirectEditionFiche();

    // 4. Pilules des classes autorisées
    const ficheMem = listeFichesMemoire.find(item => Number(item.id) === ficheEnCoursEditionId) || fiche;
    const idsAutorises = getClassesAutoriseesPourFiche(ficheMem);
    const classes = (typeof listeClassesMemoire !== 'undefined' && Array.isArray(listeClassesMemoire)) ? listeClassesMemoire : [];
    const zoneClasses = document.getElementById('editFicheZoneClasses');

    if (zoneClasses) {
      zoneClasses.innerHTML = classes.length === 0
        ? `<span style="font-size:0.8rem; color:#94a3b8;">Aucune classe configurée.</span>`
        : classes.map(c => {
            const cid = Number(c.id);
            const coche = idsAutorises.includes(cid);
            return `
              <label style="display:inline-flex; align-items:center; gap:6px; background:${coche ? '#dcfce7' : '#f8fafc'}; border:1px solid ${coche ? '#86efac' : '#cbd5e1'}; color:${coche ? '#166534' : '#475569'}; padding:4px 10px; border-radius:999px; font-size:0.78rem; font-weight:700; cursor:pointer; user-select:none;"
                     onchange="this.style.background = this.querySelector('input').checked ? '#dcfce7' : '#f8fafc'; this.style.borderColor = this.querySelector('input').checked ? '#86efac' : '#cbd5e1'; this.style.color = this.querySelector('input').checked ? '#166534' : '#475569';">
                <input type="checkbox" class="chk-classe-edition-fiche" value="${cid}" ${coche ? 'checked' : ''} style="accent-color:#16a34a; cursor:pointer;">
                <span>${c.nom}</span>
              </label>
            `;
          }).join('');
    }

    document.getElementById('modalEditionFiche').style.display = 'flex';
  } catch (e) {
    alert("Erreur lors du chargement de la fiche.");
  }
}

function majSelectCompetencesEditionFiche(codeForce = null) {
  const matId = document.getElementById('editFicheMatiereSelect')?.value;
  const selComp = document.getElementById('editFicheCompetenceSelect');
  if (!selComp) return;

  const codeActuel = codeForce !== null ? String(codeForce).toUpperCase() : String(selComp.value || "").toUpperCase();
  const mat = listeMatieresMemoire.find(m => String(m.id) === String(matId));
  const comps = (mat && Array.isArray(mat.competences)) ? mat.competences : [];

  selComp.innerHTML = '<option value="">-- Fiche générale (sans badge) --</option>' +
    comps.map(c => `<option value="${c.code}" ${String(c.code).toUpperCase() === codeActuel ? 'selected' : ''}>🎯 ${c.code} — ${c.libelle}</option>`).join('');
}

function actualiserApercuDirectEditionFiche() {
  const html = document.getElementById('editFicheHtmlInput')?.value || "";
  const preview = document.getElementById('editFicheApercuLive');
  if (preview) {
    preview.innerHTML = html.trim()
      ? html
      : `<div style="color:#94a3b8; font-style:italic; text-align:center; padding:30px 10px;">L'aperçu visuel de la fiche apparaîtra ici...</div>`;
  }
}

function importerFichierHtmlEditionFiche(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const fullContent = e.target.result;
    const doc = new DOMParser().parseFromString(fullContent, 'text/html');
    const bodyHtml = (doc.body && doc.body.innerHTML.trim().length > 0) ? doc.body.innerHTML.trim() : fullContent.trim();
    document.getElementById('editFicheHtmlInput').value = bodyHtml;
    actualiserApercuDirectEditionFiche();
  };
  reader.readAsText(file, "UTF-8");
  input.value = "";
}

function insererImageDansEditionFiche(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const tagImg = `\n<img src="${e.target.result}" alt="Illustration" style="max-width:100%; height:auto; border-radius:6px; margin:10px 0; border:1px solid #cbd5e1; display:block;">\n`;
    const textarea = document.getElementById('editFicheHtmlInput');
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + tagImg + textarea.value.substring(end);
      actualiserApercuDirectEditionFiche();
    }
  };
  reader.readAsDataURL(file);
  input.value = "";
}

function fermerModalEditionFiche() {
  const modal = document.getElementById('modalEditionFiche');
  if (modal) modal.style.display = 'none';
  ficheEnCoursEditionId = null;
}

async function sauvegarderEditionFiche() {
  if (!ficheEnCoursEditionId) return;

  const matiereId = document.getElementById('editFicheMatiereSelect').value;
  const competenceCode = document.getElementById('editFicheCompetenceSelect')?.value || '';
  const titre = document.getElementById('editFicheTitreInput').value.trim();
  const contenuHtml = document.getElementById('editFicheHtmlInput').value.trim();
  const classeIds = Array.from(document.querySelectorAll('.chk-classe-edition-fiche:checked')).map(cb => parseInt(cb.value, 10));

  if (!matiereId || !titre || !contenuHtml) {
    alert("Veuillez renseigner la matière, le titre et le contenu HTML de la fiche.");
    return;
  }

  try {
    const res = await fetch('/api/fiches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: "modifier_fiche",
        fiche_id: ficheEnCoursEditionId,
        matiere_id: parseInt(matiereId, 10),
        titre,
        contenu_html: contenuHtml,
        competence_code: competenceCode,
        classe_ids: classeIds
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      fermerModalEditionFiche();
      await chargerFichesProf();
    } else {
      alert("Erreur lors de la sauvegarde : " + (data.error || "Erreur serveur"));
    }
  } catch (e) {
    alert("Erreur réseau lors de l'enregistrement.");
  }
}