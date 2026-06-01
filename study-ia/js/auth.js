// ═══════════════════════════════════════════════════════════════
//  js/auth.js — Firebase Phone Authentication pour Study-IA
//  Flow : Numéro → OTP SMS (6 cases) → Session → /app.html
// ═══════════════════════════════════════════════════════════════

import { auth, db }                        from "./firebase-config.js";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


// ─────────────────────────────────────────────
//  CONSTANTES
// ─────────────────────────────────────────────
const MAX_ATTEMPTS    = 3;   // tentatives max avant blocage
const OTP_EXPIRY_MS   = 5 * 60 * 1000;  // 5 minutes en millisecondes

// ─────────────────────────────────────────────
//  ÉTAT GLOBAL (module-scoped)
// ─────────────────────────────────────────────
let confirmationResult = null;  // résultat retourné par Firebase après envoi SMS
let wrongAttempts      = 0;     // compteur de codes faux
let otpSentAt          = null;  // timestamp d'envoi de l'OTP
let expiryTimer        = null;  // setInterval pour le compte à rebours


// ═══════════════════════════════════════════════════════════════
//  1. INITIALISATION reCAPTCHA (INVISIBLE)
//     À appeler une seule fois quand la page de login est chargée
// ═══════════════════════════════════════════════════════════════
function initRecaptcha() {
  // Si déjà initialisé, on ne le refait pas
  if (window.recaptchaVerifier) return;

  window.recaptchaVerifier = new RecaptchaVerifier(
    auth,
    "send-otp-btn",   // ID du bouton d'envoi dans login.html
    {
      size: "invisible",  // invisible = pas de widget visible, juste une vérification silencieuse
      callback: () => {
        // reCAPTCHA validé automatiquement → on peut envoyer le SMS
      },
      "expired-callback": () => {
        // Le token reCAPTCHA a expiré (après ~2 min d'inactivité)
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
        initRecaptcha(); // on le réinitialise
        showToast("Session reCAPTCHA expirée. Réessaie.", "warning");
      },
    }
  );
}


// ═══════════════════════════════════════════════════════════════
//  2. ENVOI DE L'OTP PAR SMS
// ═══════════════════════════════════════════════════════════════
async function sendOTP() {
  const phoneInput = document.getElementById("phone-input");
  if (!phoneInput) return;

  const rawPhone = phoneInput.value.trim();

  // ── Validation basique du format ──────────────────────────────
  // Le numéro doit être au format international E.164 : +237XXXXXXXXX
  const phoneRegex = /^\+[1-9]\d{7,14}$/;
  if (!phoneRegex.test(rawPhone)) {
    showToast("Numéro invalide. Utilise le format international : +237XXXXXXXXX", "error");
    return;
  }

  // ── Désactiver le bouton pendant l'envoi ──────────────────────
  const btn = document.getElementById("send-otp-btn");
  if (btn) {
    btn.disabled    = true;
    btn.textContent = "Envoi en cours…";
  }

  try {
    // Initialise reCAPTCHA si pas encore fait
    initRecaptcha();

    // Appel Firebase : envoie le SMS et retourne un objet confirmationResult
    confirmationResult = await signInWithPhoneNumber(
      auth,
      rawPhone,
      window.recaptchaVerifier
    );

    // Mémoriser l'heure d'envoi pour gérer l'expiration
    otpSentAt     = Date.now();
    wrongAttempts = 0; // reset le compteur

    // Passer à l'étape 2 (afficher les 6 cases OTP)
    showOTPStep(rawPhone);
    startExpiryCountdown();
    showToast("Code envoyé par SMS !", "success");

  } catch (err) {
    console.error("Erreur sendOTP :", err);

    // Réinitialiser reCAPTCHA en cas d'erreur (obligatoire sinon Firebase bloque)
    if (window.recaptchaVerifier) {
      window.recaptchaVerifier.clear();
      window.recaptchaVerifier = null;
    }

    if (btn) {
      btn.disabled    = false;
      btn.textContent = "Recevoir le code";
    }

    // Messages d'erreur lisibles selon le code Firebase
    const messages = {
      "auth/invalid-phone-number"  : "Numéro de téléphone invalide.",
      "auth/too-many-requests"     : "Trop de tentatives. Réessaie dans quelques minutes.",
      "auth/quota-exceeded"        : "Quota SMS dépassé. Contacte le support.",
      "auth/captcha-check-failed"  : "Vérification reCAPTCHA échouée. Réessaie.",
    };
    const msg = messages[err.code] || "Erreur lors de l'envoi du SMS. Réessaie.";
    showToast(msg, "error");
  }
}


// ═══════════════════════════════════════════════════════════════
//  3. AFFICHER L'ÉTAPE OTP (6 cases de saisie)
// ═══════════════════════════════════════════════════════════════
function showOTPStep(phoneNumber) {
  const stepPhone = document.getElementById("step-phone");
  const stepOTP   = document.getElementById("step-otp");

  // Cacher l'étape 1 (saisie du numéro)
  if (stepPhone) stepPhone.style.display = "none";

  // Afficher l'étape 2 (saisie du code)
  if (stepOTP) {
    stepOTP.style.display = "block";

    // Afficher le numéro masqué dans le message de confirmation
    const phoneDisplay = document.getElementById("phone-display");
    if (phoneDisplay) {
      // Masquer une partie du numéro : +237 6XX XX XX 89 → +237 6•• •• •• 89
      const masked = phoneNumber.slice(0, 5) + "•••••" + phoneNumber.slice(-2);
      phoneDisplay.textContent = masked;
    }

    // Focus automatique sur la première case
    const firstInput = document.querySelector(".otp-input");
    if (firstInput) firstInput.focus();
  }
}


// ═══════════════════════════════════════════════════════════════
//  4. NAVIGATION ENTRE LES 6 CASES OTP (clavier)
// ═══════════════════════════════════════════════════════════════
function setupOTPInputs() {
  const inputs = document.querySelectorAll(".otp-input");
  if (!inputs.length) return;

  inputs.forEach((input, index) => {
    // ── Saisie d'un chiffre → passer à la case suivante ─────────
    input.addEventListener("input", (e) => {
      // Garder seulement le dernier caractère saisi (cas collé-clavier)
      const val = e.target.value.replace(/\D/g, "").slice(-1);
      e.target.value = val;

      if (val && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }

      // Si toutes les cases sont remplies → soumettre automatiquement
      const code = getOTPCode();
      if (code.length === 6) {
        verifyOTP(code);
      }
    });

    // ── Retour arrière → effacer et revenir à la case précédente ─
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !e.target.value && index > 0) {
        inputs[index - 1].focus();
        inputs[index - 1].value = "";
      }
    });

    // ── Coller un code 6 chiffres (ex : depuis les notifications) ─
    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
      if (pasted.length === 6) {
        // Remplir toutes les cases
        inputs.forEach((inp, i) => {
          inp.value = pasted[i] || "";
        });
        inputs[5].focus();
        verifyOTP(pasted);
      }
    });
  });
}

// Récupère le code OTP assemblé depuis les 6 cases
function getOTPCode() {
  const inputs = document.querySelectorAll(".otp-input");
  return Array.from(inputs).map(i => i.value).join("");
}

// Vide toutes les cases OTP
function clearOTPInputs() {
  const inputs = document.querySelectorAll(".otp-input");
  inputs.forEach(i => (i.value = ""));
  if (inputs[0]) inputs[0].focus();
}


// ═══════════════════════════════════════════════════════════════
//  5. VÉRIFICATION DU CODE OTP
// ═══════════════════════════════════════════════════════════════
async function verifyOTP(code) {
  // ── Vérifier que le code n'est pas expiré ─────────────────────
  if (otpSentAt && Date.now() - otpSentAt > OTP_EXPIRY_MS) {
    showOTPError("Code expiré. Clique sur « Renvoyer le code ».");
    showResendButton();
    return;
  }

  // ── Vérifier qu'on n'a pas dépassé les tentatives max ────────
  if (wrongAttempts >= MAX_ATTEMPTS) {
    showOTPError("Trop de tentatives. Clique sur « Renvoyer le code ».");
    showResendButton();
    blockOTPInputs();
    return;
  }

  if (!confirmationResult) {
    showToast("Session expirée. Recharge la page.", "error");
    return;
  }

  // ── Désactiver les cases pendant la vérification ──────────────
  blockOTPInputs(true);
  showLoadingOTP(true);

  try {
    // Firebase vérifie le code OTP
    const result = await confirmationResult.confirm(code);
    const user   = result.user; // objet utilisateur Firebase connecté

    // ── Créer/mettre à jour le profil dans Firestore ──────────
    await saveUserToFirestore(user);

    // ── Nettoyer le timer ─────────────────────────────────────
    if (expiryTimer) clearInterval(expiryTimer);

    showToast("Connexion réussie ! Redirection…", "success");

    // ── Rediriger vers /app.html après un court délai ─────────
    setTimeout(() => {
      window.location.href = "/app.html";
    }, 1200);

  } catch (err) {
    console.error("Erreur verifyOTP :", err);

    wrongAttempts++;
    const remaining = MAX_ATTEMPTS - wrongAttempts;

    blockOTPInputs(false); // réactiver les cases
    showLoadingOTP(false);
    clearOTPInputs();

    if (err.code === "auth/invalid-verification-code") {
      if (remaining > 0) {
        showOTPError(`Code incorrect. Il te reste ${remaining} tentative${remaining > 1 ? "s" : ""}.`);
      } else {
        // Plus de tentatives disponibles
        showOTPError("Trop de tentatives. Clique sur « Renvoyer le code ».");
        showResendButton();
        blockOTPInputs(true);
      }
    } else if (err.code === "auth/code-expired") {
      showOTPError("Code expiré. Clique sur « Renvoyer le code ».");
      showResendButton();
    } else {
      showOTPError("Erreur de vérification. Réessaie.");
    }
  }
}


// ═══════════════════════════════════════════════════════════════
//  6. SAUVEGARDER L'UTILISATEUR DANS FIRESTORE
// ═══════════════════════════════════════════════════════════════
async function saveUserToFirestore(user) {
  const userRef = doc(db, "users", user.uid);
  const snap    = await getDoc(userRef);

  if (!snap.exists()) {
    // Nouveau compte : créer le document
    await setDoc(userRef, {
      uid          : user.uid,
      phone        : user.phoneNumber,
      createdAt    : serverTimestamp(),
      plan         : "free",       // plan par défaut
      credits      : 10,           // crédits offerts à l'inscription
      generationCount: 0,
    });
  } else {
    // Compte existant : mettre à jour la date de dernière connexion
    await setDoc(userRef, { lastLoginAt: serverTimestamp() }, { merge: true });
  }
}


// ═══════════════════════════════════════════════════════════════
//  7. COMPTE À REBOURS D'EXPIRATION (5 minutes)
// ═══════════════════════════════════════════════════════════════
function startExpiryCountdown() {
  if (expiryTimer) clearInterval(expiryTimer);

  const timerEl = document.getElementById("otp-timer");

  expiryTimer = setInterval(() => {
    const elapsed   = Date.now() - otpSentAt;
    const remaining = OTP_EXPIRY_MS - elapsed;

    if (remaining <= 0) {
      clearInterval(expiryTimer);
      if (timerEl) timerEl.textContent = "Code expiré";
      showOTPError("Ton code a expiré après 5 minutes.");
      showResendButton();
      blockOTPInputs(true);
      return;
    }

    // Afficher MM:SS
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    if (timerEl) {
      timerEl.textContent = `Expire dans ${mins}:${secs.toString().padStart(2, "0")}`;
    }
  }, 1000);
}


// ═══════════════════════════════════════════════════════════════
//  8. RENVOI DU CODE (bouton "Renvoyer le code")
// ═══════════════════════════════════════════════════════════════
async function resendOTP() {
  const resendBtn = document.getElementById("resend-btn");
  if (resendBtn) resendBtn.style.display = "none";

  // Réinitialiser l'état
  wrongAttempts = 0;
  clearOTPInputs();
  blockOTPInputs(false);
  hideOTPError();

  // Réinitialiser reCAPTCHA (obligatoire pour un second envoi)
  if (window.recaptchaVerifier) {
    window.recaptchaVerifier.clear();
    window.recaptchaVerifier = null;
  }

  // Récupérer le numéro depuis l'affichage ou l'input
  // On remet l'étape 1 visible pour que l'utilisateur confirme son numéro
  const stepPhone = document.getElementById("step-phone");
  const stepOTP   = document.getElementById("step-otp");
  if (stepPhone) stepPhone.style.display = "block";
  if (stepOTP)   stepOTP.style.display   = "none";

  // Réactiver le bouton d'envoi
  const sendBtn = document.getElementById("send-otp-btn");
  if (sendBtn) {
    sendBtn.disabled    = false;
    sendBtn.textContent = "Recevoir le code";
  }

  if (expiryTimer) clearInterval(expiryTimer);
  showToast("Saisis à nouveau ton numéro pour renvoyer le code.", "info");
}


// ═══════════════════════════════════════════════════════════════
//  9. HELPERS UI
// ═══════════════════════════════════════════════════════════════

// Bloquer ou débloquer les cases OTP
function blockOTPInputs(block = true) {
  const inputs = document.querySelectorAll(".otp-input");
  inputs.forEach(i => {
    i.disabled = block;
    if (block) i.classList.add("disabled");
    else       i.classList.remove("disabled");
  });
}

// Afficher / cacher le loader pendant la vérification
function showLoadingOTP(show) {
  const loader  = document.getElementById("otp-loader");
  const verBtn  = document.getElementById("verify-otp-btn");
  if (loader) loader.style.display = show ? "block" : "none";
  if (verBtn) verBtn.style.display = show ? "none" : "block";
}

// Afficher le message d'erreur sous les cases
function showOTPError(msg) {
  const errEl = document.getElementById("otp-error");
  if (errEl) {
    errEl.textContent   = msg;
    errEl.style.display = "block";
    // Petite animation de secousse
    errEl.classList.remove("shake");
    void errEl.offsetWidth; // reflow pour relancer l'animation
    errEl.classList.add("shake");
  }
}

function hideOTPError() {
  const errEl = document.getElementById("otp-error");
  if (errEl) errEl.style.display = "none";
}

// Afficher le bouton "Renvoyer le code"
function showResendButton() {
  const resendBtn = document.getElementById("resend-btn");
  if (resendBtn) resendBtn.style.display = "inline-block";
  // Cacher le timer
  const timerEl = document.getElementById("otp-timer");
  if (timerEl) timerEl.style.display = "none";
}

// Toast de notification (utilise la fonction définie dans main.js)
function showToast(message, type = "info") {
  if (typeof window.showToast === "function") {
    window.showToast(message, type);
  } else {
    // Fallback si main.js n'est pas chargé
    console.log(`[${type.toUpperCase()}] ${message}`);
    alert(message);
  }
}


// ═══════════════════════════════════════════════════════════════
//  10. ÉTAT DE CONNEXION (persistance sur toutes les pages)
// ═══════════════════════════════════════════════════════════════
onAuthStateChanged(auth, (user) => {
  if (user) {
    // ── Utilisateur connecté ──────────────────────────────────
    // Mettre à jour l'UI si des éléments de profil existent dans la page
    const userPhoneEl = document.getElementById("user-phone");
    if (userPhoneEl) userPhoneEl.textContent = user.phoneNumber;

    // Si on est sur login.html alors qu'on est déjà connecté → rediriger
    if (window.location.pathname.includes("login")) {
      window.location.href = "/app.html";
    }

  } else {
    // ── Utilisateur non connecté ──────────────────────────────
    // Si on est sur une page protégée → rediriger vers login
    const protectedPages = ["/app.html", "/dashboard.html", "/payment.html"];
    const currentPath    = window.location.pathname;
    if (protectedPages.some(p => currentPath.includes(p))) {
      window.location.href = "/login.html";
    }
  }
});


// ═══════════════════════════════════════════════════════════════
//  11. DÉCONNEXION
// ═══════════════════════════════════════════════════════════════
async function logout() {
  try {
    await signOut(auth);
    window.location.href = "/login.html";
  } catch (err) {
    console.error("Erreur logout :", err);
    showToast("Erreur lors de la déconnexion.", "error");
  }
}


// ═══════════════════════════════════════════════════════════════
//  12. INITIALISATION AU CHARGEMENT DE LA PAGE
// ═══════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {

  // ── Bouton "Recevoir le code" ─────────────────────────────────
  const sendBtn = document.getElementById("send-otp-btn");
  if (sendBtn) {
    initRecaptcha(); // préparer reCAPTCHA dès le chargement
    sendBtn.addEventListener("click", sendOTP);
  }

  // ── Bouton "Vérifier le code" (fallback si l'utilisateur ne saisit pas les 6 cases) ─
  const verifyBtn = document.getElementById("verify-otp-btn");
  if (verifyBtn) {
    verifyBtn.addEventListener("click", () => {
      const code = getOTPCode();
      if (code.length < 6) {
        showOTPError("Entre les 6 chiffres du code reçu.");
        return;
      }
      verifyOTP(code);
    });
  }

  // ── Bouton "Renvoyer le code" ─────────────────────────────────
  const resendBtn = document.getElementById("resend-btn");
  if (resendBtn) {
    resendBtn.addEventListener("click", resendOTP);
  }

  // ── Bouton "Déconnexion" (présent sur app.html / dashboard.html) ─
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }

  // ── Configurer la navigation entre les 6 cases OTP ───────────
  setupOTPInputs();
});


// ─────────────────────────────────────────────
//  EXPORTS (pour les autres modules si besoin)
// ─────────────────────────────────────────────
export { auth, logout };