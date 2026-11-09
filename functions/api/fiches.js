export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;

  try {
    // ==================== GET ====================
    if (method === "GET") {
      const prof_id = url.searchParams.get("prof_id");
      const matiere_id = url.searchParams.get("matiere_id");
      const fiche_id = url.searchParams.get("fiche_id");
      const classe_id = url.searchParams.get("classe_id");
      const mode = url.searchParams.get("mode");

      // 1. Consultation d'une fiche précise (liseuse)
      if (fiche_id) {
        const fiche = await env.DB.prepare(`
          SELECT f.*, m.nom AS matiere_nom 
          FROM fiches_synthese f
          LEFT JOIN matieres m ON f.matiere_id = m.id
          WHERE f.id = ?
        `).bind(fiche_id).first();
        return new Response(JSON.stringify(fiche || null), { headers: { "Content-Type": "application/json" } });
      }

      // 2. Matières assignées à une classe spécifique
      if (mode === "classe_matieres" && classe_id) {
        const { results: matieres } = await env.DB.prepare(`
          SELECT m.id, m.nom, 
                 CASE WHEN cm.classe_id IS NOT NULL THEN 1 ELSE 0 END as attribuee
          FROM matieres m
          LEFT JOIN classes_matieres cm ON m.id = cm.matiere_id AND cm.classe_id = ?
          WHERE m.prof_id = ?
          ORDER BY m.nom ASC
        `).bind(classe_id, prof_id).all();
        return new Response(JSON.stringify(matieres), { headers: { "Content-Type": "application/json" } });
      }

      // 3. Liste des matières seules d'un prof
      if (mode === "matieres_only" && prof_id) {
        const { results: matieres } = await env.DB.prepare(
          "SELECT * FROM matieres WHERE prof_id = ? ORDER BY nom ASC"
        ).bind(prof_id).all();
        return new Response(JSON.stringify(matieres), { headers: { "Content-Type": "application/json" } });
      }

      // 4. Consultation Espace Élève : Uniquement les fiches des matières assignées à sa classe
      if (mode === "eleve") {
        let query = `
          SELECT f.id, f.titre, f.date_creation, m.nom AS matiere_nom, m.id AS matiere_id
          FROM fiches_synthese f
          INNER JOIN matieres m ON f.matiere_id = m.id
        `;
        const params = [];

        if (classe_id) {
          query += `
            INNER JOIN classes_matieres cm ON m.id = cm.matiere_id
            WHERE cm.classe_id = ?
          `;
          params.push(classe_id);
        }

        query += " ORDER BY m.nom ASC, f.titre ASC";
        const { results: fiches } = await env.DB.prepare(query).bind(...params).all();
        return new Response(JSON.stringify(fiches), { headers: { "Content-Type": "application/json" } });
      }

      // 5. Consultation Professeur par défaut (toutes ses fiches)
      if (prof_id) {
        let query = `
          SELECT f.id, f.titre, f.matiere_id, f.date_creation, m.nom AS matiere_nom
          FROM fiches_synthese f
          INNER JOIN matieres m ON f.matiere_id = m.id
          WHERE f.prof_id = ?
        `;
        const params = [prof_id];
        if (matiere_id) {
          query += " AND f.matiere_id = ?";
          params.push(matiere_id);
        }
        query += " ORDER BY m.nom ASC, f.titre ASC";

        const { results: fiches } = await env.DB.prepare(query).bind(...params).all();
        return new Response(JSON.stringify(fiches), { headers: { "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } });
    }

    // ==================== POST ====================
    if (method === "POST") {
      const body = await request.json();
      const { type } = body;

      // Association d'une matière à une classe (Case à cocher)
      if (type === "toggle_classe_matiere") {
        const { classe_id, matiere_id, active } = body;
        if (!classe_id || !matiere_id) {
          return new Response(JSON.stringify({ error: "Identifiants requis" }), { status: 400 });
        }

        if (active) {
          await env.DB.prepare(
            "INSERT OR IGNORE INTO classes_matieres (classe_id, matiere_id) VALUES (?, ?)"
          ).bind(classe_id, matiere_id).run();
        } else {
          await env.DB.prepare(
            "DELETE FROM classes_matieres WHERE classe_id = ? AND matiere_id = ?"
          ).bind(classe_id, matiere_id).run();
        }
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      }

      // Création d'une matière
      if (type === "creer_matiere") {
        const { prof_id, nom } = body;
        if (!prof_id || !nom || !nom.trim()) {
          return new Response(JSON.stringify({ error: "Nom de matière requis" }), { status: 400 });
        }
        const insert = await env.DB.prepare(
          "INSERT INTO matieres (prof_id, nom) VALUES (?, ?)"
        ).bind(prof_id, nom.trim()).run();
        return new Response(JSON.stringify({ success: true, id: insert.meta.last_row_id }), { headers: { "Content-Type": "application/json" } });
      }

      // Création / Import d'une fiche de synthèse
      if (type === "creer_fiche") {
        const { prof_id, matiere_id, titre, contenu_html } = body;
        if (!prof_id || !matiere_id || !titre || !contenu_html) {
          return new Response(JSON.stringify({ error: "Tous les champs sont requis." }), { status: 400 });
        }

        await env.DB.prepare(
          "INSERT INTO fiches_synthese (prof_id, matiere_id, titre, contenu_html) VALUES (?, ?, ?, ?)"
        ).bind(prof_id, parseInt(matiere_id), titre.trim(), contenu_html.trim()).run();

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      }
    }

    // ==================== DELETE ====================
    if (method === "DELETE") {
      const type = url.searchParams.get("type");
      const id = url.searchParams.get("id");

      if (type === "matiere" && id) {
        await env.DB.prepare("DELETE FROM classes_matieres WHERE matiere_id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM fiches_synthese WHERE matiere_id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM matieres WHERE id = ?").bind(id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      }

      if (type === "fiche" && id) {
        await env.DB.prepare("DELETE FROM fiches_synthese WHERE id = ?").bind(id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({ error: "Requête non supportée" }), { status: 405 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
