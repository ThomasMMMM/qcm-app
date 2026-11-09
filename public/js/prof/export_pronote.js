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
    const noteFound = notesSelection.find(n => (el.code_eleve && n.prenom && n.prenom.includes(el.code_eleve)) || n.nom === el.prenom);
    const noteStr = noteFound ? `${noteFound.note} / ${noteFound.total}` : '<span style="color:#94a3b8; font-style:italic;">Absent / Non fait</span>';
    return `<tr><td style="text-align:center;">${idx + 1}</td><td><strong>${el.prenom}</strong></td><td style="text-align:center;">${noteStr}</td></tr>`;
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
    const noteFound = notesSelection.find(n => (el.code_eleve && n.prenom && n.prenom.includes(el.code_eleve)) || n.nom === el.prenom);
    return noteFound ? String(noteFound.note).replace('.', ',') : "";
  }).join('\r\n');

  navigator.clipboard.writeText(colonneTexte).then(() => {
    alert("✓ Notes copiées dans le presse-papier !\n\nCollez directement dans la première case de la colonne Pronote avec Ctrl + V.");
  });
}

function telechargerCsvPronote() {
  const seanceFiltreId = document.getElementById('filtreSeanceSelect').value;
  const notesSelection = seanceFiltreId ? memoireToutesLesNotes.filter(n => n.seance_id == seanceFiltreId) : memoireToutesLesNotes;

  // Structure exacte acceptée par Pronote : colonne unique "Nom Prenom" et colonne "Note"
  let csvLignes = ["Nom Prenom;Note"];

  elevesClassePourExport.forEach(el => {
    const identiteEleve = (el.prenom || "").trim();

    const noteFound = notesSelection.find(n => 
      (el.code_eleve && n.prenom && n.prenom.includes(el.code_eleve)) || 
      (n.nom === el.prenom) ||
      (n.nom && identiteEleve.toLowerCase().includes(n.nom.toLowerCase()))
    );

    let noteStr = "";
    if (noteFound && noteFound.note !== undefined && noteFound.note !== null) {
      noteStr = String(noteFound.note).replace('.', ',');
    }

    csvLignes.push(`"${identiteEleve}";"${noteStr}"`);
  });

  const texteCsv = csvLignes.join('\r\n');

  // Conversion en ANSI / ISO-8859-1 pour que Pronote affiche fidèlement les accents
  const buffer = new Uint8Array(texteCsv.length);
  for (let i = 0; i < texteCsv.length; i++) {
    const charCode = texteCsv.charCodeAt(i);
    buffer[i] = charCode < 256 ? charCode : 63;
  }

  const blob = new Blob([buffer], { type: 'text/csv;charset=windows-1252;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "Notes_Pronote.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
