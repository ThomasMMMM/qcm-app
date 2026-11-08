export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { eleve_id, type_evenement } = body;

    if (!eleve_id || !type_evenement) {
      return new Response(JSON.stringify({ error: "Champs requis manquants" }), { status: 400 });
    }

    // Enregistrement dans les deux tables potentielles pour compatibilité totale
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS sorties (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          eleve_id TEXT,
          type_evenement TEXT,
          horodatage DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      await env.DB.prepare("INSERT INTO sorties (eleve_id, type_evenement) VALUES (?, ?)").bind(eleve_id, type_evenement).run();
    } catch(e) {}

    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS evenements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          eleve_id TEXT,
          type_evenement TEXT,
          horodatage DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      await env.DB.prepare("INSERT INTO evenements (eleve_id, type_evenement) VALUES (?, ?)").bind(eleve_id, type_evenement).run();
    } catch(e) {}

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestDelete(context) {
  try {
    const { env } = context;

    // Suppression stricte dans les deux tables (sans bloc catch mutuel)
    try {
      await env.DB.prepare("DELETE FROM sorties").run();
    } catch (e) {}

    try {
      await env.DB.prepare("DELETE FROM evenements").run();
    } catch (e) {}

    return new Response(JSON.stringify({ success: true, message: "Journal des alertes purgé" }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
