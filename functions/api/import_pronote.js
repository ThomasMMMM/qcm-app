export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { classe_nom, prof_id, eleves, jour_cours, horaire_cours } = body;

    if (!classe_nom || !Array.isArray(eleves) || eleves.length === 0) {
      return new Response(JSON.stringify({ error: "Nom de classe et liste d'élèves requis" }), { status: 400 });
    }

    const cleanNomClasse = classe_nom.trim();
    const j = jour_cours || "Lundi";
    const h = horaire_cours || "10h-11h";

    // 1. Trouver ou créer la classe avec son jour et son créneau
    let classe = await env.DB.prepare(
      "SELECT id FROM classes WHERE nom = ?"
    ).bind(cleanNomClasse).first();

    let classeId;
    if (!classe) {
      const resClasse = await env.DB.prepare(
        "INSERT INTO classes (nom, prof_id, jour_cours, horaire_cours) VALUES (?, ?, ?, ?)"
      ).bind(cleanNomClasse, prof_id || null, j, h).run();
      classeId = resClasse.meta.last_row_id;
    } else {
      classeId = classe.id;
      // Mise à jour du créneau si la classe existait déjà
      await env.DB.prepare(
        "UPDATE classes SET jour_cours = ?, horaire_cours = ? WHERE id = ?"
      ).bind(j, h, classeId).run();
    }

    // 2. Insérer ou mettre à jour les élèves
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    function genererCode() {
      let code = "";
      for (let i = 0; i < 4; i++) {
        code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      }
      return code;
    }

    let nbAjoutes = 0;
    for (const e of eleves) {
      const nom = (e.nom || "").trim();
      const prenom = (e.prenom || "").trim();
      const ddn = (e.date_naissance || "").trim();

      if (!nom || !prenom) continue;

      const exist = await env.DB.prepare(
        "SELECT id FROM eleves WHERE classe_id = ? AND nom = ? AND prenom = ?"
      ).bind(classeId, nom, prenom).first();

      if (!exist) {
        let codeUnique = false;
        let code = "";
        while (!codeUnique) {
          code = genererCode();
          const checkCode = await env.DB.prepare(
            "SELECT id FROM eleves WHERE classe_id = ? AND code_eleve = ?"
          ).bind(classeId, code).first();
          if (!checkCode) codeUnique = true;
        }

        await env.DB.prepare(
          "INSERT INTO eleves (classe_id, nom, prenom, date_naissance, code_eleve) VALUES (?, ?, ?, ?, ?)"
        ).bind(classeId, nom, prenom, ddn || null, code).run();

        nbAjoutes++;
      } else if (ddn) {
        await env.DB.prepare(
          "UPDATE eleves SET date_naissance = ? WHERE id = ?"
        ).bind(ddn, exist.id).run();
      }
    }

    return new Response(JSON.stringify({
      success: true,
      classe_id: classeId,
      nb_eleves: nbAjoutes
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
