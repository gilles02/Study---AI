// js/auth.js
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

// ── ÉLÉMENTS DU DOM (CORRIGÉS POUR MATCH LE HTML) ────────────────────────────
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

// ── 1. INITIALISATION DU RECAPTCHA INVISIBLE ─────────────────────────────────
function initInvisibleRecaptcha() {
  if (!window.recaptchaVerifier) {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'send-otp-btn', {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA résolu automatiquement
      },
      'expired-callback': () => {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
        initInvisibleRecaptcha();
      }
    });
  }
}

// ── 2. COMPORTEMENT UX DES 6 CASES OTP ───────────────────────────────────────
otpBoxes.forEach((box, index) => {
  box.addEventListener('input', (e) => {
    const value = e.target.value;
    e.target.value = value.replace(/[^0-9]/g, ''); // Uniquement des chiffres
    
    if (box.value !== "" && index < otpBoxes.length - 1) {
      otpBoxes[index + 1].focus(); // Case suivante
    }

    // Si la dernière case est remplie, on tente la validation automatique
    const code = getOtpCode();
    if (code.length === 6) {
      validateOTP(code);
    }
  });

  box.addEventListener('keydown', (e) => {
    if (e.key === "Backspace" && box.value === "" && index > 0) {
      otpBoxes[index - 1].focus(); // Case précédente
    }
  });
});

function getOtpCode() {
  let code = "";
  otpBoxes.forEach(box => code += box.value);
  return code;
}

// ── 3. GESTION DU MINUTEUR DE 5 MINUTES ──────────────────────────────────────
function startTimer() {
  clearInterval(countdownTimer);
  let timeRemaining = EXPIRE_MINUTES * 60;
  
  otpTimer.style.display = "block";
  resendBtn.style.display = "none";

  countdownTimer = setInterval(() => {
    timeRemaining--;
    
    const minutes = String(Math.floor(timeRemaining / 60)).padStart(2, '0');
    const seconds = String(timeRemaining % 60).padStart(2, '0');
    otpTimer.textContent = `Expire dans ${minutes}:${seconds}`;

    if (timeRemaining <= 0) {
      clearInterval(countdownTimer);
      otpTimer.textContent = "Code expiré";
      resendBtn.style.display = "inline-block";
      showOTPError("Le code a expiré. Veuillez demander un nouveau code.");
      blockOTPInputs(true);
    }
  }, 1000);
}

// ── 4. ENVOI DU SMS (CLIC SUR BOUTON ÉTAPE 1) ────────────────────────────────
if (sendOtpBtn) {
  sendOtpBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    hideOTPError();
    
    const rawValue = phoneInput.value.trim();
    const cameroonRegex = /^(6|2)\d{8}$/;

    if (!cameroonRegex.test(rawValue)) {
      showToast("Format invalide. Saisissez les 9 chiffres (ex: 699xxxxxx).", "error");
      return;
    }

    currentPhoneNumber = "+237" + rawValue;
    sendOtpBtn.disabled = true;
    sendOtpBtn.textContent = "Envoi en cours…";
    
    try {
      initInvisibleRecaptcha();
      const appVerifier = window.recaptchaVerifier;
      
      confirmationResult = await signInWithPhoneNumber(auth, currentPhoneNumber, appVerifier);
      
      // Passage à l'étape 2
      stepPhone.style.display = "none";
      stepOtp.style.display = "block";
      if (phoneDisplay) phoneDisplay.textContent = currentPhoneNumber;
      
      otpBoxes[0].focus();
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
  });
}

// ── 5. VALIDATION DU CODE OTP ────────────────────────────────────────────────
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

    // Sauvegarde ou mise à jour dans Firestore
    await saveUserToFirestore(user);
    
    clearInterval(countdownTimer);
    showToast("Connexion réussie ! Redirection…", "success");
    
    setTimeout(() => {
      window.location.href = "/app.html";
    }, 1200);
    
  } catch (error) {
    showLoading(false);
    loginAttempts++;
    
    // Vider les cases pour la nouvelle tentative
    otpBoxes.forEach(box => box.value = "");
    otpBoxes[0].focus();

    if (loginAttempts >= MAX_ATTEMPTS) {
      clearInterval(countdownTimer);
      showOTPError("Trop de tentatives infructueuses. Cliquez sur 'Renvoyer le code'.");
      blockOTPInputs(true);
      resendBtn.style.display = "inline-block";
    } else {
      showOTPError(`Code incorrect. Il vous reste ${MAX_ATTEMPTS - loginAttempts} essai(s).`);
    }
  }
}

// Liaison avec le bouton de secours Étape 2
if (verifyOtpBtn) {
  verifyOtpBtn.addEventListener('click', () => {
    validateOTP(getOtpCode());
  });
}

// ── 6. BOUTON RENVOYER LE CODE ───────────────────────────────────────────────
if (resendBtn) {
  resendBtn.addEventListener('click', async () => {
    hideOTPError();
    blockOTPInputs(false);
    
    try {
      initInvisibleRecaptcha();
      const appVerifier = window.recaptchaVerifier;
      
      confirmationResult = await signInWithPhoneNumber(auth, currentPhoneNumber, appVerifier);
      
      otpBoxes.forEach(box => box.value = "");
      otpBoxes[0].focus();
      loginAttempts = 0;
      startTimer();
      showToast("Nouveau code envoyé !", "success");
    } catch (error) {
      showOTPError("Erreur lors du renvoi. Veuillez rafraîchir la page.");
    }
  });
}

// ── 7. FONCTIONS HELPERS SÉCURISÉES ──────────────────────────────────────────
async function saveUserToFirestore(user) {
  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        phone: user.phoneNumber,
        createdAt: serverTimestamp(),
        plan: "free",
        credits: 10,
        generationCount: 0
      });
    } else {
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