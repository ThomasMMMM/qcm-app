// Fonctions utilitaires de hachage PBKDF2 via Web Crypto API
async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex ? new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]);
  const derivedKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const exportedKey = await crypto.subtle.exportKey("raw", derivedKey);
  const hashHex = Array.from(new Uint8Array(exportedKey)).map(b => b.toString(16).padStart(2, '0')).join('');
  const saltOut = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  return { hash: hashHex, salt: saltOut };
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { action, email, password, nom } = body;

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email et mot de passe requis" }), { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. INSCRIPTION
    if (action === "register") {
      const existe = await env.DB.prepare("SELECT id FROM professeurs WHERE email = ?").bind(cleanEmail).first();
      if (existe) {
        return new Response(JSON.stringify({ error: "Cet email est déjà utilisé" }), { status: 400 });
      }

      const { hash, salt } = await hashPassword(password);
      const res = await env.DB.prepare(
        "INSERT INTO professeurs (email, password_hash, salt, nom) VALUES (?, ?, ?, ?)"
      ).bind(cleanEmail, hash, salt, nom ? nom.trim() : "").run();

      return new Response(JSON.stringify({
        success: true,
        user: { id: res.meta.last_row_id, email: cleanEmail, nom: nom || "" }
      }), { headers: { "Content-Type": "application/json" } });
    }

    // 2. CONNEXION
    if (action === "login") {
      const prof = await env.DB.prepare("SELECT * FROM professeurs WHERE email = ?").bind(cleanEmail).first();
      if (!prof) {
        return new Response(JSON.stringify({ error: "Identifiants invalides" }), { status: 401 });
      }

      const { hash } = await hashPassword(password, prof.salt);
      if (hash !== prof.password_hash) {
        return new Response(JSON.stringify({ error: "Identifiants invalides" }), { status: 401 });
      }

      return new Response(JSON.stringify({
        success: true,
        user: { id: prof.id, email: prof.email, nom: prof.nom }
      }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Action inconnue" }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
