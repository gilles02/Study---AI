// ============================================
//  STUDY-IA — auth.js
//  Registration, login, logout logic
// ============================================

'use strict';

// ── Constants ────────────────────────────────
const AUTH_KEY  = 'studyia_user';
const USERS_KEY = 'studyia_users';

// ── Helpers ──────────────────────────────────
function getUsers() {
  return Storage.get(USERS_KEY) || [];
}

function saveUsers(users) {
  Storage.set(USERS_KEY, users);
}

function getCurrentUser() {
  return Storage.get(AUTH_KEY);
}

// ── Register ─────────────────────────────────
/**
 * Register a new user.
 * @param {string} name
 * @param {string} email
 * @param {string} password
 * @returns {{ success: boolean, message: string }}
 */
function register(name, email, password) {
  if (!name || !email || !password) {
    return { success: false, message: 'Tous les champs sont obligatoires.' };
  }

  if (password.length < 8) {
    return { success: false, message: 'Le mot de passe doit contenir au moins 8 caractères.' };
  }

  const users = getUsers();
  if (users.find((u) => u.email === email)) {
    return { success: false, message: 'Cette adresse e-mail est déjà utilisée.' };
  }

  const newUser = {
    id:        crypto.randomUUID(),
    name,
    email,
    password,   // ⚠️  À hasher côté serveur en production
    plan:       'free',
    createdAt:  new Date().toISOString(),
    credits:    5,
  };

  users.push(newUser);
  saveUsers(users);
  Storage.set(AUTH_KEY, newUser);

  return { success: true, message: 'Compte créé avec succès.', user: newUser };
}

// ── Login ─────────────────────────────────────
/**
 * Log in an existing user.
 * @param {string} email
 * @param {string} password
 * @returns {{ success: boolean, message: string }}
 */
function login(email, password) {
  if (!email || !password) {
    return { success: false, message: 'Veuillez renseigner vos identifiants.' };
  }

  const users = getUsers();
  const user  = users.find((u) => u.email === email && u.password === password);

  if (!user) {
    return { success: false, message: 'Email ou mot de passe incorrect.' };
  }

  Storage.set(AUTH_KEY, user);
  return { success: true, message: 'Connexion réussie.', user };
}

// ── Logout ────────────────────────────────────
function logout() {
  Storage.remove(AUTH_KEY);
  window.location.href = 'login.html';
}

// ── Update user plan ──────────────────────────
function upgradePlan(plan) {
  const user  = getCurrentUser();
  const users = getUsers();

  if (!user) return;

  const idx = users.findIndex((u) => u.id === user.id);
  if (idx === -1) return;

  users[idx].plan = plan;
  users[idx].credits = plan === 'pro' ? 999 : plan === 'standard' ? 50 : 5;
  saveUsers(users);
  Storage.set(AUTH_KEY, users[idx]);
}

// ── DOM Bindings ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ── Registration form ──
  const regForm = document.getElementById('register-form');
  if (regForm) {
    regForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name     = regForm.name.value.trim();
      const email    = regForm.email.value.trim();
      const password = regForm.password.value;

      const result = register(name, email, password);
      showToast(result.message, result.success ? 'success' : 'error');

      if (result.success) {
        setTimeout(() => { window.location.href = 'app.html'; }, 800);
      }
    });
  }

  // ── Login form ──
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email    = loginForm.email.value.trim();
      const password = loginForm.password.value;

      const result = login(email, password);
      showToast(result.message, result.success ? 'success' : 'error');

      if (result.success) {
        setTimeout(() => { window.location.href = 'app.html'; }, 800);
      }
    });
  }

  // ── Logout buttons ──
  $$('[data-logout]').forEach((btn) => {
    btn.addEventListener('click', logout);
  });

  // ── Show user name ──
  const userNameEl = document.getElementById('user-name');
  if (userNameEl) {
    const user = getCurrentUser();
    if (user) userNameEl.textContent = user.name;
  }
});
