// ============================================
//  STUDY-IA — payment.js
//  Plan selection & simulated payment flow
// ============================================

'use strict';

// ── Plans ─────────────────────────────────────
const PLANS = {
  free: {
    name:    'Gratuit',
    price:   0,
    credits: 5,
    features: ['5 générations / mois', 'Fiches de révision', 'Résumés rapides'],
  },
  standard: {
    name:    'Standard',
    price:   7.99,
    credits: 50,
    features: ['50 générations / mois', 'Tous les types de contenu', 'Historique 30 jours', 'Support email'],
  },
  pro: {
    name:    'Pro',
    price:   14.99,
    credits: 999,
    features: ['Générations illimitées', 'Tous les types de contenu', 'Historique complet', 'Support prioritaire', 'API Access'],
  },
};

// ── Select plan ───────────────────────────────
function selectPlan(planKey) {
  const plan = PLANS[planKey];
  if (!plan) return;

  // Highlight selected card
  $$('[data-plan]').forEach((el) => {
    el.classList.toggle('plan-selected', el.dataset.plan === planKey);
  });

  // Store pending plan
  Storage.set('studyia_pending_plan', planKey);

  // Show payment form if paid plan
  const paymentSection = document.getElementById('payment-form-section');
  const freeCta        = document.getElementById('free-cta');

  if (paymentSection) {
    paymentSection.style.display = planKey === 'free' ? 'none' : 'block';
  }
  if (freeCta) {
    freeCta.style.display = planKey === 'free' ? 'block' : 'none';
  }

  // Update summary
  const summaryName  = document.getElementById('summary-plan-name');
  const summaryPrice = document.getElementById('summary-price');
  if (summaryName)  summaryName.textContent  = plan.name;
  if (summaryPrice) summaryPrice.textContent = plan.price === 0 ? 'Gratuit' : `${plan.price} € / mois`;
}

// ── Process payment (simulated) ───────────────
function processPayment(formData) {
  return new Promise((resolve, reject) => {
    const { cardNumber, expiry, cvv, cardName } = formData;

    // Basic validation
    const cleanCard = cardNumber.replace(/\s/g, '');
    if (!cleanCard || cleanCard.length < 16) {
      return reject(new Error('Numéro de carte invalide.'));
    }
    if (!expiry || !/^\d{2}\/\d{2}$/.test(expiry)) {
      return reject(new Error('Date d\'expiration invalide (MM/AA).'));
    }
    if (!cvv || cvv.length < 3) {
      return reject(new Error('CVV invalide.'));
    }
    if (!cardName) {
      return reject(new Error('Nom du titulaire requis.'));
    }

    // Simulate processing delay
    setTimeout(() => {
      // Simulate 95% success rate
      if (Math.random() > 0.05) {
        resolve({ transactionId: 'TXN-' + Math.random().toString(36).slice(2, 10).toUpperCase() });
      } else {
        reject(new Error('Paiement refusé. Veuillez réessayer.'));
      }
    }, 1800);
  });
}

// ── Format card number ────────────────────────
function formatCardNumber(value) {
  return value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(value) {
  const clean = value.replace(/\D/g, '').slice(0, 4);
  if (clean.length >= 3) return clean.slice(0, 2) + '/' + clean.slice(2);
  return clean;
}

// ── DOM Bindings ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ── Plan card clicks ──
  $$('[data-plan]').forEach((card) => {
    card.addEventListener('click', () => selectPlan(card.dataset.plan));
  });

  // ── Card number formatting ──
  const cardInput = document.getElementById('card-number');
  if (cardInput) {
    cardInput.addEventListener('input', (e) => {
      e.target.value = formatCardNumber(e.target.value);
    });
  }

  const expiryInput = document.getElementById('expiry');
  if (expiryInput) {
    expiryInput.addEventListener('input', (e) => {
      e.target.value = formatExpiry(e.target.value);
    });
  }

  // ── Payment form submission ──
  const payForm = document.getElementById('payment-form');
  if (payForm) {
    payForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const submitBtn = payForm.querySelector('[type="submit"]');
      const originalText = submitBtn?.textContent;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loader" style="width:16px;height:16px;display:inline-block"></span> Traitement…';
      }

      try {
        const txn = await processPayment({
          cardNumber: payForm['card-number']?.value || '',
          expiry:     payForm['expiry']?.value      || '',
          cvv:        payForm['cvv']?.value         || '',
          cardName:   payForm['card-name']?.value   || '',
        });

        const pendingPlan = Storage.get('studyia_pending_plan') || 'standard';
        upgradePlan(pendingPlan);
        Storage.remove('studyia_pending_plan');

        showToast(`Paiement accepté ! Transaction : ${txn.transactionId}`, 'success');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);

      } catch (err) {
        showToast(err.message, 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });
  }

  // ── Free plan CTA ──
  const freeCta = document.getElementById('free-plan-btn');
  if (freeCta) {
    freeCta.addEventListener('click', () => {
      Storage.set('studyia_pending_plan', 'free');
      const user = getCurrentUser();
      if (user) {
        upgradePlan('free');
        window.location.href = 'app.html';
      } else {
        window.location.href = 'login.html';
      }
    });
  }

  // ── Pre-select plan from URL ──
  const params = new URLSearchParams(window.location.search);
  const plan   = params.get('plan');
  if (plan && PLANS[plan]) {
    selectPlan(plan);
  }
});
