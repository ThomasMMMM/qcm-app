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
  if (niveau === 0) return "Réussir 1 QCM (≥ 10/20) pour débloquer le badge Bronze";
  if (niveau === 1) return `Encore ${2 - nbReussis} QCM réussi (≥ 10/20) pour le badge Argent`;
  if (niveau === 2) {
    if (nbReussis < 3) return `Encore ${3 - nbReussis} QCM réussi (moy. ≥ 14/20) pour le badge Or`;
    return `Atteindre 14/20 de moyenne (actuellement ${moyenne.toFixed(1)}/20) pour le badge Or`;
  }
  if (niveau === 3) {
    if (nbReussis < 4) return `Encore ${4 - nbReussis} QCM réussi (moy. ≥ 16/20) pour le badge Diamant`;
    return `Atteindre 16/20 de moyenne (actuellement ${moyenne.toFixed(1)}/20) pour le badge Diamant`;
  }
  return "Niveau maximal atteint !";
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
             c.nom AS classe_nom, c.prof_id AS classe_prof_id
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
        SELECT r.id, r.seance_id, r.note, r.total, r.note_proportionnelle, r.questions_traitees, r.questions_totales,
               r.date_soumission, s.code_session, q.titre AS qcm_titre, q.matiere_id, q.competence_code
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

    // 3. Séances actives à faire
    const seancesActives = await env.DB.prepare(`
      SELECT s.id AS seance_id, s.code_session, s.date_seance, s.horaire_seance, q.titre AS qcm_titre, q.competence_code
      FROM seances s
      INNER JOIN qcm_banque q ON s.qcm_id = q.id
      WHERE s.classe_id = ? AND (s.actif = 1 OR s.actif IS NULL OR s.actif = '1')
      ORDER BY s.id DESC
    `).bind(eleve.classe_id).all();

    const aFaire = (seancesActives.results || []).filter(s => !seanceIdsPassees.includes(s.seance_id));

    // 4. Construction de l'arbre de compétences (toujours visible même sans QCM évalué)
    let arbreCompetences = [];
    try {
      // D'abord les matières explicitement liées à la classe
      let { results: matieresClasse } = await env.DB.prepare(`
        SELECT m.id, m.nom, m.competences_json
        FROM matieres m
        INNER JOIN classes_matieres cm ON m.id = cm.matiere_id
        WHERE cm.classe_id = ?
        ORDER BY m.nom ASC
      `).bind(eleve.classe_id).all();

      // Repli 1 : Si aucune matière cochée pour la classe, afficher toutes les matières du prof de la classe
      if ((!matieresClasse || matieresClasse.length === 0) && eleve.classe_prof_id) {
        const resProfMat = await env.DB.prepare(`
          SELECT id, nom, competences_json
          FROM matieres
          WHERE prof_id = ?
          ORDER BY nom ASC
        `).bind(eleve.classe_prof_id).all();
        matieresClasse = resProfMat.results || [];
      }

      // Repli 2 : Si le prof n'a encore créé aucune matière, afficher le référentiel PSE par défaut
      if (!matieresClasse || matieresClasse.length === 0) {
        matieresClasse = [{
          id: 0,
          nom: "Prévention Santé Environnement (PSE)",
          competences_json: JSON.stringify(COMPETENCES_PSE_DEFAUT)
        }];
      }

      arbreCompetences = matieresClasse.map(mat => {
        let listeComps = COMPETENCES_PSE_DEFAUT;
        if (mat.competences_json) {
          try {
            const p = JSON.parse(mat.competences_json);
            if (Array.isArray(p) && p.length > 0) listeComps = p;
          } catch (e) {}
        }

        const branches = listeComps.map(comp => {
          const copiesComp = passes.filter(p =>
            (Number(mat.id) === 0 || Number(p.matiere_id) === Number(mat.id)) &&
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

          return {
            code: comp.code,
            libelle: comp.libelle,
            niveau,
            nb_qcm: nbTotal,
            nb_reussis: nbReussis,
            moyenne: Number(moyenne.toFixed(1)),
            objectif: getProchainObjectifTexte(niveau, nbReussis, moyenne)
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
      arbre_competences: arbreCompetences
    }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}