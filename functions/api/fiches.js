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

async function ensureSchemaFiches(db) {
  try {
    await db.prepare("ALTER TABLE fiches_synthese ADD COLUMN competence_code TEXT DEFAULT NULL").run();
  } catch (e) {}
  try {
    await db.prepare("ALTER TABLE fiches_synthese ADD COLUMN ciblage_classes INTEGER DEFAULT 0").run();
  } catch (e) {}
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS fiches_classes (
      fiche_id INTEGER NOT NULL,
      classe_id INTEGER NOT NULL,
      PRIMARY KEY (fiche_id, classe_id)
    )
  `).run();
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;

  try {
    await ensureSchemaFiches(env.DB);

    // ==================== GET ====================
    if (method === "GET") {
      const prof_id = url.searchParams.get("prof_id");
      const matiere_id = url.searchParams.get("matiere_id");
      const fiche_id = url.searchParams.get("fiche_id");
      const classe_id = url.searchParams.get("classe_id");
      const mode = url.searchParams.get("mode");

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

        const { results: liaisonsCm } = await env.DB.prepare(`
          SELECT cm.matiere_id, cm.classe_id
          FROM classes_matieres cm
          INNER JOIN matieres m ON cm.matiere_id = m.id
          WHERE m.prof_id = ?
        `).bind(prof_id).all();

        const mapClassesParMat = new Map();
        (liaisonsCm || []).forEach(l => {
          const mid = Number(l.matiere_id);
          if (!mapClassesParMat.has(mid)) mapClassesParMat.set(mid, []);
          mapClassesParMat.get(mid).push(Number(l.classe_id));
        });

        const enrichies = (matieres || []).map(m => ({
          ...m,
          competences: getCompetencesPourMatiere(m),
          classe_ids: mapClassesParMat.get(Number(m.id)) || []
        }));
        return new Response(JSON.stringify(enrichies), { headers: { "Content-Type": "application/json" } });
      }

      if (mode === "eleve") {
        if (classe_id) {
          const { results: fiches } = await env.DB.prepare(`
            SELECT DISTINCT f.id, f.titre, f.competence_code, f.date_creation, m.nom AS matiere_nom, m.id AS matiere_id
            FROM fiches_synthese f
            INNER JOIN matieres m ON f.matiere_id = m.id
            LEFT JOIN classes_matieres cm ON m.id = cm.matiere_id AND cm.classe_id = ?
            LEFT JOIN fiches_classes fc ON f.id = fc.fiche_id AND fc.classe_id = ?
            WHERE (COALESCE(f.ciblage_classes, 0) = 0 AND cm.classe_id IS NOT NULL)
               OR (COALESCE(f.ciblage_classes, 0) = 1 AND fc.classe_id IS NOT NULL)
            ORDER BY m.nom ASC, f.titre ASC
          `).bind(classe_id, classe_id).all();
          return new Response(JSON.stringify(fiches || []), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store, no-cache" } });
        }

        const { results: fiches } = await env.DB.prepare(`
          SELECT f.id, f.titre, f.competence_code, f.date_creation, m.nom AS matiere_nom, m.id AS matiere_id
          FROM fiches_synthese f
          INNER JOIN matieres m ON f.matiere_id = m.id
          ORDER BY m.nom ASC, f.titre ASC
        `).all();
        return new Response(JSON.stringify(fiches || []), { headers: { "Content-Type": "application/json" } });
      }

      if (prof_id) {
        let query = `
          SELECT f.id, f.titre, f.matiere_id, f.competence_code, COALESCE(f.ciblage_classes, 0) AS ciblage_classes,
                 f.date_creation, m.nom AS matiere_nom
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

        const { results: fcRows } = await env.DB.prepare(`
          SELECT fc.fiche_id, fc.classe_id
          FROM fiches_classes fc
          INNER JOIN fiches_synthese f ON fc.fiche_id = f.id
          WHERE f.prof_id = ?
        `).bind(prof_id).all();

        const mapFc = new Map();
        (fcRows || []).forEach(r => {
          const fid = Number(r.fiche_id);
          if (!mapFc.has(fid)) mapFc.set(fid, []);
          mapFc.get(fid).push(Number(r.classe_id));
        });

        const { results: cmAllRows } = await env.DB.prepare(`
          SELECT cm.matiere_id, cm.classe_id
          FROM classes_matieres cm
          INNER JOIN classes c ON cm.classe_id = c.id
          LEFT JOIN professeurs_classes pc ON c.id = pc.classe_id
          WHERE c.prof_id = ? OR pc.prof_id = ?
        `).bind(prof_id, prof_id).all();

        const mapCm = new Map();
        (cmAllRows || []).forEach(r => {
          const mid = Number(r.matiere_id);
          if (!mapCm.has(mid)) mapCm.set(mid, []);
          const cid = Number(r.classe_id);
          if (!mapCm.get(mid).includes(cid)) mapCm.get(mid).push(cid);
        });

        const fichesEnrichies = (fiches || []).map(f => {
          const estCible = Number(f.ciblage_classes) === 1;
          const ids = estCible ? (mapFc.get(Number(f.id)) || []) : (mapCm.get(Number(f.matiere_id)) || []);
          return {
            ...f,
            classe_ids: ids
          };
        });

        return new Response(JSON.stringify(fichesEnrichies), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store, no-cache" } });
      }

      return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } });
    }

    // ==================== POST ====================
    if (method === "POST") {
      const body = await request.json();
      const actionType = String(body.type || body.action || "").trim();

      if (actionType === "toggle_classe_matiere") {
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

      if (actionType === "creer_matiere") {
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

      if (actionType === "update_competences_matiere") {
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

      if (actionType === "creer_fiche") {
        const { prof_id, matiere_id, titre, contenu_html, competence_code, classe_ids } = body;
        if (!prof_id || !matiere_id || !titre || !contenu_html) {
          return new Response(JSON.stringify({ error: "Tous les champs sont requis." }), { status: 400 });
        }

        const compClean = competence_code ? String(competence_code).trim().toUpperCase() : null;
        const hasCiblage = Array.isArray(classe_ids);

        const ins = await env.DB.prepare(
          "INSERT INTO fiches_synthese (prof_id, matiere_id, titre, contenu_html, competence_code, ciblage_classes) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(prof_id, parseInt(matiere_id), titre.trim(), contenu_html.trim(), compClean || null, hasCiblage ? 1 : 0).run();

        const newFicheId = ins.meta.last_row_id;
        if (hasCiblage && newFicheId) {
          for (const cid of classe_ids) {
            await env.DB.prepare(
              "INSERT OR IGNORE INTO fiches_classes (fiche_id, classe_id) VALUES (?, ?)"
            ).bind(newFicheId, parseInt(cid, 10)).run();
          }
        }

        return new Response(JSON.stringify({ success: true, id: newFicheId }), { headers: { "Content-Type": "application/json" } });
      }

      if (actionType === "toggle_fiche_classe") {
        const { fiche_id, classe_id, active } = body;
        if (!fiche_id || !classe_id) {
          return new Response(JSON.stringify({ error: "fiche_id et classe_id requis" }), { status: 400 });
        }
        const fid = parseInt(fiche_id, 10);
        const cid = parseInt(classe_id, 10);

        const fiche = await env.DB.prepare(
          "SELECT matiere_id, COALESCE(ciblage_classes, 0) AS ciblage_classes FROM fiches_synthese WHERE id = ?"
        ).bind(fid).first();

        if (!fiche) {
          return new Response(JSON.stringify({ error: "Fiche introuvable" }), { status: 404 });
        }

        if (Number(fiche.ciblage_classes) === 0) {
          const { results: cmRows } = await env.DB.prepare(
            "SELECT DISTINCT classe_id FROM classes_matieres WHERE matiere_id = ?"
          ).bind(fiche.matiere_id).all();
          for (const r of (cmRows || [])) {
            await env.DB.prepare(
              "INSERT OR IGNORE INTO fiches_classes (fiche_id, classe_id) VALUES (?, ?)"
            ).bind(fid, Number(r.classe_id)).run();
          }
          await env.DB.prepare("UPDATE fiches_synthese SET ciblage_classes = 1 WHERE id = ?").bind(fid).run();
        }

        if (active) {
          await env.DB.prepare("INSERT OR IGNORE INTO fiches_classes (fiche_id, classe_id) VALUES (?, ?)").bind(fid, cid).run();
        } else {
          await env.DB.prepare("DELETE FROM fiches_classes WHERE fiche_id = ? AND classe_id = ?").bind(fid, cid).run();
        }

        const { results: updated } = await env.DB.prepare(
          "SELECT classe_id FROM fiches_classes WHERE fiche_id = ?"
        ).bind(fid).all();

        return new Response(JSON.stringify({
          success: true,
          ciblage_classes: 1,
          classe_ids: (updated || []).map(r => Number(r.classe_id))
        }), { headers: { "Content-Type": "application/json" } });
      }

      if (actionType === "modifier_fiche") {
        const { fiche_id, matiere_id, titre, contenu_html, competence_code, classe_ids } = body;
        if (!fiche_id || !matiere_id || !titre || !contenu_html) {
          return new Response(JSON.stringify({ error: "Tous les champs obligatoires sont requis." }), { status: 400 });
        }

        const fid = parseInt(fiche_id, 10);
        const compClean = competence_code ? String(competence_code).trim().toUpperCase() : null;
        const hasCiblage = Array.isArray(classe_ids);

        await env.DB.prepare(
          "UPDATE fiches_synthese SET matiere_id = ?, titre = ?, contenu_html = ?, competence_code = ?, ciblage_classes = 1 WHERE id = ?"
        ).bind(parseInt(matiere_id, 10), titre.trim(), contenu_html.trim(), compClean || null, fid).run();

        if (hasCiblage) {
          await env.DB.prepare("DELETE FROM fiches_classes WHERE fiche_id = ?").bind(fid).run();
          for (const cid of classe_ids) {
            await env.DB.prepare(
              "INSERT OR IGNORE INTO fiches_classes (fiche_id, classe_id) VALUES (?, ?)"
            ).bind(fid, parseInt(cid, 10)).run();
          }
        }

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      }

      if (actionType === "update_fiche_competence") {
        const { fiche_id, competence_code } = body;
        if (!fiche_id) {
          return new Response(JSON.stringify({ error: "fiche_id requis" }), { status: 400 });
        }

        const compClean = competence_code ? String(competence_code).trim().toUpperCase() : null;
        await env.DB.prepare(
          "UPDATE fiches_synthese SET competence_code = ? WHERE id = ?"
        ).bind(compClean || null, parseInt(fiche_id, 10)).run();

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ error: `Action POST inconnue : "${actionType}"` }), { status: 400 });
    }

    // ==================== DELETE ====================
    if (method === "DELETE") {
      const type = url.searchParams.get("type");
      const id = url.searchParams.get("id");

      if (type === "matiere" && id) {
        await env.DB.prepare("DELETE FROM fiches_classes WHERE fiche_id IN (SELECT id FROM fiches_synthese WHERE matiere_id = ?)").bind(id).run();
        await env.DB.prepare("DELETE FROM classes_matieres WHERE matiere_id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM fiches_synthese WHERE matiere_id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM matieres WHERE id = ?").bind(id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      }

      if (type === "fiche" && id) {
        await env.DB.prepare("DELETE FROM fiches_classes WHERE fiche_id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM fiches_synthese WHERE id = ?").bind(id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({ error: `Méthode ${method} non supportée` }), { status: 405 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}