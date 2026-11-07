export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { action, code_session, prof_id, qcm_id, classe_id, seance_id, actif } = body;

    // Basculer l'état (Actif / Fermé)
    if (action === "toggle_actif") {
      await env.DB.prepare("UPDATE seances SET actif = ? WHERE id = ?").bind(actif ? 1 : 0, seance_id).run();
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    // Création d'une nouvelle séance
    if (!code_session || !prof_id || !qcm_id || !classe_id) {
      return new Response(JSON.stringify({ error: "Données de séance incomplètes" }), { status: 400 });
    }

    const cleanCode = code_session.trim().toUpperCase();

    // Vérifier l'unicité du code de session
    const existe = await env.DB.prepare("SELECT id FROM seances WHERE code_session = ?").bind(cleanCode).first();
    if (existe) {
      return new Response(JSON.stringify({ error: "Ce code de séance est déjà utilisé. Choisissez-en un autre." }), { status: 400 });
    }

    const res = await env.DB.prepare(
      "INSERT INTO seances (code_session, prof_id, qcm_id, classe_id, actif) VALUES (?, ?, ?, ?, 1)"
    ).bind(cleanCode, prof_id, qcm_id, classe_id).run();

    return new Response(JSON.stringify({ success: true, seance_id: res.meta.last_row_id, code_session: cleanCode }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const prof_id = url.searchParams.get("prof_id");

    if (!prof_id) {
      return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } });
    }

    const { results } = await env.DB.prepare(`
      SELECT 
        s.id, s.code_session, s.actif, s.date_creation,
        q.titre AS qcm_titre,
        c.nom AS classe_nom, c.id AS classe_id,
        COUNT(r.id) AS nb_copies
      FROM seances s
      INNER JOIN qcm_banque q ON s.qcm_id = q.id
      INNER JOIN classes c ON s.classe_id = c.id
      LEFT JOIN resultats_qcm r ON s.id = r.seance_id
      WHERE s.prof_id = ?
      GROUP BY s.id
      ORDER BY s.date_creation DESC
    `).bind(prof_id).all();

    return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestDelete(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const seance_id = url.searchParams.get("seance_id");

    if (!seance_id) {
      return new Response(JSON.stringify({ error: "ID manquant" }), { status: 400 });
    }

    await env.DB.prepare("DELETE FROM seances WHERE id = ?").bind(seance_id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
