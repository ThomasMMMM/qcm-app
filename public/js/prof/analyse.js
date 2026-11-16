let donneesAnalyseCache = {
  classes: [],
  matieres: [],
  classes_matieres: [],
  eleves: [],
  copies: []
};

async function chargerDonneesAnalyse() {
  if (typeof currentProf === "undefined" || !currentProf || !currentProf.id) return;

  const zoneContenu = document.getElementById("zoneContenuAnalyseMacro");
  if (zoneContenu) {
    zoneContenu.innerHTML = `<p style="color:#64748b; font-size:0.9rem;"><i class="fa-solid fa-spinner fa-spin"></i> Calcul des statistiques et de la matrice de compétences...</p>`;
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
      classes_matieres: data.classes_matieres || [],
      eleves: data.eleves || [],
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
  const tranches = [0, 0, 0, 0];
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

function copieAppartientAEleve(copie, eleve) {
  if (Number(copie.classe_id) !== Number(eleve.classe_id)) return false;
  const code = String(eleve.code_eleve || "").trim().toUpperCase();
  const prenomCopie = String(copie.eleve_prenom || "").trim().toUpperCase();
  const nomCopie = String(copie.eleve_nom || "").trim().toLowerCase();
  const prenomEleve = String(eleve.prenom || "").trim().toLowerCase();
  const nomEleve = String(eleve.nom || "").trim().toLowerCase();

  if (code && prenomCopie.includes(code)) return true;
  if (nomEleve && prenomEleve && nomCopie === nomEleve && prenomCopie.toLowerCase().includes(prenomEleve)) return true;
  if (!nomEleve && prenomEleve && nomCopie === prenomEleve) return true;
  return false;
}

function construireSectionCompetences(copiesFiltrees, classeIdFiltre, matiereIdFiltre) {
  // Déterminer les matières à analyser selon les filtres
  let matieresCibles = donneesAnalyseCache.matieres;
  if (matiereIdFiltre) {
    matieresCibles = matieresCibles.filter(m => String(m.id) === String(matiereIdFiltre));
  } else if (classeIdFiltre) {
    const idsAssocies = donneesAnalyseCache.classes_matieres
      .filter(cm => String(cm.classe_id) === String(classeIdFiltre))
      .map(cm => Number(cm.matiere_id));
    if (idsAssocies.length > 0) {
      matieresCibles = matieresCibles.filter(m => idsAssocies.includes(Number(m.id)));
    }
  }

  if (matieresCibles.length === 0) {
    return `
      <div style="margin-top:22px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:16px; color:#64748b; font-size:0.88rem;">
        <i class="fa-solid fa-bullseye"></i> Aucune matière à compétences n'est associée à cette sélection.
      </div>
    `;
  }

  return matieresCibles.map(mat => {
    const copiesMatiere = copiesFiltrees.filter(c => Number(c.matiere_id) === Number(mat.id));
    const comps = mat.competences || [];

    // Calcul des stats globales par compétence pour cette matière
    const statsComps = comps.map(comp => {
      const code = String(comp.code || "").toUpperCase();
      const copiesComp = copiesMatiere.filter(c => String(c.competence_code || "").toUpperCase() === code);
      const nb = copiesComp.length;
      const moy = nb > 0 ? copiesComp.reduce((s, c) => s + Number(c.note_retenue || 0), 0) / nb : null;
      const nbReussis = copiesComp.filter(c => Number(c.note_retenue || 0) >= 10).length;
      const nbDifficulte = nb - nbReussis;
      const tauxValidation = nb > 0 ? (nbReussis / nb) * 100 : null;

      return {
        code,
        libelle: comp.libelle,
        nb,
        moy,
        nbReussis,
        nbDifficulte,
        tauxValidation
      };
    });

    // Détection de la compétence nécessitant le plus de remédiation
    const compsEvaluees = statsComps.filter(s => s.nb > 0);
    let alerteRemediationHtml = "";
    if (compsEvaluees.length > 0) {
      const plusFragile = [...compsEvaluees].sort((a, b) => a.tauxValidation - b.tauxValidation || a.moy - b.moy)[0];
      if (plusFragile.tauxValidation < 75) {
        alerteRemediationHtml = `
          <div style="background:#fffbeb; border:1px solid #fde68a; border-left:4px solid #d97706; border-radius:8px; padding:10px 14px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
            <div style="font-size:0.86rem; color:#92400e;">
              <strong><i class="fa-solid fa-lightbulb"></i> Remédiation prioritaire identifiée :</strong>
              Compétence <strong>${plusFragile.code} — ${plusFragile.libelle}</strong>
              (${plusFragile.nbDifficulte} copie${plusFragile.nbDifficulte > 1 ? "s" : ""} &lt; 10/20, taux de validation : <strong>${plusFragile.tauxValidation.toFixed(0)} %</strong>).
            </div>
          </div>
        `;
      } else {
        alerteRemediationHtml = `
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-left:4px solid #16a34a; border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:0.86rem; color:#166534;">
            <strong><i class="fa-solid fa-circle-check"></i> Bonne maîtrise globale :</strong> Toutes les compétences évaluées en ${mat.nom} dépassent 75 % de validation.
          </div>
        `;
      }
    }

    // Matrice croisée Élèves × Compétences (affichée si une classe précise est filtrée, ou si <= 45 élèves)
    const elevesCibles = classeIdFiltre
      ? donneesAnalyseCache.eleves.filter(e => String(e.classe_id) === String(classeIdFiltre))
      : [];

    let matriceElevesHtml = "";
    if (classeIdFiltre && elevesCibles.length > 0) {
      const lignesEleves = elevesCibles.map(el => {
        const copiesEleve = copiesMatiere.filter(c => copieAppartientAEleve(c, el));
        let nbFragilesEleve = 0;

        const cellulesComps = comps.map(comp => {
          const code = String(comp.code || "").toUpperCase();
          const cComp = copiesEleve.filter(c => String(c.competence_code || "").toUpperCase() === code);
          if (cComp.length === 0) {
            return `<td style="text-align:center; color:#94a3b8; font-size:0.82rem;">—</td>`;
          }
          const moyEl = cComp.reduce((s, c) => s + Number(c.note_retenue || 0), 0) / cComp.length;
          let bg = "#fee2e2", col = "#b91c1c";
          if (moyEl >= 14) { bg = "#dcfce7"; col = "#15803d"; }
          else if (moyEl >= 10) { bg = "#e0f2fe"; col = "#0369a1"; }
          else { nbFragilesEleve++; }

          return `
            <td style="text-align:center;">
              <span class="badge" style="background:${bg}; color:${col}; font-weight:700; min-width:52px; display:inline-block;">
                ${moyEl.toFixed(1)}
              </span>
            </td>
          `;
        }).join("");

        const nomComplet = `${(el.nom || "").toUpperCase()} ${el.prenom || ""}`.trim();
        const badgePap = Number(el.est_pap) === 1
          ? `<span class="badge" style="background:#fdf4ff; color:#7e22ce; font-size:0.7rem; margin-left:4px;">PAP</span>`
          : "";
        const badgeBesoin = nbFragilesEleve >= 2
          ? `<span class="badge" style="background:#fef2f2; color:#dc2626; font-size:0.72rem;">⚠️ ${nbFragilesEleve} comp. fragiles</span>`
          : (nbFragilesEleve === 1
            ? `<span class="badge" style="background:#fffbeb; color:#b45309; font-size:0.72rem;">1 comp. à revoir</span>`
            : `<span style="color:#16a34a; font-size:0.78rem; font-weight:600;">✓ RAS</span>`);

        return `
          <tr>
            <td><strong>${nomComplet}</strong>${badgePap}</td>
            ${cellulesComps}
            <td style="text-align:center;">${badgeBesoin}</td>
          </tr>
        `;
      }).join("");

      matriceElevesHtml = `
        <div style="margin-top:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
            <strong style="font-size:0.9rem; color:#1e293b;">
              <i class="fa-solid fa-table-cells" style="color:var(--pronote-blue);"></i> Matrice individuelle Élèves × Compétences (${elevesCibles.length} élèves)
            </strong>
            <div style="display:flex; gap:8px; font-size:0.75rem;">
              <span class="badge" style="background:#dcfce7; color:#15803d;">≥ 14 : Solide</span>
              <span class="badge" style="background:#e0f2fe; color:#0369a1;">10–13.9 : Acquis</span>
              <span class="badge" style="background:#fee2e2; color:#b91c1c;">&lt; 10 : Remédiation</span>
            </div>
          </div>
          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>Élève</th>
                  ${comps.map(c => `<th style="text-align:center;" title="${c.libelle}">${c.code}</th>`).join("")}
                  <th style="text-align:center; width:145px;">Suivi / Besoin</th>
                </tr>
              </thead>
              <tbody>${lignesEleves}</tbody>
            </table>
          </div>
        </div>
      `;
    } else if (!classeIdFiltre) {
      matriceElevesHtml = `
        <div style="margin-top:12px; font-size:0.82rem; color:#64748b; background:#f8fafc; padding:8px 12px; border-radius:6px; border:1px solid #e2e8f0;">
          <i class="fa-solid fa-circle-info" style="color:var(--pronote-blue);"></i> Sélectionnez une <strong>classe</strong> dans le filtre en haut pour afficher la matrice nominative Élèves × Compétences et repérer les élèves ayant besoin d'une remédiation.
        </div>
      `;
    }

    return `
      <div style="margin-top:22px; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <h4 style="margin:0; color:var(--pronote-blue); font-size:1.02rem;">
            <i class="fa-solid fa-bullseye"></i> Maîtrise des Compétences — ${mat.nom}
          </h4>
          <span class="badge" style="background:#e0f2fe; color:#0369a1;">${copiesMatiere.length} copie(s) évaluée(s)</span>
        </div>

        ${alerteRemediationHtml}

        <!-- Cartes de synthèse par compétence -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
          ${statsComps.map(s => {
            if (s.nb === 0) {
              return `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; opacity:0.75;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span class="badge" style="background:#e2e8f0; color:#475569; font-weight:800;">${s.code}</span>
                    <span style="font-size:0.75rem; color:#94a3b8;">Non évaluée</span>
                  </div>
                  <div style="font-size:0.84rem; font-weight:600; color:#334155;">${s.libelle}</div>
                </div>
              `;
            }
            const barColor = s.tauxValidation >= 75 ? "#16a34a" : (s.tauxValidation >= 50 ? "#d97706" : "#dc2626");
            return `
              <div style="background:#f8fafc; border:1px solid #cbd5e1; border-left:4px solid ${barColor}; border-radius:8px; padding:10px 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span class="badge" style="background:#fef9c3; color:#854d0e; font-weight:800;">${s.code}</span>
                  <strong style="color:var(--pronote-blue); font-size:0.95rem;">Moy. ${s.moy.toFixed(1)}/20</strong>
                </div>
                <div style="font-size:0.84rem; font-weight:600; color:#1e293b; margin-bottom:8px;">${s.libelle}</div>
                <div style="background:#e2e8f0; height:7px; border-radius:999px; overflow:hidden; margin-bottom:5px;">
                  <div style="background:${barColor}; width:${s.tauxValidation.toFixed(0)}%; height:100%;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:#475569;">
                  <span>Validation : <strong>${s.tauxValidation.toFixed(0)} %</strong></span>
                  <span style="color:${s.nbDifficulte > 0 ? '#b91c1c' : '#15803d'}; font-weight:600;">
                    ${s.nbDifficulte} en difficulté
                  </span>
                </div>
              </div>
            `;
          }).join("")}
        </div>

        ${matriceElevesHtml}
      </div>
    `;
  }).join("");
}

function construireCourbeSvgEleve(copiesChrono) {
  if (!copiesChrono || copiesChrono.length === 0) {
    return `<p style="color:#64748b; font-size:0.86rem; font-style:italic;">Aucune copie enregistrée pour cet élève.</p>`;
  }

  const w = 680;
  const h = 210;
  const padL = 42;
  const padR = 24;
  const padT = 22;
  const padB = 46;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const n = copiesChrono.length;
  const getX = (idx) => n === 1 ? padL + plotW / 2 : padL + (idx / (n - 1)) * plotW;
  const getY = (note) => padT + plotH - (Math.max(0, Math.min(20, Number(note || 0))) / 20) * plotH;

  // Lignes horizontales de repère (0, 5, 10, 15, 20)
  const grilles = [0, 5, 10, 15, 20].map(val => {
    const y = getY(val);
    const estSeuil = val === 10;
    return `
      <line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}"
            stroke="${estSeuil ? '#f59e0b' : '#e2e8f0'}"
            stroke-width="${estSeuil ? '1.5' : '1'}"
            ${estSeuil ? 'stroke-dasharray="5,4"' : ''} />
      <text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="${estSeuil ? '#b45309' : '#64748b'}" font-weight="${estSeuil ? '700' : '400'}">${val}</text>
    `;
  }).join("");

  // Points et polyligne (note retenue)
  const pointsRetenue = copiesChrono.map((c, i) => `${getX(i)},${getY(c.note_retenue)}`).join(" ");
  const pointsBrute = copiesChrono.map((c, i) => `${getX(i)},${getY(c.note_brute)}`).join(" ");

  const cerclesHtml = copiesChrono.map((c, i) => {
    const cx = getX(i);
    const cy = getY(c.note_retenue);
    const col = c.note_retenue >= 14 ? "#16a34a" : (c.note_retenue >= 10 ? "#0284c7" : "#dc2626");
    const dateCourte = c.date_soumission
      ? new Date(c.date_soumission).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
      : `#${i + 1}`;
    const titreCourt = (c.qcm_titre || "").length > 18 ? (c.qcm_titre || "").slice(0, 18) + "…" : (c.qcm_titre || "");

    return `
      <g>
        <circle cx="${cx}" cy="${cy}" r="5.5" fill="${col}" stroke="#ffffff" stroke-width="2" />
        <text x="${cx}" y="${cy - 9}" text-anchor="middle" font-size="11" font-weight="700" fill="${col}">${Number(c.note_retenue).toFixed(1)}</text>
        <text x="${cx}" y="${h - 24}" text-anchor="middle" font-size="10" fill="#475569" font-weight="600">${dateCourte}</text>
        <text x="${cx}" y="${h - 10}" text-anchor="middle" font-size="9" fill="#64748b">${titreCourt}</text>
      </g>
    `;
  }).join("");

  return `
    <div style="overflow-x:auto;">
      <svg viewBox="0 0 ${w} ${h}" style="width:100%; max-width:740px; height:auto; display:block; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
        ${grilles}
        ${n > 1 ? `<polyline fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="3,3" points="${pointsBrute}" />` : ""}
        ${n > 1 ? `<polyline fill="none" stroke="#0284c7" stroke-width="2.5" points="${pointsRetenue}" />` : ""}
        ${cerclesHtml}
      </svg>
    </div>
    <div style="display:flex; gap:14px; flex-wrap:wrap; font-size:0.76rem; color:#64748b; margin-top:6px;">
      <span><strong style="color:#0284c7;">━━</strong> Note retenue (/20)</span>
      <span><strong style="color:#94a3b8;">┄┄</strong> Note brute (/20)</span>
      <span><strong style="color:#b45309;">┄┄</strong> Seuil de validation (10/20)</span>
    </div>
  `;
}

function afficherCourbeEleveSelectionne() {
  const sel = document.getElementById("selectAnalyseEleveCourbe");
  const zone = document.getElementById("zoneCourbeIndividuelleEleve");
  if (!sel || !zone) return;

  const eleveId = sel.value;
  const eleve = donneesAnalyseCache.eleves.find(e => String(e.id) === String(eleveId));
  if (!eleve) {
    zone.innerHTML = "";
    return;
  }

  const matiereIdFiltre = document.getElementById("filtreAnalyseMatiere")?.value || "";
  const copiesEleve = donneesAnalyseCache.copies
    .filter(c => copieAppartientAEleve(c, eleve) && (!matiereIdFiltre || String(c.matiere_id) === String(matiereIdFiltre)))
    .sort((a, b) => new Date(a.date_soumission || 0) - new Date(b.date_soumission || 0));

  if (copiesEleve.length === 0) {
    zone.innerHTML = `<p style="color:#64748b; font-size:0.86rem; font-style:italic; margin:8px 0 0 0;">Cet élève n'a pas encore passé d'évaluation sur cette sélection.</p>`;
    return;
  }

  const moy = copiesEleve.reduce((s, c) => s + Number(c.note_retenue || 0), 0) / copiesEleve.length;
  const copiesAvecRatio = copiesEleve.filter(c => Number(c.questions_totales) > 0);
  const ratioMoyen = copiesAvecRatio.length > 0
    ? (copiesAvecRatio.reduce((s, c) => s + (Number(c.questions_traitees || 0) / Number(c.questions_totales)), 0) / copiesAvecRatio.length) * 100
    : 100;

  zone.innerHTML = `
    <div style="display:flex; gap:12px; flex-wrap:wrap; margin:10px 0 12px 0; font-size:0.83rem;">
      <span class="badge" style="background:#eff6ff; color:var(--pronote-blue); font-weight:700;">Moyenne : ${moy.toFixed(2)} / 20</span>
      <span class="badge" style="background:#f1f5f9; color:#334155;">${copiesEleve.length} QCM passé(s)</span>
      <span class="badge" style="background:${ratioMoyen < 75 ? '#fef3c7' : '#dcfce7'}; color:${ratioMoyen < 75 ? '#b45309' : '#15803d'};">
        Achèvement moyen : ${ratioMoyen.toFixed(0)} % des questions
      </span>
      ${Number(eleve.est_pap) === 1 ? `<span class="badge" style="background:#fdf4ff; color:#7e22ce; font-weight:700;">Aménagement PAP actif</span>` : ""}
    </div>
    ${construireCourbeSvgEleve(copiesEleve)}
  `;
}

function construireSectionSuiviLongitudinal(copiesFiltrees, classeIdFiltre) {
  if (!classeIdFiltre) {
    return `
      <div style="margin-top:22px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:14px; font-size:0.84rem; color:#64748b;">
        <i class="fa-solid fa-user-chart" style="color:var(--pronote-blue);"></i> Sélectionnez une <strong>classe</strong> en haut pour activer le <strong>suivi longitudinal individuel</strong> (courbes d'évolution, détection de décrochage, vitesse d'achèvement et sorties d'écran).
      </div>
    `;
  }

  const elevesClasse = donneesAnalyseCache.eleves.filter(e => String(e.classe_id) === String(classeIdFiltre));
  if (elevesClasse.length === 0) return "";

  const bilansEleves = elevesClasse.map(el => {
    const copiesEl = copiesFiltrees
      .filter(c => copieAppartientAEleve(c, el))
      .sort((a, b) => new Date(a.date_soumission || 0) - new Date(b.date_soumission || 0));

    const nb = copiesEl.length;
    const moy = nb > 0 ? copiesEl.reduce((s, c) => s + Number(c.note_retenue || 0), 0) / nb : null;

    // Calcul de tendance entre l'avant-dernier et le dernier QCM
    let deltaTendance = null;
    if (nb >= 2) {
      deltaTendance = Number(copiesEl[nb - 1].note_retenue) - Number(copiesEl[nb - 2].note_retenue);
    }

    // Ratio moyen de questions traitées
    const avecTot = copiesEl.filter(c => Number(c.questions_totales) > 0);
    const ratioAch = avecTot.length > 0
      ? (avecTot.reduce((s, c) => s + (Number(c.questions_traitees || 0) / Number(c.questions_totales)), 0) / avecTot.length) * 100
      : null;

    // Sorties d'écran cumulées
    const totalSorties = copiesEl.reduce((s, c) => s + Number(c.nb_sorties || 0), 0);
    const totalDureeSorties = copiesEl.reduce((s, c) => s + Number(c.duree_sorties || 0), 0);

    // Génération des alertes pédagogiques
    const alertes = [];
    if (deltaTendance !== null && deltaTendance <= -3) {
      alertes.push({ type: "chute", label: `📉 Chute (${deltaTendance.toFixed(1)} pts)`, bg: "#fee2e2", col: "#b91c1c" });
    } else if (moy !== null && moy < 10) {
      alertes.push({ type: "fragile", label: "⚠️ Moyenne < 10", bg: "#fef2f2", col: "#dc2626" });
    }
    if (ratioAch !== null && ratioAch < 75) {
      alertes.push({
        type: "lenteur",
        label: Number(el.est_pap) === 1 ? `🐢 Lent (${ratioAch.toFixed(0)}% - PAP)` : `🐢 Lent (${ratioAch.toFixed(0)}% - envisager PAP)`,
        bg: "#fef3c7",
        col: "#b45309"
      });
    }
    if (totalSorties >= 3 || totalDureeSorties >= 30) {
      alertes.push({
        type: "sorties",
        label: `👁️ ${totalSorties} sortie(s) (${totalDureeSorties}s)`,
        bg: "#f3e8ff",
        col: "#7e22ce"
      });
    }

    return {
      eleve: el,
      nb,
      moy,
      deltaTendance,
      ratioAch,
      totalSorties,
      totalDureeSorties,
      alertes
    };
  });

  const nbElevesEnAlerte = bilansEleves.filter(b => b.alertes.length > 0).length;

  return `
    <div style="margin-top:22px; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
        <div>
          <h4 style="margin:0; color:var(--pronote-blue); font-size:1.02rem;">
            <i class="fa-solid fa-chart-line"></i> Suivi Longitudinal & Détection de Décrochage
          </h4>
          <p style="margin:3px 0 0 0; font-size:0.82rem; color:#64748b;">
            Analyse de l'évolution des notes, du rythme d'achèvement des questions et des sorties d'écran.
          </p>
        </div>
        <span class="badge" style="background:${nbElevesEnAlerte > 0 ? '#fef3c7' : '#dcfce7'}; color:${nbElevesEnAlerte > 0 ? '#92400e' : '#15803d'}; font-weight:700;">
          ${nbElevesEnAlerte} élève(s) à surveiller
        </span>
      </div>

      <!-- Sélecteur de courbe individuelle -->
      <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:16px;">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <label for="selectAnalyseEleveCourbe" style="font-size:0.85rem; font-weight:700; color:#1e293b;">
            <i class="fa-solid fa-user-graduate" style="color:var(--pronote-blue);"></i> Courbe d'évolution individuelle :
          </label>
          <select id="selectAnalyseEleveCourbe" class="input-field" style="margin:0; max-width:280px; font-size:0.86rem;" onchange="afficherCourbeEleveSelectionne()">
            <option value="">-- Choisir un élève de la classe --</option>
            ${bilansEleves.map(b => {
              const nomComplet = `${(b.eleve.nom || "").toUpperCase()} ${b.eleve.prenom || ""}`.trim();
              return `<option value="${b.eleve.id}">${nomComplet} (${b.nb} QCM)</option>`;
            }).join("")}
          </select>
        </div>
        <div id="zoneCourbeIndividuelleEleve"></div>
      </div>

      <!-- Tableau récapitulatif des indicateurs individuels & alertes -->
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Élève</th>
              <th style="text-align:center;">QCM faits</th>
              <th style="text-align:center;">Moyenne /20</th>
              <th style="text-align:center;">Tendance</th>
              <th style="text-align:center;">Questions faites</th>
              <th style="text-align:center;">Sorties écran</th>
              <th>Alertes & Préconisations</th>
            </tr>
          </thead>
          <tbody>
            ${bilansEleves.map(b => {
              const el = b.eleve;
              const nomComplet = `${(el.nom || "").toUpperCase()} ${el.prenom || ""}`.trim();
              const badgePap = Number(el.est_pap) === 1
                ? `<span class="badge" style="background:#fdf4ff; color:#7e22ce; font-size:0.7rem; margin-left:4px;">PAP</span>`
                : "";

              let tendanceHtml = `<span style="color:#94a3b8;">—</span>`;
              if (b.deltaTendance !== null) {
                if (b.deltaTendance >= 1.5) tendanceHtml = `<span style="color:#16a34a; font-weight:700;">↗ +${b.deltaTendance.toFixed(1)}</span>`;
                else if (b.deltaTendance <= -1.5) tendanceHtml = `<span style="color:#dc2626; font-weight:700;">↘ ${b.deltaTendance.toFixed(1)}</span>`;
                else tendanceHtml = `<span style="color:#475569; font-weight:600;">→ ${b.deltaTendance >= 0 ? "+" : ""}${b.deltaTendance.toFixed(1)}</span>`;
              }

              const alertesHtml = b.alertes.length > 0
                ? b.alertes.map(a => `<span class="badge" style="background:${a.bg}; color:${a.col}; font-weight:700; margin-right:4px; margin-bottom:2px; display:inline-block;">${a.label}</span>`).join("")
                : (b.nb > 0 ? `<span style="color:#16a34a; font-size:0.8rem; font-weight:600;">✓ Parcours régulier</span>` : `<span style="color:#94a3b8; font-size:0.8rem;">Aucune copie</span>`);

              return `
                <tr>
                  <td>
                    <a href="javascript:void(0)" style="color:#1e293b; font-weight:700; text-decoration:none;"
                       onclick="document.getElementById('selectAnalyseEleveCourbe').value='${el.id}'; afficherCourbeEleveSelectionne(); document.getElementById('selectAnalyseEleveCourbe').scrollIntoView({behavior:'smooth', block:'center'});">
                      ${nomComplet}
                    </a>${badgePap}
                  </td>
                  <td style="text-align:center;">${b.nb}</td>
                  <td style="text-align:center;">
                    ${b.moy !== null ? `<strong style="color:var(--pronote-blue);">${b.moy.toFixed(2)}</strong>` : "—"}
                  </td>
                  <td style="text-align:center;">${tendanceHtml}</td>
                  <td style="text-align:center;">
                    ${b.ratioAch !== null ? `<span style="font-weight:600; color:${b.ratioAch < 75 ? '#b45309' : '#334155'};">${b.ratioAch.toFixed(0)} %</span>` : "—"}
                  </td>
                  <td style="text-align:center; font-size:0.82rem; color:${b.totalSorties >= 3 ? '#7e22ce' : '#475569'};">
                    ${b.nb > 0 ? `${b.totalSorties} (${b.totalDureeSorties}s)` : "—"}
                  </td>
                  <td>${alertesHtml}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function basculerDetailsSeancesQcm(qcmCleId) {
  const row = document.getElementById(`detailsSeancesQcm_${qcmCleId}`);
  if (!row) return;
  row.style.display = (row.style.display === "none" || !row.style.display) ? "table-row" : "none";
}

function construireSectionPsychometrieQcm(copiesFiltrees) {
  if (!copiesFiltrees || copiesFiltrees.length === 0) return "";

  // Regroupement par QCM (qcm_id ou titre)
  const mapQcms = new Map();
  for (const c of copiesFiltrees) {
    const cle = c.qcm_id ? `id_${c.qcm_id}` : `titre_${c.qcm_titre}`;
    if (!mapQcms.has(cle)) {
      mapQcms.set(cle, {
        cle,
        qcm_id: c.qcm_id,
        qcm_titre: c.qcm_titre || "QCM sans titre",
        matiere_nom: c.matiere_nom || "Non classée",
        competence_code: c.competence_code || "",
        copies: []
      });
    }
    mapQcms.get(cle).copies.push(c);
  }

  const bilansQcms = Array.from(mapQcms.values()).map(q => {
    const n = q.copies.length;
    const moyRetenue = q.copies.reduce((s, c) => s + Number(c.note_retenue || 0), 0) / n;
    const moyBrute = q.copies.reduce((s, c) => s + Number(c.note_brute || 0), 0) / n;
    const nbReussis = q.copies.filter(c => Number(c.note_retenue || 0) >= 10).length;
    const tauxReussite = (nbReussis / n) * 100;

    // Nombre de questions et taux moyen d'achèvement
    const copiesAvecTot = q.copies.filter(c => Number(c.questions_totales) > 0);
    const nbQuestions = copiesAvecTot.length > 0 ? Number(copiesAvecTot[0].questions_totales) : null;
    const tauxAchevement = copiesAvecTot.length > 0
      ? (copiesAvecTot.reduce((s, c) => s + (Number(c.questions_traitees || 0) / Number(c.questions_totales)), 0) / copiesAvecTot.length) * 100
      : null;

    // Sous-regroupement par séance / classe pour comparaison inter-séances
    const mapSeances = new Map();
    for (const c of q.copies) {
      const sCle = `${c.seance_id || c.code_session}_${c.classe_nom}`;
      if (!mapSeances.has(sCle)) {
        mapSeances.set(sCle, {
          classe_nom: c.classe_nom,
          code_session: c.code_session || "—",
          copies: []
        });
      }
      mapSeances.get(sCle).copies.push(c);
    }

    const seancesDetails = Array.from(mapSeances.values()).map(s => {
      const sn = s.copies.length;
      const sMoy = s.copies.reduce((acc, c) => acc + Number(c.note_retenue || 0), 0) / sn;
      const sReussite = (s.copies.filter(c => Number(c.note_retenue || 0) >= 10).length / sn) * 100;
      const sAvecTot = s.copies.filter(c => Number(c.questions_totales) > 0);
      const sAch = sAvecTot.length > 0
        ? (sAvecTot.reduce((acc, c) => acc + (Number(c.questions_traitees || 0) / Number(c.questions_totales)), 0) / sAvecTot.length) * 100
        : null;
      return {
        classe_nom: s.classe_nom,
        code_session: s.code_session,
        effectif: sn,
        moyenne: sMoy,
        tauxReussite: sReussite,
        tauxAchevement: sAch
      };
    }).sort((a, b) => a.classe_nom.localeCompare(b.classe_nom));

    // Diagnostic automatique de calibration
    let diagLabel = "✓ Bien calibré";
    let diagBg = "#dcfce7";
    let diagCol = "#15803d";

    if (tauxAchevement !== null && tauxAchevement < 70) {
      diagLabel = "⏱️ Trop long (achèvement faible)";
      diagBg = "#fef3c7";
      diagCol = "#b45309";
    } else if (moyRetenue < 8.5) {
      diagLabel = "⚠️ Difficile (prévoir version simplifiée)";
      diagBg = "#fee2e2";
      diagCol = "#b91c1c";
    } else if (moyRetenue > 16.5 && (tauxAchevement === null || tauxAchevement >= 90)) {
      diagLabel = "🟢 Très accessible";
      diagBg = "#e0f2fe";
      diagCol = "#0369a1";
    }

    return {
      ...q,
      effectif: n,
      nbQuestions,
      moyRetenue,
      moyBrute,
      tauxReussite,
      tauxAchevement,
      seancesDetails,
      diagLabel,
      diagBg,
      diagCol
    };
  }).sort((a, b) => b.effectif - a.effectif);

  return `
    <div style="margin-top:22px; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
        <div>
          <h4 style="margin:0; color:var(--pronote-blue); font-size:1.02rem;">
            <i class="fa-solid fa-sliders"></i> Analyse Psychométrique des QCM & Comparaison Inter-Séances
          </h4>
          <p style="margin:3px 0 0 0; font-size:0.82rem; color:#64748b;">
            Évaluation de la difficulté, de la longueur (taux d'achèvement) et comparaison entre les classes ayant passé le même questionnaire.
          </p>
        </div>
        <span class="badge" style="background:#e0f2fe; color:#0369a1;">${bilansQcms.length} QCM évalué(s)</span>
      </div>

      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Questionnaire (QCM)</th>
              <th style="text-align:center;">Questions</th>
              <th style="text-align:center;">Copies</th>
              <th style="text-align:center;">Moy. retenue /20</th>
              <th style="text-align:center;">Achèvement</th>
              <th style="text-align:center;">Réussite</th>
              <th>Calibration</th>
              <th style="text-align:center;">Séances</th>
            </tr>
          </thead>
          <tbody>
            ${bilansQcms.map((q, idx) => {
              const achTxt = q.tauxAchevement !== null ? `${q.tauxAchevement.toFixed(0)} %` : "—";
              const achCol = (q.tauxAchevement !== null && q.tauxAchevement < 75) ? "#b45309" : "#334155";
              const diffBrute = Math.abs(q.moyRetenue - q.moyBrute) >= 0.2
                ? `<div style="font-size:0.72rem; color:#64748b;">Brute : ${q.moyBrute.toFixed(1)}</div>`
                : "";

              const sousTableauSeances = `
                <tr id="detailsSeancesQcm_${idx}" style="display:none; background:#f8fafc;">
                  <td colspan="8" style="padding:10px 16px;">
                    <div style="font-size:0.8rem; font-weight:700; color:#334155; margin-bottom:6px;">
                      <i class="fa-solid fa-code-branch" style="color:var(--pronote-blue);"></i> Détail par séance / classe pour « ${q.qcm_titre} » :
                    </div>
                    <table style="background:#ffffff; border:1px solid #cbd5e1;">
                      <thead>
                        <tr>
                          <th>Classe</th>
                          <th>Code séance</th>
                          <th style="text-align:center;">Copies</th>
                          <th style="text-align:center;">Moyenne /20</th>
                          <th style="text-align:center;">Achèvement</th>
                          <th style="text-align:center;">Réussite (≥10)</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${q.seancesDetails.map(sd => `
                          <tr>
                            <td><strong>${sd.classe_nom}</strong></td>
                            <td><span class="badge badge-session">${sd.code_session}</span></td>
                            <td style="text-align:center;">${sd.effectif}</td>
                            <td style="text-align:center;"><strong style="color:var(--pronote-blue);">${sd.moyenne.toFixed(2)}</strong></td>
                            <td style="text-align:center;">${sd.tauxAchevement !== null ? sd.tauxAchevement.toFixed(0) + " %" : "—"}</td>
                            <td style="text-align:center;">${sd.tauxReussite.toFixed(0)} %</td>
                          </tr>
                        `).join("")}
                      </tbody>
                    </table>
                  </td>
                </tr>
              `;

              return `
                <tr>
                  <td>
                    <div style="font-weight:700; color:#1e293b;">${q.qcm_titre}</div>
                    <div style="margin-top:3px; display:flex; gap:5px; flex-wrap:wrap;">
                      <span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:0.72rem;">${q.matiere_nom}</span>
                      ${q.competence_code ? `<span class="badge" style="background:#fef9c3; color:#854d0e; font-size:0.72rem;">🎯 ${q.competence_code}</span>` : ""}
                    </div>
                  </td>
                  <td style="text-align:center; font-weight:600;">${q.nbQuestions !== null ? q.nbQuestions : "—"}</td>
                  <td style="text-align:center;">${q.effectif}</td>
                  <td style="text-align:center;">
                    <strong style="color:var(--pronote-blue); font-size:0.96rem;">${q.moyRetenue.toFixed(2)}</strong>
                    ${diffBrute}
                  </td>
                  <td style="text-align:center; font-weight:700; color:${achCol};">${achTxt}</td>
                  <td style="text-align:center; font-weight:600;">${q.tauxReussite.toFixed(0)} %</td>
                  <td>
                    <span class="badge" style="background:${q.diagBg}; color:${q.diagCol}; font-weight:700;">
                      ${q.diagLabel}
                    </span>
                  </td>
                  <td style="text-align:center;">
                    <button type="button" class="btn btn-pdf" style="padding:4px 9px; font-size:0.76rem;" onclick="basculerDetailsSeancesQcm(${idx})">
                      ${q.seancesDetails.length} séance(s) ▾
                    </button>
                  </td>
                </tr>
                ${sousTableauSeances}
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
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
    { label: "0 – 5 / 20", sousLabel: "Très insuffisant", count: stats.tranches[0], color: "#dc2626" },
    { label: "5 – 10 / 20", sousLabel: "Fragile", count: stats.tranches[1], color: "#d97706" },
    { label: "10 – 15 / 20", sousLabel: "Satisfaisant", count: stats.tranches[2], color: "#0284c7" },
    { label: "15 – 20 / 20", sousLabel: "Maîtrise solide", count: stats.tranches[3], color: "#16a34a" }
  ];

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

  const sectionCompetencesHtml = construireSectionCompetences(copiesFiltrees, classeIdFiltre, matiereIdFiltre);
  const sectionLongitudinalHtml = construireSectionSuiviLongitudinal(copiesFiltrees, classeIdFiltre);
  const sectionPsychometrieHtml = construireSectionPsychometrieQcm(copiesFiltrees);

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

    <!-- 4. POINT 2 : MATRICE DE MAÎTRISE DES COMPÉTENCES & REMÉDIATION -->
    ${sectionCompetencesHtml}

    <!-- 5. POINT 3 : SUIVI LONGITUDINAL & DÉTECTION DE DÉCROCHAGE -->
    ${sectionLongitudinalHtml}

    <!-- 6. POINT 4 : ANALYSE PSYCHOMÉTRIQUE DES QCM -->
    ${sectionPsychometrieHtml}
  `;
}