export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const ficheId = url.searchParams.get("fiche_id");
    const qcmId = url.searchParams.get("qcm_id");

    // 1. Chargement direct d'une fiche de synthèse
    if (ficheId) {
      const fiche = await env.DB.prepare(`
        SELECT f.id, f.titre, f.contenu_html AS html, m.nom AS matiere_nom
        FROM fiches_synthese f
        LEFT JOIN matieres m ON f.matiere_id = m.id
        WHERE f.id = ?
      `).bind(ficheId).first();

      if (!fiche) {
        return new Response(JSON.stringify({ error: "Fiche introuvable" }), { status: 404 });
      }
      return new Response(JSON.stringify({ type: "fiche", ...fiche }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
      });
    }

    // 2. Chargement direct du document ressource d'un QCM
    if (qcmId) {
      const qcm = await env.DB.prepare(`
        SELECT q.id, q.titre, COALESCE(q.document_html, fs.contenu_html) AS html, m.nom AS matiere_nom
        FROM qcm_banque q
        LEFT JOIN matieres m ON q.matiere_id = m.id
        LEFT JOIN fiches_synthese fs ON q.fiche_id = fs.id
        WHERE q.id = ?
      `).bind(qcmId).first();

      if (!qcm || !qcm.html) {
        return new Response(JSON.stringify({ error: "Document ressource introuvable" }), { status: 404 });
      }
      return new Response(JSON.stringify({ type: "qcm", ...qcm }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
      });
    }

    // 3. Catalogue léger (sans charger le HTML lourd de tous les modules)
    const { results: fiches } = await env.DB.prepare(`
      SELECT f.id, f.titre, m.nom AS matiere_nom
      FROM fiches_synthese f
      LEFT JOIN matieres m ON f.matiere_id = m.id
      ORDER BY m.nom ASC, f.titre ASC
    `).all();

    const { results: docsQcm } = await env.DB.prepare(`
      SELECT q.id, q.titre, m.nom AS matiere_nom
      FROM qcm_banque q
      LEFT JOIN matieres m ON q.matiere_id = m.id
      WHERE q.document_html IS NOT NULL AND TRIM(q.document_html) != ''
      ORDER BY m.nom ASC, q.titre ASC
    `).all();

    return new Response(JSON.stringify({
      fiches: fiches || [],
      docs_qcm: docsQcm || []
    }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}