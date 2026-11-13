export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const prof_id = url.searchParams.get("prof_id");
    const seance_id = url.searchParams.get("seance_id");
    const classe_id = url.searchParams.get("classe_id");
    const export_pronote = url.searchParams.get("export_pronote");

    const jsonHeaders = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache"
    };

    if (!prof_id) {
      return new Response(JSON.stringify({ notes: [], sorties: [] }), { headers: jsonHeaders });
    }

    // CAS EXPORT PRONOTE : Rapprochement de tous les élèves de la classe avec les notes
    if (export_pronote && seance_id) {
      const seance = await env.DB.prepare(`
        SELECT s.id, s.code_session, s.classe_id, c.nom AS classe_nom, q.titre AS qcm_titre
        FROM seances s
        INNER JOIN classes c ON s.classe_id = c.id
        INNER JOIN qcm_banque q ON s.qcm_id = q.id
        WHERE s.id = ? AND s.prof_id = ?
      `).bind(seance_id, prof_id).first();

      if (!seance) {
        return new Response(JSON.stringify({ error: "Séance introuvable" }), { status: 404, headers: jsonHeaders });
      }

      const { results: eleves } = await env.DB.prepare(
        "SELECT id, nom, prenom, date_naissance, code_eleve FROM eleves WHERE classe_id = ? ORDER BY COALESCE(ordre, id) ASC"
      ).bind(seance.classe_id).all();

      const { results: copies } = await env.DB.prepare(
        "SELECT id, nom, prenom, note, total, nb_sorties, date_soumission, COALESCE(exporte_pronote, 0) AS exporte_pronote FROM resultats_qcm WHERE seance_id = ?"
      ).bind(seance_id).all();

      const grillePronote = eleves.map(e => {
        const copie = copies.find(c => (c.prenom && c.prenom.includes(e.code_eleve)) || c.nom === e.prenom);
        return {
          id: e.id,
          copie_id: copie ? copie.id : null,
          nom: e.nom || "",
          prenom: e.prenom,
          date_naissance: e.date_naissance || "",
          code_eleve: e.code_eleve,
          note: copie ? copie.note : null,
          total: copie ? copie.total : 20,
          nb_sorties: copie ? copie.nb_sorties : 0,
          exporte_pronote: copie ? copie.exporte_pronote : 0,
          statut: copie ? "Présent" : "Absent"
        };
      });

      return new Response(JSON.stringify({
        seance_code: seance.code_session,
        classe_nom: seance.classe_nom,
        qcm_titre: seance.qcm_titre,
        eleves: grillePronote
      }), { headers: jsonHeaders });
    }

    // LISTING CLASSIQUE DES COPIES
    let queryNotes = `
      SELECT r.id, r.nom, r.prenom, r.classe, r.qcm_titre, r.note, r.total, r.session_code, r.seance_id, r.date_soumission,
             r.nb_sorties, COALESCE(r.duree_sorties, 0) AS duree_sorties, r.questions_traitees, r.questions_totales,
             r.note_proportionnelle, COALESCE(r.exporte_pronote, 0) AS exporte_pronote,
             s.code_session, c.nom AS classe_nom, q.titre AS qcm_nom
      FROM resultats_qcm r
      LEFT JOIN seances s ON r.seance_id = s.id
      LEFT JOIN classes c ON s.classe_id = c.id
      LEFT JOIN qcm_banque q ON s.qcm_id = q.id
      WHERE (s.prof_id = ? OR r.session_code IN (SELECT code_session FROM seances WHERE prof_id = ?))
    `;
    const paramsNotes = [prof_id, prof_id];

    if (seance_id) {
      queryNotes += " AND r.seance_id = ?";
      paramsNotes.push(seance_id);
    }
    if (classe_id) {
      queryNotes += " AND s.classe_id = ?";
      paramsNotes.push(classe_id);
    }

    queryNotes += " ORDER BY r.date_soumission DESC LIMIT 200";

    const { results: notes } = await env.DB.prepare(queryNotes).bind(...paramsNotes).all();

    const { results: sorties } = await env.DB.prepare(
      "SELECT * FROM sorties_ecran ORDER BY horodatage DESC LIMIT 100"
    ).all();

    return new Response(JSON.stringify({ notes, sorties }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();

    if (body.action === "marquer_export_pronote") {
      const ids = Array.isArray(body.copie_ids)
        ? body.copie_ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id))
        : [];
      const valeur = body.exporte ? 1 : 0;

      if (ids.length > 0) {
        const placeholders = ids.map(() => "?").join(",");
        await env.DB.prepare(`UPDATE resultats_qcm SET exporte_pronote = ? WHERE id IN (${placeholders})`)
          .bind(valeur, ...ids)
          .run();
      }

      return new Response(JSON.stringify({ ok: true, count: ids.length, exporte: valeur }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Action non reconnue" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}