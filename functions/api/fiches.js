const COMPETENCES_PSE_DEFAUT = [
  { code: "C1", libelle: "Traiter l'information" },
  { code: "C2", libelle: "Appliquer une démarche d'analyse" },
  { code: "C3", libelle: "Expliquer un phénomène / enjeu en lien avec la prévention" },
  { code: "C4", libelle: "Proposer une solution pour résoudre un problème" },
  { code: "C5", libelle: "Argumenter un choix" }
];

function getCompetencesPourMatiere(row) {
  if (row && row.competences_json) {
    try {
      const parsed = JSON.parse(row.competences_json);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
  }
  return COMPETENCES_PSE_DEFAUT;
}

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
      try {
        await env.DB.prepare("ALTER TABLE fiches_synthese ADD COLUMN competence_code TEXT DEFAULT NULL").run();
      } catch (eCol) {}

      if (fiche_id) {
        const fiche = await env.DB.prepare(`
          SELECT f.*, m.nom AS matiere_nom 
          FROM fiches_synthese f
          LEFT JOIN matieres m ON f.matiere_id = m.id
          WHERE f.id = ?
        `).bind(fiche_id).first();
        return new Response(JSON.stringify(fiche || null), { headers: { "Content-Type": "application/json" } });
      }

      if (mode === "classe_matieres" && classe_id) {
        const { results: matieres } = await env.DB.prepare(`
          SELECT m.id, m.nom, m.competences_json,
                 CASE WHEN cm.classe_id IS NOT NULL THEN 1 ELSE 0 END as attribuee
          FROM matieres m
          LEFT JOIN classes_matieres cm ON m.id = cm.matiere_id AND cm.classe_id = ?
          WHERE m.prof_id = ?
          ORDER BY m.nom ASC
        `).bind(classe_id, prof_id).all();
        return new Response(JSON.stringify(matieres), { headers: { "Content-Type": "application/json" } });
      }

      if (mode === "matieres_only" && prof_id) {
        const { results: matieres } = await env.DB.prepare(
          "SELECT * FROM matieres WHERE prof_id = ? ORDER BY nom ASC"
        ).bind(prof_id).all();
        const enrichies = (matieres || []).map(m => ({
          ...m,
          competences: getCompetencesPourMatiere(m)
        }));
        return new Response(JSON.stringify(enrichies), { headers: { "Content-Type": "application/json" } });
      }

      if (mode === "eleve") {
        let query = `
          SELECT f.id, f.titre, f.competence_code, f.date_creation, m.nom AS matiere_nom, m.id AS matiere_id
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

      if (prof_id) {
        let query = `
          SELECT f.id, f.titre, f.matiere_id, f.competence_code, f.date_creation, m.nom AS matiere_nom
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

      if (type === "creer_matiere") {
        const { prof_id, nom } = body;
        if (!prof_id || !nom || !nom.trim()) {
          return new Response(JSON.stringify({ error: "Nom de matière requis" }), { status: 400 });
        }
        const compJson = JSON.stringify(COMPETENCES_PSE_DEFAUT);
        const insert = await env.DB.prepare(
          "INSERT INTO matieres (prof_id, nom, competences_json) VALUES (?, ?, ?)"
        ).bind(prof_id, nom.trim(), compJson).run();
        return new Response(JSON.stringify({ success: true, id: insert.meta.last_row_id }), { headers: { "Content-Type": "application/json" } });
      }

      if (type === "update_competences_matiere") {
        const { matiere_id, competences } = body;
        if (!matiere_id || !Array.isArray(competences)) {
          return new Response(JSON.stringify({ error: "Paramètres invalides" }), { status: 400 });
        }
        const cleanComps = competences
          .map(c => ({ code: String(c.code || "").trim().toUpperCase(), libelle: String(c.libelle || "").trim() }))
          .filter(c => c.code && c.libelle);

        await env.DB.prepare(
          "UPDATE matieres SET competences_json = ? WHERE id = ?"
        ).bind(JSON.stringify(cleanComps), parseInt(matiere_id, 10)).run();

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      }

      if (type === "creer_fiche") {
        const { prof_id, matiere_id, titre, contenu_html, competence_code } = body;
        if (!prof_id || !matiere_id || !titre || !contenu_html) {
          return new Response(JSON.stringify({ error: "Tous les champs sont requis." }), { status: 400 });
        }

        try {
          await env.DB.prepare("ALTER TABLE fiches_synthese ADD COLUMN competence_code TEXT DEFAULT NULL").run();
        } catch (eCol) {}

        const compClean = competence_code ? String(competence_code).trim().toUpperCase() : null;

        await env.DB.prepare(
          "INSERT INTO fiches_synthese (prof_id, matiere_id, titre, contenu_html, competence_code) VALUES (?, ?, ?, ?, ?)"
        ).bind(prof_id, parseInt(matiere_id), titre.trim(), contenu_html.trim(), compClean || null).run();

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      }

      if (type === "update_fiche_competence") {
        const { fiche_id, competence_code } = body;
        if (!fiche_id) {
          return new Response(JSON.stringify({ error: "fiche_id requis" }), { status: 400 });
        }
        try {
          await env.DB.prepare("ALTER TABLE fiches_synthese ADD COLUMN competence_code TEXT DEFAULT NULL").run();
        } catch (eCol) {}

        const compClean = competence_code ? String(competence_code).trim().toUpperCase() : null;
        await env.DB.prepare(
          "UPDATE fiches_synthese SET competence_code = ? WHERE id = ?"
        ).bind(compClean || null, parseInt(fiche_id, 10)).run();

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