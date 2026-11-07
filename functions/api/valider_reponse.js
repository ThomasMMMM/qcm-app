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
    } else if (qcm_id) {
      const qcm = await env.DB.prepare("SELECT data_json FROM qcm_banque WHERE id = ?").bind(qcm_id).first();
      if (qcm) dataJson = qcm.data_json;
    }

    if (!dataJson) {
      return new Response(JSON.stringify({ error: "Source du QCM introuvable" }), { status: 404 });
    }

    const questions = JSON.parse(dataJson);
    const q = questions[question_index];
    if (!q) {
      return new Response(JSON.stringify({ error: "Index de question invalide" }), { status: 400 });
    }

    let scoreQuestion = 0;
    const explications = [];
    const bonnesReponses = [];

    if (q.type === "multichoice") {
      const coches = Array.isArray(reponse_utilisateur) ? reponse_utilisateur : [];
      let fracTotale = 0;

      q.answers.forEach((ans, idx) => {
        if (ans.fraction > 0) {
          bonnesReponses.push(idx);
        }
        if (coches.includes(idx)) {
          fracTotale += ans.fraction;
          if (ans.feedback) {
            explications.push(`<strong>${ans.text} :</strong> ${ans.feedback}`);
          }
        }
      });

      scoreQuestion = q.points * (Math.max(0, fracTotale) / 100);

      return new Response(JSON.stringify({
        score: scoreQuestion,
        points_max: q.points,
        bonnes_reponses: bonnesReponses,
        generalFeedback: q.generalFeedback || "",
        explications: explications
      }), { headers: { "Content-Type": "application/json" } });

    } else if (q.type === "matching") {
      // reponse_utilisateur est un tableau des réponses données pour chaque subquestion
      const utilisateurRep = Array.isArray(reponse_utilisateur) ? reponse_utilisateur : [];
      let corrects = 0;
      const correspondances = [];

      q.subquestions.forEach((sub, idx) => {
        const repDonnee = utilisateurRep[idx] || "";
        const estCorrect = repDonnee === sub.answer;
        if (estCorrect) corrects++;
        correspondances.push({
          index: idx,
          estCorrect: estCorrect,
          bonneReponse: sub.answer
        });
      });

      scoreQuestion = q.points * (corrects / q.subquestions.length);

      return new Response(JSON.stringify({
        score: scoreQuestion,
        points_max: q.points,
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
