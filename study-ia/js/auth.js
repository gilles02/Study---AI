// ============================================================
//  STUDY-IA — auth.js
//  Firebase Phone Authentication — version commentée
// ============================================================

// ── Les imports Firebase ─────────────────────────────────────
// On importe uniquement ce dont on a besoin depuis Firebase.
// "auth" vient de notre fichier firebase-config.js (déjà initialisé).
import { auth } from "./firebase-config.js";
import {
  RecaptchaVerifier,       // Protection anti-spam de Google (invisible pour l'user)
  signInWithPhoneNumber,   // Envoie le SMS
  onAuthStateChanged,      // Écoute si l'utilisateur est connecté ou non
  signOut                  // Déconnecte l'utilisateur
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";


// ════════════════════════════════════════════════════════════
//  VARIABLES GLOBALES
//  Ces 4 variables sont partagées entre toutes les fonctions.
//  Elles doivent rester accessibles en dehors des fonctions
//  car plusieurs fonctions différentes les lisent ou les modifient.
// ════════════════════════════════════════════════════════════

// Stocke la réponse de Firebase après l'envoi du SMS.
// On en a besoin plus tard pour valider le code.
// null = pas encore de SMS envoyé.
let confirmationResult = null;

// Compte combien de fois l'utilisateur a entré un mauvais code.
// Quand il atteint 3, on bloque tout.
let tentatives = 0;

// Référence au setInterval du compte à rebours.
// On la stocke ici pour pouvoir l'arrêter avec clearInterval() plus tard.
let timerExpiration = null;

// Heure exacte où le SMS a été envoyé (en millisecondes).
// Utilisé pour calculer le temps restant avant expiration.
let tempsEnvoi = null;

// Durées fixes
const MAX_TENTATIVES = 3;
const EXPIRATION_MS  = 5 * 60 * 1000; // 5 minutes = 300 000 ms


// ════════════════════════════════════════════════════════════
//  SECTION 1 — FONCTIONS D'AFFICHAGE
//  Ces fonctions modifient uniquement ce que l'utilisateur voit.
//  Elles ne touchent pas à Firebase.
// ════════════════════════════════════════════════════════════

/**
 * Affiche un message coloré sous le formulaire.
 *
 * Le div #auth-message existe dans le HTML mais est caché (display:none).
 * Cette fonction lui donne un style et un texte, puis l'affiche.
 *
 * @param {string} message - Le texte à afficher
 * @param {string} couleur - "rouge" (erreur) | "orange" (avertissement) | "vert" (succès)
 */
function afficherMessage(message, couleur = "rouge") {
  const el = document.getElementById("auth-message");
  if (!el) return; // sécurité : si l'élément n'existe pas, on ne plante pas

  // Chaque couleur a son propre style
  const styles = {
    rouge:  { bg: "rgba(224,92,92,0.12)",   bordure: "#e05c5c", texte: "#e05c5c" },
    orange: { bg: "rgba(232,180,109,0.12)", bordure: "#e8b46d", texte: "#e8b46d" },
    vert:   { bg: "rgba(78,205,196,0.12)",  bordure: "#4ecdc4", texte: "#4ecdc4" },
  };
  const s = styles[couleur] || styles.rouge;

  el.style.cssText = `
    display: block;
    background: ${s.bg};
    border: 1px solid ${s.bordure};
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 0.85rem;
    color: ${s.texte};
    margin-top: 14px;
  `;
  el.textContent = message;
}

/** Cache le message (utile avant chaque nouvelle action) */
function cacherMessage() {
  const el = document.getElementById("auth-message");
  if (el) el.style.display = "none";
}

/**
 * Passe visuellement de l'étape 1 à l'étape 2.
 *
 * Dans le HTML il y a deux blocs :
 *   #etape-telephone (étape 1, visible au départ)
 *   #etape-otp       (étape 2, caché au départ)
 * Cette fonction cache le premier et montre le second.
 *
 * @param {string} telephone - Le numéro formaté (+33612345678)
 */
function afficherEtapeOTP(telephone) {
  document.getElementById("etape-telephone").style.display = "none";
  document.getElementById("etape-otp").style.display       = "block";

  // Affiche "Code envoyé au ••••••••78" (on masque tout sauf les 2 derniers chiffres)
  const visible = telephone.slice(-2);
  const el = document.getElementById("numero-masque");
  if (el) el.textContent = `Code envoyé au ••••••••${visible}`;

  // Met le curseur dans la première case automatiquement
  setTimeout(() => {
    const premiere = document.querySelector(".otp-input");
    if (premiere) premiere.focus();
  }, 100);

  cacherMessage();
}

/**
 * Démarre le compte à rebours de 5 minutes.
 *
 * Toutes les secondes, on calcule le temps restant et on l'affiche
 * dans #compte-rebours. Quand il atteint 0, on bloque les cases.
 */
function demarrerCompteARebours() {
  const el = document.getElementById("compte-rebours");
  if (!el) return;

  // Si un timer tournait déjà (cas d'un renvoi), on l'arrête d'abord
  if (timerExpiration) clearInterval(timerExpiration);

  // On note l'heure de l'envoi
  tempsEnvoi = Date.now();

  timerExpiration = setInterval(() => {
    const ecoule  = Date.now() - tempsEnvoi; // temps passé depuis l'envoi
    const restant = EXPIRATION_MS - ecoule;  // temps restant

    if (restant <= 0) {
      // Temps écoulé : on arrête le timer et on bloque tout
      clearInterval(timerExpiration);
      el.textContent = "Code expiré";
      afficherMessage("⏱ Ton code a expiré. Clique sur 'Renvoyer le code'.", "orange");
      afficherBoutonRenvoyer(true);
      bloquerCasesOTP(true);
      return;
    }

    // Convertit les millisecondes en "M:SS"
    const minutes  = Math.floor(restant / 60000);
    const secondes = Math.floor((restant % 60000) / 1000);
    el.textContent = `Expire dans ${minutes}:${secondes.toString().padStart(2, "0")}`;
    // padStart(2, "0") : affiche "09" au lieu de "9"
  }, 1000); // s'exécute toutes les 1000ms = 1 seconde
}

/**
 * Affiche ou cache le bouton "Renvoyer le code".
 * @param {boolean} visible - true = on montre, false = on cache
 */
function afficherBoutonRenvoyer(visible) {
  const btn = document.getElementById("btn-renvoyer");
  if (btn) btn.style.display = visible ? "block" : "none";
}

/**
 * Rend les 6 cases et le bouton Vérifier actifs ou inactifs.
 * Appelé quand le code expire ou quand les 3 tentatives sont épuisées.
 * @param {boolean} bloquer - true = grise et désactive, false = réactive
 */
function bloquerCasesOTP(bloquer) {
  document.querySelectorAll(".otp-input").forEach((input) => {
    input.disabled      = bloquer;
    input.style.opacity = bloquer ? "0.4" : "1";
  });
  const btn = document.getElementById("btn-valider-otp");
  if (btn) btn.disabled = bloquer;
}

/** Vide les 6 cases et remet le focus sur la première (après un mauvais code) */
function reinitialiserCasesOTP() {
  document.querySelectorAll(".otp-input").forEach((c) => { c.value = ""; });
  const premiere = document.querySelector(".otp-input");
  if (premiere) premiere.focus();
}

/**
 * Lit les 6 cases et les colle en une seule chaîne.
 * Ex : cases avec "4", "8", "2", "9", "1", "6" → "482916"
 * @returns {string}
 */
function lireCodeOTP() {
  return [...document.querySelectorAll(".otp-input")]
    .map((input) => input.value.trim())
    .join("");
}

/**
 * Met un bouton en état "chargement" (spinner + texte) ou le restaure.
 * @param {HTMLButtonElement} btn
 * @param {boolean} enChargement
 * @param {string} texteOriginal - Texte à remettre quand c'est fini
 */
function setChargement(btn, enChargement, texteOriginal = "") {
  if (!btn) return;
  btn.disabled = enChargement;
  if (enChargement) {
    btn.innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:8px">
        <span style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);
          border-top-color:#fff;border-radius:50%;
          animation:spin 0.7s linear infinite;display:inline-block">
        </span>
        Chargement…
      </span>`;
  } else {
    btn.innerHTML = texteOriginal;
  }
}


// ════════════════════════════════════════════════════════════
//  SECTION 2 — NAVIGATION ENTRE LES 6 CASES
//  Quand l'utilisateur tape un chiffre → passage automatique à la case suivante.
//  Quand il appuie sur Backspace → retour à la case précédente.
//  Quand il colle un code complet → répartition automatique.
// ════════════════════════════════════════════════════════════

function initNavigationOTP() {
  const cases = document.querySelectorAll(".otp-input");
  // "cases" est un tableau des 6 inputs, dans l'ordre du HTML.
  // cases[0] = 1ère case, cases[1] = 2ème, etc.

  cases.forEach((input, index) => {
    // index = position de la case (0 à 5)

    // ── Événement : l'utilisateur tape un chiffre ──
    input.addEventListener("input", (e) => {
      // On ne garde que les chiffres (supprime lettres, espaces, etc.)
      const valeur = e.target.value.replace(/\D/g, "");
      // On ne garde que le dernier caractère (au cas où 2 chiffres arrivent)
      e.target.value = valeur.slice(-1);

      // Si un chiffre a été saisi ET qu'on n'est pas sur la dernière case
      if (valeur && index < cases.length - 1) {
        cases[index + 1].focus(); // on passe à la case suivante
      }

      // Si les 6 cases sont remplies → on valide automatiquement
      if (lireCodeOTP().length === 6) {
        setTimeout(() => validerCode(), 200);
        // setTimeout de 200ms : laisse le temps à la dernière case d'afficher le chiffre
      }
    });

    // ── Événement : l'utilisateur appuie sur Backspace ──
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && index > 0) {
        // Si la case est déjà vide et qu'on appuie sur Backspace
        // → on revient à la case précédente
        cases[index - 1].focus();
      }
    });

    // ── Événement : l'utilisateur colle un texte (Ctrl+V) ──
    input.addEventListener("paste", (e) => {
      e.preventDefault(); // empêche le comportement par défaut

      // Récupère le texte collé et ne garde que les chiffres, max 6
      const colle = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);

      // Répartit les chiffres dans chaque case
      cases.forEach((c, i) => { c.value = colle[i] || ""; });

      if (colle.length === 6) {
        // Code complet collé → validation automatique
        setTimeout(() => validerCode(), 200);
      } else {
        // Code partiel → focus sur la première case vide
        cases[Math.min(colle.length, cases.length - 1)].focus();
      }
    });
  });
}


// ════════════════════════════════════════════════════════════
//  SECTION 3 — FIREBASE : ENVOI DU SMS
// ════════════════════════════════════════════════════════════

/**
 * Initialise le reCAPTCHA invisible de Firebase.
 *
 * Firebase utilise reCAPTCHA pour vérifier que c'est un humain
 * qui demande le SMS (protection anti-spam).
 * "invisible" = l'utilisateur ne voit rien, c'est automatique.
 *
 * IMPORTANT : doit être appelé UNE SEULE FOIS au chargement.
 * Si on l'appelle plusieurs fois, Firebase plante.
 * (Exception : après un renvoi de code, on doit le réinitialiser.)
 */
function initRecaptcha() {
  window.recaptchaVerifier = new RecaptchaVerifier(
    auth,
    "btn-envoyer-otp", // Firebase attache le reCAPTCHA sur ce bouton
    {
      size: "invisible", // invisible = pas de case à cocher
      callback: () => {}, // appelé quand reCAPTCHA est résolu (automatique)
      "expired-callback": () => {
        // Si l'utilisateur reste trop longtemps sans rien faire (~2min)
        afficherMessage("Session expirée. Recharge la page.", "orange");
      },
    }
  );
}

/**
 * Formate le numéro en format E.164, exigé par Firebase.
 * Firebase n'accepte PAS "06 12 34 56 78" — il faut "+33612345678".
 *
 * @param {string} numero - Ce que l'utilisateur a tapé
 * @returns {string} - "+33612345678" ou "" si invalide
 */
function formaterTelephone(numero) {
  // Supprime espaces, tirets, points, parenthèses
  let propre = numero.replace(/[\s\-().]/g, "");

  // Conversion numéro français local → international
  // "0612345678" (10 chiffres commençant par 0) → "+33612345678"
  if (propre.startsWith("0") && propre.length === 10) {
    propre = "+33" + propre.slice(1);
    // slice(1) = on enlève le "0" du début
  }

  // Vérification finale : doit commencer par + suivi de 8 à 15 chiffres
  if (!/^\+\d{8,15}$/.test(propre)) return ""; // invalide → chaîne vide

  return propre;
}

/**
 * Envoie le SMS OTP.
 * Appelée quand l'utilisateur clique "Recevoir mon code".
 */
async function envoyerOTP() {
  cacherMessage();

  const input = document.getElementById("phone-input");
  const btn   = document.getElementById("btn-envoyer-otp");

  const telephone = formaterTelephone(input.value);

  // Validation avant d'appeler Firebase
  if (!telephone) {
    afficherMessage("Numéro invalide. Format attendu : 06 12 34 56 78");
    return;
  }

  setChargement(btn, true);

  try {
    // signInWithPhoneNumber fait 2 choses :
    // 1. Contacte les serveurs Google
    // 2. Envoie un SMS au numéro
    // En retour, on reçoit un "confirmationResult" qu'on stocke
    // pour pouvoir valider le code à l'étape suivante.
    confirmationResult = await signInWithPhoneNumber(
      auth,
      telephone,
      window.recaptchaVerifier // la protection anti-spam
    );

    tentatives = 0; // remet le compteur à zéro pour ce nouvel envoi
    afficherEtapeOTP(telephone); // passe à l'étape 2
    demarrerCompteARebours();    // démarre le timer 5 minutes
    afficherBoutonRenvoyer(false); // le bouton "Renvoyer" reste caché pour l'instant

  } catch (erreur) {
    // Firebase retourne un code d'erreur précis dans erreur.code
    const messages = {
      "auth/invalid-phone-number": "Numéro de téléphone invalide.",
      "auth/too-many-requests":    "Trop de tentatives. Réessaie dans quelques minutes.",
      "auth/captcha-check-failed": "Vérification anti-spam échouée. Recharge la page.",
    };
    // Si le code d'erreur n'est pas dans notre liste, on affiche le message brut de Firebase
    afficherMessage(messages[erreur.code] || `Erreur : ${erreur.message}`);

    // Après une erreur, le reCAPTCHA doit être réinitialisé
    // sinon le prochain essai plantera aussi
    if (window.recaptchaVerifier) {
      window.recaptchaVerifier.clear();
      initRecaptcha();
    }

  } finally {
    // "finally" s'exécute TOUJOURS, que ça ait réussi ou échoué
    // → on enlève l'état "chargement" du bouton dans tous les cas
    setChargement(btn, false, "Recevoir mon code →");
  }
}


// ════════════════════════════════════════════════════════════
//  SECTION 4 — FIREBASE : VALIDATION DU CODE
// ════════════════════════════════════════════════════════════

/**
 * Vérifie le code saisi dans les 6 cases auprès de Firebase.
 *
 * Appelée automatiquement quand les 6 cases sont remplies,
 * ou manuellement via le bouton "Vérifier →".
 */
async function validerCode() {
  const code = lireCodeOTP(); // ex: "482916"

  // Vérifications préliminaires avant d'appeler Firebase
  if (code.length !== 6) {
    afficherMessage("Entre les 6 chiffres du code reçu.");
    return;
  }
  if (!confirmationResult) {
    // Ne devrait pas arriver normalement, mais sécurité au cas où
    afficherMessage("Erreur : pas de code envoyé. Recommence depuis le début.");
    return;
  }

  const btn = document.getElementById("btn-valider-otp");
  setChargement(btn, true);
  cacherMessage();

  try {
    // confirm() envoie le code à Firebase pour vérification.
    // Si le code est correct, Firebase crée automatiquement la session
    // et retourne un objet "credential" qui contient l'utilisateur.
    const credential = await confirmationResult.confirm(code);
    const user = credential.user; // l'objet utilisateur Firebase

    // Succès !
    clearInterval(timerExpiration); // arrête le compte à rebours
    afficherMessage("✓ Connexion réussie ! Redirection…", "vert");

    // On sauvegarde l'UID Firebase en local pour un accès rapide
    // (Firebase gère lui-même la session, c'est juste pratique)
    localStorage.setItem("studyia_uid",   user.uid);
    localStorage.setItem("studyia_phone", user.phoneNumber);

    // On attend 800ms pour que l'utilisateur voie le message vert,
    // puis on redirige vers l'application
    setTimeout(() => { window.location.href = "/app.html"; }, 800);

  } catch (erreur) {
    // Le code était faux ou expiré
    tentatives++; // on incrémente le compteur d'essais
    reinitialiserCasesOTP(); // on vide les cases pour qu'il retape

    if (erreur.code === "auth/code-expired") {
      // Firebase dit lui-même que le code a expiré
      clearInterval(timerExpiration);
      afficherMessage("⏱ Code expiré. Demande un nouveau code.", "orange");
      afficherBoutonRenvoyer(true);
      bloquerCasesOTP(true);

    } else if (tentatives >= MAX_TENTATIVES) {
      // 3 mauvaises tentatives → on bloque tout
      clearInterval(timerExpiration);
      afficherMessage('❌ Code incorrect 3 fois. Clique sur "Renvoyer le code".');
      afficherBoutonRenvoyer(true);
      bloquerCasesOTP(true);

    } else {
      // Il reste des essais → on informe combien
      const restantes = MAX_TENTATIVES - tentatives;
      afficherMessage(
        `Code incorrect. Il te reste ${restantes} tentative${restantes > 1 ? "s" : ""}.`
      );
      // On remet le bouton en état normal (pas en chargement)
      setChargement(btn, false, "Vérifier →");
    }

  } finally {
    // Si la page est encore là (pas encore redirigée), on enlève le chargement
    if (document.getElementById("btn-valider-otp")) {
      setChargement(btn, false, "Vérifier →");
    }
  }
}


// ════════════════════════════════════════════════════════════
//  SECTION 5 — RENVOYER LE CODE
// ════════════════════════════════════════════════════════════

/**
 * Envoie un nouveau SMS avec un nouveau code.
 * Appelée quand l'utilisateur clique "↺ Renvoyer le code".
 *
 * On réutilise le même numéro (déjà dans #phone-input).
 * On réinitialise tout : timer, tentatives, cases.
 */
async function renvoyerCode() {
  const input     = document.getElementById("phone-input");
  const telephone = formaterTelephone(input?.value || "");

  if (!telephone) {
    // Si on n'a plus le numéro, on renvoie l'utilisateur à l'étape 1
    document.getElementById("etape-otp").style.display       = "none";
    document.getElementById("etape-telephone").style.display = "block";
    return;
  }

  const btn = document.getElementById("btn-renvoyer");
  setChargement(btn, true);
  cacherMessage();

  // Le reCAPTCHA doit être réinitialisé entre deux envois SMS
  // sinon Firebase retourne une erreur "reCAPTCHA already used"
  if (window.recaptchaVerifier) {
    window.recaptchaVerifier.clear();
    initRecaptcha();
  }

  try {
    confirmationResult = await signInWithPhoneNumber(
      auth, telephone, window.recaptchaVerifier
    );

    // Remet tout à zéro pour ce nouvel envoi
    tentatives = 0;
    reinitialiserCasesOTP();     // vide les 6 cases
    bloquerCasesOTP(false);      // réactive les cases (elles étaient grisées)
    demarrerCompteARebours();    // nouveau timer de 5 minutes
    afficherBoutonRenvoyer(false); // recache le bouton "Renvoyer"
    afficherMessage("✓ Nouveau code envoyé !", "vert");

  } catch (erreur) {
    const messages = {
      "auth/too-many-requests": "Trop de tentatives. Attends quelques minutes.",
    };
    afficherMessage(messages[erreur.code] || `Erreur : ${erreur.message}`);
  } finally {
    setChargement(btn, false, "↺ Renvoyer le code");
  }
}


// ════════════════════════════════════════════════════════════
//  SECTION 6 — DÉCONNEXION
// ════════════════════════════════════════════════════════════

/**
 * Déconnecte l'utilisateur de Firebase et le renvoie sur /login.html.
 * Appelée par tous les boutons avec l'attribut data-logout.
 */
async function deconnecter() {
  await signOut(auth);
  // signOut() efface la session Firebase côté navigateur
  localStorage.removeItem("studyia_uid");
  localStorage.removeItem("studyia_phone");
  window.location.href = "/login.html";
}


// ════════════════════════════════════════════════════════════
//  SECTION 7 — PROTECTION DES PAGES
//  À utiliser sur app.html, dashboard.html :
//  si l'utilisateur n'est pas connecté, redirection vers login.
// ════════════════════════════════════════════════════════════

/**
 * Vérifie si l'utilisateur est connecté.
 * Si oui → retourne l'objet user Firebase (utile pour afficher le numéro).
 * Si non → redirige vers /login.html automatiquement.
 *
 * Usage sur une page protégée :
 *   const user = await requireAuth();
 *   console.log(user.phoneNumber); // "+33612345678"
 *
 * @returns {Promise<User>}
 */
function requireAuth() {
  return new Promise((resolve) => {
    // onAuthStateChanged est appelé une fois dès que Firebase sait
    // si l'utilisateur est connecté ou non (vérifie le token en localStorage).
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe(); // on arrête d'écouter après le premier appel
      if (!user) {
        window.location.href = "/login.html"; // pas connecté → login
      } else {
        resolve(user); // connecté → on retourne l'objet user
      }
    });
  });
}


// ════════════════════════════════════════════════════════════
//  SECTION 8 — BRANCHEMENT DOM
//  Cette partie s'exécute une fois que toute la page est chargée.
//  Elle relie les boutons HTML aux fonctions JS définies au-dessus.
// ════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {

  // On récupère les éléments clés. Si un élément n'existe pas sur cette page,
  // la variable vaut null et les if() en dessous ne font rien → pas d'erreur.
  const btnEnvoyer  = document.getElementById("btn-envoyer-otp");
  const btnValider  = document.getElementById("btn-valider-otp");
  const btnRenvoyer = document.getElementById("btn-renvoyer");
  const btnChanger  = document.getElementById("btn-changer-numero");

  // ── Page login.html ──────────────────────────────────────
  if (btnEnvoyer) {
    initRecaptcha(); // initialise le reCAPTCHA UNE SEULE FOIS ici

    // Clic sur "Recevoir mon code →"
    btnEnvoyer.addEventListener("click", envoyerOTP);

    // Appuyer sur Entrée dans le champ téléphone = même effet que cliquer
    document.getElementById("phone-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") envoyerOTP();
    });
  }

  if (btnValider) {
    initNavigationOTP(); // active la navigation entre les 6 cases
    btnValider.addEventListener("click", validerCode);
  }

  if (btnRenvoyer) {
    btnRenvoyer.addEventListener("click", renvoyerCode);
  }

  if (btnChanger) {
    // "← Changer de numéro" → retour à l'étape 1 sans recharger la page
    btnChanger.addEventListener("click", () => {
      clearInterval(timerExpiration); // arrête le timer
      document.getElementById("etape-otp").style.display       = "none";
      document.getElementById("etape-telephone").style.display = "block";
      cacherMessage();
    });
  }

  // ── Pages protégées (app.html, dashboard.html) ───────────
  // Si la balise <body> a l'attribut data-protected (ex: <body data-protected>)
  // → on vérifie que l'utilisateur est bien connecté
  if (document.body.dataset.protected !== undefined) {
    requireAuth().then((user) => {
      // Optionnel : afficher le numéro de l'utilisateur dans la nav
      const phoneEl = document.getElementById("user-phone");
      if (phoneEl) phoneEl.textContent = user.phoneNumber;
    });
  }

  // ── Boutons de déconnexion (toutes les pages) ────────────
  // Tous les éléments avec data-logout appellent deconnecter()
  document.querySelectorAll("[data-logout]").forEach((btn) => {
    btn.addEventListener("click", deconnecter);
  });

});

// ── Export pour les autres fichiers JS ───────────────────────
// generator.js et payment.js peuvent importer requireAuth si besoin
export { requireAuth, deconnecter };