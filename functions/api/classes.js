export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { nom_classe, prof_id, eleves } = body;

    if (!nom_classe || !prof_id || !eleves || eleves.length === 0) {
      return new Response(JSON.stringify({ error: "Données de classe incomplètes" }), { status: 400 });
    }

    // 1. Insertion de la classe
    const resClasse = await env.DB.prepare(
      "INSERT INTO classes (nom, prof_id) VALUES (?, ?)"
    ).bind(nom_classe.trim(), prof_id).run();

    const classeId = resClasse.meta.last_row_id;

    // 2. Insertion en lot des élèves
    const statements = eleves.map(el => {
      return env.DB.prepare(
        "INSERT INTO eleves (classe_id, prenom, date_naissance, code_eleve) VALUES (?, ?, ?, ?)"
      ).bind(classeId, el.prenom.trim(), el.date_naissance || "", el.code_eleve.trim().toUpperCase());
    });

    await env.DB.batch(statements);

    return new Response(JSON.stringify({ success: true, classe_id: classeId, total: eleves.length }), {
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
    const classe_id = url.searchParams.get("classe_id");

    // Détail des élèves d'une classe
    if (classe_id) {
      const { results } = await env.DB.prepare(
        "SELECT id, prenom, date_naissance, code_eleve FROM eleves WHERE classe_id = ? ORDER BY prenom ASC"
      ).bind(classe_id).all();
      return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
    }

    // Liste des classes d'un professeur
    if (prof_id) {
      const { results } = await env.DB.prepare(`
        SELECT c.id, c.nom, c.date_creation, COUNT(e.id) AS effectif
        FROM classes c
        LEFT JOIN eleves e ON c.id = e.classe_id
        WHERE c.prof_id = ?
        GROUP BY c.id
        ORDER BY c.nom ASC
      `).bind(prof_id).all();
      return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestDelete(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const classe_id = url.searchParams.get("classe_id");

    if (!classe_id) {
      return new Response(JSON.stringify({ error: "ID de classe requis" }), { status: 400 });
    }

    await env.DB.prepare("DELETE FROM eleves WHERE classe_id = ?").bind(classe_id).run();
    await env.DB.prepare("DELETE FROM classes WHERE id = ?").bind(classe_id).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
