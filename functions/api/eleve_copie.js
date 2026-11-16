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

    const eleve = await env.DB.prepare(`
      SELECT id, prenom, classe_id, code_eleve
      FROM eleves
      WHERE UPPER(code_eleve) = ?
    `).bind(codeEleve).first();

    if (!eleve) {
      return new Response(JSON.stringify({ error: "Élève non reconnu" }), { status: 403 });
    }

    try {
      await env.DB.prepare(`ALTER TABLE resultats_qcm ADD COLUMN reponses_json TEXT DEFAULT NULL`).run();
    } catch (e) {}

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

    const estActive = (copie.seance_actif == 1 || copie.seance_actif === "1");
    if (estActive) {
      return new Response(JSON.stringify({
        success: true,
        verrouille: true,
        qcm_titre: copie.qcm_titre,
        message: "La séance est encore ouverte pour la classe. La correction détaillée et les explications seront accessibles dès que ton enseignant aura clôturé la séance."
      }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }

    // Extraction des questions d'origine depuis qcm_banque.data_json
    let questionsSource = [];
    let introSituation = "";
    if (copie.data_json) {
      try {
        const qcmData = JSON.parse(copie.data_json);
        if (Array.isArray(qcmData)) {
          questionsSource = qcmData;
        } else if (qcmData && typeof qcmData === "object") {
          questionsSource = qcmData.questions || [];
          introSituation = qcmData.description || qcmData.intro || qcmData.situation || "";
        }
      } catch (e) {}
    }

    let detailsSauvegardes = [];
    if (copie.reponses_json) {
      try {
        const parsed = JSON.parse(copie.reponses_json);
        if (Array.isArray(parsed)) detailsSauvegardes = parsed;
      } catch (e) {}
    }

    // Fusionner les données sauvegardées de l'élève avec la banque de questions (garantit l'affichage de q.enonce)
    const nbMax = Math.max(questionsSource.length, detailsSauvegardes.length);
    const details = [];

    for (let idx = 0; idx < nbMax; idx++) {
      const qSrc = questionsSource[idx] || null;
      const dSauv = detailsSauvegardes.find(d => Number(d.index) === idx) || detailsSauvegardes[idx] || null;

      let bonnesReponses = dSauv && Array.isArray(dSauv.bonnes_reponses) ? dSauv.bonnes_reponses : [];
      let explicationsSrc = [];

      if (qSrc) {
        if (qSrc.type === "multichoice" && Array.isArray(qSrc.answers)) {
          if (bonnesReponses.length === 0) {
            qSrc.answers.forEach(a => {
              const frac = typeof a.fraction === "number" ? a.fraction : (parseFloat(a.fraction) || 0);
              if (frac > 0) bonnesReponses.push(a.text || "");
            });
          }
          qSrc.answers.forEach(a => {
            const frac = typeof a.fraction === "number" ? a.fraction : (parseFloat(a.fraction) || 0);
            if (frac > 0 && a.feedback) explicationsSrc.push(`<strong>${a.text || ""} :</strong> ${a.feedback}`);
          });
        } else if (qSrc.type === "matching" && Array.isArray(qSrc.subquestions)) {
          if (bonnesReponses.length === 0) {
            qSrc.subquestions.forEach(sub => {
              bonnesReponses.push(`${sub.question || sub.text || ""} → ${sub.answer || ""}`);
            });
          }
        }
      }

      const enonceComplet = (qSrc && (qSrc.enonce || qSrc.text || qSrc.question))
        || (dSauv && dSauv.question && !/^Question \d+$/.test(dSauv.question) ? dSauv.question : `Question ${idx + 1}`);

      const explicationsFinales = (dSauv && Array.isArray(dSauv.explications) && dSauv.explications.length > 0)
        ? dSauv.explications
        : explicationsSrc;

      details.push({
        index: idx,
        question: enonceComplet,
        image: qSrc && qSrc.image ? qSrc.image : null,
        type: (qSrc && qSrc.type) || (dSauv && dSauv.type) || "multichoice",
        points: Number((qSrc && qSrc.points) || (dSauv && dSauv.points) || 1),
        score: dSauv && dSauv.score !== undefined && dSauv.score !== null ? Number(dSauv.score) : null,
        reponses_eleve: dSauv && Array.isArray(dSauv.reponses_eleve) ? dSauv.reponses_eleve : [],
        bonnes_reponses: bonnesReponses,
        general_feedback: (qSrc && qSrc.generalFeedback) || (dSauv && dSauv.general_feedback) || "",
        explications: explicationsFinales,
        archive_sans_choix: !dSauv
      });
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
      intro_situation: introSituation,
      document_html: copie.document_html || "",
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