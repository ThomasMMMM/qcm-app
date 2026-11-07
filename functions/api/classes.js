function genererCodePartage() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let c = "";
  for (let i = 0; i < 5; i++) c += chars.charAt(Math.floor(Math.random() * chars.length));
  return "CLS-" + c;
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { action, nom_classe, prof_id, eleves, code_partage } = body;

    // CAS 1 : REJOINDRE UNE CLASSE EXISTANTE VIA CODE
    if (action === "rejoindre") {
      if (!code_partage || !prof_id) {
        return new Response(JSON.stringify({ error: "Code de classe et identifiant requis" }), { status: 400 });
      }

      const cleanCode = code_partage.trim().toUpperCase();
      const classe = await env.DB.prepare("SELECT id, nom FROM classes WHERE code_partage = ?").bind(cleanCode).first();

      if (!classe) {
        return new Response(JSON.stringify({ error: "Code de classe introuvable" }), { status: 404 });
      }

      // Vérifier si le professeur a déjà accès à cette classe
      const dejaAssocie = await env.DB.prepare(
        "SELECT 1 FROM professeurs_classes WHERE prof_id = ? AND classe_id = ?"
      ).bind(prof_id, classe.id).first();

      if (dejaAssocie) {
        return new Response(JSON.stringify({ error: "Vous avez déjà accès à cette classe" }), { status: 400 });
      }

      await env.DB.prepare(
        "INSERT INTO professeurs_classes (prof_id, classe_id) VALUES (?, ?)"
      ).bind(prof_id, classe.id).run();

      return new Response(JSON.stringify({ success: true, nom: classe.nom }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // CAS 2 : CRÉATION D'UNE NOUVELLE CLASSE
    if (!nom_classe || !prof_id || !eleves || eleves.length === 0) {
      return new Response(JSON.stringify({ error: "Données de classe incomplètes" }), { status: 400 });
    }

    const codePartage = genererCodePartage();

    // Insertion de la classe
    const resClasse = await env.DB.prepare(
      "INSERT INTO classes (nom, prof_id, code_partage) VALUES (?, ?, ?)"
    ).bind(nom_classe.trim(), prof_id, codePartage).run();

    const classeId = resClasse.meta.last_row_id;

    // Liaison du créateur dans la table professeurs_classes
    await env.DB.prepare(
      "INSERT OR IGNORE INTO professeurs_classes (prof_id, classe_id) VALUES (?, ?)"
    ).bind(prof_id, classeId).run();

    // Insertion des élèves
    const statements = eleves.map(el => {
      return env.DB.prepare(
        "INSERT INTO eleves (classe_id, prenom, date_naissance, code_eleve) VALUES (?, ?, ?, ?)"
      ).bind(classeId, el.prenom.trim(), el.date_naissance || "", el.code_eleve.trim().toUpperCase());
    });

    await env.DB.batch(statements);

    return new Response(JSON.stringify({
      success: true,
      classe_id: classeId,
      code_partage: codePartage,
      total: eleves.length
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const prof_id = url.searchParams.get("prof_id");
    const classe_id = url.searchParams.get("classe_id");

    // Détail des élèves d'une classe
    if (classe_id) {
      const { results } = await env.DB.prepare(
        "SELECT id, prenom, date_naissance, code_eleve FROM eleves WHERE classe_id = ? ORDER BY prenom ASC"
      ).bind(classe_id).all();
      return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
    }

    // Classes accessibles par le professeur (créées ou partagées)
    if (prof_id) {
      const { results } = await env.DB.prepare(`
        SELECT c.id, c.nom, c.code_partage, c.date_creation, c.prof_id AS createur_id, COUNT(e.id) AS effectif
        FROM classes c
        INNER JOIN professeurs_classes pc ON c.id = pc.classe_id
        LEFT JOIN eleves e ON c.id = e.classe_id
        WHERE pc.prof_id = ?
        GROUP BY c.id
        ORDER BY c.nom ASC
      `).bind(prof_id).all();
      return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestDelete(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const classe_id = url.searchParams.get("classe_id");
    const prof_id = url.searchParams.get("prof_id");

    if (!classe_id || !prof_id) {
      return new Response(JSON.stringify({ error: "Paramètres manquants" }), { status: 400 });
    }

    // Vérifier si le prof est le créateur initial
    const classe = await env.DB.prepare("SELECT prof_id FROM classes WHERE id = ?").bind(classe_id).first();

    if (classe && classe.prof_id == prof_id) {
      // Le créateur supprime la classe pour tout le monde
      await env.DB.prepare("DELETE FROM eleves WHERE classe_id = ?").bind(classe_id).run();
      await env.DB.prepare("DELETE FROM professeurs_classes WHERE classe_id = ?").bind(classe_id).run();
      await env.DB.prepare("DELETE FROM classes WHERE id = ?").bind(classe_id).run();
    } else {
      // Le prof invité retire simplement la classe de son espace
      await env.DB.prepare("DELETE FROM professeurs_classes WHERE prof_id = ? AND classe_id = ?").bind(prof_id, classe_id).run();
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
