// ============================================
//  STUDY-IA — main.js
//  Shared utilities & UI helpers
// ============================================

'use strict';

// ── DOM helpers ──────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ── Toast notifications ──────────────────────
/**
 * Show a toast message.
 * @param {string} message
 * @param {'info'|'success'|'error'} type
 */
function showToast(message, type = 'info') {
  let toast = $('#toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  const colors = { info: '#e8c96d', success: '#4ecdc4', error: '#e05c5c' };
  toast.style.borderLeftColor = colors[type] || colors.info;
  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── Local Storage helpers ────────────────────
const Storage = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  },
  set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  },
  remove(key) {
    localStorage.removeItem(key);
  },
};

// ── Session check ────────────────────────────
/**
 * Redirect to login if no active session.
 * Call on protected pages.
 */
function requireAuth() {
  const user = Storage.get('studyia_user');
  if (!user) {
    window.location.href = 'login.html';
  }
  return user;
}

// ── Format helpers ───────────────────────────
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function truncate(str, max = 120) {
  return str.length > max ? str.slice(0, max).trimEnd() + '…' : str;
}

// ── Animate elements on scroll ───────────────
function initScrollReveal() {
  const items = $$('[data-reveal]');
  if (!items.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-up');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  items.forEach((el) => observer.observe(el));
}

// ── Active nav link ──────────────────────────
function setActiveNavLink() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  $$('.nav-links a').forEach((link) => {
    if (link.getAttribute('href') === path) {
      link.style.color = 'var(--gold)';
    }
  });
}

// ── Copy to clipboard ────────────────────────
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copié dans le presse-papier !', 'success');
  } catch {
    showToast('Erreur lors de la copie.', 'error');
  }
}

// ── Init on DOMContentLoaded ─────────────────
document.addEventListener('DOMContentLoaded', () => {
  initScrollReveal();
  setActiveNavLink();
});
