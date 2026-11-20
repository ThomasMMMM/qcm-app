let listeBanqueQcmMemoire = [];

function parserQuestionClozeMoodle(enonceHtml, pointsDefaut) {
  // Détecte les balises Moodle Cloze : {1:MC:=Bonne~Fausse1~Fausse2} ou {1:MULTICHOICE:...} ou {1:SHORTANSWER:=Rep}
  const regexCloze = /\{(\d+)?\s*:\s*(MC|MCV|MCH|MULTICHOICE|MULTICHOICE_V|MULTICHOICE_H|SA|SHORTANSWER|MW|NUMERICAL|NM)\s*:\s*([^}]+)\}/gi;
  const sousEtapes = [];
  let match;
  let idx = 0;

  const htmlAvecPlaceholders = enonceHtml.replace(regexCloze, (fullMatch, poidsStr, subType, contenu) => {
    const poids = poidsStr ? parseFloat(poidsStr) : 1;
    const typeUpper = subType.toUpperCase();
    const isShort = (typeUpper === "SA" || typeUpper === "SHORTANSWER" || typeUpper === "MW" || typeUpper === "NUMERICAL" || typeUpper === "NM");

    const morceaux = contenu.split('~').map(s => s.trim()).filter(Boolean);
    const options = [];
    let bonneReponse = "";

    morceaux.forEach(m => {
      let estCorrect = false;
      let texteOpt = m;
      let feedbackOpt = "";

      if (texteOpt.startsWith('=')) {
        estCorrect = true;
        texteOpt = texteOpt.slice(1).trim();
      } else if (/^%100%/.test(texteOpt)) {
        estCorrect = true;
        texteOpt = texteOpt.replace(/^%100%/, '').trim();
      } else if (/^%\d+%/.test(texteOpt)) {
        texteOpt = texteOpt.replace(/^%\d+%/, '').trim();
      }

      if (texteOpt.includes('#')) {
        const parts = texteOpt.split('#');
        texteOpt = parts[0].trim();
        feedbackOpt = parts.slice(1).join('#').trim();
      }

      if (estCorrect && !bonneReponse) bonneReponse = texteOpt;
      options.push({ text: texteOpt, correct: estCorrect, feedback: feedbackOpt });
    });

    if (!bonneReponse && options.length > 0) {
      bonneReponse = options[0].text;
      options[0].correct = true;
    }

    const token = `[[CLOZE_STEP_${idx}]]`;
    sousEtapes.push({
      index: idx,
      mode: isShort ? "text" : "select",
      poids,
      bonne_reponse: bonneReponse,
      options
    });
    idx++;
    return token;
  });

  if (sousEtapes.length === 0) return null;

  const totalPoids = sousEtapes.reduce((acc, s) => acc + (s.poids || 1), 0);
  return {
    type: "cloze",
    enonce_template: htmlAvecPlaceholders,
    etapes: sousEtapes,
    points: pointsDefaut || totalPoids || 1
  };
}

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

async function renommerQcmBanque(qcmId) {
  const q = listeBanqueQcmMemoire.find(item => Number(item.id) === Number(qcmId));
  if (!q) return;
  const nouveauTitre = prompt("Nouveau titre du QCM :", q.titre || "");
  if (nouveauTitre === null) return;
  const titreNettoye = nouveauTitre.trim();
  if (!titreNettoye || titreNettoye === q.titre) return;

  try {
    const res = await fetch('/api/banque', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: "update_titre",
        qcm_id: qcmId,
        titre: titreNettoye
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      alert("Erreur lors du renommage : " + (data.error || "Erreur serveur"));
      return;
    }
    q.titre = titreNettoye;
    afficherTableauBanqueQcm();
    const selQcm = document.getElementById('selectSeanceQcm');
    if (selQcm) {
      const valSel = selQcm.value;
      selQcm.innerHTML = listeBanqueQcmMemoire.map(item => '<option value="' + item.id + '">' + item.titre + '</option>').join('');
      if (valSel) selQcm.value = valSel;
    }
    if (typeof chargerSeancesProf === 'function') chargerSeancesProf();
  } catch (e) {
    alert("Erreur réseau lors du renommage.");
  }
}

async function modifierFicheLieeQcmInline(qcmId, nouvelleFicheId) {
  try {
    await fetch('/api/banque', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: "update_fiche_liee",
        qcm_id: qcmId,
        fiche_id: nouvelleFicheId || null
      })
    });
    const q = listeBanqueQcmMemoire.find(item => Number(item.id) === Number(qcmId));
    if (q) {
      q.fiche_id = nouvelleFicheId ? parseInt(nouvelleFicheId, 10) : null;
    }
    afficherTableauBanqueQcm();
    if (typeof afficherTableauFiches === 'function') afficherTableauFiches();
  } catch (e) {}
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
  const fiches = (typeof listeFichesMemoire !== 'undefined') ? listeFichesMemoire : [];

  tbody.innerHTML = listeBanqueQcmMemoire.length === 0
    ? "<tr><td colspan='5' style='text-align:center; color:#94a3b8; padding:14px;'>Aucun QCM enregistré.</td></tr>"
    : listeBanqueQcmMemoire.map(q => {
      const mat = matieres.find(m => Number(m.id) === Number(q.matiere_id));
      const comps = (mat && Array.isArray(mat.competences)) ? mat.competences : [];

      const optionsMat = '<option value="">Matière...</option>' +
        matieres.map(m => `<option value="${m.id}" ${Number(m.id) === Number(q.matiere_id) ? 'selected' : ''}>${m.nom}</option>`).join('');

      const optionsComp = '<option value="">Compétence...</option>' +
        comps.map(c => `<option value="${c.code}" ${String(c.code) === String(q.competence_code || '') ? 'selected' : ''}>${c.code} — ${c.libelle}</option>`).join('');

      const fichesTriees = [...fiches].sort((a, b) => {
        const aMatch = q.matiere_id && Number(a.matiere_id) === Number(q.matiere_id) ? 0 : 1;
        const bMatch = q.matiere_id && Number(b.matiere_id) === Number(q.matiere_id) ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        return String(a.titre || '').localeCompare(String(b.titre || ''));
      });
      const optionsFiches = '<option value="">— Aucune fiche —</option>' +
        fichesTriees.map(f => `<option value="${f.id}" ${Number(f.id) === Number(q.fiche_id) ? 'selected' : ''}>${f.matiere_nom ? '[' + f.matiere_nom + '] ' : ''}${f.titre}</option>`).join('');

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <strong>${q.titre}</strong>
              ${q.document_html ? '<span class="badge" style="background:#e0f2fe; color:#0369a1; white-space:nowrap;">📄 Doc inclus</span>' : ''}
            </div>
          </td>
          <td>
            <div style="display:flex; gap:5px; flex-wrap:nowrap; align-items:center;">
              <select class="input-field" style="margin:0; padding:4px 6px; font-size:0.78rem; width:125px;" onchange="modifierCompetenceQcmInline(${q.id}, this.value, '')">
                ${optionsMat}
              </select>
              <select class="input-field" style="margin:0; padding:4px 6px; font-size:0.78rem; width:130px;" ${!q.matiere_id ? 'disabled' : ''} onchange="modifierCompetenceQcmInline(${q.id}, '${q.matiere_id || ''}', this.value)">
                ${optionsComp}
              </select>
            </div>
          </td>
          <td>
            <div style="display:flex; gap:4px; align-items:center;">
              <select class="input-field" style="margin:0; padding:4px 6px; font-size:0.78rem; flex:1; min-width:140px;" onchange="modifierFicheLieeQcmInline(${q.id}, this.value)">
                ${optionsFiches}
              </select>
              ${q.fiche_id ? `<button type="button" class="btn btn-simu" style="padding:4px 7px; font-size:0.74rem;" onclick="previsualiserFiche(${q.fiche_id})" title="Aperçu de la fiche liée">👁️</button>` : ''}
            </div>
          </td>
          <td style="text-align:center;">${new Date(q.date_creation).toLocaleDateString()}</td>
          <td style="text-align:center; white-space:nowrap;">
            <div style="display:inline-flex; gap:5px; justify-content:center; align-items:center; flex-wrap:nowrap;">
              <button type="button" class="btn" style="background:#0284c7; padding:4px 8px; font-size:0.75rem; white-space:nowrap;" onclick="ouvrirModaleEditionQcm(${q.id})" title="Modifier le titre, le support ou les questions">✏️ Modifier</button>
              <button type="button" class="btn btn-simu" style="padding:4px 8px; font-size:0.75rem; white-space:nowrap;" onclick="lancerSimulationBanque(${q.id})">🔍 Tester</button>
              <button type="button" class="btn btn-danger" style="padding:4px 8px; font-size:0.75rem; white-space:nowrap;" onclick="supprimerQcmBanque(${q.id})">Suppr</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
}

async function chargerBanqueProf() {
  if (!currentProf) return;
  try {
    if ((!Array.isArray(listeFichesMemoire) || listeFichesMemoire.length === 0) && typeof chargerFichesProf === 'function') {
      await chargerFichesProf();
    }
    const res = await fetch('/api/banque?prof_id=' + currentProf.id + '&t=' + Date.now(), { cache: "no-store" });
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
      titreQcm = brut.replace(/^\$course\$\/(?:[^/]+\/)*/i, '').trim() || brut;
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
    } else if (type === "cloze") {
      const parsedCloze = parserQuestionClozeMoodle(enonce, points);
      if (parsedCloze) {
        questions.push({
          type: "cloze",
          title,
          enonce: enonce,
          enonce_template: parsedCloze.enonce_template,
          etapes: parsedCloze.etapes,
          points: parsedCloze.points,
          generalFeedback
        });
      }
    } else if (type === "ordering") {
      const answersNodes = qn.querySelectorAll('answer');
      const items = [];
      let ordreIdx = 1;
      answersNodes.forEach(an => {
        const fraction = parseFloat(an.getAttribute("fraction")) || 0;
        const textAns = an.querySelector('text') ? an.querySelector('text').textContent.trim() : "";
        const fbAns = an.querySelector('feedback text') ? an.querySelector('feedback text').textContent.trim() : "";
        if (textAns) {
          const isDistracteur = fraction <= 0;
          items.push({
            id: items.length,
            text: textAns,
            ordre: isDistracteur ? 0 : ordreIdx++,
            distracteur: isDistracteur,
            feedback: fbAns
          });
        }
      });
      if (items.length >= 2) {
        questions.push({ type: "ordering", title, enonce, points, generalFeedback, items });
      }
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
      competence_code: competenceCode,
      fiche_id: document.getElementById('selectFichePourQcm')?.value || null
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
  if (!confirm("Voulez-vous vraiment supprimer ce QCM de votre banque ?\n\n(Les éventuelles séances de test associées seront également nettoyées.)")) return;
  try {
    const res = await fetch('/api/banque?qcm_id=' + qcmId, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      alert("Impossible de supprimer ce QCM : " + (data.error || "Erreur serveur"));
      return;
    }
    listeBanqueQcmMemoire = listeBanqueQcmMemoire.filter(q => Number(q.id) !== Number(qcmId));
    afficherTableauBanqueQcm();
    await chargerBanqueProf();
    if (typeof chargerSeancesProf === 'function') chargerSeancesProf();
  } catch (e) {
    alert("Erreur réseau lors de la suppression du QCM.");
  }
}


let qcmEnCoursEdition = null;

function echapperHtmlAttr(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function ouvrirModaleEditionQcm(qcmId) {
  try {
    const res = await fetch('/api/banque?qcm_id=' + encodeURIComponent(qcmId) + '&t=' + Date.now(), { cache: "no-store" });
    if (!res.ok) {
      alert("Impossible de charger ce QCM.");
      return;
    }
    const qcm = await res.json();
    let questions = [];
    try {
      questions = JSON.parse(qcm.data_json || "[]");
    } catch (e) {}

    qcmEnCoursEdition = {
      id: qcm.id,
      titre: qcm.titre || "",
      document_html: qcm.document_html || "",
      questions: Array.isArray(questions) ? questions : []
    };

    document.getElementById('editQcmIdHidden').value = qcmEnCoursEdition.id;
    document.getElementById('editQcmTitreInput').value = qcmEnCoursEdition.titre;
    document.getElementById('editQcmDocHtmlInput').value = qcmEnCoursEdition.document_html;
    document.getElementById('editQcmNbQuestions').innerText = qcmEnCoursEdition.questions.length;

    const cont = document.getElementById('editQcmQuestionsContainer');
    cont.innerHTML = qcmEnCoursEdition.questions.map((q, idx) => {
      const typeLabel = q.type === 'multichoice' ? (q.single ? 'QCM (choix unique)' : 'QCM (choix multiples)')
        : q.type === 'matching' ? 'Appariement'
        : q.type === 'cloze' ? 'Texte à trous'
        : q.type === 'ordering' ? 'Mise en ordre'
        : q.type;

      let blocReponses = '';
      if (q.type === 'multichoice' && Array.isArray(q.answers)) {
        blocReponses = `
          <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:0.78rem; font-weight:700; color:#475569;">Propositions (cochez les bonnes réponses) :</span>
            ${q.answers.map((a, aIdx) => `
              <div style="display:flex; gap:6px; align-items:center;">
                <input type="checkbox" class="edit-q-ans-ok" data-q="${idx}" data-a="${aIdx}" ${Number(a.fraction) > 0 ? 'checked' : ''} title="Réponse correcte">
                <input type="text" class="input-field edit-q-ans-text" data-q="${idx}" data-a="${aIdx}" value="${echapperHtmlAttr(a.text)}" style="margin:0; padding:5px 8px; font-size:0.84rem; flex:1;">
              </div>
            `).join('')}
          </div>
        `;
      } else if (q.type === 'matching' && Array.isArray(q.subquestions)) {
        blocReponses = `
          <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:0.78rem; font-weight:700; color:#475569;">Paires à associer :</span>
            ${q.subquestions.map((sq, sIdx) => `
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                <input type="text" class="input-field edit-q-match-q" data-q="${idx}" data-s="${sIdx}" value="${echapperHtmlAttr(sq.question)}" style="margin:0; padding:5px 8px; font-size:0.84rem;">
                <input type="text" class="input-field edit-q-match-a" data-q="${idx}" data-s="${sIdx}" value="${echapperHtmlAttr(sq.answer)}" style="margin:0; padding:5px 8px; font-size:0.84rem;">
              </div>
            `).join('')}
          </div>
        `;
      } else if (q.type === 'ordering' && Array.isArray(q.items)) {
        blocReponses = `
          <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">
            <span style="font-size:0.78rem; font-weight:700; color:#475569;">Étapes (dans l'ordre chronologique) :</span>
            ${q.items.map((it, iIdx) => `
              <div style="display:flex; gap:6px; align-items:center;">
                <span style="font-size:0.78rem; color:#64748b; width:24px;">#${iIdx + 1}</span>
                <input type="text" class="input-field edit-q-ord-text" data-q="${idx}" data-i="${iIdx}" value="${echapperHtmlAttr(it.text)}" style="margin:0; padding:5px 8px; font-size:0.84rem; flex:1;">
              </div>
            `).join('')}
          </div>
        `;
      }

      return `
        <div style="border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#ffffff;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
            <span style="font-weight:700; color:var(--pronote-blue); font-size:0.88rem;">Question ${idx + 1} <span class="badge" style="margin-left:4px;">${typeLabel}</span></span>
            <div style="display:flex; align-items:center; gap:6px;">
              <label style="font-size:0.78rem; color:#475569;">Points :</label>
              <input type="number" step="0.5" min="0.5" class="input-field edit-q-points" data-q="${idx}" value="${q.points || 1}" style="margin:0; padding:3px 6px; width:65px; font-size:0.84rem;">
            </div>
          </div>
          <div style="margin-bottom:6px;">
            <input type="text" class="input-field edit-q-title" data-q="${idx}" value="${echapperHtmlAttr(q.title)}" placeholder="Titre court de la question" style="margin:0; padding:5px 8px; font-size:0.84rem; width:100%; box-sizing:border-box;">
          </div>
          <div>
            <textarea class="input-field edit-q-enonce" data-q="${idx}" rows="2" placeholder="Énoncé de la question" style="margin:0; padding:6px 8px; font-size:0.85rem; width:100%; box-sizing:border-box;">${echapperHtmlAttr(q.enonce)}</textarea>
          </div>
          ${blocReponses}
          <div style="margin-top:8px;">
            <input type="text" class="input-field edit-q-feedback" data-q="${idx}" value="${echapperHtmlAttr(q.generalFeedback || '')}" placeholder="Explication / feedback affiché après validation (optionnel)" style="margin:0; padding:5px 8px; font-size:0.82rem; width:100%; box-sizing:border-box; background:#f8fafc;">
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('modaleEditionQcm').style.display = 'block';
  } catch (e) {
    alert("Erreur réseau lors de l'ouverture du QCM.");
  }
}

function fermerModaleEditionQcm() {
  const mod = document.getElementById('modaleEditionQcm');
  if (mod) mod.style.display = 'none';
  qcmEnCoursEdition = null;
}

async function enregistrerModificationsQcm() {
  if (!qcmEnCoursEdition) return;
  const nouveauTitre = document.getElementById('editQcmTitreInput').value.trim();
  if (!nouveauTitre) {
    alert("Le titre du QCM ne peut pas être vide.");
    return;
  }
  const nouveauDocHtml = document.getElementById('editQcmDocHtmlInput').value;

  const questionsMaj = qcmEnCoursEdition.questions.map((q, idx) => {
    const copieQ = JSON.parse(JSON.stringify(q));
    const elTitre = document.querySelector(`.edit-q-title[data-q="${idx}"]`);
    const elEnonce = document.querySelector(`.edit-q-enonce[data-q="${idx}"]`);
    const elPoints = document.querySelector(`.edit-q-points[data-q="${idx}"]`);
    const elFb = document.querySelector(`.edit-q-feedback[data-q="${idx}"]`);

    if (elTitre) copieQ.title = elTitre.value.trim();
    if (elEnonce) copieQ.enonce = elEnonce.value.trim();
    if (elPoints) copieQ.points = parseFloat(elPoints.value) || 1;
    if (elFb) copieQ.generalFeedback = elFb.value.trim();

    if (copieQ.type === 'multichoice' && Array.isArray(copieQ.answers)) {
      const coches = [];
      copieQ.answers.forEach((a, aIdx) => {
        const elTxt = document.querySelector(`.edit-q-ans-text[data-q="${idx}"][data-a="${aIdx}"]`);
        const elOk = document.querySelector(`.edit-q-ans-ok[data-q="${idx}"][data-a="${aIdx}"]`);
        if (elTxt) a.text = elTxt.value.trim();
        if (elOk && elOk.checked) coches.push(aIdx);
      });
      if (coches.length > 0) {
        const frac = Math.round((100 / coches.length) * 100) / 100;
        copieQ.answers.forEach((a, aIdx) => {
          a.fraction = coches.includes(aIdx) ? frac : 0;
        });
      }
    } else if (copieQ.type === 'matching' && Array.isArray(copieQ.subquestions)) {
      copieQ.subquestions.forEach((sq, sIdx) => {
        const elMq = document.querySelector(`.edit-q-match-q[data-q="${idx}"][data-s="${sIdx}"]`);
        const elMa = document.querySelector(`.edit-q-match-a[data-q="${idx}"][data-s="${sIdx}"]`);
        if (elMq) sq.question = elMq.value.trim();
        if (elMa) sq.answer = elMa.value.trim();
      });
    } else if (copieQ.type === 'ordering' && Array.isArray(copieQ.items)) {
      copieQ.items.forEach((it, iIdx) => {
        const elOt = document.querySelector(`.edit-q-ord-text[data-q="${idx}"][data-i="${iIdx}"]`);
        if (elOt) it.text = elOt.value.trim();
      });
    }
    return copieQ;
  });

  try {
    const res = await fetch('/api/banque', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: "update_qcm",
        qcm_id: qcmEnCoursEdition.id,
        titre: nouveauTitre,
        document_html: nouveauDocHtml,
        questions: questionsMaj
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      alert("Erreur lors de l'enregistrement : " + (data.error || "Erreur serveur"));
      return;
    }

    fermerModaleEditionQcm();
    await chargerBanqueProf();
    if (typeof chargerSeancesProf === 'function') chargerSeancesProf();
    alert("✓ QCM mis à jour avec succès !");
  } catch (e) {
    alert("Erreur réseau lors de l'enregistrement.");
  }
}