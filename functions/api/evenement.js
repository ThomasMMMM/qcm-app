export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { eleve_id, type_evenement } = body;

    if (!eleve_id || !type_evenement) {
      return new Response(JSON.stringify({ error: "Champs manquants" }), { status: 400 });
    }

    // Enregistrement direct dans Cloudflare D1
    await env.DB.prepare(
      "INSERT INTO sorties_ecran (eleve_id, type_evenement) VALUES (?, ?)"
    ).bind(eleve_id, type_evenement).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
