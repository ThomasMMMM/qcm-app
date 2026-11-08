export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { nom, prenom, session_code, seance_id, nb_sorties, note, total } = body;

    let qcmTitre = null;
    let classeNom = null;

    if (seance_id) {
      const info = await env.DB.prepare(`
        SELECT q.titre, c.nom AS classe_nom
        FROM seances s
        INNER JOIN qcm_banque q ON s.qcm_id = q.id
        INNER JOIN classes c ON s.classe_id = c.id
        WHERE s.id = ?
      `).bind(seance_id).first();

      if (info) {
        qcmTitre = info.titre;
        classeNom = info.classe_nom;
      }
    }

    await env.DB.prepare(`
      INSERT INTO resultats_qcm (nom, prenom, session_code, seance_id, classe, qcm_titre, nb_sorties, note, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      nom || "Élève",
      prenom || "",
      session_code || "",
      seance_id || null,
      classeNom || null,
      qcmTitre || "Évaluation",
      nb_sorties || 0,
      note !== undefined ? note : 0,
      total || 20
    ).run();

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
