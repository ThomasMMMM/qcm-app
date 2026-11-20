async function ensureColonneFicheBanque(db) {
  try {
    await db.prepare("ALTER TABLE qcm_banque ADD COLUMN fiche_id INTEGER DEFAULT NULL").run();
  } catch (e) {}
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const prof_id = url.searchParams.get("prof_id");
    const qcm_id = url.searchParams.get("qcm_id");

    await ensureColonneFicheBanque(env.DB);

    if (qcm_id) {
      const qcm = await env.DB.prepare(
        "SELECT id, titre, data_json, document_html, date_creation, matiere_id, competence_code, fiche_id FROM qcm_banque WHERE id = ?"
      ).bind(qcm_id).first();
      return new Response(JSON.stringify(qcm), { headers: { "Content-Type": "application/json" } });
    }

    let query = `
      SELECT q.id, q.titre, q.document_html, q.date_creation, q.matiere_id, q.competence_code, q.fiche_id,
             m.nom AS matiere_nom, fs.titre AS fiche_titre
      FROM qcm_banque q
      LEFT JOIN matieres m ON q.matiere_id = m.id
      LEFT JOIN fiches_synthese fs ON q.fiche_id = fs.id
    `;
    const params = [];
    if (prof_id) {
      query += " WHERE q.prof_id = ? OR q.prof_id IS NULL";
      params.push(prof_id);
    }
    query += " ORDER BY q.date_creation DESC";

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store, no-cache" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();

    await ensureColonneFicheBanque(env.DB);

    // Mise à jour rapide de la matière / compétence d'un QCM existant
    if (body.action === "update_competence") {
      const { qcm_id, matiere_id, competence_code } = body;
      if (!qcm_id) {
        return new Response(JSON.stringify({ error: "qcm_id requis" }), { status: 400 });
      }
      await env.DB.prepare(
        "UPDATE qcm_banque SET matiere_id = ?, competence_code = ? WHERE id = ?"
      ).bind(
        matiere_id ? parseInt(matiere_id, 10) : null,
        competence_code ? String(competence_code).trim().toUpperCase() : null,
        parseInt(qcm_id, 10)
      ).run();
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    // Modification directe du titre d'un QCM existant
    if (body.action === "update_titre") {
      const { qcm_id, titre } = body;
      const nouveauTitre = String(titre || "").trim();
      if (!qcm_id || !nouveauTitre) {
        return new Response(JSON.stringify({ error: "qcm_id et titre requis" }), { status: 400 });
      }
      const qid = parseInt(qcm_id, 10);
      await env.DB.prepare("UPDATE qcm_banque SET titre = ? WHERE id = ?").bind(nouveauTitre, qid).run();
      try {
        await env.DB.prepare("UPDATE resultats_qcm SET qcm_titre = ? WHERE seance_id IN (SELECT id FROM seances WHERE qcm_id = ?)").bind(nouveauTitre, qid).run();
      } catch (e) {}
      return new Response(JSON.stringify({ success: true, titre: nouveauTitre }), { headers: { "Content-Type": "application/json" } });
    }

    // Modification complète d'un QCM (titre, document_html, questions)
    if (body.action === "update_qcm") {
      const { qcm_id, titre, document_html, questions } = body;
      const nouveauTitre = String(titre || "").trim();
      if (!qcm_id || !nouveauTitre) {
        return new Response(JSON.stringify({ error: "qcm_id et titre requis" }), { status: 400 });
      }
      const qid = parseInt(qcm_id, 10);
      const docHtml = (document_html !== undefined && document_html !== null && String(document_html).trim() !== "")
        ? String(document_html).trim()
        : null;

      if (Array.isArray(questions) && questions.length > 0) {
        await env.DB.prepare(
          "UPDATE qcm_banque SET titre = ?, document_html = ?, data_json = ? WHERE id = ?"
        ).bind(nouveauTitre, docHtml, JSON.stringify(questions), qid).run();
      } else {
        await env.DB.prepare(
          "UPDATE qcm_banque SET titre = ?, document_html = ? WHERE id = ?"
        ).bind(nouveauTitre, docHtml, qid).run();
      }

      try {
        await env.DB.prepare("UPDATE resultats_qcm SET qcm_titre = ? WHERE seance_id IN (SELECT id FROM seances WHERE qcm_id = ?)").bind(nouveauTitre, qid).run();
      } catch (e) {}

      return new Response(JSON.stringify({ success: true, titre: nouveauTitre }), { headers: { "Content-Type": "application/json" } });
    }

    // Liaison / modification directe de la Fiche Synthèse associée à un QCM existant
    if (body.action === "update_fiche_liee") {
      const { qcm_id, fiche_id } = body;
      if (!qcm_id) {
        return new Response(JSON.stringify({ error: "qcm_id requis" }), { status: 400 });
      }
      const fid = fiche_id ? parseInt(fiche_id, 10) : null;
      await env.DB.prepare("UPDATE qcm_banque SET fiche_id = ? WHERE id = ?").bind(fid, parseInt(qcm_id, 10)).run();
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    const { titre, questions, prof_id, document_html, matiere_id, competence_code, fiche_id } = body;

    if (!titre || !Array.isArray(questions) || questions.length === 0) {
      return new Response(JSON.stringify({ error: "Titre et questions requis" }), { status: 400 });
    }

    const dataJson = JSON.stringify(questions);
    const docHtml = (document_html || "").trim() || null;
    const matId = matiere_id ? parseInt(matiere_id, 10) : null;
    const compCode = competence_code ? String(competence_code).trim().toUpperCase() : null;
    const fId = fiche_id ? parseInt(fiche_id, 10) : null;

    const res = await env.DB.prepare(`
      INSERT INTO qcm_banque (titre, data_json, document_html, prof_id, matiere_id, competence_code, fiche_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(titre, dataJson, docHtml, prof_id || null, matId, compCode, fId).run();

    return new Response(JSON.stringify({ success: true, id: res.meta.last_row_id }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestDelete(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const qcm_id = url.searchParams.get("qcm_id");

    if (!qcm_id) {
      return new Response(JSON.stringify({ error: "Identifiant QCM requis" }), { status: 400 });
    }

    const qid = parseInt(qcm_id, 10);

    // Nettoyage des dépendances (séances, suivi direct, résultats, cahier de texte) pour éviter le blocage FOREIGN KEY
    try {
      await env.DB.prepare("DELETE FROM suivi_direct WHERE seance_id IN (SELECT id FROM seances WHERE qcm_id = ?)").bind(qid).run();
    } catch (e) {}
    try {
      await env.DB.prepare("DELETE FROM absences_seances WHERE seance_id IN (SELECT id FROM seances WHERE qcm_id = ?)").bind(qid).run();
    } catch (e) {}
    try {
      await env.DB.prepare("DELETE FROM resultats_qcm WHERE seance_id IN (SELECT id FROM seances WHERE qcm_id = ?)").bind(qid).run();
    } catch (e) {}
    try {
      await env.DB.prepare("DELETE FROM resultats_qcm WHERE qcm_id = ?").bind(qid).run();
    } catch (e) {}
    try {
      await env.DB.prepare("UPDATE cahier_texte SET qcm_id = NULL WHERE qcm_id = ?").bind(qid).run();
    } catch (e) {}
    try {
      await env.DB.prepare("DELETE FROM seances WHERE qcm_id = ?").bind(qid).run();
    } catch (e) {}

    await env.DB.prepare("DELETE FROM qcm_banque WHERE id = ?").bind(qid).run();
    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}