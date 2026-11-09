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
  if (typeof chargerBanqueProf === 'function') chargerBanqueProf();
  if (typeof chargerClassesProf === 'function') chargerClassesProf();
  if (typeof chargerSeancesProf === 'function') chargerSeancesProf();
  if (typeof chargerResultatsProf === 'function') chargerResultatsProf();
}
