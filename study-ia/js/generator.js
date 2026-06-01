// ============================================
//  STUDY-IA — generator.js
//  AI content generation (fiches, quiz, résumés)
// ============================================

'use strict';

// ── Types & Templates ─────────────────────────
const GENERATION_TYPES = {
  fiche:   { label: 'Fiche de révision', icon: '📄', prompt: (topic) => `Crée une fiche de révision structurée et détaillée sur le sujet suivant : "${topic}". Inclus les points clés, définitions, exemples concrets et un résumé final.` },
  quiz:    { label: 'Quiz interactif',   icon: '❓', prompt: (topic) => `Génère un quiz de 5 questions à choix multiples sur : "${topic}". Pour chaque question, propose 4 réponses et indique la bonne réponse avec une explication.` },
  resume:  { label: 'Résumé rapide',     icon: '⚡', prompt: (topic) => `Fais un résumé clair et concis (200-300 mots) sur : "${topic}". Mets en avant les points essentiels à retenir.` },
  mindmap: { label: 'Plan structuré',    icon: '🗺️', prompt: (topic) => `Crée un plan structuré hiérarchique (introduction, grands axes, sous-points, conclusion) pour le sujet : "${topic}".` },
};

// ── History ───────────────────────────────────
const HISTORY_KEY = 'studyia_history';

function getHistory() {
  return Storage.get(HISTORY_KEY) || [];
}

function addToHistory(item) {
  const history = getHistory();
  history.unshift({ ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  Storage.set(HISTORY_KEY, history.slice(0, 50)); // keep last 50
}

// ── Main generator ────────────────────────────
/**
 * Generate study content via the Anthropic API.
 * @param {string} topic     - Subject to study
 * @param {string} type      - One of the GENERATION_TYPES keys
 * @param {string} level     - 'lycee' | 'licence' | 'master' | 'professionnel'
 * @returns {Promise<string>}
 */
async function generateContent(topic, type = 'fiche', level = 'lycee') {
  const user = getCurrentUser();

  if (!user) {
    throw new Error('Vous devez être connecté pour générer du contenu.');
  }

  if (user.credits <= 0) {
    throw new Error('Vous n\'avez plus de crédits. Passez à un plan supérieur.');
  }

  const typeConfig = GENERATION_TYPES[type];
  if (!typeConfig) throw new Error('Type de génération inconnu.');

  const levelLabels = {
    lycee:        'lycée (terminale)',
    licence:      'licence universitaire',
    master:       'master / grande école',
    professionnel:'formation professionnelle',
  };

  const systemPrompt = `Tu es Study-IA, un assistant pédagogique expert. Tu génères du contenu de révision clair, précis et adapté au niveau ${levelLabels[level] || 'lycée'}. Tes réponses sont en français, structurées et directement exploitables par l'étudiant.`;

const response = await fetch("/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    prompt: topic,   // le sujet saisi par l'utilisateur
    type:   type,    // "fiche", "quiz", "resume" ou "mindmap"
    level:  level,   // "lycee", "licence", etc.
  }),
});

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Erreur API Anthropic.');
  }

 const data = await response.json();
const texte = data.result; // le texte généré par Gemini

  // Deduct 1 credit & save to history
  decrementCredit(user);
  addToHistory({ topic, type, level, result });

  return result;
}

// ── Credit management ─────────────────────────
function decrementCredit(user) {
  const users = Storage.get('studyia_users') || [];
  const idx   = users.findIndex((u) => u.id === user.id);
  if (idx === -1) return;

  users[idx].credits = Math.max(0, (users[idx].credits || 0) - 1);
  Storage.set('studyia_users', users);
  Storage.set('studyia_user', users[idx]);
}

// ── Render helpers ────────────────────────────
/**
 * Convert the plain-text AI response into formatted HTML.
 * @param {string} text
 */
function renderMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,   '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm,  '<h3>$1</h3>')
    .replace(/^# (.+)$/gm,   '<h2>$1</h2>')
    .replace(/^- (.+)$/gm,   '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(.+)$/gm, (line) => {
      if (line.startsWith('<')) return line;
      return line;
    });
}

// ── DOM Bindings ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const form      = document.getElementById('generator-form');
  const output    = document.getElementById('generator-output');
  const copyBtn   = document.getElementById('copy-btn');
  const creditEl  = document.getElementById('user-credits');

  // Show credits
  if (creditEl) {
    const user = getCurrentUser();
    if (user) creditEl.textContent = user.credits ?? 0;
  }

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const topic   = form.topic?.value.trim();
    const type    = form.type?.value    || 'fiche';
    const level   = form.level?.value   || 'lycee';
    const submitBtn = form.querySelector('[type="submit"]');

    if (!topic) {
      showToast('Veuillez entrer un sujet.', 'error');
      return;
    }

    // Loading state
    if (output) {
      output.innerHTML = '<div class="center" style="padding:40px"><div class="loader"></div></div>';
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Génération…';
    }

    try {
      const result = await generateContent(topic, type, level);

      if (output) {
        output.innerHTML = `<div class="generated-content"><p>${renderMarkdown(result)}</p></div>`;
      }

      // Update credits display
      const user = getCurrentUser();
      if (creditEl && user) creditEl.textContent = user.credits ?? 0;

      showToast('Contenu généré avec succès !', 'success');

    } catch (err) {
      showToast(err.message || 'Une erreur est survenue.', 'error');
      if (output) output.innerHTML = '';
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Générer';
      }
    }
  });

  // Copy result
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const text = output?.innerText || '';
      if (text) copyToClipboard(text);
    });
  }
});
