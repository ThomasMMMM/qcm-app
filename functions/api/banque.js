export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const prof_id = url.searchParams.get("prof_id");
    const qcm_id = url.searchParams.get("qcm_id");

    if (qcm_id) {
      const qcm = await env.DB.prepare(
        "SELECT id, titre, data_json, document_html, date_creation FROM qcm_banque WHERE id = ?"
      ).bind(qcm_id).first();
      return new Response(JSON.stringify(qcm), { headers: { "Content-Type": "application/json" } });
    }

    let query = "SELECT id, titre, document_html, date_creation FROM qcm_banque";
    const params = [];
    if (prof_id) {
      query += " WHERE prof_id = ? OR prof_id IS NULL";
      params.push(prof_id);
    }
    query += " ORDER BY date_creation DESC";

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { titre, questions, prof_id, document_html } = body;

    if (!titre || !Array.isArray(questions) || questions.length === 0) {
      return new Response(JSON.stringify({ error: "Titre et questions requis" }), { status: 400 });
    }

    const dataJson = JSON.stringify(questions);
    const docHtml = (document_html || "").trim() || null;

    const res = await env.DB.prepare(`
      INSERT INTO qcm_banque (titre, data_json, document_html, prof_id)
      VALUES (?, ?, ?, ?)
    `).bind(titre, dataJson, docHtml, prof_id || null).run();

    return new Response(JSON.stringify({ success: true, id: res.meta.last_row_id }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestDelete(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const qcm_id = url.searchParams.get("qcm_id");

    if (!qcm_id) {
      return new Response(JSON.stringify({ error: "Identifiant QCM requis" }), { status: 400 });
    }

    await env.DB.prepare("DELETE FROM qcm_banque WHERE id = ?").bind(qcm_id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
