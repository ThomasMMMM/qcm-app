export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const prof_id = url.searchParams.get("prof_id");
    const classe_id = url.searchParams.get("classe_id");

    // Si on demande la liste des élèves d'une classe (pour PDF ou export)
    if (classe_id) {
      const { results } = await env.DB.prepare(
        "SELECT id, prenom, date_naissance, code_eleve FROM eleves WHERE classe_id = ? ORDER BY prenom ASC"
      ).bind(classe_id).all();
      return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
    }

    // Sinon, liste des classes avec l'effectif calculé
    let query = `
      SELECT c.*, 
             (SELECT COUNT(*) FROM eleves e WHERE e.classe_id = c.id) AS effectif
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

    const nomFinal = (body.nom || body.classe_nom || body.nom_classe || body.classe || body.name || "").trim();
    if (!nomFinal) {
      return new Response(JSON.stringify({ error: "Nom de classe requis" }), { status: 400 });
    }

    const j = body.jour_cours || "Lundi";
    const h = body.horaire_cours || "10h-11h";
    const profId = body.prof_id || null;

    // 1. Créer ou mettre à jour la classe
    let exist = await env.DB.prepare("SELECT id FROM classes WHERE nom = ?").bind(nomFinal).first();
    let classeId;

    if (!exist) {
      // Génération code partage court (ex: CLS-4A2K)
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

    // 2. Insérer les élèves transmis s'il y en a
    if (Array.isArray(body.eleves) && body.eleves.length > 0) {
      const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      function genCode() {
        let c = "";
        for (let i = 0; i < 4; i++) c += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        return c;
      }

      for (const el of body.eleves) {
        const p = (el.prenom || "").trim();
        const d = (el.date_naissance || "").trim();
        const codePerso = (el.code_eleve || genCode()).trim().toUpperCase();
        if (!p) continue;

        const eleveExist = await env.DB.prepare(
          "SELECT id FROM eleves WHERE classe_id = ? AND prenom = ?"
        ).bind(classeId, p).first();

        if (!eleveExist) {
          await env.DB.prepare(
            "INSERT INTO eleves (classe_id, prenom, date_naissance, code_eleve) VALUES (?, ?, ?, ?)"
          ).bind(classeId, p, d || null, codePerso).run();
        } else if (d) {
          await env.DB.prepare(
            "UPDATE eleves SET date_naissance = ? WHERE id = ?"
          ).bind(d, eleveExist.id).run();
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

// 3. GESTIONNAIRE DE SUPPRESSION DE CLASSE
export async function onRequestDelete(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const classe_id = url.searchParams.get("classe_id");

    if (!classe_id) {
      return new Response(JSON.stringify({ error: "Identifiant de classe requis" }), { status: 400 });
    }

    // Supprimer les élèves de cette classe
    await env.DB.prepare("DELETE FROM eleves WHERE classe_id = ?").bind(classe_id).run();

    // Supprimer les séances associées
    await env.DB.prepare("DELETE FROM seances WHERE classe_id = ?").bind(classe_id).run();

    // Supprimer la classe
    await env.DB.prepare("DELETE FROM classes WHERE id = ?").bind(classe_id).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
