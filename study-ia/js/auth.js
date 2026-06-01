// ═══════════════════════════════════════════════════════════════
//  js/auth.js — Firebase Phone Authentication pour Study-IA
//  Flow : Numéro → OTP SMS (6 cases) → Session → /app.html
// ═══════════════════════════════════════════════════════════════

import { auth, db } from "./firebase-config.js";
import { 
  RecaptchaVerifier, 
  signInWithPhoneNumber 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── VARIABLES DE CONTRÔLE D'ÉTAT ─────────────────────────────────────────────
let confirmationResult = null;
let currentPhoneNumber = "";
let loginAttempts = 0;
let countdownTimer = null;
const MAX_ATTEMPTS = 3;
const EXPIRE_MINUTES = 5;

// ── ÉLÉMENTS DU DOM ──────────────────────────────────────────────────────────
const stepPhone = document.getElementById('step-phone');
const stepOtp = document.getElementById('step-otp');
const phoneInput = document.getElementById('phone-input');
const sendOtpBtn = document.getElementById('send-otp-btn');
const otpBoxes = document.querySelectorAll('.otp-input');
const otpTimer = document.getElementById('otp-timer');
const otpLoader = document.getElementById('otp-loader');
const otpError = document.getElementById('otp-error');
const verifyOtpBtn = document.getElementById('verify-otp-btn');
const resendBtn = document.getElementById('resend-btn');
const phoneDisplay = document.getElementById('phone-display');

// ── 1. INITIALISATION DU RECAPTCHA INVISIBLE (CIBLE BIEN LE CONTENEUR HTML) ──
function initRecaptcha() {
  if (!window.recaptchaVerifier) {
    // CORRECTION : Ciblage de 'recaptcha-container' au lieu de 'send-otp-btn'
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA résolu automatiquement lors du process d'envoi
      },
      'expired-callback': () => {
        if (window.recaptchaVerifier) {
          window.recaptchaVerifier.clear();
          window.recaptchaVerifier = null;
        }
        initRecaptcha();
      }
    });
  }
}

// ── 2. ENVOI DU SMS (FONCTION MULTI-RÉUTILISABLE) ────────────────────────────
async function sendOTP(e) {
  if (e) e.preventDefault();
  hideOTPError();
  
  const rawValue = phoneInput.value.trim();
  const cameroonRegex = /^(6|2)\d{8}$/; // Gestion intelligente stricte des 9 chiffres au Cameroun

  if (!cameroonRegex.test(rawValue)) {
    showToast("Format invalide. Saisissez les 9 chiffres (ex: 699xxxxxx).", "error");
    return;
  }

  currentPhoneNumber = "+237" + rawValue;
  sendOtpBtn.disabled = true;
  sendOtpBtn.textContent = "Envoi en cours…";
  
  try {
    initRecaptcha();
    const appVerifier = window.recaptchaVerifier;
    
    confirmationResult = await signInWithPhoneNumber(auth, currentPhoneNumber, appVerifier);
    
    // Passage fluide à l'étape du code OTP
    stepPhone.style.display = "none";
    stepOtp.style.display = "block";
    if (phoneDisplay) phoneDisplay.textContent = currentPhoneNumber;
    
    // Focus automatique immédiat sur la première case
    if (otpBoxes[0]) otpBoxes[0].focus();
    
    loginAttempts = 0;
    startTimer();
    showToast("Code envoyé par SMS !", "success");
    
  } catch (error) {
    console.error("Erreur d'envoi SMS :", error);
    if (window.recaptchaVerifier) {
      window.recaptchaVerifier.clear();
      window.recaptchaVerifier = null;
    }
    sendOtpBtn.disabled = false;
    sendOtpBtn.textContent = "Recevoir le code par SMS";
    showToast("Impossible d'envoyer le SMS. Réessayez plus tard.", "error");
  }
}

// ── 3. COMPORTEMENT UX DES 6 CASES OTP ───────────────────────────────────────
otpBoxes.forEach((box, index) => {
  box.addEventListener('input', (e) => {
    const value = e.target.value;
    e.target.value = value.replace(/[^0-9]/g, ''); // Uniquement des caractères numériques
    
    if (box.value !== "" && index < otpBoxes.length - 1) {
      otpBoxes[index + 1].focus(); // Passe à la case suivante
    }

    // Si la 6ème case est saisie, déclenchement immédiat de la validation
    const code = getOtpCode();
    if (code.length === 6) {
      validateOTP(code);
    }
  });

  box.addEventListener('keydown', (e) => {
    if (e.key === "Backspace" && box.value === "" && index > 0) {
      otpBoxes[index - 1].focus(); // Retour à la case précédente
    }
  });
});

function getOtpCode() {
  let code = "";
  otpBoxes.forEach(box => code += box.value);
  return code;
}

// ── 4. GESTION DU MINUTEUR DE COMPTE À REBOURS ───────────────────────────────
function startTimer() {
  clearInterval(countdownTimer);
  let timeRemaining = EXPIRE_MINUTES * 60;
  
  if (otpTimer) otpTimer.style.display = "block";
  if (resendBtn) resendBtn.style.display = "none";

  countdownTimer = setInterval(() => {
    timeRemaining--;
    
    const minutes = String(Math.floor(timeRemaining / 60)).padStart(2, '0');
    const seconds = String(timeRemaining % 60).padStart(2, '0');
    if (otpTimer) otpTimer.textContent = `Expire dans ${minutes}:${seconds}`;

    if (timeRemaining <= 0) {
      clearInterval(countdownTimer);
      if (otpTimer) otpTimer.textContent = "Code expiré";
      if (resendBtn) resendBtn.style.display = "inline-block";
      showOTPError("Le code a expiré. Veuillez demander un nouveau code.");
      blockOTPInputs(true);
    }
  }, 1000);
}

// ── 5. VALIDATION DU CODE OTP AUPRÈS DE FIREBASE ─────────────────────────────
async function validateOTP(smsCode) {
  if (smsCode.length !== 6) {
    showOTPError("Veuillez entrer le code complet à 6 chiffres.");
    return;
  }

  showLoading(true);
  hideOTPError();

  try {
    const result = await confirmationResult.confirm(smsCode);
    const user = result.user;

    // Sauvegarde transparente du profil dans Firestore
    await saveUserToFirestore(user);
    
    clearInterval(countdownTimer);
    showToast("Connexion réussie ! Redirection…", "success");
    
    setTimeout(() => {
      window.location.href = "/app.html";
    }, 1200);
    
  } catch (error) {
    showLoading(false);
    loginAttempts++;
    
    // Remise à zéro des cases pour faciliter une nouvelle saisie
    otpBoxes.forEach(box => box.value = "");
    if (otpBoxes[0]) otpBoxes[0].focus();

    if (loginAttempts >= MAX_ATTEMPTS) {
      clearInterval(countdownTimer);
      showOTPError("Trop de tentatives infructueuses. Cliquez sur 'Renvoyer le code'.");
      blockOTPInputs(true);
      if (resendBtn) resendBtn.style.display = "inline-block";
    } else {
      showOTPError(`Code incorrect. Il vous reste ${MAX_ATTEMPTS - loginAttempts} essai(s).`);
    }
  }
}

// ── 6. LIAISON DES ÉVÉNEMENTS SUR LES BOUTONS ────────────────────────────────

// Clic Étape 1 : Envoi du numéro
if (sendOtpBtn) {
  sendOtpBtn.addEventListener('click', sendOTP);
}

// Clic Étape 2 : Validation manuelle via le bouton alternatif
if (verifyOtpBtn) {
  verifyOtpBtn.addEventListener('click', () => {
    validateOTP(getOtpCode());
  });
}

// Clic Étape 2 : Demande de renvoi de SMS en cas d'expiration/blocage
if (resendBtn) {
  resendBtn.addEventListener('click', async () => {
    hideOTPError();
    blockOTPInputs(false);
    
    try {
      initRecaptcha();
      const appVerifier = window.recaptchaVerifier;
      
      confirmationResult = await signInWithPhoneNumber(auth, currentPhoneNumber, appVerifier);
      
      otpBoxes.forEach(box => box.value = "");
      if (otpBoxes[0]) otpBoxes[0].focus();
      loginAttempts = 0;
      startTimer();
      showToast("Nouveau code envoyé !", "success");
    } catch (error) {
      showOTPError("Erreur lors du renvoi. Veuillez rafraîchir la page.");
    }
  });
}

// ── 7. FONCTIONS FONCTIONNELLES ET COMPOSANTS HELPERS ────────────────────────
async function saveUserToFirestore(user) {
  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      // Configuration initiale pour les nouveaux comptes d'étudiants
      await setDoc(userRef, {
        uid: user.uid,
        phone: user.phoneNumber,
        createdAt: serverTimestamp(),
        plan: "free",
        credits: 10,
        generationCount: 0
      });
    } else {
      // Simple mise à jour de traçabilité pour les utilisateurs existants
      await setDoc(userRef, { lastLoginAt: serverTimestamp() }, { merge: true });
    }
  } catch (e) {
    console.error("Erreur écriture Firestore:", e);
  }
}

function showOTPError(msg) {
  if (otpError) {
    otpError.textContent = msg;
    otpError.style.display = "block";
  }
}

function hideOTPError() {
  if (otpError) otpError.style.display = "none";
}

function showLoading(isLoading) {
  if (otpLoader && verifyOtpBtn) {
    otpLoader.style.display = isLoading ? "block" : "none";
    verifyOtpBtn.style.display = isLoading ? "none" : "block";
  }
}

function blockOTPInputs(isBlocked) {
  otpBoxes.forEach(box => box.disabled = isBlocked);
  if (verifyOtpBtn) verifyOtpBtn.disabled = isBlocked;
}

function showToast(message, type = "info") {
  if (typeof window.showToast === "function") {
    window.showToast(message, type);
  } else {
    console.log(`[${type.toUpperCase()}] ${message}`);
  }
}