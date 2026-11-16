export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const resultatId = url.searchParams.get("resultat_id");
    const seanceId = url.searchParams.get("seance_id");
    const codeEleve = (url.searchParams.get("code_eleve") || "").trim().toUpperCase();

    if (!codeEleve || (!resultatId && !seanceId)) {
      return new Response(JSON.stringify({ error: "Paramètres manquants" }), { status: 400 });
    }

    // 1. Vérifier l'identité de l'élève
    const eleve = await env.DB.prepare(`
      SELECT id, prenom, classe_id, code_eleve
      FROM eleves
      WHERE UPPER(code_eleve) = ?
    `).bind(codeEleve).first();

    if (!eleve) {
      return new Response(JSON.stringify({ error: "Élève non reconnu" }), { status: 403 });
    }

    // S'assurer que la colonne reponses_json existe
    try {
      await env.DB.prepare(`ALTER TABLE resultats_qcm ADD COLUMN reponses_json TEXT DEFAULT NULL`).run();
    } catch (e) {}

    // 2. Récupérer la copie et l'état de la séance
    let copie = null;
    if (resultatId) {
      copie = await env.DB.prepare(`
        SELECT r.id, r.seance_id, r.note, r.total, r.note_proportionnelle,
               r.questions_traitees, r.questions_totales, r.reponses_json, r.date_soumission,
               COALESCE(s.actif, 1) AS seance_actif, s.code_session,
               q.id AS qcm_id, q.titre AS qcm_titre, q.data_json, q.document_html
        FROM resultats_qcm r
        INNER JOIN seances s ON r.seance_id = s.id
        INNER JOIN qcm_banque q ON s.qcm_id = q.id
        WHERE r.id = ? AND s.classe_id = ? AND (r.nom = ? OR r.prenom LIKE ?)
      `).bind(resultatId, eleve.classe_id, eleve.prenom, `%${codeEleve}%`).first();
    } else {
      copie = await env.DB.prepare(`
        SELECT r.id, r.seance_id, r.note, r.total, r.note_proportionnelle,
               r.questions_traitees, r.questions_totales, r.reponses_json, r.date_soumission,
               COALESCE(s.actif, 1) AS seance_actif, s.code_session,
               q.id AS qcm_id, q.titre AS qcm_titre, q.data_json, q.document_html
        FROM resultats_qcm r
        INNER JOIN seances s ON r.seance_id = s.id
        INNER JOIN qcm_banque q ON s.qcm_id = q.id
        WHERE r.seance_id = ? AND s.classe_id = ? AND (r.nom = ? OR r.prenom LIKE ?)
        ORDER BY r.date_soumission DESC
        LIMIT 1
      `).bind(seanceId, eleve.classe_id, eleve.prenom, `%${codeEleve}%`).first();
    }

    if (!copie) {
      return new Response(JSON.stringify({ error: "Copie introuvable" }), { status: 404 });
    }

    // 3. Sécurité anti-triche : bloquer le corrigé tant que la séance est active en classe
    const estActive = (copie.seance_actif == 1 || copie.seance_actif === "1");
    if (estActive) {
      return new Response(JSON.stringify({
        success: true,
        verrouille: true,
        qcm_titre: copie.qcm_titre,
        message: "La séance est encore ouverte pour la classe. La correction détaillée et les explications seront accessibles dès que ton enseignant aura clôturé la séance."
      }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }

    // 4. Reconstruire le détail question par question
    let details = [];
    if (copie.reponses_json) {
      try {
        const parsed = JSON.parse(copie.reponses_json);
        if (Array.isArray(parsed)) details = parsed;
      } catch (e) {}
    }

    // Fallback rétrocompatible si la copie a été passée avant l'activation de reponses_json
    if (details.length === 0 && copie.data_json) {
      try {
        const qcmData = JSON.parse(copie.data_json);
        const questions = Array.isArray(qcmData) ? qcmData : (qcmData.questions || []);
        details = questions.map((q, idx) => {
          let bonnesReponses = [];
          let explications = [];
          if (q.type === "multichoice" && Array.isArray(q.answers)) {
            q.answers.forEach(a => {
              const frac = typeof a.fraction === "number" ? a.fraction : (parseFloat(a.fraction) || 0);
              if (frac > 0) {
                bonnesReponses.push(a.text || "");
                if (a.feedback) explications.push(`${a.text} : ${a.feedback}`);
              }
            });
          } else if (q.type === "matching" && Array.isArray(q.subquestions)) {
            q.subquestions.forEach(sub => {
              bonnesReponses.push(`${sub.text} → ${sub.answer}`);
            });
          }
          return {
            index: idx,
            question: q.text || q.question || `Question ${idx + 1}`,
            type: q.type || "multichoice",
            points: Number(q.points || 1),
            score: null,
            reponses_eleve: [],
            bonnes_reponses: bonnesReponses,
            general_feedback: q.generalFeedback || "",
            explications: explications,
            archive_sans_choix: true
          };
        });
      } catch (e) {}
    }

    const estIncomplet = (
      copie.note_proportionnelle !== null &&
      copie.note_proportionnelle !== undefined &&
      copie.questions_traitees !== null &&
      copie.questions_totales !== null &&
      Number(copie.questions_traitees) < Number(copie.questions_totales)
    );

    return new Response(JSON.stringify({
      success: true,
      verrouille: false,
      qcm_titre: copie.qcm_titre,
      note_brute: copie.note,
      note_retenue: estIncomplet ? Number(copie.note_proportionnelle).toFixed(2) : copie.note,
      est_incomplet: estIncomplet,
      questions_traitees: copie.questions_traitees,
      questions_totales: copie.questions_totales,
      date_soumission: copie.date_soumission,
      has_document: !!(copie.document_html && copie.document_html.trim()),
      qcm_id: copie.qcm_id,
      details
    }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}