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

    // Récupération souple du nom de classe
    const nomFinal = (body.nom || body.classe_nom || body.nom_classe || body.classe || body.name || "").trim();

    if (!nomFinal) {
      return new Response(JSON.stringify({ error: "Nom de classe requis" }), { status: 400 });
    }

    const j = body.jour_cours || "Lundi";
    const h = body.horaire_cours || "10h-11h";
    const profId = body.prof_id || null;

    // Mise à jour si la classe existe déjà
    let exist = await env.DB.prepare("SELECT id FROM classes WHERE nom = ?").bind(nomFinal).first();
    let classeId;

    if (!exist) {
      const res = await env.DB.prepare(
        "INSERT INTO classes (nom, prof_id, jour_cours, horaire_cours) VALUES (?, ?, ?, ?)"
      ).bind(nomFinal, profId, j, h).run();
      classeId = res.meta.last_row_id;
    } else {
      classeId = exist.id;
      await env.DB.prepare(
        "UPDATE classes SET jour_cours = ?, horaire_cours = ? WHERE id = ?"
      ).bind(j, h, classeId).run();
    }

    return new Response(JSON.stringify({ success: true, id: classeId }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
