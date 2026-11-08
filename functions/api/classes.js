export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const prof_id = url.searchParams.get("prof_id");

    let query = "SELECT * FROM classes";
    const params = [];
    if (prof_id) {
      query += " WHERE prof_id = ? OR prof_id IS NULL";
      params.push(prof_id);
    }
    query += " ORDER BY nom ASC";

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
    const { action, id, nom, prof_id, jour_cours, horaire_cours } = body;

    // Mise à jour du créneau d'une classe existante
    if (action === "update_creneau" && id) {
      await env.DB.prepare(
        "UPDATE classes SET jour_cours = ?, horaire_cours = ? WHERE id = ?"
      ).bind(jour_cours || "Lundi", horaire_cours || "08h-09h", id).run();

      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    // Création normale
    if (!nom) {
      return new Response(JSON.stringify({ error: "Nom de classe requis" }), { status: 400 });
    }

    const j = jour_cours || "Lundi";
    const h = horaire_cours || "08h-09h";

    const res = await env.DB.prepare(
      "INSERT INTO classes (nom, prof_id, jour_cours, horaire_cours) VALUES (?, ?, ?, ?)"
    ).bind(nom.trim(), prof_id || null, j, h).run();

    return new Response(JSON.stringify({ success: true, id: res.meta.last_row_id }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
