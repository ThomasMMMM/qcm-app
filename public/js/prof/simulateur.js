let isModeSimulation = false;
let currentQuestions = [];
let currentQuestionIndex = 0;
let totalScoreObtenu = 0;
let totalScorePossible = 0;
let currentDocumentHtml = null;

function preparerQuestionClozeSimu(q) {
  if (!q || q.type !== "cloze") return q;
  if (Array.isArray(q.etapes) && q.etapes.length > 0 && q.enonce_template) return q;

  const sourceHtml = q.enonce || q.text || "";
  const regexCloze = /\{(\d+)?\s*:\s*(MC|MCV|MCH|MULTICHOICE|MULTICHOICE_V|MULTICHOICE_H|SA|SHORTANSWER|MW|NUMERICAL|NM)\s*:\s*([^}]+)\}/gi;
  const etapes = [];
  let idx = 0;

  const template = sourceHtml.replace(regexCloze, (fullMatch, poidsStr, subType, contenu) => {
    const poids = poidsStr ? parseFloat(poidsStr) : 1;
    const typeUpper = subType.toUpperCase();
    const isShort = (typeUpper === "SA" || typeUpper === "SHORTANSWER" || typeUpper === "MW" || typeUpper === "NUMERICAL" || typeUpper === "NM");
    const morceaux = contenu.split('~').map(s => s.trim()).filter(Boolean);
    const options = [];
    let bonneReponse = "";
    let feedbackBonne = "";

    morceaux.forEach(m => {
      let estCorrect = false;
      let texteOpt = m;
      let fbOpt = "";

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
        fbOpt = parts.slice(1).join('#').trim();
      }

      if (estCorrect && !bonneReponse) {
        bonneReponse = texteOpt;
        feedbackBonne = fbOpt;
      }
      options.push({ text: texteOpt, correct: estCorrect, feedback: fbOpt });
    });

    if (!bonneReponse && options.length > 0) {
      bonneReponse = options[0].text;
      feedbackBonne = options[0].feedback || "";
      options[0].correct = true;
    }

    const optionsMelangees = [...options].sort(() => Math.random() - 0.5);
    const token = `[[CLOZE_STEP_${idx}]]`;
    etapes.push({
      index: idx,
      label: `Étape ${idx + 1}`,
      mode: isShort ? "text" : "select",
      poids,
      bonne_reponse: bonneReponse,
      feedback: feedbackBonne,
      options: optionsMelangees
    });
    idx++;
    return token;
  });

  q.etapes = etapes;
  q.enonce_template = template;
  return q;
}

async function lancerSimulationBanque(qcmId) {
  try {
    const resDetail = await fetch(`/api/eleve_quiz?simulateur_qcm_id=${qcmId}`);
    const data = await resDetail.json();
    if (!resDetail.ok || !data.questions) {
      alert("Erreur simulateur : " + (data.error || "Questions introuvables"));
      return;
    }
    demarrerSimulation(data.questions, `[Simulation] ${data.titre}`, data.document_html);
  } catch(e) {
    alert("Erreur simulateur : " + e.message);
  }
}

async function lancerSimulationSeance(seanceId) {
  try {
    const seance = listeSeancesMemoire.find(s => s.id === seanceId);
    if (!seance) return;
    const res = await fetch(`/api/eleve_quiz?simulateur_seance_id=${seanceId}`);
    const data = await res.json();
    if (!res.ok || !data.questions) {
      alert("Erreur simulateur : " + (data.error || "Questions introuvables"));
      return;
    }
    demarrerSimulation(data.questions, `[Simulation Séance: ${seance.code_session}] ${data.titre}`, data.document_html);
  } catch(e) {
    alert("Erreur simulateur : " + e.message);
  }
}

function demarrerSimulation(questions, titre, docHtml = null) {
  currentDocumentHtml = docHtml;
  const boxDoc = document.getElementById('btnOuvrirDocBox');
  if (boxDoc) boxDoc.style.display = currentDocumentHtml ? 'block' : 'none';

  isModeSimulation = true;
  currentQuestions = questions;
  currentQuestionIndex = 0;
  totalScoreObtenu = 0;
  totalScorePossible = 0;
  currentQuestions.forEach(q => { totalScorePossible += q.points; });

  document.getElementById('viewProfDashboard').style.display = 'none';
  document.getElementById('viewSimulateurProf').style.display = 'block';
  document.getElementById('viewSimulateurFin').style.display = 'none';

  afficherQuestionSimulateur();
}

function quitterSimulation() {
  isModeSimulation = false;
  document.getElementById('viewSimulateurProf').style.display = 'none';
  document.getElementById('viewSimulateurFin').style.display = 'none';
  document.getElementById('viewProfDashboard').style.display = 'block';
}

function ouvrirDocRessourceSimu() {
  if (!currentDocumentHtml) return;
  document.getElementById('corpsDocRessourceSimu').innerHTML = currentDocumentHtml;
  document.getElementById('modalDocRessourceSimu').style.display = 'flex';
}

function fermerDocRessourceSimu() {
  document.getElementById('modalDocRessourceSimu').style.display = 'none';
}

function afficherQuestionSimulateur() {
  const q = preparerQuestionClozeSimu(currentQuestions[currentQuestionIndex]);
  const totalQ = currentQuestions.length;

  document.getElementById('simuProgressionText').innerText = `Question ${currentQuestionIndex + 1} sur ${totalQ}`;
  document.getElementById('simuPointsText').innerText = `${q.points} pt${q.points > 1 ? 's' : ''}`;
  document.getElementById('simuProgressBarFill').style.width = `${((currentQuestionIndex + 1) / totalQ) * 100}%`;

  document.getElementById('simuFeedbackContainer').style.display = 'none';
  document.getElementById('simuFeedbackContainer').innerHTML = '';
  document.getElementById('btnValiderQuestionSimu').style.display = 'block';
  document.getElementById('btnQuestionSuivanteSimu').style.display = 'none';

  const container = document.getElementById('simuSingleQuestionContainer');
  let h = `<div class="question-enonce">${q.enonce}</div>`;
  if (q.image) h += `<img class="img-qcm" style="max-width:100%; height:auto; border-radius:6px; margin:10px 0; border:1px solid #cbd5e1;" src="data:image/png;base64,${q.image}">`;

  if (q.type === "multichoice") {
    const inputType = q.single ? "radio" : "checkbox";
    q.answers.forEach((ans) => {
      const repId = ans.id !== undefined ? ans.id : 0;
      h += `
        <label class="reponse-label" id="label_ans_${repId}">
          <input type="${inputType}" name="current_q_ans" value="${repId}">
          <div>
            ${ans.text}
            ${ans.image ? `<br><img style="max-height:120px; border-radius:6px; margin-top:6px;" src="data:image/png;base64,${ans.image}">` : ''}
          </div>
        </label>
      `;
    });
  } else if (q.type === "matching") {
    const opts = [...q.choices || q.subquestions.map(s => s.answer)];
    q.subquestions.forEach((sub, sIdx) => {
      h += `
        <div class="matching-row" id="matching_row_${sIdx}">
          <span><strong>${sub.question}</strong></span>
          <select name="matching_sel_${sIdx}">
            <option value="">-- Choisir --</option>
            ${opts.map(o => `<option value="${o}">${o}</option>`).join('')}
          </select>
        </div>
      `;
    });
  } else if (q.type === "cloze" && Array.isArray(q.etapes)) {
    let htmlCloze = q.enonce_template || q.enonce || "";
    q.etapes.forEach((etape, eIdx) => {
      const token = `[[CLOZE_STEP_${eIdx}]]`;
      let champHtml = "";
      if (etape.mode === "text") {
        champHtml = `<input type="text" name="simu_cloze_input_${eIdx}" id="simu_cloze_field_${eIdx}" placeholder="Votre réponse..." style="display:inline-block; padding:5px 10px; border:2px solid #0284c7; border-radius:6px; font-weight:700; font-size:0.92rem; color:#0f172a; background:#ffffff; margin:2px 4px; min-width:160px;">`;
      } else {
        const opts = Array.isArray(etape.options) ? etape.options : [];
        champHtml = `
          <select name="simu_cloze_input_${eIdx}" id="simu_cloze_field_${eIdx}" style="display:inline-block; max-width:100%; padding:6px 10px; border:2px solid #0284c7; border-radius:6px; font-weight:700; font-size:0.9rem; color:#0369a1; background:#f0f9ff; margin:3px 4px; cursor:pointer;">
            <option value="">-- Choisir --</option>
            ${opts.map(o => `<option value="${String(o.text).replace(/"/g, '&quot;')}">${o.text}</option>`).join('')}
          </select>
        `;
      }
      champHtml += `<span id="simu_cloze_corr_${eIdx}" style="display:none; font-size:0.84rem; font-weight:700; margin-left:6px;"></span>`;
      htmlCloze = htmlCloze.replace(token, champHtml);
    });
    h = `<div class="question-enonce" style="line-height:1.65;">${htmlCloze}</div>`;
    if (q.image) h += `<img class="img-qcm" style="max-width:100%; height:auto; border-radius:6px; margin:10px 0; border:1px solid #cbd5e1;" src="data:image/png;base64,${q.image}">`;
  }
  container.innerHTML = h;
}

function validerQuestionSimu() {
  const q = preparerQuestionClozeSimu(currentQuestions[currentQuestionIndex]);
  let scoreQuestion = 0;
  let explications = [];

  if (q.type === "multichoice") {
    const inputs = document.querySelectorAll('input[name="current_q_ans"]');
    const checkedInputs = document.querySelectorAll('input[name="current_q_ans"]:checked');

    if (checkedInputs.length === 0) {
      alert("Veuillez sélectionner au moins une réponse.");
      return;
    }

    inputs.forEach(i => i.disabled = true);
    let fracTotale = 0;
    inputs.forEach(input => {
      const idx = parseInt(input.value);
      const ans = q.answers.find(a => (a.id !== undefined ? a.id : 0) === idx) || q.answers[idx];
      const frac = (typeof ans.fraction === 'number') ? ans.fraction : (parseFloat(ans.fraction) || 0);
      const label = document.getElementById(`label_ans_${idx}`);

      if (frac > 0) label.classList.add('is-correct');
      if (input.checked) {
        fracTotale += frac;
        if (frac <= 0) label.classList.add('is-wrong');
        if (ans.feedback) explications.push(`<strong>${ans.text} :</strong> ${ans.feedback}`);
      }
    });

    scoreQuestion = q.points * (Math.max(0, fracTotale) / 100);
  } else if (q.type === "matching") {
    const selects = document.querySelectorAll('select[name^="matching_sel_"]');
    let complet = true;
    selects.forEach(s => { if (!s.value) complet = false; });
    if (!complet) {
      alert("Veuillez associer toutes les propositions avant de valider.");
      return;
    }

    let corrects = 0;
    q.subquestions.forEach((sub, sIdx) => {
      const sel = document.querySelector(`select[name="matching_sel_${sIdx}"]`);
      sel.disabled = true;
      const row = document.getElementById(`matching_row_${sIdx}`);
      if (sel.value === sub.answer) {
        corrects++;
        row.style.background = "var(--correct-bg)";
        row.style.borderColor = "var(--correct-border)";
      } else {
        row.style.background = "var(--incorrect-bg)";
        row.style.borderColor = "var(--incorrect-border)";
      }
    });
    scoreQuestion = q.points * (corrects / (q.subquestions.length || 1));
  } else if (q.type === "cloze" && Array.isArray(q.etapes)) {
    let toutRempli = true;
    q.etapes.forEach((etape, eIdx) => {
      const field = document.getElementById(`simu_cloze_field_${eIdx}`);
      if (!field || !field.value.trim()) toutRempli = false;
    });
    if (!toutRempli) {
      alert("Veuillez compléter toutes les étapes avant de valider.");
      return;
    }

    let poidsTotal = 0;
    let poidsObtenu = 0;

    q.etapes.forEach((etape, eIdx) => {
      const field = document.getElementById(`simu_cloze_field_${eIdx}`);
      const corrSpan = document.getElementById(`simu_cloze_corr_${eIdx}`);
      const poids = Number(etape.poids || 1);
      poidsTotal += poids;
      field.disabled = true;

      const valEleve = field.value.trim();
      const bonne = String(etape.bonne_reponse || "").trim();
      const estJuste = valEleve.toLowerCase() === bonne.toLowerCase();

      if (estJuste) {
        poidsObtenu += poids;
        field.style.borderColor = "#16a34a";
        field.style.background = "#dcfce7";
        field.style.color = "#15803d";
        if (corrSpan) {
          corrSpan.style.display = "inline-block";
          corrSpan.style.color = "#15803d";
          corrSpan.innerText = "✓";
        }
      } else {
        field.style.borderColor = "#dc2626";
        field.style.background = "#fee2e2";
        field.style.color = "#b91c1c";
        if (corrSpan) {
          corrSpan.style.display = "inline-block";
          corrSpan.style.color = "#15803d";
          corrSpan.innerText = `→ Attendu : ${bonne}`;
        }
      }
      if (etape.feedback) {
        explications.push(`<strong>${etape.label || 'Étape ' + (eIdx + 1)} :</strong> ${etape.feedback}`);
      }
    });

    scoreQuestion = q.points * (poidsObtenu / (poidsTotal || 1));
  }

  totalScoreObtenu += scoreQuestion;

  const fbBox = document.getElementById('simuFeedbackContainer');
  let fbHtml = "";
  if (scoreQuestion >= q.points) {
    fbHtml += `<div><strong>Bravo !</strong> Réponse correcte (+${scoreQuestion.toFixed(2)} pt).</div>`;
  } else {
    fbHtml += `<div><strong>Correction :</strong> Vous obtenez ${scoreQuestion.toFixed(2)} / ${q.points} pt.</div>`;
  }

  if (q.generalFeedback) fbHtml += `<div style="margin-top:8px;">💡 <strong>Explication :</strong> ${q.generalFeedback}</div>`;
  if (explications.length > 0) fbHtml += `<div style="margin-top:8px;">${explications.join('<br>')}</div>`;

  fbBox.className = `feedback-box ${scoreQuestion >= q.points ? '' : 'has-error'}`;
  fbBox.innerHTML = fbHtml;
  fbBox.style.display = 'block';

  document.getElementById('btnValiderQuestionSimu').style.display = 'none';
  const btnSuivant = document.getElementById('btnQuestionSuivanteSimu');
  btnSuivant.style.display = 'block';
  btnSuivant.innerText = currentQuestionIndex === currentQuestions.length - 1 ? "Terminer la simulation" : "Question suivante →";
}

function passerQuestionSuivanteSimu() {
  if (currentQuestionIndex < currentQuestions.length - 1) {
    currentQuestionIndex++;
    afficherQuestionSimulateur();
  } else {
    const note20 = totalScorePossible > 0 ? ((totalScoreObtenu / totalScorePossible) * 20).toFixed(2) : "0.00";
    document.getElementById('viewSimulateurProf').style.display = 'none';
    document.getElementById('viewSimulateurFin').style.display = 'block';
    document.getElementById('simuNoteFinaleText').innerText = note20 + " / 20";
  }
}