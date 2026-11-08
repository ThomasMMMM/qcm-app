export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { prenom, date_naissance, code_eleve } = body;

    if (!prenom || !code_eleve) {
      return new Response(JSON.stringify({ error: "Prénom et code individuel requis" }), { status: 400 });
    }

    const cleanPrenom = prenom.trim().toLowerCase();
    const cleanCode = code_eleve.trim().toUpperCase();
    const cleanDate = (date_naissance || "").trim();

    // 1. Recherche de l'élève
    let queryEleve = `
      SELECT e.id, e.prenom, e.date_naissance, e.code_eleve, e.classe_id, COALESCE(e.est_pap, 0) AS est_pap, c.nom AS classe_nom
      FROM eleves e
      INNER JOIN classes c ON e.classe_id = c.id
      WHERE UPPER(e.code_eleve) = ? AND LOWER(e.prenom) LIKE ?
    `;
    const params = [cleanCode, `%${cleanPrenom}%`];

    const eleve = await env.DB.prepare(queryEleve).bind(...params).first();

    if (!eleve) {
      return new Response(JSON.stringify({ error: "Identifiants incorrects. Vérifiez votre prénom et votre code." }), { status: 404 });
    }

    // Vérification de la date de naissance si elle est renseignée en base
    if (eleve.date_naissance && cleanDate) {
      // Normalisation des dates (ex: JJ/MM/AAAA ou AAAA-MM-JJ)
      const dDb = eleve.date_naissance.replace(/[-/]/g, "");
      const dSaisie = cleanDate.replace(/[-/]/g, "");
      // Si format AAAA-MM-JJ vs JJ-MM-AAAA
      const revSaisie = cleanDate.split("-").reverse().join("");
      if (!dDb.includes(dSaisie) && !dDb.includes(revSaisie)) {
        return new Response(JSON.stringify({ error: "La date de naissance ne correspond pas." }), { status: 403 });
      }
    }

    // 2. QCM passés par cet élève
    const notes = await env.DB.prepare(`
      SELECT n.id, n.seance_id, n.note, n.total, n.date_soumission, s.code_session, q.titre AS qcm_titre
      FROM notes n
      INNER JOIN seances s ON n.seance_id = s.id
      INNER JOIN qcm_banque q ON s.qcm_id = q.id
      WHERE s.classe_id = ? AND (n.nom = ? OR n.prenom LIKE ?)
      ORDER BY n.date_soumission DESC
    `).bind(eleve.classe_id, eleve.prenom, `%${cleanCode}%`).all();

    const seanceIdsPassees = (notes.results || []).map(n => n.seance_id);

    // 3. QCM disponibles à faire pour sa classe (séances actives non encore passées)
    const seancesActives = await env.DB.prepare(`
      SELECT s.id AS seance_id, s.code_session, s.date_seance, s.horaire_seance, q.titre AS qcm_titre
      FROM seances s
      INNER JOIN qcm_banque q ON s.qcm_id = q.id
      WHERE s.classe_id = ? AND s.actif = 1
      ORDER BY s.date_creation DESC
    `).bind(eleve.classe_id).all();

    const aFaire = (seancesActives.results || []).filter(s => !seanceIdsPassees.includes(s.seance_id));

    return new Response(JSON.stringify({
      success: true,
      eleve: {
        id: eleve.id,
        prenom: eleve.prenom,
        classe_id: eleve.classe_id,
        classe_nom: eleve.classe_nom,
        code_eleve: eleve.code_eleve,
        est_pap: eleve.est_pap === 1
      },
      a_faire: aFaire,
      passes: notes.results || []
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
