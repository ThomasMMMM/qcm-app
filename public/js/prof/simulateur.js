let isModeSimulation = false;
let currentQuestions = [];
let currentQuestionIndex = 0;
let totalScoreObtenu = 0;
let totalScorePossible = 0;
let currentDocumentHtml = null;

function preparerQuestionClozeSimu(q) {
  if (!q || q.type !== "cloze") return q;
  const texteBrutCheck = q.enonce_template || q.enonce || q.text || "";
  if (Array.isArray(q.etapes) && q.etapes.length > 0 && q.enonce_template && !/\{(\d+)?\s*:\s*(MC|MULTICHOICE|SA|SHORTANSWER)/i.test(texteBrutCheck)) {
    return q;
  }

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
  const vSimu = document.getElementById('viewSimulateurProf');
  const vFin = document.getElementById('viewSimulateurFin');
  const vDash = document.getElementById('viewProfDashboard');
  if (vSimu) vSimu.style.display = 'none';
  if (vFin) vFin.style.display = 'none';
  if (vDash) vDash.style.display = 'flex';

  const uneRubriqueVisible = Array.from(document.querySelectorAll('.rubrique-contenu-prof')).some(el => el.style.display === 'block');
  const hub = document.getElementById('vueHubProf');
  if (!uneRubriqueVisible && hub) {
    hub.style.display = 'block';
  }
  if (typeof actualiserCompteursTuiles === 'function') actualiserCompteursTuiles();
}

function estModeDysProfActif() {
  return localStorage.getItem('qcm_pref_mode_dys_prof') === '1';
}

function appliquerEtatModeDysProf() {
  const actif = estModeDysProfActif();
  ['corpsDocRessourceSimu', 'corpsModalApercuFiche', 'editFicheApercuLive'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('mode-dys-actif', actif);
  });
  document.querySelectorAll('.btn-dys-sync').forEach(btn => {
    btn.classList.toggle('active', actif);
    btn.innerHTML = actif ? '<span>👁️ Confort Dys : ON</span>' : '<span>👁️ Confort Dys</span>';
  });
}

function basculerModeDysProf() {
  const nouvelEtat = !estModeDysProfActif();
  localStorage.setItem('qcm_pref_mode_dys_prof', nouvelEtat ? '1' : '0');
  appliquerEtatModeDysProf();
}

function ouvrirDocRessourceSimu() {
  if (!currentDocumentHtml) return;
  document.getElementById('corpsDocRessourceSimu').innerHTML = currentDocumentHtml;
  if (typeof appliquerEtatModeDysProf === 'function') appliquerEtatModeDysProf();
  document.getElementById('modalDocRessourceSimu').style.display = 'flex';
}

let vitesseLectureAudioProf = 1.0;
let contexteAudioProfActif = null;

function arreterLectureAudioProf() {
  try {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  } catch (e) {}
  contexteAudioProfActif = null;
  document.querySelectorAll('.btn-audio-prof-sync').forEach(btn => {
    btn.classList.remove('active');
    btn.innerHTML = '<span>🔊 Écouter</span>';
  });
}

function basculerVitesseAudioProf() {
  vitesseLectureAudioProf = (vitesseLectureAudioProf === 1.0) ? 0.85 : 1.0;
  document.querySelectorAll('.btn-vitesse-prof-sync').forEach(btn => {
    btn.innerHTML = `<span>${vitesseLectureAudioProf === 1.0 ? '1×' : '0.85×'}</span>`;
    btn.classList.toggle('active', vitesseLectureAudioProf !== 1.0);
  });
  if ('speechSynthesis' in window && window.speechSynthesis.speaking && contexteAudioProfActif) {
    const { corpsId, modalId } = contexteAudioProfActif;
    arreterLectureAudioProf();
    basculerLectureAudioProf(corpsId, modalId);
  }
}

function basculerLectureAudioProf(corpsId, modalId) {
  if (!('speechSynthesis' in window)) {
    alert("La synthèse vocale n'est pas prise en charge par ce navigateur.");
    return;
  }

  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    arreterLectureAudioProf();
    return;
  }

  const corpsEl = document.getElementById(corpsId);
  if (!corpsEl) return;

  const clone = corpsEl.cloneNode(true);
  clone.querySelectorAll('style, script, noscript').forEach(el => el.remove());
  clone.querySelectorAll('h1, h2, h3, h4, p, li, tr, br').forEach(el => {
    el.insertAdjacentText('afterend', '. ');
  });

  const texteBrut = (clone.innerText || clone.textContent || '')
    .replace(/\s+/g, ' ')
    .replace(/\.(\s*\.)+/g, '.')
    .trim();

  if (!texteBrut) return;

  const phrases = texteBrut.match(/[^.!?]+[.!?]*/g) || [texteBrut];
  const segments = [];
  let courant = '';
  for (const ph of phrases) {
    if ((courant + ' ' + ph).length > 220 && courant.trim()) {
      segments.push(courant.trim());
      courant = ph;
    } else {
      courant += ' ' + ph;
    }
  }
  if (courant.trim()) segments.push(courant.trim());

  contexteAudioProfActif = { corpsId, modalId };
  document.querySelectorAll('.btn-audio-prof-sync').forEach(btn => {
    btn.classList.add('active');
    btn.innerHTML = '<span>⏹️ Stop</span>';
  });

  const voixDisponibles = window.speechSynthesis.getVoices();
  const voixFr = voixDisponibles.find(v => /^fr(-|_)/i.test(v.lang));

  let indexSeg = 0;
  function lireSegmentSuivant() {
    const modal = document.getElementById(modalId);
    if (!modal || modal.style.display === 'none' || indexSeg >= segments.length) {
      arreterLectureAudioProf();
      return;
    }
    const utter = new SpeechSynthesisUtterance(segments[indexSeg]);
    utter.lang = 'fr-FR';
    utter.rate = vitesseLectureAudioProf;
    if (voixFr) utter.voice = voixFr;

    utter.onend = () => {
      indexSeg++;
      lireSegmentSuivant();
    };
    utter.onerror = () => {
      arreterLectureAudioProf();
    };
    window.speechSynthesis.speak(utter);
  }

  lireSegmentSuivant();
}

let regleLectureProfActive = false;
let regleLectureProfY = Math.round(window.innerHeight * 0.45);

let glissementRegleProf = false;

function positionnerRegleLectureProf(clientY) {
  if (!regleLectureProfActive) return;
  const hauteurBande = 56;
  if (typeof clientY === 'number' && !isNaN(clientY)) {
    regleLectureProfY = Math.min(window.innerHeight - 60, Math.max(70, clientY));
  }
  const topH = Math.max(0, regleLectureProfY - hauteurBande / 2);
  const botTop = Math.min(window.innerHeight, regleLectureProfY + hauteurBande / 2);
  const topEl = document.getElementById('regleLectureTopProf');
  const botEl = document.getElementById('regleLectureBottomProf');
  const handleEl = document.getElementById('regleLectureHandleProf');
  if (topEl) topEl.style.height = topH + 'px';
  if (botEl) botEl.style.top = botTop + 'px';
  if (handleEl) handleEl.style.top = topH + 'px';
}

function deplacerRegleProf(deltaY) {
  positionnerRegleLectureProf(regleLectureProfY + deltaY);
}

function basculerRegleLectureProf() {
  regleLectureProfActive = !regleLectureProfActive;
  const overlay = document.getElementById('regleLectureOverlayProf');
  if (overlay) overlay.style.display = regleLectureProfActive ? 'block' : 'none';
  document.querySelectorAll('.btn-regle-prof-sync').forEach(btn => {
    btn.classList.toggle('active', regleLectureProfActive);
    btn.innerHTML = regleLectureProfActive ? '<span>📏 Règle : ON</span>' : '<span>📏 Règle</span>';
  });
  if (regleLectureProfActive) {
    positionnerRegleLectureProf(Math.round(window.innerHeight * 0.38));
  }
}

function desactiverRegleLectureProf() {
  regleLectureProfActive = false;
  glissementRegleProf = false;
  const overlay = document.getElementById('regleLectureOverlayProf');
  if (overlay) overlay.style.display = 'none';
  document.querySelectorAll('.btn-regle-prof-sync').forEach(btn => {
    btn.classList.remove('active');
    btn.innerHTML = '<span>📏 Règle</span>';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const handle = document.getElementById('regleLectureHandleProf');
  if (handle) {
    handle.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      glissementRegleProf = true;
      e.preventDefault();
    });
    handle.addEventListener('touchstart', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      glissementRegleProf = true;
    }, { passive: true });
  }
});

document.addEventListener('mousemove', (e) => {
  if (regleLectureProfActive && glissementRegleProf) positionnerRegleLectureProf(e.clientY);
}, { passive: true });
document.addEventListener('mouseup', () => { glissementRegleProf = false; });
document.addEventListener('touchmove', (e) => {
  if (regleLectureProfActive && glissementRegleProf && e.touches && e.touches[0]) {
    positionnerRegleLectureProf(e.touches[0].clientY);
  }
}, { passive: true });
document.addEventListener('touchend', () => { glissementRegleProf = false; });

function fermerDocRessourceSimu() {
  arreterLectureAudioProf();
  desactiverRegleLectureProf();
  document.getElementById('modalDocRessourceSimu').style.display = 'none';
}

window.simuOrderingSelected = [];
window.simuOrderingPool = [];

function initOrderingSimu(q) {
  const allItems = (q.items || []).map((it, idx) => ({ ...it, uid: idx }));
  window.simuOrderingSelected = [];
  window.simuOrderingPool = [...allItems].sort(() => Math.random() - 0.5);
}

function renderOrderingSimuZones(disabled = false) {
  const zoneSel = document.getElementById('simu_ordering_selected');
  const zonePool = document.getElementById('simu_ordering_pool');
  if (!zoneSel || !zonePool) return;

  if (window.simuOrderingSelected.length === 0) {
    zoneSel.innerHTML = `<div style="text-align:center; color:#64748b; font-size:0.85rem; padding:14px; border:2px dashed #cbd5e1; border-radius:8px;">Touchez une étape ci-dessous pour la placer en position 1...</div>`;
  } else {
    zoneSel.innerHTML = window.simuOrderingSelected.map((it, idx) => `
      <div id="simu_ord_row_${idx}" style="display:flex; align-items:center; justify-content:space-between; gap:8px; background:#eff6ff; border:2px solid #93c5fd; border-radius:8px; padding:8px 10px; margin-bottom:6px;">
        <div style="display:flex; align-items:center; gap:8px; flex:1;">
          <span style="background:#0284c7; color:#fff; font-weight:800; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:0.8rem; flex-shrink:0;">${idx + 1}</span>
          <span style="font-size:0.9rem; font-weight:600; color:#0f172a;">${it.text}</span>
        </div>
        ${disabled ? '' : `
          <div style="display:flex; gap:4px; flex-shrink:0;">
            <button type="button" onclick="moveOrderingSimu(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} style="padding:4px 8px; border:1px solid #cbd5e1; background:#fff; border-radius:6px; cursor:pointer; font-weight:bold;">▲</button>
            <button type="button" onclick="moveOrderingSimu(${idx}, 1)" ${idx === window.simuOrderingSelected.length - 1 ? 'disabled' : ''} style="padding:4px 8px; border:1px solid #cbd5e1; background:#fff; border-radius:6px; cursor:pointer; font-weight:bold;">▼</button>
            <button type="button" onclick="removeOrderingSimu(${idx})" style="padding:4px 8px; border:1px solid #fecaca; background:#fee2e2; color:#b91c1c; border-radius:6px; cursor:pointer; font-weight:bold;">✖</button>
          </div>
        `}
      </div>
    `).join('');
  }

  if (window.simuOrderingPool.length === 0) {
    zonePool.innerHTML = `<div style="font-size:0.8rem; color:#94a3b8; font-style:italic;">Toutes les étiquettes ont été placées.</div>`;
  } else {
    zonePool.innerHTML = window.simuOrderingPool.map((it, idx) => `
      <button type="button" ${disabled ? 'disabled' : ''} onclick="pickOrderingSimu(${idx})" style="display:block; width:100%; text-align:left; background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:9px 12px; margin-bottom:6px; font-size:0.88rem; color:#1e293b; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.04);">
        ➕ ${it.text}
      </button>
    `).join('');
  }
}

function pickOrderingSimu(poolIdx) {
  const [item] = window.simuOrderingPool.splice(poolIdx, 1);
  if (item) window.simuOrderingSelected.push(item);
  renderOrderingSimuZones(false);
}

function removeOrderingSimu(selIdx) {
  const [item] = window.simuOrderingSelected.splice(selIdx, 1);
  if (item) window.simuOrderingPool.push(item);
  renderOrderingSimuZones(false);
}

function moveOrderingSimu(selIdx, delta) {
  const newIdx = selIdx + delta;
  if (newIdx < 0 || newIdx >= window.simuOrderingSelected.length) return;
  const temp = window.simuOrderingSelected[selIdx];
  window.simuOrderingSelected[selIdx] = window.simuOrderingSelected[newIdx];
  window.simuOrderingSelected[newIdx] = temp;
  renderOrderingSimuZones(false);
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
  } else if (q.type === "ordering" && Array.isArray(q.items)) {
    initOrderingSimu(q);
    h += `
      <div style="margin-top:12px;">
        <div style="font-size:0.8rem; font-weight:800; color:#0369a1; text-transform:uppercase; margin-bottom:6px;">📋 Votre procédure ordonnée :</div>
        <div id="simu_ordering_selected" style="margin-bottom:14px;"></div>
        <div style="font-size:0.8rem; font-weight:800; color:#475569; text-transform:uppercase; margin-bottom:6px;">🗂️ Étapes disponibles (laissez les intrus ici) :</div>
        <div id="simu_ordering_pool"></div>
      </div>
    `;
  }
  container.innerHTML = h;
  if (q.type === "ordering") renderOrderingSimuZones(false);
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
  } else if (q.type === "ordering" && Array.isArray(q.items)) {
    const attendus = q.items.filter(it => !it.distracteur).sort((a, b) => a.ordre - b.ordre);
    if (window.simuOrderingSelected.length === 0) {
      alert("Veuillez sélectionner et ordonner les étapes avant de valider.");
      return;
    }
    renderOrderingSimuZones(true);

    let bonsPlacements = 0;
    let intrusClasses = 0;

    window.simuOrderingSelected.forEach((it, idx) => {
      const row = document.getElementById(`simu_ord_row_${idx}`);
      if (it.distracteur) {
        intrusClasses++;
        if (row) { row.style.background = "#fee2e2"; row.style.borderColor = "#dc2626"; }
        explications.push(`<strong>❌ Intrus classé (${it.text}) :</strong> ${it.feedback || "Cet élément ne devait pas être retenu."}`);
      } else if (attendus[idx] && Number(attendus[idx].ordre) === Number(it.ordre)) {
        bonsPlacements++;
        if (row) { row.style.background = "#dcfce7"; row.style.borderColor = "#16a34a"; }
      } else {
        if (row) { row.style.background = "#fef9c3"; row.style.borderColor = "#eab308"; }
      }
    });

    const ratio = Math.max(0, (bonsPlacements - intrusClasses * 0.5) / (attendus.length || 1));
    scoreQuestion = q.points * ratio;

    if (scoreQuestion < q.points) {
      const listeOrdreHtml = attendus.map((it, i) => `<div><strong>${i + 1}.</strong> ${it.text}</div>`).join('');
      explications.unshift(`<div style="background:#f0fdf4; border:1px solid #86efac; padding:8px; border-radius:6px; margin-bottom:6px;"><strong>✅ Ordre exact attendu :</strong>${listeOrdreHtml}</div>`);
    }
  }

  totalScoreObtenu += scoreQuestion;

  const fbBox = document.getElementById('simuFeedbackContainer');
  const estJusteSimu = Number(scoreQuestion) >= (Number(q.points || 1) - 0.01);
  const estPartielSimu = !estJusteSimu && Number(scoreQuestion) > 0;
  let fbHtml = "";
  if (estJusteSimu) {
    fbHtml += `<div><strong>✅ Bravo !</strong> Réponse correcte (+${scoreQuestion.toFixed(2)} pt).</div>`;
  } else if (estPartielSimu) {
    fbHtml += `<div><strong>⚠️ Partiellement juste :</strong> Vous obtenez ${scoreQuestion.toFixed(2)} / ${q.points} pt.</div>`;
  } else {
    fbHtml += `<div><strong>❌ Incorrect :</strong> Vous obtenez 0 / ${q.points} pt.</div>`;
  }

  if (q.generalFeedback) fbHtml += `<div style="margin-top:8px;">💡 <strong>Explication :</strong> ${q.generalFeedback}</div>`;
  if (explications.length > 0) fbHtml += `<div style="margin-top:8px;">${explications.join('<br>')}</div>`;

  fbBox.className = `feedback-box ${estJusteSimu ? 'is-correct' : 'has-error'}`;
  if (estJusteSimu) {
    fbBox.style.background = '#dcfce7';
    fbBox.style.borderColor = '#16a34a';
    fbBox.style.borderLeft = '5px solid #16a34a';
    fbBox.style.color = '#14532d';
  } else if (estPartielSimu) {
    fbBox.style.background = '#fef3c7';
    fbBox.style.borderColor = '#d97706';
    fbBox.style.borderLeft = '5px solid #d97706';
    fbBox.style.color = '#78350f';
  } else {
    fbBox.style.background = '#fee2e2';
    fbBox.style.borderColor = '#dc2626';
    fbBox.style.borderLeft = '5px solid #dc2626';
    fbBox.style.color = '#7f1d1d';
  }
  fbBox.innerHTML = fbHtml;
  fbBox.style.display = 'block';
  if (estJusteSimu) {
    fbBox.classList.remove('anim-bravo-pop');
    void fbBox.offsetWidth;
    fbBox.classList.add('anim-bravo-pop');
    if (typeof lancerMiniConfettisSimu === 'function') lancerMiniConfettisSimu(fbBox);
  }

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
function lancerMiniConfettisSimu(cibleEl) {
  try {
    if (!document.getElementById('styleAnimSimuBravo')) {
      const st = document.createElement('style');
      st.id = 'styleAnimSimuBravo';
      st.textContent = `
        @keyframes popBravoSimu { 0% { transform: scale(0.92); opacity: 0.4; } 55% { transform: scale(1.03); opacity: 1; } 100% { transform: scale(1); } }
        .anim-bravo-pop { animation: popBravoSimu 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        @keyframes confettiFallSimu { 0% { transform: translate(0,0) rotate(0deg) scale(1); opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(0.6); opacity: 0; } }
        .mini-confetti-particule { position: fixed; width: 8px; height: 8px; border-radius: 2px; pointer-events: none; z-index: 9999; animation: confettiFallSimu 0.95s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `;
      document.head.appendChild(st);
    }
    const rect = cibleEl.getBoundingClientRect();
    const originX = rect.left + Math.min(rect.width * 0.35, 140);
    const originY = rect.top + 14;
    const couleurs = ['#16a34a', '#22c55e', '#facc15', '#38bdf8', '#f97316', '#a855f7'];
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('span');
      p.className = 'mini-confetti-particule';
      const angle = (-Math.PI * 0.85) + (Math.random() * Math.PI * 0.7);
      const dist = 45 + Math.random() * 75;
      p.style.left = originX + 'px';
      p.style.top = originY + 'px';
      p.style.background = couleurs[i % couleurs.length];
      if (i % 3 === 0) p.style.borderRadius = '50%';
      p.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
      p.style.setProperty('--dy', (Math.sin(angle) * dist - 10).toFixed(1) + 'px');
      p.style.setProperty('--rot', (Math.random() * 540 - 270).toFixed(0) + 'deg');
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1000);
    }
  } catch (e) {}
}