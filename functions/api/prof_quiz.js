export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { code, titre, questions, prof_id } = body;

    if (!code || !questions || !prof_id) {
      return new Response(JSON.stringify({ error: "Données de QCM incomplètes ou enseignant non identifié" }), { status: 400 });
    }

    const cleanCode = code.toUpperCase().trim();
    const jsonStr = JSON.stringify(questions);

    await env.DB.prepare(
      "INSERT OR REPLACE INTO quiz_sessions (code, titre, data_json, prof_id) VALUES (?, ?, ?, ?)"
    ).bind(cleanCode, titre || "QCM Pronote", jsonStr, prof_id).run();

    return new Response(JSON.stringify({ success: true, code: cleanCode }), {
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
      "SELECT code, titre, date_creation, actif FROM quiz_sessions WHERE prof_id = ? ORDER BY date_creation DESC"
    ).bind(prof_id).all();

    return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
