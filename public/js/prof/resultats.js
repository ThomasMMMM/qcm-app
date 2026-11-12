let memoireToutesLesNotes = [];

async function chargerResultatsProf() {
  if (!currentProf) return;
  try {
    const res = await fetch(`/api/resultats?prof_id=${currentProf.id}`);
    const data = await res.json();
    memoireToutesLesNotes = data.notes || [];
    filtrerResultats();

    const sorties = data.sorties || [];
    const tbodySorties = document.getElementById('tableSortiesBody');
    if (tbodySorties) {
      tbodySorties.innerHTML = sorties.length === 0 ? "<tr><td colspan='3' style='text-align:center; color:#94a3b8; padding:10px;'>Aucun incident consigné.</td></tr>" :
        sorties.map(s => `
          <tr>
            <td>${new Date(s.horodatage).toLocaleTimeString()}</td>
            <td>${s.eleve_id}</td>
            <td style="color:${s.type_evenement === 'page_masquee' ? '#d97706':'#2563eb'}; font-weight:bold;">${s.type_evenement}</td>
          </tr>
        `).join('');
    }
  } catch(e) {}
}

function filtrerResultats() {
  const classeFiltreId = document.getElementById('filtreClasseSelect').value;
  const seanceFiltreId = document.getElementById('filtreSeanceSelect').value;

  let filtrees = memoireToutesLesNotes;
  if (seanceFiltreId) {
    filtrees = filtrees.filter(n => n.seance_id == seanceFiltreId);
  }
  if (classeFiltreId) {
    const cl = listeClassesMemoire.find(c => c.id == classeFiltreId);
    if (cl) {
      filtrees = filtrees.filter(n => (n.classe_nom === cl.nom) || (n.classe === cl.nom));
    }
  }

  let moyenne = 0;
  if (filtrees.length > 0) {
    const total = filtrees.reduce((acc, n) => acc + n.note, 0);
    moyenne = (total / filtrees.length).toFixed(2);
  }

  document.getElementById('statCopiesText').innerText = `${filtrees.length} copie(s) ${filtrees.length > 0 ? `(Moyenne : ${moyenne}/20)` : ''}`;
  const tbody = document.getElementById('tableNotesBody');
  tbody.innerHTML = filtrees.length === 0 ? "<tr><td colspan='7' style='text-align:center; color:#94a3b8; padding:14px;'>Aucune copie pour cette sélection.</td></tr>" :
    filtrees.map(n => {
      const nbS = n.nb_sorties || 0;
      const durS = parseInt(n.duree_sorties) || 0;
      let txtDuree = "0 s";
      if (durS > 0) {
        const min = Math.floor(durS / 60);
        const sec = durS % 60;
        txtDuree = min > 0 ? (min + " min " + (sec > 0 ? sec + " s" : "")) : (sec + " s");
      }

      let renduTemps = '<span style="color:#94a3b8;">0 s</span>';
      if (nbS > 0) {
        if (durS > 0) {
          renduTemps = `<strong style="color:#b91c1c;">${txtDuree}</strong>`;
        } else {
          renduTemps = '<span style="color:#d97706; font-size:0.8rem; font-style:italic;">Non mesuré</span>';
        }
      }

      return `
        <tr>
          <td>${new Date(n.date_soumission).toLocaleTimeString()}</td>
          <td><strong>${n.nom}</strong> ${n.prenom}</td>
          <td><span class="badge">${n.classe_nom || n.classe || '-'}</span></td>
          <td><span class="badge-session">${n.code_session || n.session_code || '-'}</span></td>
          <td>
            <div style="display:flex; flex-direction:column; gap:3px;">
              <div>
                <strong style="color:var(--pronote-blue); font-size:1rem;">${n.note} / ${n.total}</strong>
                <span style="font-size:0.72rem; color:#64748b;">(Brute)</span>
              </div>
              ${(n.questions_traitees !== null && n.questions_totales !== null && n.questions_traitees < n.questions_totales)
                ? `<div style="font-size:0.78rem; background:#fef3c7; color:#92400e; padding:3px 6px; border-radius:4px; border:1px solid #fde68a; display:inline-block;">
                     <strong>${(n.note_proportionnelle !== null ? Number(n.note_proportionnelle).toFixed(2) : '0.00')} / 20</strong> sur faites
                     <span style="display:block; font-size:0.7rem; color:#b45309;">⚠️ Rendu anticipé (${n.questions_traitees}/${n.questions_totales} Q.)</span>
                   </div>`
                : (n.questions_traitees !== null && n.questions_totales !== null)
                  ? `<span style="font-size:0.72rem; color:#15803d;">✓ ${n.questions_traitees}/${n.questions_totales} Q.</span>`
                  : ''
              }
            </div>
          </td>
          <td>
            ${(nbS > 0)
              ? `<span class="badge" style="background:#fee2e2; color:#b91c1c;">⚠️ ${nbS} sortie${nbS > 1 ? 's' : ''}</span>`
              : `<span class="badge" style="background:#dcfce7; color:#15803d;">🟢 Aucune</span>`
            }
          </td>
          <td>${renduTemps}</td>
        </tr>
      `;
    }).join('');
}

async function purgerJournalAlertes() {
  if (!confirm("Voulez-vous vraiment effacer l'intégralité du journal des alertes et incidents ?")) return;
  try {
    const res = await fetch('/api/evenement', { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      const tbody = document.getElementById('tableSortiesBody');
      if (tbody) tbody.innerHTML = "<tr><td colspan='3' style='text-align:center; color:#94a3b8; padding:10px;'>Aucun incident consigné.</td></tr>";
      alert("✓ Le journal des sorties d'écran et incidents a été purgé !");
      await chargerResultatsProf();
    } else {
      alert("Erreur lors de la purge : " + (data.error || "Erreur serveur"));
    }
  } catch (e) {
    alert("Erreur réseau : " + e.message);
  }
}
