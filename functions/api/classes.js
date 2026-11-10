export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const prof_id = url.searchParams.get("prof_id");
    const classe_id = url.searchParams.get("classe_id");

    // 1. Liste des élèves d'une classe : TRI PAR L'ORDRE DU CSV PRONOTE (Ordre alphabétique du Nom)
    if (classe_id) {
      const { results } = await env.DB.prepare(
        "SELECT id, nom, prenom, date_naissance, code_eleve, COALESCE(est_pap, 0) AS est_pap, COALESCE(ordre, id) AS ordre FROM eleves WHERE classe_id = ? ORDER BY COALESCE(ordre, id) ASC"
      ).bind(classe_id).all();
      return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
    }

    // 2. Liste des classes avec effectifs
    let query = `
      SELECT c.*, 
             (SELECT COUNT(*) FROM eleves e WHERE e.classe_id = c.id) AS effectif,
             (SELECT COUNT(*) FROM eleves e WHERE e.classe_id = c.id AND e.est_pap = 1) AS nb_pap
      FROM classes c
    `;
    const params = [];
    if (prof_id) {
      query += " WHERE c.prof_id = ? OR c.prof_id IS NULL";
      params.push(prof_id);
    }
    query += " ORDER BY c.nom ASC";

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

    // Modification du statut PAP
    if (body.action === "toggle_pap" && body.eleve_id !== undefined) {
      await env.DB.prepare(
        "UPDATE eleves SET est_pap = ? WHERE id = ?"
      ).bind(body.est_pap ? 1 : 0, body.eleve_id).run();
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    // Création / Importation d'une classe
    const nomFinal = (body.nom || body.classe_nom || body.nom_classe || body.classe || body.name || "").trim();
    if (!nomFinal) {
      return new Response(JSON.stringify({ error: "Nom de classe requis" }), { status: 400 });
    }

    const j = body.jour_cours || "Lundi";
    const h = body.horaire_cours || "10h-11h";
    const profId = body.prof_id || null;

    let exist = await env.DB.prepare("SELECT id FROM classes WHERE nom = ?").bind(nomFinal).first();
    let classeId;

    if (!exist) {
      const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      let codePartage = "CLS-";
      for (let i = 0; i < 4; i++) codePartage += alphabet.charAt(Math.floor(Math.random() * alphabet.length));

      const res = await env.DB.prepare(
        "INSERT INTO classes (nom, prof_id, jour_cours, horaire_cours, code_partage) VALUES (?, ?, ?, ?, ?)"
      ).bind(nomFinal, profId, j, h, codePartage).run();
      classeId = res.meta.last_row_id;
    } else {
      classeId = exist.id;
      await env.DB.prepare(
        "UPDATE classes SET jour_cours = ?, horaire_cours = ? WHERE id = ?"
      ).bind(j, h, classeId).run();
    }

    // Enregistrement des élèves avec préservation de leur index d'ordre d'origine
    if (Array.isArray(body.eleves) && body.eleves.length > 0) {
      const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      function genCode() {
        let c = "";
        for (let i = 0; i < 4; i++) c += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        return c;
      }

      for (let idx = 0; idx < body.eleves.length; idx++) {
        const el = body.eleves[idx];
        const n = (el.nom || "").trim().toUpperCase();
        const p = (el.prenom || "").trim();
        const d = (el.date_naissance || "").trim();
        const codePerso = (el.code_eleve || genCode()).trim().toUpperCase();
        const estPap = el.est_pap ? 1 : 0;
        const numOrdre = (el.ordre !== undefined && el.ordre !== null) ? el.ordre : (idx + 1);
        if (!p) continue;

        const eleveExist = await env.DB.prepare(
          n 
            ? "SELECT id FROM eleves WHERE classe_id = ? AND nom = ? AND prenom = ?"
            : "SELECT id FROM eleves WHERE classe_id = ? AND prenom = ?"
        ).bind(...(n ? [classeId, n, p] : [classeId, p])).first();

        if (!eleveExist) {
          await env.DB.prepare(
            "INSERT INTO eleves (classe_id, nom, prenom, date_naissance, code_eleve, est_pap, ordre) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).bind(classeId, n || null, p, d || null, codePerso, estPap, numOrdre).run();
        } else {
          await env.DB.prepare(
            "UPDATE eleves SET nom = COALESCE(?, nom), date_naissance = COALESCE(?, date_naissance), est_pap = ?, ordre = ? WHERE id = ?"
          ).bind(n || null, d || null, estPap, numOrdre, eleveExist.id).run();
        }
      }
    }

    return new Response(JSON.stringify({ success: true, id: classeId }), {
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
    const classe_id = url.searchParams.get("classe_id");

    if (!classe_id) {
      return new Response(JSON.stringify({ error: "Identifiant de classe requis" }), { status: 400 });
    }

    await env.DB.prepare("DELETE FROM eleves WHERE classe_id = ?").bind(classe_id).run();
    await env.DB.prepare("DELETE FROM seances WHERE classe_id = ?").bind(classe_id).run();
    await env.DB.prepare("DELETE FROM classes WHERE id = ?").bind(classe_id).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
