export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const prof_id = url.searchParams.get("prof_id");
    const seance_id = url.searchParams.get("seance_id");
    const classe_id = url.searchParams.get("classe_id");

    if (!prof_id) {
      return new Response(JSON.stringify({ notes: [], sorties: [] }), { headers: { "Content-Type": "application/json" } });
    }

    let queryNotes = `
      SELECT r.id, r.nom, r.prenom, r.classe, r.qcm_titre, r.note, r.total, r.session_code, r.seance_id, r.date_soumission, r.nb_sorties,
             s.code_session, c.nom AS classe_nom, q.titre AS qcm_nom
      FROM resultats_qcm r
      LEFT JOIN seances s ON r.seance_id = s.id
      LEFT JOIN classes c ON s.classe_id = c.id
      LEFT JOIN qcm_banque q ON s.qcm_id = q.id
      WHERE (s.prof_id = ? OR r.session_code IN (SELECT code_session FROM seances WHERE prof_id = ?))
    `;
    const paramsNotes = [prof_id, prof_id];

    if (seance_id) {
      queryNotes += " AND r.seance_id = ?";
      paramsNotes.push(seance_id);
    }
    if (classe_id) {
      queryNotes += " AND s.classe_id = ?";
      paramsNotes.push(classe_id);
    }

    queryNotes += " ORDER BY r.date_soumission DESC LIMIT 200";

    const { results: notes } = await env.DB.prepare(queryNotes).bind(...paramsNotes).all();

    const { results: sorties } = await env.DB.prepare(
      "SELECT * FROM sorties_ecran ORDER BY horodatage DESC LIMIT 100"
    ).all();

    return new Response(JSON.stringify({ notes, sorties }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
