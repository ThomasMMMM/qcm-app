let donneesAnalyseCache = {
  classes: [],
  matieres: [],
  copies: []
};

async function chargerDonneesAnalyse() {
  if (typeof currentProf === "undefined" || !currentProf || !currentProf.id) return;

  const zoneContenu = document.getElementById("zoneContenuAnalyseMacro");
  if (zoneContenu) {
    zoneContenu.innerHTML = `<p style="color:#64748b; font-size:0.9rem;"><i class="fa-solid fa-spinner fa-spin"></i> Calcul des statistiques en cours...</p>`;
  }

  try {
    const res = await fetch(`/api/analyse?prof_id=${encodeURIComponent(currentProf.id)}`, { cache: "no-store" });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "Erreur lors du chargement des analyses");
    }

    donneesAnalyseCache = {
      classes: data.classes || [],
      matieres: data.matieres || [],
      copies: data.copies || []
    };

    alimenterFiltresAnalyse();
    actualiserVueAnalyseMacro();
  } catch (err) {
    if (zoneContenu) {
      zoneContenu.innerHTML = `<div style="background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; padding:12px; border-radius:8px; font-size:0.88rem;">
        <i class="fa-solid fa-triangle-exclamation"></i> Impossible de charger l'analyse : ${err.message}
      </div>`;
    }
  }
}

function alimenterFiltresAnalyse() {
  const selClasse = document.getElementById("filtreAnalyseClasse");
  const selMatiere = document.getElementById("filtreAnalyseMatiere");

  if (selClasse) {
    const valC = selClasse.value;
    selClasse.innerHTML = `<option value="">Toutes les classes (${donneesAnalyseCache.classes.length})</option>` +
      donneesAnalyseCache.classes.map(c => `<option value="${c.id}">${c.nom}</option>`).join("");
    if (valC) selClasse.value = valC;
  }

  if (selMatiere) {
    const valM = selMatiere.value;
    selMatiere.innerHTML = `<option value="">Toutes les matières (${donneesAnalyseCache.matieres.length})</option>` +
      donneesAnalyseCache.matieres.map(m => `<option value="${m.id}">${m.nom}</option>`).join("");
    if (valM) selMatiere.value = valM;
  }
}

function calculerStatsGroupe(listeCopies) {
  const n = listeCopies.length;
  if (n === 0) {
    return {
      effectif: 0,
      moyenneRetenue: 0,
      moyenneBrute: 0,
      mediane: 0,
      min: 0,
      max: 0,
      nbReussite: 0,
      tauxReussite: 0,
      tranches: [0, 0, 0, 0]
    };
  }

  const notesRetenues = listeCopies.map(c => Number(c.note_retenue || 0)).sort((a, b) => a - b);
  const notesBrutes = listeCopies.map(c => Number(c.note_brute || 0));

  const sommeRetenue = notesRetenues.reduce((acc, v) => acc + v, 0);
  const sommeBrute = notesBrutes.reduce((acc, v) => acc + v, 0);

  const milieu = Math.floor(n / 2);
  const mediane = (n % 2 === 0)
    ? (notesRetenues[milieu - 1] + notesRetenues[milieu]) / 2
    : notesRetenues[milieu];

  const nbReussite = notesRetenues.filter(v => v >= 10).length;
  const tranches = [0, 0, 0, 0]; // [0-5[, [5-10[, [10-15[, [15-20]
  for (const note of notesRetenues) {
    if (note < 5) tranches[0]++;
    else if (note < 10) tranches[1]++;
    else if (note < 15) tranches[2]++;
    else tranches[3]++;
  }

  return {
    effectif: n,
    moyenneRetenue: sommeRetenue / n,
    moyenneBrute: sommeBrute / n,
    mediane,
    min: notesRetenues[0],
    max: notesRetenues[n - 1],
    nbReussite,
    tauxReussite: (nbReussite / n) * 100,
    tranches
  };
}

function actualiserVueAnalyseMacro() {
  const zoneContenu = document.getElementById("zoneContenuAnalyseMacro");
  if (!zoneContenu) return;

  const classeIdFiltre = document.getElementById("filtreAnalyseClasse")?.value || "";
  const matiereIdFiltre = document.getElementById("filtreAnalyseMatiere")?.value || "";

  const copiesFiltrees = donneesAnalyseCache.copies.filter(c => {
    if (classeIdFiltre && String(c.classe_id) !== String(classeIdFiltre)) return false;
    if (matiereIdFiltre && String(c.matiere_id) !== String(matiereIdFiltre)) return false;
    return true;
  });

  if (copiesFiltrees.length === 0) {
    zoneContenu.innerHTML = `
      <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:24px; text-align:center; color:#64748b;">
        <i class="fa-solid fa-chart-column" style="font-size:1.8rem; color:#94a3b8; margin-bottom:8px;"></i>
        <p style="margin:0; font-weight:600;">Aucune copie disponible pour cette sélection.</p>
        <p style="margin:4px 0 0 0; font-size:0.84rem;">Modifiez les filtres de classe ou de matière pour afficher les statistiques.</p>
      </div>
    `;
    return;
  }

  const stats = calculerStatsGroupe(copiesFiltrees);
  const maxTranche = Math.max(...stats.tranches, 1);

  const configTranches = [
    { label: "0 – 5 / 20", sousLabel: "Très insuffisant", count: stats.tranches[0], color: "#dc2626", bg: "#fef2f2" },
    { label: "5 – 10 / 20", sousLabel: "Fragile", count: stats.tranches[1], color: "#d97706", bg: "#fffbeb" },
    { label: "10 – 15 / 20", sousLabel: "Satisfaisant", count: stats.tranches[2], color: "#0284c7", bg: "#f0f9ff" },
    { label: "15 – 20 / 20", sousLabel: "Maîtrise solide", count: stats.tranches[3], color: "#16a34a", bg: "#f0fdf4" }
  ];

  // Synthèse croisée par Classe × Matière
  const mapGroupes = new Map();
  for (const c of copiesFiltrees) {
    const cle = `${c.classe_nom}|||${c.matiere_nom}`;
    if (!mapGroupes.has(cle)) {
      mapGroupes.set(cle, { classe_nom: c.classe_nom, matiere_nom: c.matiere_nom, copies: [] });
    }
    mapGroupes.get(cle).copies.push(c);
  }

  const lignesSynthese = Array.from(mapGroupes.values())
    .map(g => ({ ...g, stats: calculerStatsGroupe(g.copies) }))
    .sort((a, b) => a.classe_nom.localeCompare(b.classe_nom) || a.matiere_nom.localeCompare(b.matiere_nom));

  zoneContenu.innerHTML = `
    <!-- 1. CARTES KPI SYNTHÉTIQUES -->
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(165px, 1fr)); gap:12px; margin-bottom:20px;">
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px;">
        <div style="font-size:0.76rem; color:#64748b; font-weight:700; text-transform:uppercase;">Copies analysées</div>
        <div style="font-size:1.55rem; font-weight:800; color:#1e293b; margin-top:4px;">${stats.effectif}</div>
        <div style="font-size:0.76rem; color:#64748b;">Évaluations soumises</div>
      </div>

      <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px 14px;">
        <div style="font-size:0.76rem; color:#1d4ed8; font-weight:700; text-transform:uppercase;">Moyenne générale</div>
        <div style="font-size:1.55rem; font-weight:800; color:var(--pronote-blue); margin-top:4px;">${stats.moyenneRetenue.toFixed(2)} <span style="font-size:0.9rem; font-weight:600;">/20</span></div>
        <div style="font-size:0.75rem; color:#3b82f6;">Brute : ${stats.moyenneBrute.toFixed(2)} /20</div>
      </div>

      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px 14px;">
        <div style="font-size:0.76rem; color:#15803d; font-weight:700; text-transform:uppercase;">Taux de réussite</div>
        <div style="font-size:1.55rem; font-weight:800; color:#16a34a; margin-top:4px;">${stats.tauxReussite.toFixed(0)} %</div>
        <div style="font-size:0.76rem; color:#15803d;">${stats.nbReussite} / ${stats.effectif} copies ≥ 10/20</div>
      </div>

      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px;">
        <div style="font-size:0.76rem; color:#64748b; font-weight:700; text-transform:uppercase;">Médiane</div>
        <div style="font-size:1.55rem; font-weight:800; color:#334155; margin-top:4px;">${stats.mediane.toFixed(2)} <span style="font-size:0.9rem; font-weight:600;">/20</span></div>
        <div style="font-size:0.76rem; color:#64748b;">50 % au-dessus / dessous</div>
      </div>

      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px;">
        <div style="font-size:0.76rem; color:#64748b; font-weight:700; text-transform:uppercase;">Étendue (Min – Max)</div>
        <div style="font-size:1.35rem; font-weight:800; color:#334155; margin-top:6px;">${stats.min.toFixed(1)} – ${stats.max.toFixed(1)}</div>
        <div style="font-size:0.76rem; color:#64748b;">Écart : ${(stats.max - stats.min).toFixed(1)} pts</div>
      </div>
    </div>

    <!-- 2. HISTOGRAMME DE RÉPARTITION DES NOTES -->
    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:16px; margin-bottom:20px;">
      <h4 style="margin:0 0 4px 0; color:#1e293b; font-size:0.98rem;">
        <i class="fa-solid fa-chart-bar" style="color:var(--pronote-blue);"></i> Répartition des notes par tranches
      </h4>
      <p style="margin:0 0 14px 0; font-size:0.82rem; color:#64748b;">
        Distribution basée sur la note retenue (incluant la note proportionnelle pour les devoirs incomplets).
      </p>

      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; align-items:end; height:170px; padding:12px 8px 0 8px; border-bottom:2px solid #cbd5e1;">
        ${configTranches.map(t => {
          const pct = (t.count / stats.effectif) * 100;
          const hauteurPx = t.count === 0 ? 6 : Math.max(22, Math.round((t.count / maxTranche) * 130));
          return `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%;">
              <div style="font-size:0.82rem; font-weight:800; color:${t.color}; margin-bottom:4px;">
                ${t.count} <span style="font-weight:600; font-size:0.74rem; color:#64748b;">(${pct.toFixed(0)}%)</span>
              </div>
              <div style="width:100%; max-width:74px; height:${hauteurPx}px; background:${t.color}; border-radius:6px 6px 0 0; transition:height 0.25s ease;"></div>
            </div>
          `;
        }).join("")}
      </div>

      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-top:8px; text-align:center;">
        ${configTranches.map(t => `
          <div>
            <div style="font-weight:700; font-size:0.82rem; color:#1e293b;">${t.label}</div>
            <div style="font-size:0.73rem; color:#64748b;">${t.sousLabel}</div>
          </div>
        `).join("")}
      </div>
    </div>

    <!-- 3. TABLEAU COMPARATIF PAR CLASSE ET PAR MATIÈRE -->
    <div>
      <h4 style="margin:0 0 10px 0; color:#1e293b; font-size:0.98rem;">
        <i class="fa-solid fa-table-list" style="color:var(--pronote-blue);"></i> Synthèse comparative par Classe & Matière
      </h4>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Classe</th>
              <th>Matière</th>
              <th style="text-align:center;">Copies</th>
              <th style="text-align:center;">Moyenne /20</th>
              <th style="text-align:center;">Médiane /20</th>
              <th style="text-align:center;">Taux réussite (≥10)</th>
              <th style="text-align:center;">Min – Max</th>
            </tr>
          </thead>
          <tbody>
            ${lignesSynthese.map(l => {
              const s = l.stats;
              const badgeReussiteBg = s.tauxReussite >= 70 ? "#dcfce7" : (s.tauxReussite >= 50 ? "#fef3c7" : "#fee2e2");
              const badgeReussiteCol = s.tauxReussite >= 70 ? "#15803d" : (s.tauxReussite >= 50 ? "#b45309" : "#b91c1c");
              return `
                <tr>
                  <td><strong>${l.classe_nom}</strong></td>
                  <td><span class="badge" style="background:#e0f2fe; color:#0369a1;">${l.matiere_nom}</span></td>
                  <td style="text-align:center;">${s.effectif}</td>
                  <td style="text-align:center;"><strong style="color:var(--pronote-blue); font-size:0.98rem;">${s.moyenneRetenue.toFixed(2)}</strong></td>
                  <td style="text-align:center;">${s.mediane.toFixed(2)}</td>
                  <td style="text-align:center;">
                    <span class="badge" style="background:${badgeReussiteBg}; color:${badgeReussiteCol}; font-weight:700;">
                      ${s.tauxReussite.toFixed(0)} % (${s.nbReussite}/${s.effectif})
                    </span>
                  </td>
                  <td style="text-align:center; color:#475569; font-size:0.85rem;">${s.min.toFixed(1)} – ${s.max.toFixed(1)}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}