let listeSeancesMemoire = [];
let offsetSemaine = 0;

async function creerNouvelleSeance() {
  const qcmId = document.getElementById('selectSeanceQcm').value;
  const classeId = document.getElementById('selectSeanceClasse').value;
  const codeSession = document.getElementById('codeSeanceInput').value.trim().toUpperCase();
  const dateSeance = document.getElementById('seanceDateInput').value;
  const horaireSeance = document.getElementById('seanceHoraireInput').value.trim();

  if (!qcmId || !classeId || !codeSession) {
    alert("Veuillez sélectionner un QCM, une classe et choisir un code d'épreuve.");
    return;
  }

  const res = await fetch('/api/seances', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prof_id: currentProf.id,
      qcm_id: parseInt(qcmId),
      classe_id: parseInt(classeId),
      code_session: codeSession,
      date_seance: dateSeance || null,
      horaire_seance: horaireSeance || null
    })
  });

  const data = await res.json();
  if (res.ok) {
    alert(`Séance activée avec succès pour le ${dateSeance || 'cours habituel'} (${codeSession}) !`);
    document.getElementById('codeSeanceInput').value = "";
    chargerSeancesProf();
  } else {
    alert("Erreur: " + data.error);
  }
}

async function toggleEtatSeance(seanceId, etatActuel) {
  await fetch('/api/seances', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: "toggle_actif", seance_id: seanceId, actif: !etatActuel })
  });
  chargerSeancesProf();
}

async function supprimerSeance(seanceId, code) {
  if (!confirm(`Voulez-vous vraiment supprimer la séance "${code}" ainsi que les copies associées ?`)) return;
  try {
    const res = await fetch(`/api/seances?seance_id=${seanceId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      await chargerSeancesProf();
      if (typeof chargerResultatsProf === 'function') await chargerResultatsProf();
    } else {
      alert("Erreur lors de la suppression : " + (data.error || "Erreur serveur"));
    }
  } catch (e) {}
}

async function chargerSeancesProf() {
  if (!currentProf) return;
  try {
    const res = await fetch(`/api/seances?prof_id=${currentProf.id}`);
    listeSeancesMemoire = await res.json();

    if (typeof mettreAJourOptionsSeancesSelonClasse === 'function') {
      mettreAJourOptionsSeancesSelonClasse();
    } else {
      const selFiltre = document.getElementById('filtreSeanceSelect');
      if (selFiltre) {
        selFiltre.innerHTML = '<option value="">Toutes les séances</option>' +
          listeSeancesMemoire.map(s => `<option value="${s.id}">${s.code_session} (${s.classe_nom})</option>`).join('');
      }
    }

    const tbody = document.getElementById('tableSeancesBody');
    tbody.innerHTML = listeSeancesMemoire.length === 0 ? "<tr><td colspan='7' style='text-align:center; color:#94a3b8; padding:14px;'>Aucune séance active.</td></tr>" :
      listeSeancesMemoire.map(s => `
        <tr>
          <td><span class="badge-session">${s.code_session}</span></td>
          <td>${s.qcm_titre}</td>
          <td><strong>${s.classe_nom}</strong></td>
          <td>${s.date_seance ? `${s.date_seance} (${s.horaire_seance || ''})` : '-'}</td>
          <td style="text-align:center;">
            <span class="${s.actif ? 'badge-active' : 'badge-closed'}">${s.actif ? 'Active' : 'Clôturée'}</span>
          </td>
          <td style="text-align:center;">${s.nb_copies || 0}</td>
          <td style="white-space:nowrap; text-align:center;">
            <div style="display:inline-flex; gap:5px; align-items:center; justify-content:center; flex-wrap:nowrap;">
              <button type="button" class="btn" style="background:#0284c7; margin:0; padding:5px 9px; font-size:0.75rem; line-height:1.2; display:inline-flex; align-items:center; gap:4px; white-space:nowrap; height:28px;" onclick="ouvrirSuiviDirectSeance(${s.id})">📡 Direct</button>
              <button type="button" class="btn btn-simu" style="margin:0; padding:5px 9px; font-size:0.75rem; line-height:1.2; display:inline-flex; align-items:center; gap:4px; white-space:nowrap; height:28px;" onclick="lancerSimulationSeance(${s.id})">🔍 Tester</button>
              <button type="button" class="btn btn-pdf" style="background:${s.actif ? '#eab308' : '#16a34a'}; margin:0; padding:5px 9px; font-size:0.75rem; line-height:1.2; display:inline-flex; align-items:center; gap:4px; white-space:nowrap; height:28px;" onclick="toggleEtatSeance(${s.id}, ${s.actif})">${s.actif ? '🔒 Fermer' : '🔓 Rouvrir'}</button>
              <button type="button" class="btn btn-danger" style="margin:0; padding:5px 9px; font-size:0.75rem; line-height:1.2; display:inline-flex; align-items:center; gap:4px; white-space:nowrap; height:28px;" onclick="supprimerSeance(${s.id}, '${s.code_session}')">🗑️ Suppr</button>
            </div>
          </td>
        </tr>
      `).join('');

    afficherPlanningSemaine();
  } catch (e) {}
}

function changerSemainePlanning(delta) {
  offsetSemaine += delta;
  afficherPlanningSemaine();
}

function getLundiSemaine(offset) {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + (offset * 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function afficherPlanningSemaine() {
  const grille = document.getElementById('grillePlanningSemaine');
  if (!grille) return;

  const lundi = getLundiSemaine(offsetSemaine);
  const vendredi = new Date(lundi);
  vendredi.setDate(lundi.getDate() + 4);

  const formatJourMois = (d) => `${d.getDate()} ${d.toLocaleDateString('fr-FR', { month: 'short' })}`;
  document.getElementById('labelSemainePlanning').innerText = `Semaine du ${formatJourMois(lundi)} au ${formatJourMois(vendredi)} ${vendredi.getFullYear()}`;

  grille.innerHTML = "";
  const joursSemaine = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

  for (let i = 0; i < 5; i++) {
    const curDate = new Date(lundi);
    curDate.setDate(lundi.getDate() + i);
    const yyyy = curDate.getFullYear();
    const mm = String(curDate.getMonth() + 1).padStart(2, '0');
    const dd = String(curDate.getDate()).padStart(2, '0');
    const strDateIso = `${yyyy}-${mm}-${dd}`;

    const extraireMinutesDebut = (h) => {
      if (!h) return 9999;
      const m = String(h).trim().match(/^(\d{1,2})\s*[hH:]\s*(\d{0,2})/);
      if (!m) return 9999;
      const heures = parseInt(m[1], 10);
      const minutes = m[2] ? parseInt(m[2], 10) : 0;
      return (heures * 60) + minutes;
    };

    const seancesDuJour = listeSeancesMemoire
      .filter(s => s.date_seance === strDateIso)
      .sort((a, b) => {
        const diffHeure = extraireMinutesDebut(a.horaire_seance) - extraireMinutesDebut(b.horaire_seance);
        if (diffHeure !== 0) return diffHeure;
        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });
    let cartesHtml = "";

    if (seancesDuJour.length === 0) {
      cartesHtml = "<div style='font-size:0.75rem; color:#94a3b8; font-style:italic; padding:10px 0;'>Aucun devoir</div>";
    } else {
      cartesHtml = seancesDuJour.map(s => `
        <div class="seance-item" style="border-left:3px solid ${s.actif ? '#22c55e' : '#94a3b8'};">
          <div style="font-weight:bold; font-size:0.8rem; color:#1e293b;">${s.horaire_seance || ''}</div>
          <div style="font-weight:bold; font-size:0.85rem; color:var(--pronote-blue);">${s.classe_nom}</div>
          <div style="font-size:0.75rem; color:#475569; margin:2px 0;">${s.qcm_titre}</div>
          <div style="font-size:0.7rem; color:#64748b;">${s.nb_copies || 0} copie(s)</div>
        </div>
      `).join('');
    }

    grille.innerHTML += `
      <div class="carte-jour">
        <div class="carte-jour-titre">${joursSemaine[i]} ${curDate.getDate()}</div>
        ${cartesHtml}
      </div>
    `;
  }
}
// ==============================================================================
// SUIVI EN DIRECT DU QCM EN CLASSE (LIVE CLASS MONITOR)
// ==============================================================================
let intervalSuiviDirect = null;
let seanceSuiviDirectId = null;
let donneesSuiviDirectCache = null;

function ouvrirSuiviDirectSeance(seanceId) {
  seanceSuiviDirectId = seanceId;
  const modal = document.getElementById('modalSuiviDirectClasse');
  if (modal) modal.style.display = 'flex';

  rafraichirSuiviDirect();
  if (intervalSuiviDirect) clearInterval(intervalSuiviDirect);
  intervalSuiviDirect = setInterval(rafraichirSuiviDirect, 4000);
}

function fermerSuiviDirectSeance() {
  if (intervalSuiviDirect) {
    clearInterval(intervalSuiviDirect);
    intervalSuiviDirect = null;
  }
  seanceSuiviDirectId = null;
  const modal = document.getElementById('modalSuiviDirectClasse');
  if (modal) modal.style.display = 'none';
}

async function rafraichirSuiviDirect() {
  if (!seanceSuiviDirectId) return;
  try {
    const res = await fetch(`/api/suivi_direct?seance_id=${seanceSuiviDirectId}`);
    if (!res.ok) return;
    const data = await res.json();
    donneesSuiviDirectCache = data;
    rendreSuiviDirect(data);
  } catch (e) {}
}

function rendreSuiviDirect(data) {
  if (!data || !data.seance) return;

  const titreEl = document.getElementById('liveDirectTitreSeance');
  if (titreEl) {
    titreEl.innerHTML = `📡 Suivi en direct — <strong>${data.seance.classe_nom}</strong> • ${data.seance.qcm_titre} <span class="badge-session" style="margin-left:6px;">${data.seance.code_session}</span>`;
  }

  const r = data.resume || {};
  const kpiEl = document.getElementById('liveDirectKpis');
  if (kpiEl) {
    kpiEl.innerHTML = `
      <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:10px; text-align:center;">
        <div style="font-size:0.75rem; color:#0369a1; font-weight:700; text-transform:uppercase;">Connectés</div>
        <div style="font-size:1.3rem; font-weight:800; color:#0f172a;">${r.connectes || 0} / ${r.effectif_total || 0}</div>
      </div>
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px; text-align:center;">
        <div style="font-size:0.75rem; color:#15803d; font-weight:700; text-transform:uppercase;">Terminés / En cours</div>
        <div style="font-size:1.3rem; font-weight:800; color:#15803d;">${r.termines || 0} <span style="font-size:0.9rem; color:#0284c7;">(${r.en_cours || 0} en cours)</span></div>
      </div>
      <div style="background:#fefce8; border:1px solid #fef08a; border-radius:8px; padding:10px; text-align:center;">
        <div style="font-size:0.75rem; color:#a16207; font-weight:700; text-transform:uppercase;">Moyenne provisoire</div>
        <div style="font-size:1.3rem; font-weight:800; color:#854d0e;">${r.moyenne_provisoire !== null ? r.moyenne_provisoire.toFixed(1) + ' / 20' : '—'}</div>
      </div>
      <div style="background:${(r.hors_ecran_actuel > 0 || r.total_alertes_sorties > 0) ? '#fef2f2' : '#f8fafc'}; border:1px solid ${(r.hors_ecran_actuel > 0 || r.total_alertes_sorties > 0) ? '#fecaca' : '#e2e8f0'}; border-radius:8px; padding:10px; text-align:center;">
        <div style="font-size:0.75rem; color:#b91c1c; font-weight:700; text-transform:uppercase;">Sorties d'application</div>
        <div style="font-size:1.3rem; font-weight:800; color:${r.hors_ecran_actuel > 0 ? '#dc2626' : '#334155'};">
          ${r.hors_ecran_actuel > 0 ? `🚨 ${r.hors_ecran_actuel} dehors !` : `${r.total_alertes_sorties || 0} sortie(s)`}
        </div>
      </div>
    `;
  }

  // Radar des questions
  const radarEl = document.getElementById('liveDirectRadarQuestions');
  if (radarEl && Array.isArray(data.stats_questions)) {
    radarEl.innerHTML = data.stats_questions.map(sq => {
      const taux = sq.repondus > 0 ? Math.round(((sq.justes + sq.partiels * 0.5) / sq.repondus) * 100) : null;
      const bg = taux === null ? '#f1f5f9' : (taux >= 70 ? '#dcfce7' : (taux >= 45 ? '#fef9c3' : '#fee2e2'));
      const color = taux === null ? '#64748b' : (taux >= 70 ? '#15803d' : (taux >= 45 ? '#a16207' : '#b91c1c'));
      return `
        <div style="background:${bg}; color:${color}; border:1px solid rgba(0,0,0,0.08); border-radius:6px; padding:5px 10px; font-size:0.78rem; font-weight:700;" title="${sq.titre}">
          Q${sq.numero} : ${taux !== null ? taux + '%' : '—'}
        </div>
      `;
    }).join('');
  }

  // Tri de la liste des élèves
  const critereTri = document.getElementById('selectTriSuiviDirect')?.value || 'nom';
  const eleves = [...(data.eleves || [])];

  if (critereTri === 'alertes') {
    eleves.sort((a, b) => (b.hors_ecran - a.hors_ecran) || (b.nb_sorties - a.nb_sorties) || a.nom.localeCompare(b.nom));
  } else if (critereTri === 'score_asc') {
    eleves.sort((a, b) => {
      const na = a.note_sur_20 !== null ? a.note_sur_20 : 999;
      const nb = b.note_sur_20 !== null ? b.note_sur_20 : 999;
      return na - nb;
    });
  } else if (critereTri === 'avancement') {
    eleves.sort((a, b) => (b.question_courante - a.question_courante));
  }

  const tbody = document.getElementById('tableSuiviDirectBody');
  if (!tbody) return;

  const nbQ = data.seance.total_questions || 1;

  tbody.innerHTML = eleves.map(el => {
    let badgeStatut = `<span style="background:#f1f5f9; color:#64748b; padding:3px 8px; border-radius:99px; font-size:0.75rem; font-weight:700;">⚪ En attente</span>`;
    if (el.est_absent && el.statut === 'non_connecte') {
      badgeStatut = `<span style="background:#e2e8f0; color:#334155; padding:3px 8px; border-radius:99px; font-size:0.75rem; font-weight:800;">🚫 Absent</span>`;
    } else if (el.hors_ecran === 1 && el.statut === 'en_cours') {
      badgeStatut = `<span style="background:#dc2626; color:#ffffff; padding:3px 8px; border-radius:99px; font-size:0.75rem; font-weight:800; animation: pulse 1.2s infinite;">🚨 HORS ÉCRAN !</span>`;
    } else if (el.statut === 'termine') {
      badgeStatut = `<span style="background:#dcfce7; color:#15803d; padding:3px 8px; border-radius:99px; font-size:0.75rem; font-weight:700;">✅ Terminé</span>`;
    } else if (el.statut === 'en_cours') {
      badgeStatut = `<span style="background:#e0f2fe; color:#0369a1; padding:3px 8px; border-radius:99px; font-size:0.75rem; font-weight:700;">🔵 Q${Math.min(el.question_courante, nbQ)} / ${nbQ}</span>`;
    }

    let badgeSorties = `<span style="color:#94a3b8; font-size:0.78rem;">0</span>`;
    if (el.nb_sorties > 0) {
      badgeSorties = `<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:2px 7px; border-radius:6px; font-size:0.75rem; font-weight:800;">⚠️ ${el.nb_sorties}x (${el.duree_sorties_sec}s)</span>`;
    }

    // Pastilles Q1..Qn
    let pastillesHtml = '<div style="display:flex; gap:4px; flex-wrap:wrap;">';
    for (let i = 0; i < nbQ; i++) {
      const rep = Array.isArray(el.reponses) ? el.reponses[i] : null;
      let bgP = '#e2e8f0';
      let colP = '#475569';
      if (rep && rep.etat === 'juste') { bgP = '#22c55e'; colP = '#ffffff'; }
      else if (rep && rep.etat === 'partiel') { bgP = '#f59e0b'; colP = '#ffffff'; }
      else if (rep && rep.etat === 'faux') { bgP = '#ef4444'; colP = '#ffffff'; }

      pastillesHtml += `<span style="display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:5px; background:${bgP}; color:${colP}; font-size:0.72rem; font-weight:800;">${i + 1}</span>`;
    }
    pastillesHtml += '</div>';

    const noteTxt = el.note_sur_20 !== null
      ? `<strong style="color:${el.note_sur_20 >= 10 ? '#15803d' : '#dc2626'}; font-size:0.92rem;">${el.note_sur_20.toFixed(1)} / 20</strong>`
      : `<span style="color:#94a3b8;">—</span>`;

    const rowBg = (el.hors_ecran === 1 && el.statut === 'en_cours')
      ? 'background:#fef2f2;'
      : (el.est_absent ? 'background:#f8fafc; opacity:0.75;' : '');
    const disableAbsent = (el.statut === 'termine' || el.statut === 'en_cours') ? 'disabled title="Élève connecté"' : '';

    return `
      <tr style="${rowBg}">
        <td style="text-align:center;">
          <input type="checkbox" ${el.est_absent ? 'checked' : ''} ${disableAbsent}
                 onchange="toggleAbsentEleveSeance(${el.id}, this.checked)"
                 style="width:17px; height:17px; cursor:pointer; accent-color:#dc2626;">
        </td>
        <td><strong>${el.nom}</strong> ${el.prenom}</td>
        <td style="text-align:center;">${badgeStatut}</td>
        <td>${pastillesHtml}</td>
        <td style="text-align:center;">${badgeSorties}</td>
        <td style="text-align:center;">${noteTxt}</td>
      </tr>
    `;
  }).join('');
}