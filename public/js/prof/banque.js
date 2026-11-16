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
// ==============================================================================
// CONSTRUCTEUR VISUEL D'ACTIVITÉS À ÉTAPES (CLOZE / 5M / QQOQCP / PRÉVENTION)
// ==============================================================================
function ouvrirModalConstructeurCloze() {
  const modal = document.getElementById('modalConstructeurCloze');
  if (!modal) return;

  // Synchroniser les matières depuis listeMatieresMemoire
  const selMat = document.getElementById('clozeMatiereSelect');
  if (selMat) {
    const matieres = (typeof listeMatieresMemoire !== 'undefined') ? listeMatieresMemoire : [];
    selMat.innerHTML = '<option value="">-- Aucune matière --</option>' +
      matieres.map(m => `<option value="${m.id}">${m.nom}</option>`).join('');
    // Pré-sélectionner la matière PSE si disponible
    const matPse = matieres.find(m => /pr[ée]vention|pse/i.test(m.nom));
    if (matPse) selMat.value = matPse.id;
    majSelectCompetencesCloze();
  }

  const contEtapes = document.getElementById('conteneurEtapesConstructeurCloze');
  if (contEtapes && contEtapes.children.length === 0) {
    appliquerModeleCloze('5M');
  }

  modal.style.display = 'flex';
}

function fermerModalConstructeurCloze() {
  const modal = document.getElementById('modalConstructeurCloze');
  if (modal) modal.style.display = 'none';
}

function majSelectCompetencesCloze() {
  const selMat = document.getElementById('clozeMatiereSelect');
  const selComp = document.getElementById('clozeCompetenceSelect');
  if (!selMat || !selComp) return;

  const matId = selMat.value;
  const matieres = (typeof listeMatieresMemoire !== 'undefined') ? listeMatieresMemoire : [];
  const mat = matieres.find(m => String(m.id) === String(matId));
  const comps = (mat && Array.isArray(mat.competences)) ? mat.competences : [];

  selComp.innerHTML = '<option value="">-- Aucune compétence ciblée --</option>' +
    comps.map(c => `<option value="${c.code}">${c.code} — ${c.libelle}</option>`).join('');
}

function ajouterLigneEtapeCloze(labelEtape = "", texteAvant = "", choixStr = "", bonneReponse = "", texteApres = "", explicationEtape = "") {
  const cont = document.getElementById('conteneurEtapesConstructeurCloze');
  if (!cont) return;
  const num = cont.children.length + 1;

  const div = document.createElement('div');
  div.className = "bloc-etape-cloze";
  div.style.cssText = "background:#f8fafc; border:1px solid #cbd5e1; border-left:4px solid #0284c7; border-radius:8px; padding:12px; margin-bottom:10px;";
  div.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <strong style="color:#0369a1; font-size:0.88rem;">Étape ${num}</strong>
      <button type="button" class="btn btn-danger" style="padding:3px 8px; font-size:0.74rem; margin:0;" onclick="this.closest('.bloc-etape-cloze').remove()">✖ Retirer</button>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
      <div>
        <label style="font-size:0.76rem; font-weight:bold; color:#475569;">Titre de l'étape :</label>
        <input type="text" class="input-field cloze-etape-titre" value="${String(labelEtape || 'Étape ' + num).replace(/"/g, '&quot;')}" placeholder="Ex: Étape 1 — Identifier le facteur" style="margin:0; font-size:0.84rem;">
      </div>
      <div>
        <label style="font-size:0.76rem; font-weight:bold; color:#15803d;">Bonne réponse attendue * :</label>
        <input type="text" class="input-field cloze-etape-bonne" value="${String(bonneReponse).replace(/"/g, '&quot;')}" placeholder="Ex: Milieu" style="margin:0; font-size:0.84rem; border-color:#86efac;">
      </div>
    </div>
    <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:8px; margin-bottom:8px;">
      <div>
        <label style="font-size:0.76rem; font-weight:bold; color:#475569;">Début de la phrase (avant le menu déroulant) * :</label>
        <input type="text" class="input-field cloze-etape-avant" value="${String(texteAvant).replace(/"/g, '&quot;')}" placeholder="Ex: La présence d'huile au sol relève du facteur" style="margin:0; font-size:0.84rem;">
      </div>
      <div>
        <label style="font-size:0.76rem; font-weight:bold; color:#475569;">Suite de la phrase (facultatif) :</label>
        <input type="text" class="input-field cloze-etape-apres" value="${String(texteApres).replace(/"/g, '&quot;')}" placeholder="Ex: dans la méthode des 5M." style="margin:0; font-size:0.84rem;">
      </div>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
      <div>
        <label style="font-size:0.76rem; font-weight:bold; color:#475569;">Autres propositions du menu (séparées par ;) * :</label>
        <input type="text" class="input-field cloze-etape-distracteurs" value="${String(choixStr).replace(/"/g, '&quot;')}" placeholder="Ex: Matériel ; Main-d'œuvre ; Méthode ; Matière" style="margin:0; font-size:0.84rem;">
      </div>
      <div>
        <label style="font-size:0.76rem; font-weight:bold; color:#0369a1;">Explication pédagogique de l'étape :</label>
        <input type="text" class="input-field cloze-etape-fb" value="${String(explicationEtape).replace(/"/g, '&quot;')}" placeholder="Ex: L'état du sol appartient à l'environnement de travail (Milieu)." style="margin:0; font-size:0.84rem;">
      </div>
    </div>
  `;
  cont.appendChild(div);
}

function appliquerModeleCloze(modele) {
  const titreInput = document.getElementById('clozeActiviteTitre');
  const sitInput = document.getElementById('clozeSituationInput');
  const cont = document.getElementById('conteneurEtapesConstructeurCloze');
  const selComp = document.getElementById('clozeCompetenceSelect');
  if (!cont) return;

  cont.innerHTML = "";

  if (modele === '5M') {
    if (titreInput) titreInput.value = "Analyse de situation (Méthode 5M) — Chute en cuisine collective";
    if (sitInput) sitInput.value = "Dans une cuisine collective, Karim glisse sur une flaque d'huile près de la friteuse alors qu'il transporte un bac chaud. Il porte des baskets en toile personnelles car ses chaussures de sécurité ne lui ont pas encore été fournies.";
    if (selComp) selComp.value = "C2";
    ajouterLigneEtapeCloze("Étape 1 — Facteur lié à l'environnement", "La flaque d'huile sur le sol de la cuisine relève du facteur", "Matériel ; Main-d'œuvre ; Méthode ; Matière", "Milieu", ".", "L'état du sol et l'environnement de travail appartiennent au Milieu.");
    ajouterLigneEtapeCloze("Étape 2 — Facteur lié à l'équipement", "Le port de baskets en toile à la place de chaussures antidérapantes relève du facteur", "Milieu ; Main-d'œuvre ; Méthode ; Matière", "Matériel", ".", "Les équipements de travail et de protection relèvent du Matériel.");
    ajouterLigneEtapeCloze("Étape 3 — Mesure de prévention prioritaire", "Pour supprimer le risque à la source, la mesure prioritaire consiste à", "Afficher un panneau d'avertissement ; Distribuer une trousse de secours ; Former aux gestes et postures", "Nettoyer immédiatement le sol et installer un revêtement antidérapant", ".", "La prévention intrinsèque (supprimer ou réduire le danger) est toujours prioritaire.");
  } else if (modele === 'QQOQCP') {
    if (titreInput) titreInput.value = "Poser le problème (Méthode QQOQCP)";
    if (sitInput) sitInput.value = "Décrivez ici la situation professionnelle ou l'incident observé...";
    if (selComp) selComp.value = "C2";
    ajouterLigneEtapeCloze("Étape 1 — QUI ?", "La personne directement exposée au risque dans cette situation est", "Le fournisseur ; Le client extérieur ; L'inspecteur du travail", "Le salarié / l'opérateur au poste", ".", "Identifier la victime ou l'acteur exposé.");
    ajouterLigneEtapeCloze("Étape 2 — QUOI ?", "Le problème ou phénomène dangereux identifié est", "Un retard de livraison ; Une panne informatique ; Une absence de planning", "L'exposition au danger décrit dans la situation", ".", "Définir précisément la nature du problème.");
    ajouterLigneEtapeCloze("Étape 3 — POURQUOI ?", "L'objectif de la démarche de prévention est de", "Augmenter la cadence ; Réduire les coûts d'achat ; Sanctionner l'équipe", "Préserver la santé et la sécurité de l'opérateur", ".", "Finalité de toute démarche de prévention en PSE.");
  } else if (modele === 'PREVENTION') {
    if (titreInput) titreInput.value = "Démarche d'analyse du risque et niveaux de prévention";
    if (sitInput) sitInput.value = "Décrivez la situation de travail exposant l'opérateur à un danger...";
    if (selComp) selComp.value = "C4";
    ajouterLigneEtapeCloze("Étape 1 — Phénomène dangereux", "Dans cette situation, l'élément susceptible de causer un dommage est", "L'arrêt de travail ; La trousse de secours ; Le règlement intérieur", "Le phénomène dangereux identifié au poste", ".", "Le phénomène dangereux est la cause capable de provoquer une lésion.");
    ajouterLigneEtapeCloze("Étape 2 — Prévention collective", "Une mesure de protection collective consiste à", "Fournir des gants individuels ; Former aux premiers secours ; Mettre une affiche de rappel", "Isoler ou capoter la source du danger pour tous", ".", "La protection collective prime toujours sur la protection individuelle.");
    ajouterLigneEtapeCloze("Étape 3 — Prévention individuelle (EPI)", "En complément, l'équipement de protection individuelle adapté est", "Un extincteur mural ; Une signalétique au sol ; Un registre d'infirmerie", "Le port d'un EPI adapté au risque résiduel", ".", "L'EPI protège uniquement l'opérateur qui le porte.");
  } else {
    if (titreInput) titreInput.value = "";
    if (sitInput) sitInput.value = "";
    ajouterLigneEtapeCloze("Étape 1", "", "", "", "", "");
    ajouterLigneEtapeCloze("Étape 2", "", "", "", "", "");
  }
}

async function enregistrerActiviteClozeDansBanque() {
  const titre = document.getElementById('clozeActiviteTitre')?.value.trim();
  const situation = document.getElementById('clozeSituationInput')?.value.trim();
  const matiereId = document.getElementById('clozeMatiereSelect')?.value || null;
  const competenceCode = document.getElementById('clozeCompetenceSelect')?.value || null;
  const blocs = document.querySelectorAll('#conteneurEtapesConstructeurCloze .bloc-etape-cloze');

  if (!titre) {
    alert("Veuillez indiquer un titre pour cette activité.");
    return;
  }
  if (blocs.length === 0) {
    alert("Veuillez ajouter au moins une étape.");
    return;
  }

  const etapes = [];
  let htmlEtapes = situation ? `<div style="background:#f0f9ff; border-left:4px solid #0284c7; padding:10px 12px; border-radius:6px; margin-bottom:12px;"><strong>📋 Situation :</strong> ${situation}</div>` : "";
  const feedbacksEtapes = [];

  for (let i = 0; i < blocs.length; i++) {
    const b = blocs[i];
    const titreEtape = b.querySelector('.cloze-etape-titre')?.value.trim() || `Étape ${i + 1}`;
    const bonne = b.querySelector('.cloze-etape-bonne')?.value.trim();
    const avant = b.querySelector('.cloze-etape-avant')?.value.trim();
    const apres = b.querySelector('.cloze-etape-apres')?.value.trim();
    const distStr = b.querySelector('.cloze-etape-distracteurs')?.value || "";
    const fb = b.querySelector('.cloze-etape-fb')?.value.trim();

    if (!bonne || !avant) {
      alert(`Veuillez renseigner au minimum le début de phrase et la bonne réponse pour l'étape ${i + 1}.`);
      return;
    }

    const distracteurs = distStr.split(';').map(s => s.trim()).filter(s => s && s.toLowerCase() !== bonne.toLowerCase());
    const options = [{ text: bonne, correct: true, feedback: fb || "" }];
    distracteurs.forEach(d => options.push({ text: d, correct: false, feedback: "" }));

    // Mélanger les options pour l'élève
    options.sort(() => Math.random() - 0.5);

    etapes.push({
      index: i,
      label: titreEtape,
      mode: "select",
      poids: 1,
      bonne_reponse: bonne,
      options,
      feedback: fb || ""
    });

    htmlEtapes += `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; margin-bottom:8px;">
        <div style="font-size:0.78rem; font-weight:800; color:#0369a1; text-transform:uppercase; margin-bottom:4px;">${titreEtape}</div>
        <div style="font-size:0.95rem; line-height:1.6;">${avant} [[CLOZE_STEP_${i}]] ${apres}</div>
      </div>
    `;
    if (fb) feedbacksEtapes.push(`<strong>${titreEtape} :</strong> ${fb}`);
  }

  const questionCloze = {
    type: "cloze",
    title: titre,
    enonce: htmlEtapes,
    enonce_template: htmlEtapes,
    etapes,
    points: etapes.length,
    generalFeedback: feedbacksEtapes.join('<br>')
  };

  const docHtml = document.getElementById('documentHtmlInput')?.value.trim() || null;

  const res = await fetch('/api/banque', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      titre,
      questions: [questionCloze],
      prof_id: currentProf.id,
      document_html: docHtml,
      matiere_id: matiereId,
      competence_code: competenceCode
    })
  });

  if (res.ok) {
    alert(`✓ Activité à étapes "${titre}" ajoutée à votre Banque QCM (${etapes.length} étapes) !`);
    fermerModalConstructeurCloze();
    chargerBanqueProf();
  } else {
    alert("Erreur lors de l'enregistrement de l'activité à étapes.");
  }
}