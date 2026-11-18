export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const profId = url.searchParams.get("prof_id");

    if (!profId) {
      return new Response(JSON.stringify({ error: "prof_id requis" }), { status: 400 });
    }

    // 1. Classes accessibles par l'enseignant
    const { results: classes } = await env.DB.prepare(`
      SELECT DISTINCT c.id, c.nom, c.jour_cours, c.horaire_cours
      FROM classes c
      LEFT JOIN professeurs_classes pc ON c.id = pc.classe_id
      WHERE c.prof_id = ? OR pc.prof_id = ?
      ORDER BY c.nom ASC
    `).bind(profId, profId).all();

    // 2. Élèves par classe
    const { results: eleves } = await env.DB.prepare(`
      SELECT DISTINCT e.id, e.classe_id, e.nom, e.prenom, e.code_eleve, COALESCE(e.est_pap, 0) AS est_pap, e.ordre
      FROM eleves e
      INNER JOIN classes c ON e.classe_id = c.id
      LEFT JOIN professeurs_classes pc ON c.id = pc.classe_id
      WHERE c.prof_id = ? OR pc.prof_id = ?
      ORDER BY e.ordre ASC, e.nom ASC, e.prenom ASC
    `).bind(profId, profId).all();

    // 3. Séances chronologiques avec matière & compétence
    const { results: seances } = await env.DB.prepare(`
      SELECT s.id, s.code_session, s.qcm_id, s.classe_id, s.actif,
             s.date_seance, s.horaire_seance, s.date_creation,
             c.nom AS classe_nom,
             q.titre AS qcm_titre, q.competence_code,
             m.nom AS matiere_nom
      FROM seances s
      INNER JOIN classes c ON s.classe_id = c.id
      LEFT JOIN professeurs_classes pc ON c.id = pc.classe_id
      INNER JOIN qcm_banque q ON s.qcm_id = q.id
      LEFT JOIN matieres m ON q.matiere_id = m.id
      WHERE s.prof_id = ? OR c.prof_id = ? OR pc.prof_id = ?
      ORDER BY COALESCE(NULLIF(s.date_seance, ''), substr(s.date_creation, 1, 10)) ASC, s.id ASC
    `).bind(profId, profId, profId).all();

    // 4. Absences déclarées en direct (table absences_seances)
    let absencesDeclarees = [];
    try {
      const { results: absRows } = await env.DB.prepare(`
        SELECT a.seance_id, a.eleve_id
        FROM absences_seances a
        INNER JOIN seances s ON a.seance_id = s.id
        INNER JOIN classes c ON s.classe_id = c.id
        LEFT JOIN professeurs_classes pc ON c.id = pc.classe_id
        WHERE s.prof_id = ? OR c.prof_id = ? OR pc.prof_id = ?
      `).bind(profId, profId, profId).all();
      absencesDeclarees = absRows || [];
    } catch (e) {
      absencesDeclarees = [];
    }

    // 5. Copies / résultats de toutes les séances de l'enseignant
    const { results: copies } = await env.DB.prepare(`
      SELECT r.id, r.seance_id, r.session_code, r.nom, r.prenom,
             r.note, r.total, r.note_proportionnelle, r.questions_traitees, r.questions_totales,
             r.date_soumission
      FROM resultats_qcm r
      INNER JOIN seances s ON (r.seance_id = s.id OR r.session_code = s.code_session)
      INNER JOIN classes c ON s.classe_id = c.id
      LEFT JOIN professeurs_classes pc ON c.id = pc.classe_id
      WHERE s.prof_id = ? OR c.prof_id = ? OR pc.prof_id = ?
    `).bind(profId, profId, profId).all();

    return new Response(JSON.stringify({
      success: true,
      classes: classes || [],
      eleves: eleves || [],
      seances: seances || [],
      absences: absencesDeclarees,
      copies: copies || []
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