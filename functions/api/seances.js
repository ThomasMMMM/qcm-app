export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const prof_id = url.searchParams.get("prof_id");

    if (!prof_id) {
      return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } });
    }

    const query = `
      SELECT s.*, c.nom AS classe_nom, c.jour_cours, c.horaire_cours, q.titre AS qcm_titre,
             (SELECT COUNT(*) FROM resultats_qcm r WHERE r.seance_id = s.id) AS nb_copies
      FROM seances s
      INNER JOIN classes c ON s.classe_id = c.id
      INNER JOIN qcm_banque q ON s.qcm_id = q.id
      WHERE s.prof_id = ?
      ORDER BY s.date_seance DESC, s.date_creation DESC
    `;

    const { results } = await env.DB.prepare(query).bind(prof_id).all();
    return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { prof_id, qcm_id, classe_id, code_session, date_seance, horaire_seance } = body;

    if (!prof_id || !qcm_id || !classe_id || !code_session) {
      return new Response(JSON.stringify({ error: "Tous les champs sont requis" }), { status: 400 });
    }

    const cleanCode = code_session.trim().toUpperCase();

    const exist = await env.DB.prepare(
      "SELECT id FROM seances WHERE code_session = ? AND actif = 1"
    ).bind(cleanCode).first();

    if (exist) {
      return new Response(JSON.stringify({ error: "Ce code de séance est déjà actif." }), { status: 400 });
    }

    const res = await env.DB.prepare(`
      INSERT INTO seances (prof_id, qcm_id, classe_id, code_session, actif, date_seance, horaire_seance)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).bind(prof_id, qcm_id, classe_id, cleanCode, date_seance || null, horaire_seance || null).run();

    return new Response(JSON.stringify({ success: true, id: res.meta.last_row_id }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
