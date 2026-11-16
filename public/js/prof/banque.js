let listeBanqueQcmMemoire = [];

function alimenterSelectMatieresBanque() {
  const selMat = document.getElementById('selectBanqueMatiereImport');
  if (!selMat) return;
  const matieres = (typeof listeMatieresMemoire !== 'undefined') ? listeMatieresMemoire : [];
  const valActuelle = selMat.value;
  selMat.innerHTML = '<option value="">-- Aucune matière --</option>' +
    matieres.map(m => `<option value="${m.id}">${m.nom}</option>`).join('');
  if (valActuelle) selMat.value = valActuelle;
  majSelectCompetencesImport();
}

function majSelectCompetencesImport() {
  const selMat = document.getElementById('selectBanqueMatiereImport');
  const selComp = document.getElementById('selectBanqueCompetenceImport');
  if (!selMat || !selComp) return;

  const matId = selMat.value;
  if (!matId) {
    selComp.innerHTML = '<option value="">-- Sélectionner une matière d\'abord --</option>';
    return;
  }

  const matieres = (typeof listeMatieresMemoire !== 'undefined') ? listeMatieresMemoire : [];
  const mat = matieres.find(m => String(m.id) === String(matId));
  const comps = (mat && Array.isArray(mat.competences)) ? mat.competences : [];

  selComp.innerHTML = '<option value="">-- Aucune compétence ciblée --</option>' +
    comps.map(c => `<option value="${c.code}">${c.code} — ${c.libelle}</option>`).join('');
}

async function modifierCompetenceQcmInline(qcmId, nouvelleMatiereId, nouvelleCompCode) {
  try {
    await fetch('/api/banque', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: "update_competence",
        qcm_id: qcmId,
        matiere_id: nouvelleMatiereId || null,
        competence_code: nouvelleCompCode || null
      })
    });
    const q = listeBanqueQcmMemoire.find(item => Number(item.id) === Number(qcmId));
    if (q) {
      q.matiere_id = nouvelleMatiereId ? parseInt(nouvelleMatiereId, 10) : null;
      q.competence_code = nouvelleCompCode || null;
    }
    afficherTableauBanqueQcm();
  } catch (e) {}
}

function afficherTableauBanqueQcm() {
  const tbody = document.getElementById('tableBanqueQcmBody');
  if (!tbody) return;

  const matieres = (typeof listeMatieresMemoire !== 'undefined') ? listeMatieresMemoire : [];

  tbody.innerHTML = listeBanqueQcmMemoire.length === 0
    ? "<tr><td colspan='4' style='text-align:center; color:#94a3b8; padding:14px;'>Aucun QCM enregistré.</td></tr>"
    : listeBanqueQcmMemoire.map(q => {
      const mat = matieres.find(m => Number(m.id) === Number(q.matiere_id));
      const comps = (mat && Array.isArray(mat.competences)) ? mat.competences : [];

      const optionsMat = '<option value="">Matière...</option>' +
        matieres.map(m => `<option value="${m.id}" ${Number(m.id) === Number(q.matiere_id) ? 'selected' : ''}>${m.nom}</option>`).join('');

      const optionsComp = '<option value="">Compétence...</option>' +
        comps.map(c => `<option value="${c.code}" ${String(c.code) === String(q.competence_code || '') ? 'selected' : ''}>${c.code} — ${c.libelle}</option>`).join('');

      return `
        <tr>
          <td>
            <strong>${q.titre}</strong>
            ${q.document_html ? '<span class="badge" style="background:#e0f2fe; color:#0369a1; margin-left:4px;">📄 Doc inclus</span>' : ''}
          </td>
          <td>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <select class="input-field" style="margin:0; padding:4px 6px; font-size:0.78rem; width:auto; max-width:125px;" onchange="modifierCompetenceQcmInline(${q.id}, this.value, '')">
                ${optionsMat}
              </select>
              <select class="input-field" style="margin:0; padding:4px 6px; font-size:0.78rem; width:auto; max-width:165px;" ${!q.matiere_id ? 'disabled' : ''} onchange="modifierCompetenceQcmInline(${q.id}, '${q.matiere_id || ''}', this.value)">
                ${optionsComp}
              </select>
            </div>
          </td>
          <td style="text-align:center;">${new Date(q.date_creation).toLocaleDateString()}</td>
          <td style="text-align:center; display:flex; gap:6px; justify-content:center;">
            <button type="button" class="btn btn-simu" style="padding:4px 8px; font-size:0.75rem;" onclick="lancerSimulationBanque(${q.id})">🔍 Tester</button>
            <button type="button" class="btn btn-danger" style="padding:4px 8px; font-size:0.75rem;" onclick="supprimerQcmBanque(${q.id})">Suppr</button>
          </td>
        </tr>
      `;
    }).join('');
}

async function chargerBanqueProf() {
  if (!currentProf) return;
  try {
    const res = await fetch('/api/banque?prof_id=' + currentProf.id);
    listeBanqueQcmMemoire = await res.json();

    alimenterSelectMatieresBanque();
    afficherTableauBanqueQcm();

    const selQcm = document.getElementById('selectSeanceQcm');
    if (selQcm) selQcm.innerHTML = listeBanqueQcmMemoire.map(q => '<option value="' + q.id + '">' + q.titre + '</option>').join('');
  } catch (e) {}
}

function importerFichierHtmlDoc(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const fullContent = e.target.result;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(fullContent, 'text/html');
      const bodyHtml = (doc.body && doc.body.innerHTML.trim().length > 0) ? doc.body.innerHTML.trim() : fullContent.trim();
      document.getElementById('documentHtmlInput').value = bodyHtml;
      alert('✓ Fichier "' + file.name + '" importé avec succès dans le document ressource !');
    } catch (err) {
      document.getElementById('documentHtmlInput').value = fullContent.trim();
      alert('✓ Fichier "' + file.name + '" importé !');
    }
  };
  reader.readAsText(file, "UTF-8");
  input.value = "";
}

function convertirImageEtInsererHtml(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64Data = e.target.result;
    const tagImg = '\n<img src="' + base64Data + '" alt="Ressource" style="max-width:100%; height:auto; border-radius:6px; margin:10px 0; border:1px solid #cbd5e1; display:block;">\n';
    const textarea = document.getElementById('documentHtmlInput');
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + tagImg + textarea.value.substring(end);
      alert("Image convertie en Base64 et insérée dans le HTML !");
    }
  };
  reader.readAsDataURL(file);
  input.value = "";
}

async function lierFicheAuQcm(select) {
  const ficheId = select.value;
  if (!ficheId) return;
  try {
    const res = await fetch('/api/fiches?fiche_id=' + ficheId);
    const f = await res.json();
    if (f && f.contenu_html) {
      document.getElementById('documentHtmlInput').value = f.contenu_html;
      if (f.matiere_id) {
        const selMat = document.getElementById('selectBanqueMatiereImport');
        if (selMat) {
          selMat.value = f.matiere_id;
          majSelectCompetencesImport();
        }
      }
      alert('✓ Contenu de la fiche "' + f.titre + '" injecté en tant que Document Ressource du QCM !');
    }
  } catch (e) {}
}

async function importerDansBanque() {
  const fileInput = document.getElementById('xmlBanqueInput');
  const file = fileInput.files[0];
  if (!file) { alert("Veuillez sélectionner un fichier XML Pronote."); return; }

  const text = await file.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");

  let titreQcm = file.name.replace(/\.[^/.]+$/, "");
  const catTextNode = xmlDoc.querySelector('question[type="category"] text');
  if (catTextNode && catTextNode.textContent) {
    let brut = catTextNode.textContent.trim();
    const matchName = brut.match(/<name>([^<]+)<\/name>/i);
    if (matchName && matchName[1]) {
      titreQcm = matchName[1].trim();
    } else if (!brut.startsWith('<') && brut.length > 0) {
      titreQcm = brut;
    }
  }

  const questionsNodes = xmlDoc.querySelectorAll('question:not([type="category"])');
  const questions = [];

  questionsNodes.forEach(qn => {
    const type = qn.getAttribute("type");
    const nameNode = qn.querySelector('name text');
    const questionTextNode = qn.querySelector('questiontext text');
    const defaultGradeNode = qn.querySelector('defaultgrade');
    const generalFeedbackNode = qn.querySelector('generalfeedback text');

    const title = nameNode ? nameNode.textContent.trim() : "";
    const enonce = questionTextNode ? questionTextNode.textContent.trim() : "";
    const points = defaultGradeNode ? parseFloat(defaultGradeNode.textContent) : 1;
    const generalFeedback = generalFeedbackNode ? generalFeedbackNode.textContent.trim() : "";

    if (type === "multichoice") {
      const single = qn.querySelector('single') ? qn.querySelector('single').textContent.trim() === 'true' : true;
      const answersNodes = qn.querySelectorAll('answer');
      const answers = [];
      answersNodes.forEach(an => {
        const fraction = parseFloat(an.getAttribute("fraction")) || 0;
        const textAns = an.querySelector('text') ? an.querySelector('text').textContent.trim() : "";
        const fbAns = an.querySelector('feedback text') ? an.querySelector('feedback text').textContent.trim() : "";
        answers.push({ text: textAns, fraction, feedback: fbAns });
      });
      questions.push({ type, title, enonce, points, single, generalFeedback, answers });
    } else if (type === "matching") {
      const subqNodes = qn.querySelectorAll('subquestion');
      const subquestions = [];
      subqNodes.forEach(sq => {
        const sqText = sq.querySelector('text') ? sq.querySelector('text').textContent.trim() : "";
        const ansText = sq.querySelector('answer text') ? sq.querySelector('answer text').textContent.trim() : "";
        if (sqText && ansText) subquestions.push({ question: sqText, answer: ansText });
      });
      questions.push({ type, title, enonce, points, generalFeedback, subquestions });
    }
  });

  if (questions.length === 0) {
    alert("Aucune question valide trouvée dans ce fichier XML Pronote.");
    return;
  }

  const docHtml = document.getElementById('documentHtmlInput').value.trim() || null;
  const matiereId = document.getElementById('selectBanqueMatiereImport')?.value || null;
  const competenceCode = document.getElementById('selectBanqueCompetenceImport')?.value || null;

  const res = await fetch('/api/banque', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      titre: titreQcm,
      questions,
      prof_id: currentProf.id,
      document_html: docHtml,
      matiere_id: matiereId,
      competence_code: competenceCode
    })
  });

  if (res.ok) {
    alert('✓ QCM "' + titreQcm + '" importé avec succès (' + questions.length + ' questions) !');
    fileInput.value = "";
    document.getElementById('documentHtmlInput').value = "";
    chargerBanqueProf();
  } else {
    alert("Erreur lors de l'enregistrement dans la banque.");
  }
}

async function supprimerQcmBanque(qcmId) {
  if (!confirm("Voulez-vous vraiment supprimer ce QCM de votre banque ?")) return;
  await fetch('/api/banque?qcm_id=' + qcmId, { method: 'DELETE' });
  chargerBanqueProf();
}