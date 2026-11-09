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
  } catch(e) {}
}

async function chargerSeancesProf() {
  if (!currentProf) return;
  try {
    const res = await fetch(`/api/seances?prof_id=${currentProf.id}`);
    listeSeancesMemoire = await res.json();

    const selFiltre = document.getElementById('filtreSeanceSelect');
    if (selFiltre) {
      selFiltre.innerHTML = '<option value="">Toutes les séances</option>' +
        listeSeancesMemoire.map(s => `<option value="${s.id}">${s.code_session} (${s.classe_nom})</option>`).join('');
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
          <td style="display:flex; gap:4px; align-items:center; justify-content:center;">
            <button type="button" class="btn btn-simu" style="padding:4px 8px; font-size:0.75rem;" onclick="lancerSimulationSeance(${s.id})">🔍 Tester</button>
            <button type="button" class="btn btn-pdf" style="background:${s.actif ? '#eab308' : '#16a34a'}; padding:4px 8px; font-size:0.75rem;" onclick="toggleEtatSeance(${s.id}, ${s.actif})">
              ${s.actif ? 'Fermer' : 'Rouvrir'}
            </button>
            <button type="button" class="btn btn-danger" style="padding:4px 8px; font-size:0.75rem;" onclick="supprimerSeance(${s.id}, '${s.code_session}')">Suppr</button>
          </td>
        </tr>
      `).join('');

    afficherPlanningSemaine();
  } catch(e) {}
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
  monday.setHours(0,0,0,0);
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

    const seancesDuJour = listeSeancesMemoire.filter(s => s.date_seance === strDateIso);
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
