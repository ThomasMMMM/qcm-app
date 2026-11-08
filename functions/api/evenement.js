export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { eleve_id, type_evenement } = body;

    if (!eleve_id || !type_evenement) {
      return new Response(JSON.stringify({ error: "Champs requis manquants" }), { status: 400 });
    }

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS sorties_ecran (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        eleve_id TEXT,
        type_evenement TEXT,
        horodatage DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(
      "INSERT INTO sorties_ecran (eleve_id, type_evenement) VALUES (?, ?)"
    ).bind(eleve_id, type_evenement).run();

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestDelete(context) {
  try {
    const { env } = context;

    await env.DB.prepare("DELETE FROM sorties_ecran").run();

    return new Response(JSON.stringify({ success: true, message: "Journal des alertes purgé avec succès" }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
