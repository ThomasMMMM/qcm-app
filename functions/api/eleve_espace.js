const COMPETENCES_PSE_DEFAUT = [
  { code: "C1", libelle: "Traiter l'information" },
  { code: "C2", libelle: "Appliquer une démarche d'analyse" },
  { code: "C3", libelle: "Expliquer un phénomène / enjeu en lien avec la prévention" },
  { code: "C4", libelle: "Proposer une solution pour résoudre un problème" },
  { code: "C5", libelle: "Argumenter un choix" }
];

function calculerNiveauBadge(nbReussis, moyenne) {
  if (nbReussis >= 4 && moyenne >= 16) return 4; // Diamant
  if (nbReussis >= 3 && moyenne >= 14) return 3; // Or
  if (nbReussis >= 2) return 2;                  // Argent
  if (nbReussis >= 1) return 1;                  // Bronze
  return 0;
}

function getProchainObjectifTexte(niveau, nbReussis, moyenne) {
  if (niveau === 0) return "Réussir 1 QCM (≥ 10/20) pour valider le Niveau 1 (Maîtrise insuffisante)";
  if (niveau === 1) return `Encore ${2 - nbReussis} QCM réussi (≥ 10/20) pour atteindre le Niveau 2 (Maîtrise fragile)`;
  if (niveau === 2) {
    if (nbReussis < 3) return `Encore ${3 - nbReussis} QCM réussi (moy. ≥ 14/20) pour le Niveau 3 (Très bonne maîtrise)`;
    return `Atteindre 14/20 de moyenne (actuellement ${moyenne.toFixed(1)}/20) pour le Niveau 3 (Très bonne maîtrise)`;
  }
  if (niveau === 3) {
    if (nbReussis < 4) return `Encore ${4 - nbReussis} QCM réussi (moy. ≥ 16/20) pour le Niveau 4 (Excellente maîtrise)`;
    return `Atteindre 16/20 de moyenne (actuellement ${moyenne.toFixed(1)}/20) pour le Niveau 4 (Excellente maîtrise)`;
  }
  return "Niveau maximal atteint — Excellente maîtrise !";
}

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

    const queryEleve = `
      SELECT e.id, e.prenom, e.date_naissance, e.code_eleve, e.classe_id, COALESCE(e.est_pap, 0) AS est_pap,
             c.nom AS classe_nom
      FROM eleves e
      INNER JOIN classes c ON e.classe_id = c.id
      WHERE UPPER(e.code_eleve) = ? AND LOWER(e.prenom) LIKE ?
    `;
    const eleve = await env.DB.prepare(queryEleve).bind(cleanCode, `%${cleanPrenom}%`).first();

    if (!eleve) {
      return new Response(JSON.stringify({ error: "Identifiants incorrects. Vérifiez votre prénom et votre code." }), { status: 404 });
    }

    if (eleve.date_naissance && cleanDate) {
      const dDb = eleve.date_naissance.replace(/[-/]/g, "");
      const dSaisie = cleanDate.replace(/[-/]/g, "");
      const revSaisie = cleanDate.split("-").reverse().join("");
      if (!dDb.includes(dSaisie) && !dDb.includes(revSaisie)) {
        return new Response(JSON.stringify({ error: "La date de naissance ne correspond pas." }), { status: 403 });
      }
    }

    // 2. Récupération des copies déjà soumises avec matière et compétence du QCM
    let passes = [];
    let seanceIdsPassees = [];

    try {
      const resCopies = await env.DB.prepare(`
        SELECT r.id, r.seance_id, r.note, r.total, r.note_proportionnelle, r.questions_traitees, r.questions_totales, COALESCE(r.exporte_pronote, 0) AS exporte_pronote,
               r.date_soumission, s.code_session, COALESCE(s.actif, 1) AS seance_actif, q.titre AS qcm_titre, q.matiere_id, q.competence_code
        FROM resultats_qcm r
        INNER JOIN seances s ON r.seance_id = s.id
        INNER JOIN qcm_banque q ON s.qcm_id = q.id
        WHERE s.classe_id = ? AND (r.nom = ? OR r.prenom LIKE ?)
        ORDER BY r.date_soumission DESC
      `).bind(eleve.classe_id, eleve.prenom, `%${cleanCode}%`).all();

      passes = resCopies.results || [];
      seanceIdsPassees = passes.map(p => p.seance_id);
    } catch (e1) {
      passes = [];
      seanceIdsPassees = [];
    }

    // 3. Toutes les séances de la classe (pour "À faire" ET "Cahier de texte")
    const resToutesSeances = await env.DB.prepare(`
      SELECT s.id AS seance_id, s.code_session, s.date_seance, s.horaire_seance, s.date_creation,
             COALESCE(s.actif, 1) AS actif,
             q.id AS qcm_id, q.titre AS qcm_titre, q.matiere_id, q.competence_code,
             CASE WHEN q.document_html IS NOT NULL AND TRIM(q.document_html) != '' THEN 1 ELSE 0 END AS has_document,
             m.nom AS matiere_nom
      FROM seances s
      INNER JOIN qcm_banque q ON s.qcm_id = q.id
      LEFT JOIN matieres m ON q.matiere_id = m.id
      WHERE s.classe_id = ?
      ORDER BY COALESCE(s.date_seance, substr(s.date_creation, 1, 10)) DESC, s.id DESC
    `).bind(eleve.classe_id).all();

    const toutesSeances = resToutesSeances.results || [];

    const aFaire = toutesSeances.filter(s =>
      (s.actif == 1 || s.actif === '1') && !seanceIdsPassees.includes(s.seance_id)
    );

    const cahierTexte = toutesSeances.map(s => {
      const copie = passes.find(p => Number(p.seance_id) === Number(s.seance_id));
      const estActif = (s.actif == 1 || s.actif === '1');
      let statut = "cloture";
      if (copie) statut = "fait";
      else if (estActif) statut = "a_faire";

      return {
        seance_id: s.seance_id,
        qcm_id: s.qcm_id,
        code_session: s.code_session,
        date_seance: s.date_seance || (s.date_creation ? String(s.date_creation).slice(0, 10) : ""),
        horaire_seance: s.horaire_seance || "",
        qcm_titre: s.qcm_titre,
        matiere_id: s.matiere_id,
        matiere_nom: s.matiere_nom || "Enseignement",
        competence_code: s.competence_code || "",
        has_document: s.has_document === 1,
        statut,
        seance_actif: estActif,
        resultat_id: copie ? copie.id : null,
        note: copie ? copie.note : null,
        total: copie ? copie.total : 20,
        note_proportionnelle: copie ? copie.note_proportionnelle : null,
        questions_traitees: copie ? copie.questions_traitees : null,
        questions_totales: copie ? copie.questions_totales : null,
        date_soumission: copie ? copie.date_soumission : null,
        exporte_pronote: copie ? (Number(copie.exporte_pronote) === 1) : false
      };
    });

    // 4. Construction de l'arbre de compétences : STRICTEMENT les matières associées à la classe de l'élève
    let arbreCompetences = [];
    try {
      try {
        await env.DB.prepare("ALTER TABLE fiches_synthese ADD COLUMN competence_code TEXT DEFAULT NULL").run();
      } catch (eCol) {}

      const { results: fichesClasse } = await env.DB.prepare(`
        SELECT f.id, f.matiere_id, f.titre, f.competence_code
        FROM fiches_synthese f
        INNER JOIN classes_matieres cm ON f.matiere_id = cm.matiere_id
        WHERE cm.classe_id = ?
        ORDER BY f.titre ASC
      `).bind(eleve.classe_id).all();

      const { results: matieresClasse } = await env.DB.prepare(`
        SELECT m.id, m.nom, m.competences_json
        FROM matieres m
        INNER JOIN classes_matieres cm ON m.id = cm.matiere_id
        WHERE cm.classe_id = ?
        ORDER BY m.nom ASC
      `).bind(eleve.classe_id).all();

      arbreCompetences = (matieresClasse || []).map(mat => {
        let listeComps = COMPETENCES_PSE_DEFAUT;
        if (mat.competences_json) {
          try {
            const p = JSON.parse(mat.competences_json);
            if (Array.isArray(p) && p.length > 0) listeComps = p;
          } catch (e) {}
        }

        const branches = listeComps.map(comp => {
          const copiesComp = passes.filter(p =>
            Number(p.matiere_id) === Number(mat.id) &&
            String(p.competence_code || "").toUpperCase() === String(comp.code || "").toUpperCase()
          );

          const notesRetenues = copiesComp.map(p => {
            const estIncomplet = (
              p.note_proportionnelle !== null &&
              p.note_proportionnelle !== undefined &&
              p.questions_traitees !== null &&
              p.questions_totales !== null &&
              Number(p.questions_traitees) < Number(p.questions_totales)
            );
            return estIncomplet ? Number(p.note_proportionnelle) : Number(p.note || 0);
          });

          const nbTotal = notesRetenues.length;
          const nbReussis = notesRetenues.filter(n => n >= 10).length;
          const moyenne = nbTotal > 0 ? (notesRetenues.reduce((a, b) => a + b, 0) / nbTotal) : 0;
          const niveau = calculerNiveauBadge(nbReussis, moyenne);

          const codeCompUpper = String(comp.code || "").trim().toUpperCase();
          const fichesLiees = (fichesClasse || [])
            .filter(f => {
              if (Number(f.matiere_id) !== Number(mat.id)) return false;
              const fCode = String(f.competence_code || "").trim().toUpperCase();
              if (fCode && fCode === codeCompUpper) return true;
              // Correspondance automatique si le titre mentionne explicitement le code compétence (ex: "Fiche C1", "[C1]")
              const regexCode = new RegExp(`(^|[^A-Z0-9])${codeCompUpper}([^A-Z0-9]|$)`, "i");
              return !fCode && regexCode.test(f.titre || "");
            })
            .map(f => ({ id: f.id, titre: f.titre }));

          return {
            code: comp.code,
            libelle: comp.libelle,
            niveau,
            nb_qcm: nbTotal,
            nb_reussis: nbReussis,
            moyenne: Number(moyenne.toFixed(1)),
            objectif: getProchainObjectifTexte(niveau, nbReussis, moyenne),
            fiches: fichesLiees
          };
        });

        return {
          matiere_id: mat.id,
          matiere_nom: mat.nom,
          competences: branches
        };
      });
    } catch (e2) {
      arbreCompetences = [];
    }

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
      passes: passes,
      cahier_texte: cahierTexte,
      arbre_competences: arbreCompetences
    }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}