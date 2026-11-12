export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const {
      nom,
      prenom,
      session_code,
      seance_id,
      nb_sorties,
      duree_sorties,
      note,
      total,
      questions_traitees,
      questions_totales,
      note_proportionnelle
    } = body;

    const noteFinale = parseFloat(note) || 0;
    const totalMax = parseFloat(total) || 20;
    const sorties = parseInt(nb_sorties) || 0;
    const tempsSorties = parseInt(duree_sorties) || 0;
    const qTraitees = (questions_traitees !== undefined && questions_traitees !== null) ? parseInt(questions_traitees) : null;
    const qTotales = (questions_totales !== undefined && questions_totales !== null) ? parseInt(questions_totales) : null;
    const noteProp = (note_proportionnelle !== undefined && note_proportionnelle !== null) ? parseFloat(note_proportionnelle) : null;

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
          duree_sorties INTEGER DEFAULT 0,
          questions_traitees INTEGER DEFAULT NULL,
          questions_totales INTEGER DEFAULT NULL,
          note_proportionnelle REAL DEFAULT NULL,
          date_soumission DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      await env.DB.prepare(`
        INSERT INTO resultats_qcm (
          seance_id, nom, prenom, session_code, note, total, nb_sorties, duree_sorties,
          questions_traitees, questions_totales, note_proportionnelle
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        seance_id || null,
        nom || "",
        prenom || "",
        session_code || "",
        noteFinale,
        totalMax,
        sorties,
        tempsSorties,
        qTraitees,
        qTotales,
        noteProp
      ).run();
    } catch (e1) {
      console.error("Erreur insertion resultats_qcm :", e1);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
