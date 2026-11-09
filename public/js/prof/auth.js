let currentProf = null;
let authMode = "login";

window.addEventListener('DOMContentLoaded', () => {
  const savedProf = localStorage.getItem('qcm_prof_user');
  if (savedProf) {
    try {
      currentProf = JSON.parse(savedProf);
    } catch(e) {
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
  document.getElementById('viewProfDashboard').style.display = 'block';
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
}


// ================= NAVIGATION PAR TUILES =================
function retournerAuHubProf() {
  document.querySelectorAll('.rubrique-contenu-prof').forEach(el => el.style.display = 'none');
  const hub = document.getElementById('vueHubProf');
  if (hub) hub.style.display = 'block';
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
}

function actualiserCompteursTuiles() {
  // 1. Classes
  const elClasses = document.getElementById('tuileInfoClasses');
  if (elClasses && typeof listeClassesMemoire !== 'undefined') {
    const nbC = listeClassesMemoire.length;
    elClasses.innerText = nbC > 0 ? (nbC + ' classe' + (nbC > 1 ? 's configurées' : ' configurée')) : '0 classe enregistrée';
  }

  // 2. Fiches & Matières
  const elFiches = document.getElementById('tuileInfoFiches');
  if (elFiches) {
    const nbF = (typeof listeFichesMemoire !== 'undefined') ? listeFichesMemoire.length : 0;
    const nbM = (typeof listeMatieresMemoire !== 'undefined') ? listeMatieresMemoire.length : 0;
    elFiches.innerText = nbF + ' fiche' + (nbF > 1 ? 's' : '') + ' • ' + nbM + ' matière' + (nbM > 1 ? 's' : '');
  }

  // 3. Banque QCM
  const elBanque = document.getElementById('tuileInfoBanque');
  if (elBanque && typeof listeBanqueQcmMemoire !== 'undefined') {
    const nbQ = listeBanqueQcmMemoire.length;
    elBanque.innerText = nbQ > 0 ? (nbQ + ' questionnaire' + (nbQ > 1 ? 's' : '')) : '0 questionnaire';
  }

  // 4. Séances
  const elSeances = document.getElementById('tuileInfoSeances');
  if (elSeances && typeof listeSeancesMemoire !== 'undefined') {
    const actives = listeSeancesMemoire.filter(s => s.actif).length;
    elSeances.innerText = actives > 0 ? (actives + ' active' + (actives > 1 ? 's' : '') + ' sur ' + listeSeancesMemoire.length) : '0 active (' + listeSeancesMemoire.length + ' clôturée' + (listeSeancesMemoire.length > 1 ? 's' : '') + ')';
  }

  // 5. Résultats & Copies
  const elResultats = document.getElementById('tuileInfoResultats');
  if (elResultats && typeof memoireToutesLesNotes !== 'undefined') {
    const nbNotes = memoireToutesLesNotes.length;
    elResultats.innerText = nbNotes > 0 ? (nbNotes + ' copie' + (nbNotes > 1 ? 's enregistrées' : ' enregistrée')) : '0 copie';
  }
}
