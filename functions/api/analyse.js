export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const profId = url.searchParams.get("prof_id");

    if (!profId) {
      return new Response(JSON.stringify({ error: "prof_id requis" }), { status: 400 });
    }

    // 1. Classes accessibles par l'enseignant (propriétaire ou partagées)
    const { results: classes } = await env.DB.prepare(`
      SELECT DISTINCT c.id, c.nom
      FROM classes c
      LEFT JOIN professeurs_classes pc ON c.id = pc.classe_id
      WHERE c.prof_id = ? OR pc.prof_id = ?
      ORDER BY c.nom ASC
    `).bind(profId, profId).all();

    // 2. Matières de l'enseignant
    const { results: matieres } = await env.DB.prepare(`
      SELECT id, nom
      FROM matieres
      WHERE prof_id = ?
      ORDER BY nom ASC
    `).bind(profId).all();

    // 3. Copies soumises sur les séances de l'enseignant (ou classes partagées)
    const { results: copiesBrutes } = await env.DB.prepare(`
      SELECT r.id, r.nom, r.prenom, r.classe, r.qcm_titre,
             r.note, r.total, r.note_proportionnelle, r.questions_traitees, r.questions_totales,
             r.nb_sorties, r.duree_sorties, r.date_soumission,
             s.id AS seance_id, s.code_session, s.classe_id,
             c.nom AS classe_nom_officiel,
             q.id AS qcm_id, q.matiere_id, q.competence_code,
             m.nom AS matiere_nom
      FROM resultats_qcm r
      INNER JOIN seances s ON (r.seance_id = s.id OR r.session_code = s.code_session)
      INNER JOIN classes c ON s.classe_id = c.id
      LEFT JOIN professeurs_classes pc ON c.id = pc.classe_id
      INNER JOIN qcm_banque q ON s.qcm_id = q.id
      LEFT JOIN matieres m ON q.matiere_id = m.id
      WHERE s.prof_id = ? OR c.prof_id = ? OR pc.prof_id = ?
      ORDER BY r.date_soumission DESC
    `).bind(profId, profId, profId).all();

    // Déduplication éventuelle si jointure multiple
    const dejaVus = new Set();
    const copies = [];
    for (const row of (copiesBrutes || [])) {
      if (dejaVus.has(row.id)) continue;
      dejaVus.add(row.id);

      const estIncomplet = (
        row.note_proportionnelle !== null &&
        row.note_proportionnelle !== undefined &&
        row.questions_traitees !== null &&
        row.questions_totales !== null &&
        Number(row.questions_traitees) < Number(row.questions_totales)
      );

      const noteBrute = Number(row.note || 0);
      const noteRetenue = estIncomplet ? Number(row.note_proportionnelle) : noteBrute;

      copies.push({
        id: row.id,
        eleve_nom: row.nom || "",
        eleve_prenom: row.prenom || "",
        classe_id: row.classe_id,
        classe_nom: row.classe_nom_officiel || row.classe || "Sans classe",
        matiere_id: row.matiere_id || 0,
        matiere_nom: row.matiere_nom || "Non classée",
        seance_id: row.seance_id,
        code_session: row.code_session || "",
        qcm_titre: row.qcm_titre || "",
        competence_code: row.competence_code || "",
        note_brute: Number(noteBrute.toFixed(2)),
        note_retenue: Number(noteRetenue.toFixed(2)),
        est_incomplet: estIncomplet,
        questions_traitees: row.questions_traitees,
        questions_totales: row.questions_totales,
        date_soumission: row.date_soumission
      });
    }

    return new Response(JSON.stringify({
      success: true,
      classes: classes || [],
      matieres: matieres || [],
      copies
    }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}