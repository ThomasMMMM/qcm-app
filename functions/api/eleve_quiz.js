function preparerQuestions(questions) {
  return questions.map(q => {
    const points = Number(q.points) > 0 ? Number(q.points) : 1;
    
    if (q.type === "multichoice") {
      return {
        type: q.type,
        title: q.title || "",
        enonce: q.enonce || "",
        image: q.image || null,
        points: points,
        single: q.single,
        generalFeedback: q.generalFeedback || "",
        answers: (q.answers || []).map((a, idx) => ({
          id: idx,
          text: a.text || "",
          image: a.image || null,
          fraction: (typeof a.fraction === "number" && !isNaN(a.fraction)) ? a.fraction : (parseFloat(a.fraction) || 0),
          feedback: a.feedback || ""
        }))
      };
    } else if (q.type === "matching") {
      const subqs = q.subquestions || [];
      const tousLesChoix = subqs.map(s => s.answer).sort(() => Math.random() - 0.5);
      return {
        type: q.type,
        title: q.title || "",
        enonce: q.enonce || "",
        image: q.image || null,
        points: points,
        generalFeedback: q.generalFeedback || "",
        subquestions: subqs,
        choices: tousLesChoix
      };
    }
    return q;
  });
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const code_eleve = url.searchParams.get("code_eleve");
    
    const simuQcmId = url.searchParams.get("simulateur_qcm_id");
    const simuSeanceId = url.searchParams.get("simulateur_seance_id");

    // 1. Simulation Banque
    if (simuQcmId) {
      const qcm = await env.DB.prepare("SELECT id, titre, data_json FROM qcm_banque WHERE id = ?").bind(simuQcmId).first();
      if (!qcm) return new Response(JSON.stringify({ error: "QCM introuvable" }), { status: 404 });
      const brute = JSON.parse(qcm.data_json);
      return new Response(JSON.stringify({
        qcm_id: qcm.id,
        titre: qcm.titre,
        questions: preparerQuestions(brute)
      }), { headers: { "Content-Type": "application/json" } });
    }

    // 2. Simulation Séance
    if (simuSeanceId) {
      const seance = await env.DB.prepare(`
        SELECT s.id, s.code_session, q.titre, q.data_json
        FROM seances s
        INNER JOIN qcm_banque q ON s.qcm_id = q.id
        WHERE s.id = ?
      `).bind(simuSeanceId).first();
      if (!seance) return new Response(JSON.stringify({ error: "Séance introuvable" }), { status: 404 });
      const brute = JSON.parse(seance.data_json);
      return new Response(JSON.stringify({
        seance_id: seance.id,
        titre: seance.titre,
        code_session: seance.code_session,
        questions: preparerQuestions(brute)
      }), { headers: { "Content-Type": "application/json" } });
    }

    // 3. Passation Élève
    if (!code || !code_eleve) {
      return new Response(JSON.stringify({ error: "Code d'épreuve et code élève requis" }), { status: 400 });
    }

    const cleanCode = code.toUpperCase().trim();
    const cleanCodeEleve = code_eleve.toUpperCase().trim();

    const seance = await env.DB.prepare(`
      SELECT s.id AS seance_id, s.code_session, s.actif, s.classe_id, q.titre, q.data_json, c.nom AS classe_nom
      FROM seances s
      INNER JOIN qcm_banque q ON s.qcm_id = q.id
      INNER JOIN classes c ON s.classe_id = c.id
      WHERE s.code_session = ?
    `).bind(cleanCode).first();

    if (!seance) return new Response(JSON.stringify({ error: "Séance introuvable. Vérifiez le code." }), { status: 404 });
    if (!seance.actif) return new Response(JSON.stringify({ error: "Cette épreuve est actuellement clôturée par le professeur." }), { status: 403 });

    const eleve = await env.DB.prepare(
      "SELECT id, prenom FROM eleves WHERE code_eleve = ? AND classe_id = ?"
    ).bind(cleanCodeEleve, seance.classe_id).first();

    if (!eleve) return new Response(JSON.stringify({ error: "Code individuel élève non reconnu dans cette classe." }), { status: 403 });

    const questionsBrutes = JSON.parse(seance.data_json);

    return new Response(JSON.stringify({
      seance_id: seance.seance_id,
      code_session: seance.code_session,
      titre: seance.titre,
      classe_nom: seance.classe_nom,
      eleve_prenom: eleve.prenom,
      questions: preparerQuestions(questionsBrutes)
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
