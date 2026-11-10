let elevesClassePourExport = [];

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
  const seanceFiltreId = document.getElementById('filtreSeanceSelect').value;
  const notesSelection = seanceFiltreId ? memoireToutesLesNotes.filter(n => n.seance_id == seanceFiltreId) : memoireToutesLesNotes;

  const htmlRows = elevesClassePourExport.map((el, idx) => {
    const nomComplet = [el.nom, el.prenom].filter(Boolean).join(' ');
    const noteFound = notesSelection.find(n => 
      (el.code_eleve && n.prenom && n.prenom.includes(el.code_eleve)) || 
      (el.nom && n.nom && n.nom.toUpperCase() === el.nom.toUpperCase()) ||
      (n.nom === el.prenom)
    );
    const noteStr = noteFound ? `${noteFound.note} / ${noteFound.total}` : '<span style="color:#94a3b8; font-style:italic;">Absent / Non fait</span>';
    return `<tr><td style="text-align:center;">${idx + 1}</td><td><strong>${nomComplet || el.prenom}</strong></td><td style="text-align:center;">${noteStr}</td></tr>`;
  }).join('');

  document.getElementById('previewExportContainer').innerHTML = `
    <table>
      <thead><tr><th style="width:40px; text-align:center;">N°</th><th>Élève</th><th style="text-align:center; width:120px;">Note</th></tr></thead>
      <tbody>${htmlRows}</tbody>
    </table>
  `;
}

function copierNotesPressePapier() {
  const seanceFiltreId = document.getElementById('filtreSeanceSelect').value;
  const notesSelection = seanceFiltreId ? memoireToutesLesNotes.filter(n => n.seance_id == seanceFiltreId) : memoireToutesLesNotes;

  const colonneTexte = elevesClassePourExport.map(el => {
    const noteFound = notesSelection.find(n => 
      (el.code_eleve && n.prenom && n.prenom.includes(el.code_eleve)) || 
      (el.nom && n.nom && n.nom.toUpperCase() === el.nom.toUpperCase()) ||
      (n.nom === el.prenom)
    );
    return noteFound ? String(noteFound.note).replace('.', ',') : "";
  }).join('\r\n');

  navigator.clipboard.writeText(colonneTexte).then(() => {
    alert("✓ Notes copiées dans le presse-papier !\n\nCollez directement dans la première case de la colonne Pronote avec Ctrl + V.");
  });
}

function telechargerCsvPronote() {
  const seanceFiltreId = document.getElementById('filtreSeanceSelect').value;
  const notesSelection = seanceFiltreId ? memoireToutesLesNotes.filter(n => n.seance_id == seanceFiltreId) : memoireToutesLesNotes;

  // Format officiel PRONOTE : 4 colonnes distinctes avec UTF-8 BOM (\uFEFF)
  let csvContent = "\uFEFFNom;Prenom;Date_naissance;Note\r\n";

  elevesClassePourExport.forEach(el => {
    const nomEleve = (el.nom || "").trim().toUpperCase();
    const prenomEleve = (el.prenom || "").trim();
    const dateNais = (el.date_naissance || "").trim();

    const noteFound = notesSelection.find(n =>
      (el.code_eleve && n.prenom && n.prenom.includes(el.code_eleve)) ||
      (nomEleve && n.nom && n.nom.toUpperCase() === nomEleve) ||
      (n.nom === el.prenom)
    );

    let noteStr = "";
    if (noteFound && noteFound.note !== undefined && noteFound.note !== null) {
      noteStr = String(noteFound.note).replace('.', ',');
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
