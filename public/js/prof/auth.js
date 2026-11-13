let currentProf = null;
let authMode = "login";

window.addEventListener('DOMContentLoaded', () => {
  const savedProf = localStorage.getItem('qcm_prof_user');
  if (savedProf) {
    try {
      currentProf = JSON.parse(savedProf);
    } catch (e) {
      currentProf = null;
    }
  }

  if (currentProf && currentProf.id) {
    afficherDashboard();
  } else {
    afficherAuth();
  }
});

function afficherDashboard() {
  document.getElementById('viewProfAuth').style.display = 'none';
  document.getElementById('viewProfDashboard').style.display = 'flex';
  const label = document.getElementById('labelProfNom');
  if (label) label.innerText = currentProf.nom || currentProf.email || 'Enseignant';
  chargerToutesLesDonnees();
}

function afficherAuth() {
  document.getElementById('viewProfDashboard').style.display = 'none';
  document.getElementById('viewProfAuth').style.display = 'block';
}

function toggleAuthMode() {
  authMode = (authMode === "login") ? "register" : "login";
  if (authMode === "register") {
    document.getElementById('authTitle').innerText = "Inscription Enseignant";
    document.getElementById('nomRegisterGroup').style.display = 'block';
    document.getElementById('btnAuthSubmit').innerText = "Créer mon compte";
    document.getElementById('authToggleText').innerText = "Déjà inscrit ?";
    document.getElementById('authToggleLink').innerText = "Se connecter";
  } else {
    document.getElementById('authTitle').innerText = "Connexion Enseignant";
    document.getElementById('nomRegisterGroup').style.display = 'none';
    document.getElementById('btnAuthSubmit').innerText = "Se connecter";
    document.getElementById('authToggleText').innerText = "Pas encore de compte ?";
    document.getElementById('authToggleLink').innerText = "Créer un compte";
  }
}

async function traiterAuthProf() {
  const email = document.getElementById('profEmail').value.trim();
  const password = document.getElementById('profPassword').value;
  const nom = document.getElementById('profNom').value.trim();

  if (!email || !password) {
    alert("Veuillez renseigner un email et un mot de passe.");
    return;
  }

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: authMode, email, password, nom })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Erreur d'authentification.");
      return;
    }

    currentProf = data.user;
    localStorage.setItem('qcm_prof_user', JSON.stringify(currentProf));
    afficherDashboard();
  } catch (err) {
    alert("Erreur de connexion au serveur.");
  }
}

function deconnecterProf() {
  currentProf = null;
  localStorage.removeItem('qcm_prof_user');
  afficherAuth();
}

function chargerToutesLesDonnees() {
  if (typeof chargerMatieresProf === 'function') chargerMatieresProf();
  if (typeof chargerFichesProf === 'function') chargerFichesProf();
  if (typeof chargerBanqueProf === 'function') chargerBanqueProf();
  if (typeof chargerClassesProf === 'function') chargerClassesProf();
  if (typeof chargerSeancesProf === 'function') chargerSeancesProf();
  if (typeof chargerResultatsProf === 'function') chargerResultatsProf();
  setTimeout(actualiserCompteursTuiles, 600);
  setTimeout(actualiserCompteursTuiles, 1500);
}

// ================= NAVIGATION SIDEBAR & VUE D'ENSEMBLE =================
function toggleSidebarProf() {
  const sb = document.getElementById('profSidebar');
  const ov = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.toggle('open');
  if (ov) ov.classList.toggle('open');
}

function fermerSidebarMobile() {
  const sb = document.getElementById('profSidebar');
  const ov = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('open');
}

function marquerLienSidebarActif(targetId) {
  document.querySelectorAll('.sidebar-link').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === targetId);
  });
}

function retournerAuHubProf() {
  document.querySelectorAll('.rubrique-contenu-prof').forEach(el => el.style.display = 'none');
  const hub = document.getElementById('vueHubProf');
  if (hub) hub.style.display = 'block';
  marquerLienSidebarActif('vueHubProf');
  fermerSidebarMobile();
  actualiserCompteursTuiles();
}

function ouvrirRubriqueProf(idRubrique) {
  const hub = document.getElementById('vueHubProf');
  if (hub) hub.style.display = 'none';
  document.querySelectorAll('.rubrique-contenu-prof').forEach(el => el.style.display = 'none');
  const cible = document.getElementById(idRubrique);
  if (cible) {
    cible.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  marquerLienSidebarActif(idRubrique);
  fermerSidebarMobile();

  if (idRubrique === 'rubriqueResultats' && typeof chargerResultatsProf === 'function') {
    chargerResultatsProf();
  }
}

function actualiserCompteursTuiles() {
  // 1. Banque QCM
  const nbQ = (typeof listeBanqueQcmMemoire !== 'undefined') ? listeBanqueQcmMemoire.length : 0;
  setText('kpiNbQcm', nbQ);
  setText('navBadgeBanque', nbQ);
  setText('kpiSubQcm', nbQ > 1 ? 'Questionnaires disponibles' : 'Questionnaire disponible');

  // 2. Classes & Élèves
  const nbC = (typeof listeClassesMemoire !== 'undefined') ? listeClassesMemoire.length : 0;
  let totalEleves = 0;
  if (typeof listeClassesMemoire !== 'undefined') {
    listeClassesMemoire.forEach(c => {
      totalEleves += Number(c.nb_eleves || (Array.isArray(c.eleves) ? c.eleves.length : 0));
    });
  }
  setText('kpiNbClasses', nbC);
  setText('navBadgeClasses', nbC);
  setText('kpiSubClasses', totalEleves > 0 ? `${totalEleves} élève${totalEleves > 1 ? 's' : ''} inscrit${totalEleves > 1 ? 's' : ''}` : 'Groupes configurés');

  // 3. Fiches & Matières
  const nbF = (typeof listeFichesMemoire !== 'undefined') ? listeFichesMemoire.length : 0;
  const nbM = (typeof listeMatieresMemoire !== 'undefined') ? listeMatieresMemoire.length : 0;
  setText('kpiNbFiches', nbF);
  setText('navBadgeFiches', nbF);
  setText('kpiSubFiches', `${nbM} matière${nbM > 1 ? 's' : ''}`);

  // 4. Séances
  const seances = (typeof listeSeancesMemoire !== 'undefined') ? listeSeancesMemoire : [];
  const actives = seances.filter(s => s.actif);
  setText('kpiNbSeances', actives.length);
  setText('navBadgeSeances', actives.length);
  setText('kpiSubSeances', `${seances.length} séance${seances.length > 1 ? 's' : ''} au total`);

  // 5. Résultats & Copies
  const notes = (typeof memoireToutesLesNotes !== 'undefined') ? memoireToutesLesNotes : [];
  setText('kpiNbCopies', notes.length);
  setText('navBadgeResultats', notes.length);
  if (notes.length > 0) {
    const notesValides = notes.map(n => Number(n.note)).filter(v => !isNaN(v));
    const moy = notesValides.length ? (notesValides.reduce((a, b) => a + b, 0) / notesValides.length).toFixed(1) : '—';
    setText('kpiSubCopies', `Moyenne globale : ${moy}/20`);
  } else {
    setText('kpiSubCopies', 'Aucune copie rendue');
  }

  // 6. Bloc résumé : Séances actives
  const boxSeances = document.getElementById('resumeSeancesActives');
  if (boxSeances) {
    if (actives.length === 0) {
      boxSeances.innerHTML = `<p style="color:#64748b; font-size:0.86rem; margin:0;">Aucune séance active actuellement. Cliquez sur <strong>Lancer une séance</strong> pour démarrer une évaluation.</p>`;
    } else {
      boxSeances.innerHTML = actives.slice(0, 5).map(s => `
        <div class="resume-list-item">
          <div style="min-width:0;">
            <div style="font-weight:700; color:var(--pronote-dark); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${escapeHtmlSimple(s.qcm_titre || 'QCM')}
            </div>
            <div style="font-size:0.78rem; color:#64748b;">
              Classe : <strong>${escapeHtmlSimple(s.classe_nom || s.classe || '—')}</strong> • Code : <code style="background:#e2e8f0; padding:1px 5px; border-radius:4px; font-weight:bold;">${escapeHtmlSimple(s.code_session || '')}</code>
            </div>
          </div>
          <span class="badge" style="background:#dcfce7; color:#15803d; font-size:0.75rem; padding:3px 8px; border-radius:999px; font-weight:700;">Active</span>
        </div>
      `).join('');
    }
  }

  // 7. Bloc résumé : Dernières copies soumises
  const boxCopies = document.getElementById('resumeDernieresCopies');
  if (boxCopies) {
    if (notes.length === 0) {
      boxCopies.innerHTML = `<p style="color:#64748b; font-size:0.86rem; margin:0;">Aucune copie enregistrée pour le moment.</p>`;
    } else {
      boxCopies.innerHTML = notes.slice(0, 5).map(n => {
        const noteAffichee = (n.note_proportionnelle !== null && n.note_proportionnelle !== undefined && n.questions_traitees < n.questions_totales)
          ? `${Number(n.note_proportionnelle).toFixed(1)}/20 <span style="font-size:0.72rem; color:#b45309;">(prop.)</span>`
          : `${Number(n.note || 0).toFixed(1)}/20`;
        const alerteBadge = (Number(n.nb_sorties || 0) > 0)
          ? `<span style="background:#fee2e2; color:#dc2626; font-size:0.72rem; padding:2px 6px; border-radius:4px; font-weight:700;">⚠️ ${n.nb_sorties} sortie${n.nb_sorties > 1 ? 's' : ''}</span>`
          : '';
        return `
          <div class="resume-list-item">
            <div style="min-width:0;">
              <div style="font-weight:700; color:var(--text-color);">
                ${escapeHtmlSimple((n.nom || '') + ' ' + (n.prenom || ''))}
                <span style="font-weight:500; color:#64748b; font-size:0.78rem;">(${escapeHtmlSimple(n.classe || '—')})</span>
              </div>
              <div style="font-size:0.78rem; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${escapeHtmlSimple(n.qcm_titre || 'Évaluation')}
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
              ${alerteBadge}
              <strong style="color:var(--pronote-blue); font-size:0.92rem;">${noteAffichee}</strong>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.innerText = val;
}

function escapeHtmlSimple(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}