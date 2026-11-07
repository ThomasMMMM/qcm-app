export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { nom, prenom, classe, qcm_titre, note, total, session_code, seance_id } = body;

    if (!nom || note === undefined || total === undefined) {
      return new Response(JSON.stringify({ error: "Données incomplètes" }), { status: 400 });
    }

    await env.DB.prepare(
      "INSERT INTO resultats_qcm (nom, prenom, classe, qcm_titre, note, total, session_code, seance_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(nom, prenom || "", classe || "", qcm_titre || "Sans titre", note, total, session_code || "", seance_id || null).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
