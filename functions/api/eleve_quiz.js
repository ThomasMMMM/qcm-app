export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const code_eleve = url.searchParams.get("code_eleve");

    if (!code || !code_eleve) {
      return new Response(JSON.stringify({ error: "Code d'épreuve et code élève requis" }), { status: 400 });
    }

    const cleanCode = code.toUpperCase().trim();
    const cleanCodeEleve = code_eleve.toUpperCase().trim();

    // Trouver la séance active
    const seance = await env.DB.prepare(`
      SELECT s.id AS seance_id, s.code_session, s.actif, s.classe_id, q.titre, q.data_json, c.nom AS classe_nom
      FROM seances s
      INNER JOIN qcm_banque q ON s.qcm_id = q.id
      INNER JOIN classes c ON s.classe_id = c.id
      WHERE s.code_session = ?
    `).bind(cleanCode).first();

    if (!seance) {
      return new Response(JSON.stringify({ error: "Séance introuvable. Vérifiez le code." }), { status: 404 });
    }

    if (!seance.actif) {
      return new Response(JSON.stringify({ error: "Cette épreuve est actuellement clôturée par le professeur." }), { status: 403 });
    }

    // Vérifier que l'élève appartient bien à la classe de cette séance
    const eleve = await env.DB.prepare(
      "SELECT id, prenom FROM eleves WHERE code_eleve = ? AND classe_id = ?"
    ).bind(cleanCodeEleve, seance.classe_id).first();

    if (!eleve) {
      return new Response(JSON.stringify({ error: "Code personnel élève inconnu ou n'appartenant pas à la classe de cette épreuve." }), { status: 403 });
    }

    return new Response(JSON.stringify({
      seance_id: seance.seance_id,
      code_session: seance.code_session,
      titre: seance.titre,
      classe_nom: seance.classe_nom,
      eleve_prenom: eleve.prenom,
      questions: JSON.parse(seance.data_json)
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
