let offsetSemaineSuivi = -1;
let seanceSelectionneeSuiviId = null;

function changerSemainePlanningSuivi(delta) {
  offsetSemaineSuivi += delta;
  afficherPlanningSemaineSuivi();
}

function getLundiSemaineSuivi(offset) {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + (offset * 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function afficherPlanningSemaineSuivi() {
  const grille = document.getElementById('grillePlanningSemaineSuivi');
  if (!grille) return;

  const seancesSource = (donneesSuiviClassesCache && Array.isArray(donneesSuiviClassesCache.seances))
    ? donneesSuiviClassesCache.seances
    : (typeof listeSeancesMemoire !== 'undefined' && Array.isArray(listeSeancesMemoire) ? listeSeancesMemoire : []);
  const classesSource = (donneesSuiviClassesCache && Array.isArray(donneesSuiviClassesCache.classes))
    ? donneesSuiviClassesCache.classes
    : (typeof listeClassesMemoire !== 'undefined' && Array.isArray(listeClassesMemoire) ? listeClassesMemoire : []);
  const copiesSource = (donneesSuiviClassesCache && Array.isArray(donneesSuiviClassesCache.copies))
    ? donneesSuiviClassesCache.copies
    : [];

  const lundi = getLundiSemaineSuivi(offsetSemaineSuivi);
  const vendredi = new Date(lundi);
  vendredi.setDate(lundi.getDate() + 4);

  const formatJourMois = (d) => `${d.getDate()} ${d.toLocaleDateString('fr-FR', { month: 'short' })}`;
  const lbl = document.getElementById('labelSemainePlanningSuivi');
  if (lbl) {
    lbl.innerText = `Semaine du ${formatJourMois(lundi)} au ${formatJourMois(vendredi)} ${vendredi.getFullYear()}`;
  }

  grille.innerHTML = "";
  const joursSemaine = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

  const extraireMinutesDebut = (h) => {
    if (!h) return 9999;
    const m = String(h).trim().match(/^(\d{1,2})\s*[hH:]\s*(\d{0,2})/);
    if (!m) return 9999;
    return (parseInt(m[1], 10) * 60) + (m[2] ? parseInt(m[2], 10) : 0);
  };

  for (let i = 0; i < 5; i++) {
    const curDate = new Date(lundi);
    curDate.setDate(lundi.getDate() + i);
    const yyyy = curDate.getFullYear();
    const mm = String(curDate.getMonth() + 1).padStart(2, '0');
    const dd = String(curDate.getDate()).padStart(2, '0');
    const strDateIso = `${yyyy}-${mm}-${dd}`;

    const seancesDuJour = seancesSource
      .filter(s => {
        const dRef = (s.date_seance && String(s.date_seance).trim()) ? String(s.date_seance).trim() : String(s.date_creation || "").slice(0, 10);
        return dRef === strDateIso;
      })
      .sort((a, b) => {
        const diffHeure = extraireMinutesDebut(a.horaire_seance) - extraireMinutesDebut(b.horaire_seance);
        if (diffHeure !== 0) return diffHeure;
        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });

    let cartesHtml = "";
    if (seancesDuJour.length === 0) {
      cartesHtml = "<div style='font-size:0.75rem; color:#94a3b8; font-style:italic; padding:10px 0;'>Aucun devoir</div>";
    } else {
      cartesHtml = seancesDuJour.map(s => {
        const clObj = classesSource.find(c => Number(c.id) === Number(s.classe_id));
        const nomClasse = s.classe_nom || (clObj ? clObj.nom : "Classe");
        const nbCopies = s.nb_copies !== undefined
          ? s.nb_copies
          : copiesSource.filter(c => Number(c.seance_id) === Number(s.id) || (c.session_code && c.session_code === s.code_session)).length;
        const estSelectionnee = Number(seanceSelectionneeSuiviId) === Number(s.id);

        return `
          <div class="seance-item"
               onclick="selectionnerSeanceDepuisPlanningSuivi(${Number(s.classe_id)}, ${Number(s.id)})"
               title="Cliquer pour afficher la progression et les présences de ${nomClasse}"
               style="cursor:pointer; border-left:3px solid ${estSelectionnee ? '#0284c7' : (Number(s.actif) === 1 ? '#22c55e' : '#94a3b8')}; background:${estSelectionnee ? '#eff6ff' : '#ffffff'}; box-shadow:${estSelectionnee ? '0 0 0 2px #0284c7' : 'none'}; transition:all 0.15s;">
            <div style="font-weight:bold; font-size:0.8rem; color:#1e293b;">${s.horaire_seance || ''}</div>
            <div style="font-weight:bold; font-size:0.85rem; color:var(--pronote-blue);">${nomClasse}</div>
            <div style="font-size:0.75rem; color:#475569; margin:2px 0;">${s.qcm_titre || 'Évaluation'}</div>
            <div style="font-size:0.7rem; color:#64748b;">${nbCopies} copie(s)</div>
          </div>
        `;
      }).join('');
    }

    grille.innerHTML += `
      <div class="carte-jour">
        <div class="carte-jour-titre">${joursSemaine[i]} ${curDate.getDate()}</div>
        ${cartesHtml}
      </div>
    `;
  }
}

function selectionnerSeanceDepuisPlanningSuivi(classeId, seanceId) {
  seanceSelectionneeSuiviId = Number(seanceId);
  const selClasse = document.getElementById('filtreSuiviClasseSelect');
  if (selClasse && classeId) {
    selClasse.value = String(classeId);
  }
  afficherPlanningSemaineSuivi();
  rendreSuiviClasses();

  setTimeout(() => {
    const carteCible = document.getElementById('carte-seance-suivi-' + seanceId);
    if (carteCible) {
      carteCible.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 80);
}
let donneesSuiviClassesCache = null;

async function chargerSuiviClasses() {
  const zone = document.getElementById('zoneContenuSuiviClasses');
  if (!zone || !currentProf) return;

  zone.innerHTML = `<div style="padding:24px; text-align:center; color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement de la progression des classes et des présences...</div>`;

  try {
    const res = await fetch(`/api/suivi_classes?prof_id=${currentProf.id}&t=${Date.now()}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Erreur lors du chargement du suivi.");
    }

    donneesSuiviClassesCache = data;

    // Alimenter le sélecteur de classes
    const selClasse = document.getElementById('filtreSuiviClasseSelect');
    if (selClasse) {
      const valActuelle = selClasse.value;
      selClasse.innerHTML = (data.classes || []).map(c => `<option value="${c.id}">${c.nom}</option>`).join('');
      if (valActuelle && (data.classes || []).some(c => String(c.id) === String(valActuelle))) {
        selClasse.value = valActuelle;
      }
    }

    afficherPlanningSemaineSuivi();
    rendreSuiviClasses();
  } catch (err) {
    zone.innerHTML = `<div style="background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; padding:14px; border-radius:8px;">⚠️ ${err.message}</div>`;
  }
}

function getNumeroSemaineIso(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return { cle: "0000-S00", label: "Date non précisée" };
  const dateUtc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = dateUtc.getUTCDay() || 7;
  dateUtc.setUTCDate(dateUtc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dateUtc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((dateUtc - yearStart) / 86400000) + 1) / 7);

  // Calcul du lundi de cette semaine pour affichage lisible
  const lundi = new Date(d);
  const diffLundi = (d.getDay() === 0 ? -6 : 1) - d.getDay();
  lundi.setDate(d.getDate() + diffLundi);
  const vendredi = new Date(lundi);
  vendredi.setDate(lundi.getDate() + 4);

  const fmt = (dt) => dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return {
    cle: `${dateUtc.getUTCFullYear()}-S${String(weekNo).padStart(2, '0')}`,
    label: `Semaine ${weekNo} (du ${fmt(lundi)} au ${fmt(vendredi)} ${vendredi.getFullYear()})`
  };
}

function formaterDateFrLongue(dateStr) {
  if (!dateStr) return "Date non renseignée";
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const txt = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function rendreSuiviClasses() {
  const zone = document.getElementById('zoneContenuSuiviClasses');
  const selClasse = document.getElementById('filtreSuiviClasseSelect');
  const selGranularite = document.getElementById('filtreSuiviGranularite');
  if (!zone || !donneesSuiviClassesCache) return;

  const classes = donneesSuiviClassesCache.classes || [];
  if (classes.length === 0) {
    zone.innerHTML = `<p style="color:#64748b; font-style:italic; padding:12px;">Aucune classe configurée pour le moment.</p>`;
    return;
  }

  const classeId = selClasse && selClasse.value ? Number(selClasse.value) : Number(classes[0].id);
  const granularite = selGranularite ? selGranularite.value : "seance";
  const classeObj = classes.find(c => Number(c.id) === classeId) || classes[0];

  const elevesClasse = (donneesSuiviClassesCache.eleves || []).filter(e => Number(e.classe_id) === classeId);
  const effectifTotal = elevesClasse.length;
  const nbPap = elevesClasse.filter(e => Number(e.est_pap) === 1).length;

  const seancesClasse = (donneesSuiviClassesCache.seances || []).filter(s => Number(s.classe_id) === classeId);
  const absencesAll = donneesSuiviClassesCache.absences || [];
  const copiesAll = donneesSuiviClassesCache.copies || [];

  if (seancesClasse.length === 0) {
    zone.innerHTML = `
      <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px; padding:24px; text-align:center; color:#64748b;">
        Aucune séance enregistrée pour la classe <strong>${classeObj.nom}</strong> (${effectifTotal} élève${effectifTotal > 1 ? 's' : ''}).
      </div>
    `;
    return;
  }

  // Enrichissement de chaque séance avec notes, présents et absents
  const seancesEnrichies = seancesClasse.map(s => {
    const dateRef = (s.date_seance && s.date_seance.trim()) ? s.date_seance.trim() : String(s.date_creation || "").slice(0, 10);
    const semaineInfo = getNumeroSemaineIso(dateRef);

    // Copies uniques rattachées à la séance
    const copiesSeanceRaw = copiesAll.filter(c => Number(c.seance_id) === Number(s.id) || (c.session_code && c.session_code === s.code_session));
    const copiesParId = new Map();
    copiesSeanceRaw.forEach(c => copiesParId.set(c.id, c));
    const copiesSeance = Array.from(copiesParId.values());

    // Absents explicitement cochés dans absences_seances
    const idsAbsentsCoches = new Set(
      absencesAll.filter(a => Number(a.seance_id) === Number(s.id)).map(a => Number(a.eleve_id))
    );

    const absentsListe = [];
    const nonRendusZeroAuto = [];
    const notesValides = [];

    elevesClasse.forEach(el => {
      const codeUpper = String(el.code_eleve || "").toUpperCase();
      const copieEl = copiesSeance.find(c =>
        (codeUpper && String(c.prenom || "").toUpperCase().includes(codeUpper)) ||
        (el.nom && String(c.nom || "").trim().toUpperCase() === String(el.nom).trim().toUpperCase() && String(c.prenom || "").trim().toUpperCase().startsWith(String(el.prenom || "").trim().toUpperCase())) ||
        (String(c.nom || "").trim().toUpperCase() === String(el.prenom || "").trim().toUpperCase())
      );

      const estCocheAbsent = idsAbsentsCoches.has(Number(el.id));
      const estZeroAuto = copieEl && String(copieEl.prenom || "").includes("(Non rendu - 0 auto)");

      if (estCocheAbsent || (!copieEl && Number(s.actif) === 0)) {
        absentsListe.push({
          nom: el.nom || "",
          prenom: el.prenom || "",
          est_pap: Number(el.est_pap) === 1,
          source: estCocheAbsent ? "appel" : "cloture"
        });
      }

      if (estZeroAuto) {
        nonRendusZeroAuto.push(`${el.nom ? el.nom + ' ' : ''}${el.prenom}`);
      }

      if (copieEl) {
        const estIncomplet = (
          copieEl.note_proportionnelle !== null &&
          copieEl.note_proportionnelle !== undefined &&
          copieEl.questions_traitees !== null &&
          copieEl.questions_totales !== null &&
          Number(copieEl.questions_traitees) < Number(copieEl.questions_totales)
        );
        const noteRetenue = estIncomplet ? Number(copieEl.note_proportionnelle) : Number(copieEl.note || 0);
        notesValides.push(noteRetenue);
      }
    });

    const moyenne = notesValides.length > 0
      ? Number((notesValides.reduce((acc, v) => acc + v, 0) / notesValides.length).toFixed(2))
      : null;

    const nbPresents = Math.max(0, effectifTotal - absentsListe.length);
    const tauxPresence = effectifTotal > 0 ? Math.round((nbPresents / effectifTotal) * 100) : 100;

    return {
      ...s,
      dateRef,
      semaineInfo,
      moyenne,
      nbCopies: notesValides.length,
      nbPresents,
      tauxPresence,
      absentsListe,
      nonRendusZeroAuto
    };
  });

  // Calcul des indicateurs globaux de la classe
  const seancesAvecNotes = seancesEnrichies.filter(s => s.moyenne !== null);
  const moyenneGlobale = seancesAvecNotes.length > 0
    ? (seancesAvecNotes.reduce((acc, s) => acc + s.moyenne, 0) / seancesAvecNotes.length).toFixed(2)
    : "—";

  let deltaProgressionHtml = `<span style="color:#64748b;">1ère évaluation</span>`;
  if (seancesAvecNotes.length >= 2) {
    const prem = seancesAvecNotes[0].moyenne;
    const dern = seancesAvecNotes[seancesAvecNotes.length - 1].moyenne;
    const diff = (dern - prem).toFixed(2);
    if (Number(diff) > 0) {
      deltaProgressionHtml = `<span style="color:#16a34a; font-weight:700;">↗ +${diff} pt vs début</span>`;
    } else if (Number(diff) < 0) {
      deltaProgressionHtml = `<span style="color:#dc2626; font-weight:700;">↘ ${diff} pt vs début</span>`;
    } else {
      deltaProgressionHtml = `<span style="color:#0284c7; font-weight:700;">→ Stable (${dern}/20)</span>`;
    }
  }

  const tauxPresenceMoyen = Math.round(
    seancesEnrichies.reduce((acc, s) => acc + s.tauxPresence, 0) / seancesEnrichies.length
  );

  // Préparation des points du graphique (par séance ou agrégés par semaine)
  let pointsGraph = [];
  if (granularite === "semaine") {
    const parSemaine = new Map();
    seancesEnrichies.forEach(s => {
      if (!parSemaine.has(s.semaineInfo.cle)) {
        parSemaine.set(s.semaineInfo.cle, { label: s.semaineInfo.cle.split('-')[1], fullLabel: s.semaineInfo.label, notes: [], presences: [] });
      }
      const grp = parSemaine.get(s.semaineInfo.cle);
      if (s.moyenne !== null) grp.notes.push(s.moyenne);
      grp.presences.push(s.tauxPresence);
    });
    pointsGraph = Array.from(parSemaine.values()).map(g => ({
      label: g.label,
      subLabel: g.fullLabel,
      valeur: g.notes.length > 0 ? Number((g.notes.reduce((a, b) => a + b, 0) / g.notes.length).toFixed(1)) : 0,
      hasNote: g.notes.length > 0,
      presence: Math.round(g.presences.reduce((a, b) => a + b, 0) / g.presences.length)
    }));
  } else {
    pointsGraph = seancesEnrichies.map(s => {
      const dtCourt = s.dateRef ? s.dateRef.split('-').reverse().slice(0, 2).join('/') : s.code_session;
      return {
        label: dtCourt,
        subLabel: `${s.qcm_titre} (${s.code_session})`,
        valeur: s.moyenne !== null ? Number(s.moyenne.toFixed(1)) : 0,
        hasNote: s.moyenne !== null,
        presence: s.tauxPresence
      };
    });
  }

  // Génération du graphique SVG chronologique
  const svgW = Math.max(540, pointsGraph.length * 85);
  const svgH = 210;
  const padL = 38, padR = 24, padT = 24, padB = 42;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  const y10 = padT + plotH * (1 - 10 / 20);

  let coords = [];
  const barresEtLabels = pointsGraph.map((pt, i) => {
    const step = pointsGraph.length === 1 ? plotW / 2 : (plotW / (pointsGraph.length - 1));
    const x = pointsGraph.length === 1 ? (padL + plotW / 2) : (padL + i * step);
    const y = padT + plotH * (1 - Math.min(20, Math.max(0, pt.valeur)) / 20);
    if (pt.hasNote) coords.push(`${x},${y}`);
    const colPt = pt.valeur >= 12 ? "#16a34a" : (pt.valeur >= 10 ? "#0284c7" : "#ea580c");

    return `
      <g>
        <line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="#f1f5f9" stroke-width="1"/>
        <text x="${x}" y="${svgH - 22}" text-anchor="middle" font-size="11" font-weight="700" fill="#334155">${pt.label}</text>
        <text x="${x}" y="${svgH - 8}" text-anchor="middle" font-size="9.5" fill="#64748b">${pt.presence}% prés.</text>
        ${pt.hasNote ? `
          <circle cx="${x}" cy="${y}" r="5.5" fill="${colPt}" stroke="#ffffff" stroke-width="2"/>
          <rect x="${x - 18}" y="${y - 21}" width="36" height="15" rx="4" fill="#ffffff" stroke="${colPt}" stroke-width="1"/>
          <text x="${x}" y="${y - 10.5}" text-anchor="middle" font-size="10" font-weight="800" fill="${colPt}">${pt.valeur}</text>
        ` : `
          <text x="${x}" y="${padT + plotH / 2}" text-anchor="middle" font-size="9.5" fill="#94a3b8">En cours</text>
        `}
      </g>
    `;
  }).join('');

  const polylineHtml = coords.length >= 2
    ? `<polyline fill="none" stroke="#0b5cab" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" points="${coords.join(' ')}"/>`
    : '';

  const graphSvgHtml = `
    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:18px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
        <strong style="font-size:0.92rem; color:#0f172a;"><i class="fa-solid fa-chart-line" style="color:var(--pronote-blue);"></i> Courbe de progression (${granularite === 'semaine' ? 'moyenne par semaine' : 'moyenne par séance'})</strong>
        <span style="font-size:0.78rem; color:#64748b;">Repère horizontal : <strong>10 / 20</strong></span>
      </div>
      <div style="overflow-x:auto;">
        <svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%; min-width:520px; height:210px; display:block;">
          <line x1="${padL}" y1="${padT}" x2="${svgW - padR}" y2="${padT}" stroke="#e2e8f0" stroke-dasharray="3 3"/>
          <text x="${padL - 6}" y="${padT + 4}" text-anchor="end" font-size="10" fill="#64748b">20</text>
          <line x1="${padL}" y1="${y10}" x2="${svgW - padR}" y2="${y10}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="5 4"/>
          <text x="${padL - 6}" y="${y10 + 4}" text-anchor="end" font-size="10" font-weight="700" fill="#475569">10</text>
          <line x1="${padL}" y1="${padT + plotH}" x2="${svgW - padR}" y2="${padT + plotH}" stroke="#cbd5e1" stroke-width="1.2"/>
          <text x="${padL - 6}" y="${padT + plotH + 4}" text-anchor="end" font-size="10" fill="#64748b">0</text>
          ${polylineHtml}
          ${barresEtLabels}
        </svg>
      </div>
    </div>
  `;

  // Regroupement chronologique (du plus récent au plus ancien) par semaine
  const seancesDesc = [...seancesEnrichies].reverse();
  const groupesSemaines = new Map();
  seancesDesc.forEach(s => {
    if (!groupesSemaines.has(s.semaineInfo.cle)) {
      groupesSemaines.set(s.semaineInfo.cle, { label: s.semaineInfo.label, items: [] });
    }
    groupesSemaines.get(s.semaineInfo.cle).items.push(s);
  });

  let timelineHtml = "";
  groupesSemaines.forEach(grp => {
    const cartesSeances = grp.items.map(s => {
      const badgeEtat = Number(s.actif) === 1
        ? `<span class="badge" style="background:#dcfce7; color:#15803d;">🟢 En cours</span>`
        : `<span class="badge" style="background:#f1f5f9; color:#475569;">Clôturée</span>`;

      const noteBloc = s.moyenne !== null
        ? `<div style="font-size:1.15rem; font-weight:800; color:var(--pronote-blue);">${s.moyenne} <span style="font-size:0.8rem; font-weight:600; color:#64748b;">/ 20</span></div>`
        : `<div style="font-size:0.85rem; color:#94a3b8; font-style:italic;">Aucune copie</div>`;

      const absentsHtml = s.absentsListe.length === 0
        ? `<span class="badge" style="background:#dcfce7; color:#15803d; font-weight:700;">✓ Aucun absent (${s.nbPresents}/${effectifTotal} présents)</span>`
        : `
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span style="font-size:0.8rem; font-weight:700; color:#b91c1c;">
              🚫 ${s.absentsListe.length} absent${s.absentsListe.length > 1 ? 's' : ''} (${s.nbPresents}/${effectifTotal} présents) :
            </span>
            ${s.absentsListe.map(a => `
              <span class="badge" style="background:#fee2e2; color:#991b1b; border:1px solid #fecaca; font-weight:700;">
                ${a.nom ? a.nom.toUpperCase() + ' ' : ''}${a.prenom}${a.est_pap ? ' (PAP)' : ''}
              </span>
            `).join('')}
          </div>
        `;

      const nonRendusHtml = s.nonRendusZeroAuto.length > 0
        ? `<div style="margin-top:6px; font-size:0.78rem; color:#92400e; background:#fffbeb; border:1px solid #fde68a; padding:4px 8px; border-radius:6px; display:inline-block;">
             ⚠️ Présent(s) sans copie rendue (0 auto) : <strong>${s.nonRendusZeroAuto.join(', ')}</strong>
           </div>`
        : '';

      return `
        <div id="carte-seance-suivi-${s.id}" style="background:${Number(seanceSelectionneeSuiviId) === Number(s.id) ? '#f0f9ff' : '#ffffff'}; border:1px solid ${Number(seanceSelectionneeSuiviId) === Number(s.id) ? '#0284c7' : '#e2e8f0'}; border-left:4px solid ${Number(s.actif) === 1 ? '#16a34a' : '#0b5cab'}; box-shadow:${Number(seanceSelectionneeSuiviId) === Number(s.id) ? '0 0 0 2px rgba(2,132,199,0.2)' : 'none'}; border-radius:8px; padding:12px 14px; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
            <div>
              <div style="font-size:0.8rem; font-weight:700; color:#475569; margin-bottom:4px;">
                <i class="fa-regular fa-calendar" style="color:var(--pronote-blue);"></i> ${formaterDateFrLongue(s.dateRef)}${s.horaire_seance ? ' • ' + s.horaire_seance : ''}
              </div>
              <div style="font-size:0.98rem; font-weight:800; color:#0f172a; margin-bottom:6px;">
                ${s.qcm_titre} <span class="badge badge-session">${s.code_session}</span>
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                ${s.matiere_nom ? `<span class="badge" style="background:#e0f2fe; color:#0369a1;">${s.matiere_nom}</span>` : ''}
                ${s.competence_code ? `<span class="badge" style="background:#fef9c3; color:#854d0e; font-weight:700;">🎯 ${s.competence_code}</span>` : ''}
                ${badgeEtat}
              </div>
            </div>
            <div style="text-align:right; min-width:110px;">
              <div style="font-size:0.74rem; color:#64748b; text-transform:uppercase; font-weight:700;">Moyenne</div>
              ${noteBloc}
              <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">${s.nbCopies} copie${s.nbCopies > 1 ? 's' : ''}</div>
            </div>
          </div>

          <div style="margin-top:10px; padding-top:8px; border-top:1px dashed #e2e8f0;">
            ${absentsHtml}
            ${nonRendusHtml}
          </div>
        </div>
      `;
    }).join('');

    timelineHtml += `
      <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px 14px; margin-bottom:14px;">
        <div style="font-weight:800; font-size:0.88rem; color:var(--pronote-dark); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          <i class="fa-solid fa-calendar-week" style="color:var(--pronote-blue);"></i> ${grp.label}
        </div>
        ${cartesSeances}
      </div>
    `;
  });

  // KPIs en haut de la rubrique
  const kpisHtml = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:16px;">
      <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px 14px;">
        <div style="font-size:0.76rem; color:#64748b; font-weight:700; text-transform:uppercase;">Classe & Effectif</div>
        <div style="font-size:1.25rem; font-weight:800; color:#0f172a; margin-top:2px;">${classeObj.nom}</div>
        <div style="font-size:0.8rem; color:#475569; margin-top:2px;">${effectifTotal} élève${effectifTotal > 1 ? 's' : ''} (${nbPap} PAP)</div>
      </div>

      <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px 14px;">
        <div style="font-size:0.76rem; color:#64748b; font-weight:700; text-transform:uppercase;">Séances réalisées</div>
        <div style="font-size:1.25rem; font-weight:800; color:var(--pronote-blue); margin-top:2px;">${seancesEnrichies.length}</div>
        <div style="font-size:0.8rem; color:#475569; margin-top:2px;">${groupesSemaines.size} semaine${groupesSemaines.size > 1 ? 's' : ''} de cours</div>
      </div>

      <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px 14px;">
        <div style="font-size:0.76rem; color:#64748b; font-weight:700; text-transform:uppercase;">Moyenne & Tendance</div>
        <div style="font-size:1.25rem; font-weight:800; color:#0f172a; margin-top:2px;">${moyenneGlobale} <span style="font-size:0.85rem; color:#64748b;">/ 20</span></div>
        <div style="font-size:0.8rem; margin-top:2px;">${deltaProgressionHtml}</div>
      </div>

      <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px 14px;">
        <div style="font-size:0.76rem; color:#64748b; font-weight:700; text-transform:uppercase;">Assiduité moyenne</div>
        <div style="font-size:1.25rem; font-weight:800; color:${tauxPresenceMoyen >= 85 ? '#16a34a' : '#d97706'}; margin-top:2px;">${tauxPresenceMoyen} %</div>
        <div style="font-size:0.8rem; color:#475569; margin-top:2px;">Taux de présence en séance</div>
      </div>
    </div>
  `;

  zone.innerHTML = kpisHtml + graphSvgHtml + timelineHtml;
}