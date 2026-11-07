export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const prof_id = url.searchParams.get("prof_id");

    if (!prof_id) {
      return new Response(JSON.stringify({ notes: [], sorties: [] }), { headers: { "Content-Type": "application/json" } });
    }

    // Récupère uniquement les notes des QCM créés par ce professeur
    const { results: notes } = await env.DB.prepare(`
      SELECT r.* FROM resultats_qcm r
      INNER JOIN quiz_sessions q ON r.session_code = q.code
      WHERE q.prof_id = ?
      ORDER BY r.date_soumission DESC LIMIT 100
    `).bind(prof_id).all();

    // Récupère les alertes de sorties d'écran
    const { results: sorties } = await env.DB.prepare(
      "SELECT * FROM sorties_ecran ORDER BY horodatage DESC LIMIT 100"
    ).all();

    return new Response(JSON.stringify({ notes, sorties }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
