let elevesClassePourExport = [];

function obtenirNoteRetenuePourExport(noteFound) {
  if (!noteFound) return null;
  const estIncomplet = (
    noteFound.note_proportionnelle !== null &&
    noteFound.note_proportionnelle !== undefined &&
    noteFound.questions_traitees !== null &&
    noteFound.questions_totales !== null &&
    Number(noteFound.questions_traitees) < Number(noteFound.questions_totales)
  );
  return estIncomplet ? Number(noteFound.note_proportionnelle) : Number(noteFound.note);
}

function obtenirNotesTrieesPourExport() {
  const seanceFiltreId = document.getElementById('filtreSeanceSelect').value;
  const notesSelection = seanceFiltreId
    ? memoireToutesLesNotes.filter(n => n.seance_id == seanceFiltreId)
    : [...memoireToutesLesNotes];

  // Toujours privilégier la copie la plus récente (id ou date_soumission la plus élevée)
  return notesSelection.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
}

function trouverCopieEleve(notesTriees, el) {
  const nomEleve = (el.nom || el.prenom || "").trim().toUpperCase();
  return notesTriees.find(n =>
    (el.code_eleve && n.prenom && n.prenom.includes(el.code_eleve)) ||
    (nomEleve && n.nom && n.nom.toUpperCase() === nomEleve) ||
    (n.nom === el.prenom)
  );
}

async function ouvrirModalExportPronote() {
  const classeFiltreId = document.getElementById('filtreClasseSelect').value;
  if (!classeFiltreId) {
    alert("Veuillez sélectionner une classe dans le filtre au préalable.");
    return;
  }
  document.getElementById('modalExportPronote').style.display = 'flex';
  const res = await fetch(`/api/classes?classe_id=${classeFiltreId}`);
  elevesClassePourExport = await res.json();
  afficherApercuExport();
}

function fermerModalExportPronote() {
  document.getElementById('modalExportPronote').style.display = 'none';
}

function afficherApercuExport() {
  const notesTriees = obtenirNotesTrieesPourExport();

  const htmlRows = elevesClassePourExport.map((el, idx) => {
    const nomComplet = [el.nom, el.prenom].filter(Boolean).join(' ');
    const noteFound = trouverCopieEleve(notesTriees, el);

    let noteStr = '<span style="color:#94a3b8; font-style:italic;">Absent / Non fait</span>';
    if (noteFound) {
      const noteExport = obtenirNoteRetenuePourExport(noteFound);
      const estProrata = (
        noteFound.note_proportionnelle !== null &&
        noteFound.note_proportionnelle !== undefined &&
        Number(noteFound.questions_traitees) < Number(noteFound.questions_totales)
      );
      noteStr = estProrata
        ? `<strong>${noteExport} / ${noteFound.total}</strong> <span style="font-size:0.75rem; color:#b45309;">(${noteFound.questions_traitees}/${noteFound.questions_totales} Q.)</span>`
        : `${noteExport} / ${noteFound.total}`;
    }

    return `<tr><td style="text-align:center;">${idx + 1}</td><td><strong>${nomComplet || el.prenom}</strong></td><td style="text-align:center;">${noteStr}</td></tr>`;
  }).join('');

  document.getElementById('previewExportContainer').innerHTML = `
    <table>
      <thead><tr><th style="width:40px; text-align:center;">N°</th><th>Élève</th><th style="text-align:center; width:150px;">Note exportée</th></tr></thead>
      <tbody>${htmlRows}</tbody>
    </table>
  `;
}

function copierNotesPressePapier() {
  const notesTriees = obtenirNotesTrieesPourExport();

  const colonneTexte = elevesClassePourExport.map(el => {
    const noteFound = trouverCopieEleve(notesTriees, el);
    const noteExport = obtenirNoteRetenuePourExport(noteFound);
    return (noteExport !== null && !isNaN(noteExport)) ? String(noteExport).replace('.', ',') : "";
  }).join('\r\n');

  navigator.clipboard.writeText(colonneTexte).then(() => {
    alert("✓ Notes copiées dans le presse-papier !\n\nCollez directement dans la première case de la colonne Pronote avec Ctrl + V.");
  });
}

function telechargerCsvPronote() {
  const notesTriees = obtenirNotesTrieesPourExport();

  // Format officiel PRONOTE : 4 colonnes distinctes avec UTF-8 BOM (\uFEFF)
  let csvContent = "\uFEFFNom;Prenom;Date_naissance;Note\r\n";

  elevesClassePourExport.forEach(el => {
    const nomEleve = (el.nom || el.prenom || "").trim().toUpperCase();
    const prenomEleve = (el.prenom || "").trim();
    const dateNais = (el.date_naissance || "").trim();

    const noteFound = trouverCopieEleve(notesTriees, el);

    let noteStr = "";
    const noteExport = obtenirNoteRetenuePourExport(noteFound);
    if (noteExport !== null && !isNaN(noteExport)) {
      noteStr = String(noteExport).replace('.', ',');
    }

    csvContent += `${nomEleve};${prenomEleve};${dateNais};${noteStr}\r\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);

  const selectClasse = document.getElementById('filtreClasseSelect');
  const nomClasse = (selectClasse && selectClasse.selectedOptions[0]) ? selectClasse.selectedOptions[0].text.replace(/\s+/g, '_') : "Pronote";

  link.setAttribute("download", `Notes_Pronote_${nomClasse}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}