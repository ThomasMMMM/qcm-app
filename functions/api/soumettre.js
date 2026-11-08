export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { nom, prenom, session_code, seance_id, nb_sorties, note, total } = body;

    const noteFinale = parseFloat(note) || 0;
    const totalMax = parseFloat(total) || 20;
    const sorties = parseInt(nb_sorties) || 0;

    // 1. Insertion dans resultats_qcm (table principale lue par resultats.js et l'export Pronote)
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS resultats_qcm (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          seance_id INTEGER,
          nom TEXT,
          prenom TEXT,
          classe TEXT,
          qcm_titre TEXT,
          session_code TEXT,
          note REAL,
          total REAL,
          nb_sorties INTEGER DEFAULT 0,
          date_soumission DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      await env.DB.prepare(`
        INSERT INTO resultats_qcm (seance_id, nom, prenom, session_code, note, total, nb_sorties)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(seance_id || null, nom || "", prenom || "", session_code || "", noteFinale, totalMax, sorties).run();
    } catch (e1) {
      console.error("Erreur insertion resultats_qcm :", e1);
    }

    // 2. Insertion miroir dans copies (pour l'espace personnel élève)
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS copies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          seance_id INTEGER,
          nom TEXT,
          prenom TEXT,
          session_code TEXT,
          note REAL,
          total REAL,
          nb_sorties INTEGER DEFAULT 0,
          date_soumission DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      await env.DB.prepare(`
        INSERT INTO copies (seance_id, nom, prenom, session_code, note, total, nb_sorties)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(seance_id || null, nom || "", prenom || "", session_code || "", noteFinale, totalMax, sorties).run();
    } catch (e2) {}

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
