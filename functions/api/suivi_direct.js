async function ensureTableSuiviDirect(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS suivi_direct (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seance_id INTEGER NOT NULL,
      eleve_id INTEGER,
      code_eleve TEXT NOT NULL,
      nom_eleve TEXT,
      prenom_eleve TEXT,
      statut TEXT DEFAULT 'en_cours',
      question_courante INTEGER DEFAULT 1,
      total_questions INTEGER DEFAULT 1,
      score_actuel REAL DEFAULT 0,
      score_max_courant REAL DEFAULT 0,
      score_total_possible REAL DEFAULT 0,
      reponses_json TEXT DEFAULT '[]',
      hors_ecran INTEGER DEFAULT 0,
      nb_sorties INTEGER DEFAULT 0,
      duree_sorties_sec INTEGER DEFAULT 0,
      derniere_activite TEXT DEFAULT (datetime('now')),
      UNIQUE(seance_id, code_eleve)
    )
  `).run();
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const seance_id = url.searchParams.get("seance_id");

    if (!seance_id) {
      return new Response(JSON.stringify({ error: "seance_id requis" }), { status: 400 });
    }

    await ensureTableSuiviDirect(env.DB);

    const seance = await env.DB.prepare(`
      SELECT s.*, c.nom AS classe_nom, q.titre AS qcm_titre, q.data_json
      FROM seances s
      INNER JOIN classes c ON s.classe_id = c.id
      INNER JOIN qcm_banque q ON s.qcm_id = q.id LEFT JOIN fiches_synthese fs ON q.fiche_id = fs.id
      WHERE s.id = ?
    `).bind(seance_id).first();

    if (!seance) {
      return new Response(JSON.stringify({ error: "Séance introuvable" }), { status: 404 });
    }

    let questionsList = [];
    try {
      questionsList = JSON.parse(seance.data_json || "[]");
    } catch (e) {}

    // Récupérer tous les élèves de la classe
    const { results: elevesClasse } = await env.DB.prepare(`
      SELECT id, nom, prenom, code_eleve
      FROM eleves
      WHERE classe_id = ?
      ORDER BY nom ASC, prenom ASC
    `).bind(seance.classe_id).all();

    // Récupérer les suivis en direct enregistrés pour cette séance
    const { results: suivis } = await env.DB.prepare(`
      SELECT * FROM suivi_direct WHERE seance_id = ?
    `).bind(seance_id).all();

    // Récupérer aussi les copies déjà soumises dans resultats_qcm
    const { results: copiesFinales } = await env.DB.prepare(`
      SELECT * FROM resultats_qcm WHERE seance_id = ?
    `).bind(seance_id).all();

    const setAbsents = new Set();
    try { const { results: absR } = await env.DB.prepare('SELECT eleve_id FROM absences_seances WHERE seance_id = ?').bind(seance_id).all(); (absR || []).forEach(a => setAbsents.add(Number(a.eleve_id))); } catch(e) {}
    const mapSuivi = new Map();
    suivis.forEach(sv => mapSuivi.set(String(sv.code_eleve).trim().toUpperCase(), sv));

    const mapCopies = new Map();
    copiesFinales.forEach(cp => {
      const nLow = String(cp.nom || "").trim().toLowerCase();
      const pLow = String(cp.prenom || "").trim().toLowerCase();
      if (nLow) mapCopies.set(nLow, cp);
      mapCopies.set(`${nLow}_${pLow}`, cp);
      elevesClasse.forEach(el => {
        const cUp = String(el.code_eleve || "").trim().toUpperCase();
        if (cUp && String(cp.prenom || "").toUpperCase().includes(cUp)) {
          mapCopies.set(cUp, cp);
        }
      });
    });

    const nbQuestionsTotal = questionsList.length || 1;
    const fusionEleves = [];
    const statsQuestions = Array.from({ length: nbQuestionsTotal }, (_, i) => ({
      index: i,
      numero: i + 1,
      titre: questionsList[i]?.title || `Q${i + 1}`,
      justes: 0,
      partiels: 0,
      faux: 0,
      repondus: 0
    }));

    let nbConnectes = 0;
    let nbTermines = 0;
    let nbEnCours = 0;
    let nbHorsEcranActuel = 0;
    let totalAlertesSorties = 0;
    let sommeNotesProvisoires = 0;
    let nbNotesProvisoires = 0;

    elevesClasse.forEach(el => {
      const codeUpper = String(el.code_eleve || "").trim().toUpperCase();
      const cleNom = `${String(el.nom || "").trim().toLowerCase()}_${String(el.prenom || "").trim().toLowerCase()}`;
      const sv = mapSuivi.get(codeUpper);
      const cp = mapCopies.get(codeUpper) || mapCopies.get(cleNom) || mapCopies.get(String(el.prenom || "").trim().toLowerCase());

      let statut = "non_connecte";
      let reponses = [];
      let questionCourante = 0;
      let scoreActuel = 0;
      let scoreMaxCourant = 0;
      let scoreTotalPossible = 0;
      let noteSur20 = null;
      let horsEcran = 0;
      let nbSorties = 0;
      let dureeSortiesSec = 0;
      let derniereActivite = null;

      if (sv) {
        statut = cp ? "termine" : (sv.statut || "en_cours");
        questionCourante = sv.question_courante || 1;
        scoreActuel = Number(sv.score_actuel || 0);
        scoreMaxCourant = Number(sv.score_max_courant || 0);
        scoreTotalPossible = Number(sv.score_total_possible || 0);
        horsEcran = Number(sv.hors_ecran || 0);
        nbSorties = Number(sv.nb_sorties || 0);
        dureeSortiesSec = Number(sv.duree_sorties_sec || 0);
        derniereActivite = sv.derniere_activite;
        try {
          reponses = JSON.parse(sv.reponses_json || "[]");
        } catch (e) {}

        if (cp && cp.note !== undefined && cp.note !== null) {
          const totCp = Number(cp.total) > 0 ? Number(cp.total) : 20;
          noteSur20 = Math.round(((Number(cp.note) / totCp) * 20) * 10) / 10;
          if (Number(cp.nb_sorties || 0) > nbSorties) nbSorties = Number(cp.nb_sorties || 0);
          if (Number(cp.duree_sorties || 0) > dureeSortiesSec) dureeSortiesSec = Number(cp.duree_sorties || 0);
          if ((!Array.isArray(reponses) || reponses.every(r => !r)) && cp.reponses_json) {
            try {
              const det = JSON.parse(cp.reponses_json);
              if (Array.isArray(det)) {
                reponses = Array.from({ length: nbQuestionsTotal }, (_, idx) => {
                  const d = det.find(item => Number(item.index) === idx) || det[idx];
                  if (!d || d.score === undefined || d.score === null) return null;
                  const ptsMax = Number(d.points || 1);
                  const sc = Number(d.score || 0);
                  return { etat: sc >= ptsMax ? "juste" : (sc > 0 ? "partiel" : "faux"), score: sc, max: ptsMax };
                });
              }
            } catch (e) {}
          }
        } else if (scoreMaxCourant > 0) {
          noteSur20 = Math.round(((scoreActuel / scoreMaxCourant) * 20) * 10) / 10;
        }
      } else if (cp) {
        statut = "termine";
        const totCp = Number(cp.total) > 0 ? Number(cp.total) : 20;
        noteSur20 = Math.round(((Number(cp.note || 0) / totCp) * 20) * 10) / 10;
        nbSorties = Number(cp.nb_sorties || 0);
        dureeSortiesSec = Number(cp.duree_sorties || 0);
        if (cp.reponses_json) {
          try {
            const det = JSON.parse(cp.reponses_json);
            if (Array.isArray(det)) {
              reponses = Array.from({ length: nbQuestionsTotal }, (_, idx) => {
                const d = det.find(item => Number(item.index) === idx) || det[idx];
                if (!d || d.score === undefined || d.score === null) return null;
                const ptsMax = Number(d.points || 1);
                const sc = Number(d.score || 0);
                return { etat: sc >= ptsMax ? "juste" : (sc > 0 ? "partiel" : "faux"), score: sc, max: ptsMax };
              });
            }
          } catch (e) {}
        }
      }

      if (statut !== "non_connecte") nbConnectes++;
      if (statut === "termine") nbTermines++;
      if (statut === "en_cours") nbEnCours++;
      if (horsEcran === 1 && statut === "en_cours") nbHorsEcranActuel++;
      if (nbSorties > 0) totalAlertesSorties += nbSorties;

      if (noteSur20 !== null && !isNaN(noteSur20)) {
        sommeNotesProvisoires += noteSur20;
        nbNotesProvisoires++;
      }

      // Alimenter les stats par question
      reponses.forEach((rep, idx) => {
        if (statsQuestions[idx] && rep && rep.etat) {
          statsQuestions[idx].repondus++;
          if (rep.etat === "juste") statsQuestions[idx].justes++;
          else if (rep.etat === "partiel") statsQuestions[idx].partiels++;
          else if (rep.etat === "faux") statsQuestions[idx].faux++;
        }
      });

      fusionEleves.push({
        id: el.id,
        est_absent: setAbsents.has(Number(el.id)),
        nom: el.nom,
        prenom: el.prenom,
        code_eleve: el.code_eleve,
        statut,
        question_courante: questionCourante,
        total_questions: nbQuestionsTotal,
        reponses,
        note_sur_20: noteSur20,
        hors_ecran: horsEcran,
        nb_sorties: nbSorties,
        duree_sorties_sec: dureeSortiesSec,
        derniere_activite: derniereActivite
      });
    });

    const moyenneProvisoire = nbNotesProvisoires > 0
      ? Math.round((sommeNotesProvisoires / nbNotesProvisoires) * 10) / 10
      : null;

    return new Response(JSON.stringify({
      seance: {
        id: seance.id,
        code_session: seance.code_session,
        classe_nom: seance.classe_nom,
        qcm_titre: seance.qcm_titre,
        actif: seance.actif,
        total_questions: nbQuestionsTotal
      },
      resume: {
        effectif_total: elevesClasse.length,
        connectes: nbConnectes,
        en_cours: nbEnCours,
        termines: nbTermines,
        hors_ecran_actuel: nbHorsEcranActuel,
        total_alertes_sorties: totalAlertesSorties,
        moyenne_provisoire: moyenneProvisoire
      },
      stats_questions: statsQuestions,
      eleves: fusionEleves
    }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store, no-cache" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const {
      seance_id,
      eleve_id,
      code_eleve,
      nom_eleve,
      prenom_eleve,
      statut,
      question_courante,
      total_questions,
      score_actuel,
      score_max_courant,
      score_total_possible,
      reponses,
      hors_ecran,
      nb_sorties,
      duree_sorties_sec
    } = body;

    if (!seance_id || !code_eleve) {
      return new Response(JSON.stringify({ ok: false, ignored: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    await ensureTableSuiviDirect(env.DB);

    const existing = await env.DB.prepare(`
      SELECT * FROM suivi_direct WHERE seance_id = ? AND code_eleve = ?
    `).bind(seance_id, String(code_eleve).trim().toUpperCase()).first();

    if (!existing) {
      await env.DB.prepare(`
        INSERT INTO suivi_direct (
          seance_id, eleve_id, code_eleve, nom_eleve, prenom_eleve,
          statut, question_courante, total_questions,
          score_actuel, score_max_courant, score_total_possible,
          reponses_json, hors_ecran, nb_sorties, duree_sorties_sec, derniere_activite
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        seance_id,
        eleve_id || null,
        String(code_eleve).trim().toUpperCase(),
        nom_eleve || "",
        prenom_eleve || "",
        statut || "en_cours",
        question_courante || 1,
        total_questions || 1,
        score_actuel !== undefined ? score_actuel : 0,
        score_max_courant !== undefined ? score_max_courant : 0,
        score_total_possible !== undefined ? score_total_possible : 0,
        reponses ? JSON.stringify(reponses) : "[]",
        hors_ecran !== undefined ? (hors_ecran ? 1 : 0) : 0,
        nb_sorties !== undefined ? nb_sorties : 0,
        duree_sorties_sec !== undefined ? duree_sorties_sec : 0
      ).run();
    } else {
      const nextStatut = statut || existing.statut;
      const nextQ = question_courante !== undefined ? question_courante : existing.question_courante;
      const nextTotQ = total_questions !== undefined ? total_questions : existing.total_questions;
      const nextScore = score_actuel !== undefined ? score_actuel : existing.score_actuel;
      const nextScoreMax = score_max_courant !== undefined ? score_max_courant : existing.score_max_courant;
      const nextScoreTot = score_total_possible !== undefined ? score_total_possible : existing.score_total_possible;
      const nextRepJson = reponses !== undefined ? JSON.stringify(reponses) : existing.reponses_json;
      const nextHorsEcran = hors_ecran !== undefined ? (hors_ecran ? 1 : 0) : existing.hors_ecran;
      const nextNbSorties = nb_sorties !== undefined ? nb_sorties : existing.nb_sorties;
      const nextDureeSorties = duree_sorties_sec !== undefined ? duree_sorties_sec : existing.duree_sorties_sec;

      await env.DB.prepare(`
        UPDATE suivi_direct
        SET statut = ?,
            question_courante = ?,
            total_questions = ?,
            score_actuel = ?,
            score_max_courant = ?,
            score_total_possible = ?,
            reponses_json = ?,
            hors_ecran = ?,
            nb_sorties = ?,
            duree_sorties_sec = ?,
            derniere_activite = datetime('now')
        WHERE id = ?
      `).bind(
        nextStatut, nextQ, nextTotQ, nextScore, nextScoreMax, nextScoreTot,
        nextRepJson, nextHorsEcran, nextNbSorties, nextDureeSorties, existing.id
      ).run();
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}