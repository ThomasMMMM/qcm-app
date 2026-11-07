export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { code, titre, questions } = body;

    if (!code || !questions || questions.length === 0) {
      return new Response(JSON.stringify({ error: "Données de QCM invalides" }), { status: 400 });
    }

    const jsonStr = JSON.stringify(questions);
    await env.DB.prepare(
      "INSERT OR REPLACE INTO quiz_sessions (code, titre, data_json) VALUES (?, ?, ?)"
    ).bind(code.toUpperCase().trim(), titre || "QCM Pronote", jsonStr).run();

    return new Response(JSON.stringify({ success: true, code: code.toUpperCase().trim() }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestGet(context) {
  try {
    const { env } = context;
    const { results } = await env.DB.prepare(
      "SELECT code, titre, date_creation, actif FROM quiz_sessions ORDER BY date_creation DESC"
    ).all();
    return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
