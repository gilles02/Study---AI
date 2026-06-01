// js/auth.js
import { auth } from "./firebase-config.js";
import { 
  RecaptchaVerifier, 
  signInWithPhoneNumber 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ── VARIABLES DE CONTRÔLE D'ÉTAT ─────────────────────────────────────────────
let confirmationResult = null;
let currentPhoneNumber = "";
let loginAttempts = 0;
let countdownTimer = null;
const MAX_ATTEMPTS = 3;
const EXPIRE_MINUTES = 5;

// ── ÉLÉMENTS DU DOM ──────────────────────────────────────────────────────────
const formStep1 = document.getElementById('auth-step1');
const formStep2 = document.getElementById('auth-step2');
const phoneField = document.getElementById('phone-field');
const errorBoxStep1 = document.getElementById('error-box');
const errorBoxStep2 = document.getElementById('error-box-step2');
const otpBoxes = document.querySelectorAll('.otp-box');
const countdownEl = document.getElementById('countdown');
const timerTextEl = document.getElementById('timer-text');
const resendBtn = document.getElementById('resend-btn');

// ── 1. INITIALISATION DU RECAPTCHA INVISIBLE ─────────────────────────────────
function initInvisibleRecaptcha() {
  if (!window.recaptchaVerifier) {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA résolu automatiquement
      },
      'expired-callback': () => {
        window.recaptchaVerifier.clear();
        initInvisibleRecaptcha();
      }
    });
  }
}

// ── 2. COMPORTEMENT UX DES 6 CASES OTP ───────────────────────────────────────
otpBoxes.forEach((box, index) => {
  // Focus sur la première case au chargement de l'étape 2
  box.addEventListener('input', (e) => {
    const value = e.target.value;
    // Forcer uniquement les chiffres
    e.target.value = value.replace(/[^0-9]/g, '');
    
    if (box.value !== "" && index < otpBoxes.length - 1) {
      otpBoxes[index + 1].focus(); // Passe à la case suivante
    }
  });

  // Gestion du retour arrière (Backspace)
  box.addEventListener('keydown', (e) => {
    if (e.key === "Backspace" && box.value === "" && index > 0) {
      otpBoxes[index - 1].focus(); // Recule d'une case
    }
  });
  
  // Style dynamique lors du focus
  box.addEventListener('focus', () => box.style.borderColor = "#1F5C8B");
  box.addEventListener('blur', () => box.style.borderColor = "#e2e8f0");
});

// Récupérer le code complet des 6 cases
function getOtpCode() {
  let code = "";
  otpBoxes.forEach(box => code += box.value);
  return code;
}

// ── 3. GESTION DU MINUTEUR DE 5 MINUTES ──────────────────────────────────────
function startTimer() {
  clearInterval(countdownTimer);
  let timeRemaining = EXPIRE_MINUTES * 60; // 300 secondes
  
  timerTextEl.style.display = "inline";
  resendBtn.style.display = "none";

  countdownTimer = setInterval(() => {
    timeRemaining--;
    
    const minutes = String(Math.floor(timeRemaining / 60)).padStart(2, '0');
    const seconds = String(timeRemaining % 60).padStart(2, '0');
    countdownEl.textContent = `${minutes}:${seconds}`;

    if (timeRemaining <= 0) {
      clearInterval(countdownTimer);
      // Code expiré
      timerTextEl.style.display = "none";
      resendBtn.style.display = "inline-block";
      errorBoxStep2.textContent = "Le code a expiré. Veuillez demander un nouveau code.";
      errorBoxStep2.style.display = "block";
      otpBoxes.forEach(box => box.disabled = true);
      document.getElementById('verify-otp-btn').disabled = true;
    }
  }, 1000);
}

// ── 4. SOUCOUP D'ENVOI DU SMS (ÉTAPE 1) ──────────────────────────────────────
formStep1.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBoxStep1.style.display = "none";
  
  const rawValue = phoneField.value.trim();
  const cameroonRegex = /^(6|2)\d{8}$/;

  if (!cameroonRegex.test(rawValue)) {
    errorBoxStep1.textContent = "Format invalide. Saisissez les 9 chiffres (ex: 699xxxxxx).";
    errorBoxStep1.style.display = "block";
    return;
  }

  currentPhoneNumber = "+237" + rawValue;
  
  try {
    initInvisibleRecaptcha();
    const appVerifier = window.recaptchaVerifier;
    
    // Appel Firebase pour l'envoi de l'OTP
    confirmationResult = await signInWithPhoneNumber(auth, currentPhoneNumber, appVerifier);
    
    // Transition d'affichage vers l'Étape 2
    formStep1.style.display = "none";
    formStep2.style.display = "block";
    otpBoxes[0].focus();
    
    // Lancement du cycle de vie de l'OTP
    loginAttempts = 0;
    startTimer();
    
  } catch (error) {
    console.error("Erreur d'envoi SMS :", error.message);
    errorBoxStep1.textContent = "Impossible d'envoyer le SMS. Réessayez plus tard.";
    errorBoxStep1.style.display = "block";
  }
});

// ── 5. VALIDATION DU CODE OTP (ÉTAPE 2) ──────────────────────────────────────
formStep2.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBoxStep2.style.display = "none";
  
  const smsCode = getOtpCode();
  
  if (smsCode.length !== 6) {
    errorBoxStep2.textContent = "Veuillez entrer le code complet à 6 chiffres.";
    errorBoxStep2.style.display = "block";
    return;
  }

  try {
    // Validation du code auprès de Firebase
    await confirmationResult.confirm(smsCode);
    
    // Succès total -> Nettoyage et redirection
    clearInterval(countdownTimer);
    window.location.href = "/app.html";
    
  } catch (error) {
    loginAttempts++;
    console.warn(`Tentative infructueuse : ${loginAttempts}/${MAX_ATTEMPTS}`);
    
    if (loginAttempts >= MAX_ATTEMPTS) {
      clearInterval(countdownTimer);
      errorBoxStep2.textContent = "Compte bloqué temporairement suite à 3 codes erronés. Rechargez la page.";
      errorBoxStep2.style.display = "block";
      otpBoxes.forEach(box => box.disabled = true);
      document.getElementById('verify-otp-btn').disabled = true;
    } else {
      errorBoxStep2.textContent = `Code incorrect. Il vous reste ${MAX_ATTEMPTS - loginAttempts} essai(s).`;
      errorBoxStep2.style.display = "block";
      // Réinitialiser les cases et focus sur la première
      otpBoxes.forEach(box => box.value = "");
      otpBoxes[0].focus();
    }
  }
});

// ── 6. LIEN LIÉ AU BOUTON "RENVOYER LE CODE" ─────────────────────────────────
resendBtn.addEventListener('click', async () => {
  errorBoxStep2.style.display = "none";
  
  try {
    initInvisibleRecaptcha();
    const appVerifier = window.recaptchaVerifier;
    
    confirmationResult = await signInWithPhoneNumber(auth, currentPhoneNumber, appVerifier);
    
    // Réactiver les éléments de saisie
    otpBoxes.forEach(box => {
      box.disabled = false;
      box.value = "";
    });
    document.getElementById('verify-otp-btn').disabled = false;
    otpBoxes[0].focus();
    
    // Relancer les compteurs
    loginAttempts = 0;
    startTimer();
  } catch (error) {
    errorBoxStep2.textContent = "Erreur lors du renvoi du code. Veuillez rafraîchir.";
    errorBoxStep2.style.display = "block";
  }
});