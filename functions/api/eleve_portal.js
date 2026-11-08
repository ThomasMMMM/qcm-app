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

    // 1. Authentification de l'élève
    const eleve = await env.DB.prepare(`
      SELECT e.id, e.prenom, e.date_naissance, e.code_eleve, e.classe_id, c.nom AS classe_nom
      FROM eleves e
      INNER JOIN classes c ON e.classe_id = c.id
      WHERE e.code_eleve = ?
    `).bind(cleanCode).first();

    if (!eleve) {
      return new Response(JSON.stringify({ error: "Identifiants incorrects (code inconnu)" }), { status: 403 });
    }

    if (!eleve.prenom.toLowerCase().startsWith(cleanPrenom.split(" ")[0])) {
      return new Response(JSON.stringify({ error: "Le prénom ne correspond pas au code fourni" }), { status: 403 });
    }

    if (eleve.date_naissance && date_naissance) {
      const dbDate = eleve.date_naissance.replace(/[\/\-\.]/g, "");
      const inputDate = date_naissance.trim().replace(/[\/\-\.]/g, "");
      if (dbDate !== inputDate) {
        return new Response(JSON.stringify({ error: "Date de naissance incorrecte" }), { status: 403 });
      }
    }

    // 2. Séances actives pour sa classe
    const { results: seancesDispo } = await env.DB.prepare(`
      SELECT s.id AS seance_id, s.code_session, s.actif, s.date_creation, q.titre, q.id AS qcm_id
      FROM seances s
      INNER JOIN qcm_banque q ON s.qcm_id = q.id
      WHERE s.classe_id = ? AND s.actif = 1
      ORDER BY s.date_creation DESC
    `).bind(eleve.classe_id).all();

    // 3. Historique des notes avec récupération directe du titre du QCM (même pour les copies passées)
    const { results: notesPassees } = await env.DB.prepare(`
      SELECT r.id, r.seance_id, r.session_code, 
             COALESCE(q.titre, r.qcm_titre, 'Évaluation ' || r.session_code) AS qcm_titre,
             r.note, r.total, r.date_soumission
      FROM resultats_qcm r
      LEFT JOIN seances s ON r.seance_id = s.id
      LEFT JOIN qcm_banque q ON s.qcm_id = q.id
      WHERE (r.prenom LIKE ? OR r.nom = ?)
      ORDER BY r.date_soumission DESC
    `).bind(`%${eleve.code_eleve}%`, eleve.prenom).all();

    const seancesFaitesIds = new Set(notesPassees.map(n => n.seance_id).filter(id => id !== null));
    const aFaire = seancesDispo.filter(s => !seancesFaitesIds.has(s.seance_id));

    return new Response(JSON.stringify({
      eleve: {
        id: eleve.id,
        prenom: eleve.prenom,
        classe_nom: eleve.classe_nom,
        code_eleve: eleve.code_eleve
      },
      a_faire: aFaire,
      historique: notesPassees
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
