export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { titre, questions, prof_id } = body;

    if (!titre || !questions || !prof_id) {
      return new Response(JSON.stringify({ error: "Données incomplètes" }), { status: 400 });
    }

    const jsonStr = JSON.stringify(questions);
    const res = await env.DB.prepare(
      "INSERT INTO qcm_banque (prof_id, titre, data_json) VALUES (?, ?, ?)"
    ).bind(prof_id, titre.trim(), jsonStr).run();

    return new Response(JSON.stringify({ success: true, qcm_id: res.meta.last_row_id }), {
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

    const { results } = await env.DB.prepare(
      "SELECT id, titre, date_creation FROM qcm_banque WHERE prof_id = ? ORDER BY date_creation DESC"
    ).bind(prof_id).all();

    return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestDelete(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const qcm_id = url.searchParams.get("qcm_id");
    const prof_id = url.searchParams.get("prof_id");

    if (!qcm_id || !prof_id) {
      return new Response(JSON.stringify({ error: "Paramètres manquants" }), { status: 400 });
    }

    await env.DB.prepare("DELETE FROM qcm_banque WHERE id = ? AND prof_id = ?").bind(qcm_id, prof_id).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
