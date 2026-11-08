export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { seance_id, qcm_id, question_index, reponse_utilisateur } = body;

    let dataJson = null;

    if (seance_id) {
      const seance = await env.DB.prepare(`
        SELECT q.data_json FROM seances s
        INNER JOIN qcm_banque q ON s.qcm_id = q.id
        WHERE s.id = ?
      `).bind(seance_id).first();
      if (seance) dataJson = seance.data_json;
    } 
    
    if (!dataJson && qcm_id) {
      const qcm = await env.DB.prepare("SELECT data_json FROM qcm_banque WHERE id = ?").bind(qcm_id).first();
      if (qcm) dataJson = qcm.data_json;
    }

    if (!dataJson) {
      return new Response(JSON.stringify({ error: "Source du questionnaire introuvable" }), { status: 404 });
    }

    const questions = JSON.parse(dataJson);
    const q = questions[question_index];
    if (!q) {
      return new Response(JSON.stringify({ error: "Question introuvable" }), { status: 400 });
    }

    const pointsMax = Number(q.points) > 0 ? Number(q.points) : 1;
    let scoreQuestion = 0;
    const explications = [];
    const bonnesReponses = [];

    if (q.type === "multichoice") {
      const coches = Array.isArray(reponse_utilisateur) ? reponse_utilisateur : [];
      let fracTotale = 0;

      if (Array.isArray(q.answers)) {
        q.answers.forEach((ans, idx) => {
          const fraction = Number(ans.fraction) || 0;
          if (fraction > 0) {
            bonnesReponses.push(idx);
          }
          if (coches.includes(idx)) {
            fracTotale += fraction;
            if (ans.feedback) {
              explications.push(`<strong>${ans.text} :</strong> ${ans.feedback}`);
            }
          }
        });
      }

      scoreQuestion = pointsMax * (Math.max(0, fracTotale) / 100);

      return new Response(JSON.stringify({
        score: Number(scoreQuestion.toFixed(2)),
        points_max: pointsMax,
        bonnes_reponses: bonnesReponses,
        generalFeedback: q.generalFeedback || "",
        explications: explications
      }), { headers: { "Content-Type": "application/json" } });

    } else if (q.type === "matching") {
      const utilisateurRep = Array.isArray(reponse_utilisateur) ? reponse_utilisateur : [];
      let corrects = 0;
      const correspondances = [];
      const totalSub = (q.subquestions && q.subquestions.length) ? q.subquestions.length : 1;

      if (Array.isArray(q.subquestions)) {
        q.subquestions.forEach((sub, idx) => {
          const repDonnee = utilisateurRep[idx] || "";
          const estCorrect = (repDonnee === sub.answer);
          if (estCorrect) corrects++;
          correspondances.push({
            index: idx,
            estCorrect: estCorrect,
            bonneReponse: sub.answer
          });
        });
      }

      scoreQuestion = pointsMax * (corrects / totalSub);

      return new Response(JSON.stringify({
        score: Number(scoreQuestion.toFixed(2)),
        points_max: pointsMax,
        matching_resultats: correspondances,
        generalFeedback: q.generalFeedback || "",
        explications: explications
      }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Type de question non pris en charge" }), { status: 400 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
