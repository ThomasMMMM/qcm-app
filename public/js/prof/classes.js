let listeClassesMemoire = [];
let parsedElevesPreview = [];
let classeSelectionneePapId = null;
let classeSelectionneeMatieresId = null;

function analyserCsvPronote(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const lignes = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lignes.length < 2) return;

    const sep = lignes[0].includes(';') ? ';' : ',';
    const headers = lignes[0].split(sep).map(h => h.trim());
    const colEleve = headers.findIndex(h => /Élèves|Eleves|Nom/i.test(h));
    const colDate = headers.findIndex(h => /Né\(e\)|Naissance|Date/i.test(h));

    const counts = {};
    const elevesBruts = [];

    for (let i = 1; i < lignes.length; i++) {
      const cols = lignes[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
      const nomComplet = cols[colEleve] || "";
      const dateNais = colDate !== -1 ? cols[colDate] : "";
      if (!nomComplet) continue;

      const parts = nomComplet.split(/\s+/);
      const prenomBrut = parts.length > 1 ? parts[parts.length - 1] : parts[0];
      const init = parts.length > 1 ? parts[0].charAt(0).toUpperCase() + '.' : '';

      counts[prenomBrut.toLowerCase()] = (counts[prenomBrut.toLowerCase()] || 0) + 1;
      elevesBruts.push({ prenomBrut, init, dateNaissance: dateNais });
    }

    function genCode() {
      const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      let c = "";
      for (let k = 0; k < 4; k++) c += chars.charAt(Math.floor(Math.random() * chars.length));
      return c;
    }

    parsedElevesPreview = elevesBruts.map((e, idx) => {
      const estDbl = counts[e.prenomBrut.toLowerCase()] > 1;
      return {
        ordre: idx + 1,
        prenom: estDbl && e.init ? (e.prenomBrut + ' ' + e.init) : e.prenomBrut,
        date_naissance: e.dateNaissance,
        code_eleve: genCode()
      };
    });

    const inputNom = document.getElementById('nomClasseInput');
    if (!inputNom.value.trim()) {
      inputNom.value = file.name.replace(/\.[^/.]+$/, "").replace(/Export_?/i, "");
    }
  };
  reader.readAsText(file, "ISO-8859-1");
}

async function enregistrerClasseDepuisCsv() {
  const nom = document.getElementById('nomClasseInput').value.trim();
  if (!nom) { alert("Veuillez indiquer un nom pour la classe."); return; }
  if (parsedElevesPreview.length === 0) { alert("Veuillez sélectionner un fichier CSV Pronote valide."); return; }

  const res = await fetch('/api/classes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom, prof_id: currentProf.id, eleves: parsedElevesPreview })
  });

  if (res.ok) {
    alert("✓ Classe enregistrée avec succès !");
    document.getElementById('csvPronoteInput').value = "";
    document.getElementById('nomClasseInput').value = "";
    parsedElevesPreview = [];
    chargerClassesProf();
  } else {
    alert("Erreur lors de l'enregistrement de la classe.");
  }
}

async function chargerClassesProf() {
  if (!currentProf) return;
  try {
    const res = await fetch('/api/classes?prof_id=' + currentProf.id);
    listeClassesMemoire = await res.json();

    const tbody = document.getElementById('tableClassesBody');
    if (!tbody) return;

    tbody.innerHTML = listeClassesMemoire.length === 0
      ? "<tr><td colspan='4' style='text-align:center; color:#94a3b8; padding:14px;'>Aucune classe enregistrée.</td></tr>"
      : listeClassesMemoire.map(c => `
        <tr>
          <td><strong>${c.nom}</strong></td>
          <td style="text-align:center;">${c.effectif || 0}</td>
          <td style="text-align:center;">
            <span class="badge" style="background:${c.nb_pap > 0 ? '#fdf4ff' : '#f1f5f9'}; color:${c.nb_pap > 0 ? '#7e22ce' : '#64748b'};">
              ${c.nb_pap || 0} PAP
            </span>
          </td>
          <td style="text-align:center; display:flex; gap:6px; justify-content:center;">
            <button type="button" class="btn btn-pdf" style="background:#4f46e5; padding:4px 8px; font-size:0.75rem;" onclick="ouvrirModalMatieresClasse(${c.id}, '${c.nom}')">📚 Matières</button>
            <button type="button" class="btn btn-pdf" style="padding:4px 8px; font-size:0.75rem;" onclick="ouvrirModalGestionEleves(${c.id}, '${c.nom}')">👥 Élèves</button>
            <button type="button" class="btn btn-pdf" style="background:#0284c7; padding:4px 8px; font-size:0.75rem;" onclick="genererPdfClasse(${c.id}, '${c.nom}')">📄 PDF</button>
            <button type="button" class="btn btn-danger" style="padding:4px 8px; font-size:0.75rem;" onclick="supprimerClasse(${c.id}, '${c.nom}')">Suppr</button>
          </td>
        </tr>
      `).join('');

    const selClasse = document.getElementById('selectSeanceClasse');
    const selFiltre = document.getElementById('filtreClasseSelect');
    if (selClasse) selClasse.innerHTML = listeClassesMemoire.map(c => '<option value="' + c.id + '">' + c.nom + '</option>').join('');
    if (selFiltre) selFiltre.innerHTML = '<option value="">Toutes les classes</option>' + listeClassesMemoire.map(c => '<option value="' + c.id + '">' + c.nom + '</option>').join('');
  } catch(e) {}
}

async function supprimerClasse(classeId, nom) {
  if (!confirm('Voulez-vous vraiment supprimer la classe "' + nom + '" ?')) return;
  await fetch('/api/classes?classe_id=' + classeId, { method: 'DELETE' });
  chargerClassesProf();
}

async function genererPdfClasse(classeId, nomClasse) {
  const res = await fetch('/api/classes?classe_id=' + classeId);
  const eleves = await res.json();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFillColor(11, 92, 171);
  doc.rect(0, 0, 210, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text('Identifiants QCM — Classe : ' + nomClasse, 14, 14);

  let aDesPap = false;
  const bodyData = eleves.map(e => {
    const estPap = (e.est_pap === 1 || e.est_pap === true);
    if (estPap) aDesPap = true;
    const prenomAffiche = estPap ? (e.prenom + ' *') : e.prenom;
    return [prenomAffiche, e.code_eleve, e.date_naissance || "-"];
  });

  doc.autoTable({
    startY: 28,
    head: [['Prénom élève', 'Code individuel', 'Né(e) le']],
    body: bodyData,
    theme: 'striped',
    margin: { left: 47 },
    styles: { fontSize: 12, cellPadding: 2.5, textColor: [30, 41, 59], valign: 'middle' },
    headStyles: { fillColor: [11, 92, 171], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 11 },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    columnStyles: {
      0: { cellWidth: 46, fontStyle: 'bold', halign: 'right' },
      1: { cellWidth: 34, fontStyle: 'bold', font: 'courier', textColor: [15, 23, 42], halign: 'left' },
      2: { cellWidth: 36, halign: 'center', textColor: [71, 85, 105], fontSize: 10 }
    },
    didDrawPage: function () {
      if (aDesPap) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 116, 139);
        doc.text("* Élève bénéficiant d'un aménagement d'épreuve (PAP)", 47, doc.internal.pageSize.height - 10);
      }
    }
  });

  doc.save('Codes_' + nomClasse + '.pdf');
}

async function ouvrirModalGestionEleves(classeId, nomClasse) {
  classeSelectionneePapId = classeId;
  document.getElementById('nomClasseGestionPap').innerText = nomClasse;
  document.getElementById('modalGestionEleves').style.display = 'flex';

  const cont = document.getElementById('conteneurListeElevesPap');
  cont.innerHTML = "<p style='padding:12px; color:#64748b;'>Chargement des élèves...</p>";

  try {
    const res = await fetch('/api/classes?classe_id=' + classeId);
    const eleves = await res.json();

    if (eleves.length === 0) {
      cont.innerHTML = "<p style='padding:12px; color:#64748b;'>Aucun élève dans cette classe.</p>";
      return;
    }

    cont.innerHTML = '<table><thead><tr><th>N°</th><th>Élève</th><th>Code</th><th style="text-align:center;">Aménagement PAP</th></tr></thead><tbody>' +
      eleves.map((e, idx) => `
        <tr style="background:${e.est_pap ? '#fdf4ff' : 'white'};">
          <td>${idx + 1}</td>
          <td><strong>${e.prenom}</strong></td>
          <td><span class="badge-session">${e.code_eleve}</span></td>
          <td style="text-align:center;">
            <label style="cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-weight:bold; color:${e.est_pap ? '#7e22ce' : '#64748b'};">
              <input type="checkbox" style="transform:scale(1.3); cursor:pointer;" ${e.est_pap ? 'checked' : ''} onchange="basculerPapEleve(${e.id}, this.checked)">
              ${e.est_pap ? 'PAP Activé' : 'Standard'}
            </label>
          </td>
        </tr>
      `).join('') + '</tbody></table>';
  } catch(err) {
    cont.innerHTML = "<p style='padding:12px; color:#dc2626;'>Erreur de chargement.</p>";
  }
}

function fermerModalGestionEleves() {
  document.getElementById('modalGestionEleves').style.display = 'none';
  chargerClassesProf();
}

async function basculerPapEleve(eleveId, estPap) {
  try {
    await fetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: "toggle_pap", eleve_id: eleveId, est_pap: estPap })
    });
  } catch(e) {}
}

async function ouvrirModalMatieresClasse(classeId, nomClasse) {
  classeSelectionneeMatieresId = classeId;
  document.getElementById('nomClasseGestionMatieres').innerText = nomClasse;
  document.getElementById('modalGestionMatieresClasse').style.display = 'flex';

  const cont = document.getElementById('conteneurListeMatieresClasse');
  cont.innerHTML = "<p style='padding:12px; color:#64748b;'>Chargement des matières...</p>";

  try {
    const res = await fetch('/api/fiches?mode=classe_matieres&classe_id=' + classeId + '&prof_id=' + currentProf.id);
    const matieres = await res.json();

    if (matieres.length === 0) {
      cont.innerHTML = "<p style='padding:12px; color:#64748b; font-style:italic;'>Aucune matière créée. Créez d'abord vos matières dans le module Fiches Synthèse.</p>";
      return;
    }

    cont.innerHTML = '<p style="font-size:0.85rem; color:#64748b; margin-top:0;">Cochez les matières enseignées à cette classe :</p>' +
      '<table><thead><tr><th>Matière</th><th style="text-align:center; width:140px;">Enseignée</th></tr></thead><tbody>' +
      matieres.map(m => `
        <tr style="background:${m.attribuee ? '#f0fdf4' : 'white'};">
          <td><strong>${m.nom}</strong></td>
          <td style="text-align:center;">
            <input type="checkbox" style="transform:scale(1.3); cursor:pointer;" ${m.attribuee ? 'checked' : ''} onchange="basculerMatiereClasse(${classeId}, ${m.id}, this.checked)">
          </td>
        </tr>
      `).join('') + '</tbody></table>';
  } catch(err) {
    cont.innerHTML = "<p style='padding:12px; color:#dc2626;'>Erreur de chargement.</p>";
  }
}

function fermerModalMatieresClasse() {
  document.getElementById('modalGestionMatieresClasse').style.display = 'none';
}

async function basculerMatiereClasse(classeId, matiereId, active) {
  try {
    await fetch('/api/fiches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: "toggle_classe_matiere", classe_id: classeId, matiere_id: matiereId, active: active })
    });
  } catch(e) {}
}
