let memoireToutesLesNotes = [];

function mettreAJourOptionsSeancesSelonClasse() {
  const selClasse = document.getElementById('filtreClasseSelect');
  const selSeance = document.getElementById('filtreSeanceSelect');
  if (!selSeance) return;

  const classeFiltreId = selClasse ? selClasse.value : "";
  const valeurActuelle = selSeance.value;
  const seances = (typeof listeSeancesMemoire !== 'undefined') ? listeSeancesMemoire : [];

  let seancesDisponibles = seances;
  if (classeFiltreId) {
    const cl = (typeof listeClassesMemoire !== 'undefined')
      ? listeClassesMemoire.find(c => String(c.id) === String(classeFiltreId))
      : null;

    seancesDisponibles = seances.filter(s =>
      String(s.classe_id) === String(classeFiltreId) ||
      (cl && s.classe_nom === cl.nom)
    );
  }

  selSeance.innerHTML = '<option value="">Toutes les séances</option>' +
    seancesDisponibles.map(s => {
      const libelle = classeFiltreId
        ? `${s.code_session}${s.qcm_titre ? ' — ' + s.qcm_titre : ''}`
        : `${s.code_session} (${s.classe_nom})`;
      return `<option value="${s.id}">${libelle}</option>`;
    }).join('');

  if (valeurActuelle && seancesDisponibles.some(s => String(s.id) === String(valeurActuelle))) {
    selSeance.value = valeurActuelle;
  } else {
    selSeance.value = "";
  }
}

function onChangeFiltreClasseResultats() {
  mettreAJourOptionsSeancesSelonClasse();
  filtrerResultats();
}

async function chargerResultatsProf() {
  if (!currentProf) return;
  try {
    const res = await fetch(`/api/resultats?prof_id=${currentProf.id}`);
    const data = await res.json();
    memoireToutesLesNotes = data.notes || [];
    mettreAJourOptionsSeancesSelonClasse();
    filtrerResultats();
    if (typeof actualiserCompteursTuiles === 'function') actualiserCompteursTuiles();

    const sorties = data.sorties || [];
    const tbodySorties = document.getElementById('tableSortiesBody');
    if (tbodySorties) {
      tbodySorties.innerHTML = sorties.length === 0 ? "<tr><td colspan='3' style='text-align:center; color:#64748b; padding:10px;'>Aucun incident consigné.</td></tr>" :
        sorties.map(s => `
          <tr>
            <td>${new Date(s.horodatage).toLocaleTimeString()}</td>
            <td>${s.eleve_id}</td>
            <td style="color:${s.type_evenement === 'page_masquee' ? '#d97706':'#2563eb'}; font-weight:bold;">${s.type_evenement}</td>
          </tr>
        `).join('');
    }
  } catch (e) {}
}

function filtrerResultats() {
  const classeFiltreId = document.getElementById('filtreClasseSelect').value;
  const seanceFiltreId = document.getElementById('filtreSeanceSelect').value;
  const cbNonExportees = document.getElementById('filtreNonExporteesCheckbox');
  const seulementNonExportees = cbNonExportees ? cbNonExportees.checked : false;

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
  if (seulementNonExportees) {
    filtrees = filtrees.filter(n => Number(n.exporte_pronote) !== 1);
  }

  let moyenne = 0;
  if (filtrees.length > 0) {
    const total = filtrees.reduce((acc, n) => acc + n.note, 0);
    moyenne = (total / filtrees.length).toFixed(2);
  }

  const nbNonExporteesSelection = filtrees.filter(n => Number(n.exporte_pronote) !== 1).length;
  document.getElementById('statCopiesText').innerText = `${filtrees.length} copie(s) ${filtrees.length > 0 ? `(Moyenne : ${moyenne}/20 • ${nbNonExporteesSelection} à exporter)` : ''}`;

  const tbody = document.getElementById('tableNotesBody');
  tbody.innerHTML = filtrees.length === 0 ? "<tr><td colspan='9' style='text-align:center; color:#64748b; padding:14px;'>Aucune copie pour cette sélection.</td></tr>" :
    filtrees.map(n => {
      const nbS = n.nb_sorties || 0;
      const durS = parseInt(n.duree_sorties) || 0;
      let txtDuree = "0 s";
      if (durS > 0) {
        const min = Math.floor(durS / 60);
        const sec = durS % 60;
        txtDuree = min > 0 ? (min + " min " + (sec > 0 ? sec + " s" : "")) : (sec + " s");
      }

      let renduTemps = '<span style="color:#475569;">0 s</span>';
      if (nbS > 0) {
        if (durS > 0) {
          renduTemps = `<strong style="color:#b91c1c;">${txtDuree}</strong>`;
        } else {
          renduTemps = '<span style="color:#b45309; font-size:0.8rem; font-style:italic;">Non mesuré</span>';
        }
      }

      const estExporte = Number(n.exporte_pronote) === 1;
      const badgeExport = estExporte
        ? `<span class="badge" style="background:#dcfce7; color:#15803d; font-weight:700;">✓ Exportée</span>`
        : `<span class="badge" style="background:#fef3c7; color:#b45309; font-weight:700;">⏳ À exporter</span>`;

      return `
        <tr>
          <td>
            <div style="font-weight:600; color:#334155; font-size:0.84rem;">${new Date(n.date_soumission).toLocaleDateString('fr-FR')}</div>
            <div style="font-size:0.78rem; color:#64748b;">${new Date(n.date_soumission).toLocaleTimeString('fr-FR')}</div>
          </td>
          <td><strong>${n.nom}</strong> ${n.prenom}</td>
          <td><span class="badge">${n.classe_nom || n.classe || '-'}</span></td>
          <td><span class="badge-session">${n.code_session || n.session_code || '-'}</span></td>
          <td><strong style="color:var(--pronote-blue); font-size:1rem;">${n.note} / ${n.total}</strong></td>
          <td>
            ${(n.questions_traitees !== null && n.questions_totales !== null)
              ? (n.questions_traitees < n.questions_totales
                  ? `<div style="display:inline-block; background:#fef3c7; color:#92400e; padding:3px 7px; border-radius:5px; border:1px solid #fde68a; font-size:0.85rem;">
                       <strong>${(n.note_proportionnelle !== null ? Number(n.note_proportionnelle).toFixed(2) : '0.00')} / 20</strong>
                       <span style="display:block; font-size:0.72rem; color:#b45309;">⚠️ ${n.questions_traitees}/${n.questions_totales} Q. faites</span>
                     </div>`
                  : `<div>
                       <strong style="color:#15803d; font-size:0.95rem;">${(n.note_proportionnelle !== null ? Number(n.note_proportionnelle).toFixed(2) : Number(n.note).toFixed(2))} / 20</strong>
                       <span style="display:block; font-size:0.72rem; color:#475569;">✓ ${n.questions_traitees}/${n.questions_totales} Q.</span>
                     </div>`)
              : `<span style="color:#475569; font-size:0.8rem;">— (avant maj)</span>`
            }
          </td>
          <td>
            ${(nbS > 0)
              ? `<span class="badge" style="background:#fee2e2; color:#b91c1c;">⚠️ ${nbS} sortie${nbS > 1 ? 's' : ''}</span>`
              : `<span class="badge" style="background:#dcfce7; color:#15803d;">🟢 Aucune</span>`
            }
          </td>
          <td>${renduTemps}</td>
          <td style="text-align:center;">${badgeExport}</td>
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
      if (tbody) tbody.innerHTML = "<tr><td colspan='3' style='text-align:center; color:#64748b; padding:10px;'>Aucun incident consigné.</td></tr>";
      alert("✓ Le journal des sorties d'écran et incidents a été purgé !");
      await chargerResultatsProf();
    } else {
      alert("Erreur lors de la purge : " + (data.error || "Erreur serveur"));
    }
  } catch (e) {
    alert("Erreur réseau : " + e.message);
  }
}