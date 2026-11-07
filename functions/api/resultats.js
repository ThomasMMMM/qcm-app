export async function onRequestGet(context) {
  try {
    const { env } = context;
    
    // Récupération des notes soumises
    const { results: notes } = await env.DB.prepare(
      "SELECT * FROM resultats_qcm ORDER BY date_soumission DESC LIMIT 100"
    ).all();

    // Récupération des sorties d'écran
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
