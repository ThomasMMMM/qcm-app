export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const code = url.searchParams.get("code");

    if (!code) {
      return new Response(JSON.stringify({ error: "Code requis" }), { status: 400 });
    }

    const session = await env.DB.prepare(
      "SELECT code, titre, data_json FROM quiz_sessions WHERE code = ? AND actif = 1"
    ).bind(code.toUpperCase().trim()).first();

    if (!session) {
      return new Response(JSON.stringify({ error: "QCM introuvable ou inactif" }), { status: 404 });
    }

    return new Response(JSON.stringify({
      code: session.code,
      titre: session.titre,
      questions: JSON.parse(session.data_json)
    }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
