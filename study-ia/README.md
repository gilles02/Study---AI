# Study-IA 📚✦

**Plateforme de révision propulsée par l'IA (Claude d'Anthropic)**

> Application web vanilla (HTML / CSS / JS pur) — aucun framework, aucune dépendance.

---

## Structure du projet

```
study-ia/
│
├── index.html          Landing page publique (présentation, fonctionnalités, tarifs)
├── app.html            Interface principale de génération de contenu
├── login.html          Inscription & connexion
├── payment.html        Sélection de plan & paiement (simulé)
├── dashboard.html      Tableau de bord utilisateur
│
├── css/
│   └── style.css       Feuille de style globale (variables, composants, utilitaires)
│
├── js/
│   ├── main.js         Utilitaires partagés (toast, localStorage, animations)
│   ├── auth.js         Authentification (register, login, logout, session)
│   ├── generator.js    Génération IA via l'API Anthropic
│   └── payment.js      Sélection de plan & traitement de paiement simulé
│
└── README.md           Ce fichier
```

---

## Pages

| Fichier | Rôle | Auth requise |
|---|---|---|
| `index.html` | Landing page publique | Non |
| `login.html` | Formulaire connexion / inscription | Non |
| `app.html` | Génération de fiches, quiz, résumés | Oui |
| `payment.html` | Choix du plan & paiement | Optionnelle |
| `dashboard.html` | Historique, stats, profil | Oui |

---

## Modules JS

### `main.js`
Fonctions utilitaires partagées par toutes les pages :
- `showToast(message, type)` — notifications non-bloquantes
- `Storage` — wrapper localStorage (get / set / remove)
- `requireAuth()` — redirige vers login.html si non connecté
- `initScrollReveal()` — animation des éléments `[data-reveal]` au scroll
- `copyToClipboard(text)` — copie dans le presse-papier

### `auth.js`
Gestion complète de l'authentification côté client :
- `register(name, email, password)` — création de compte
- `login(email, password)` — connexion
- `logout()` — déconnexion + redirection
- `getCurrentUser()` — lecture de la session active
- `upgradePlan(plan)` — mise à jour du plan utilisateur

> ⚠️ Les mots de passe sont stockés en clair dans `localStorage` à des fins de démonstration. En production, utiliser un backend sécurisé avec hashage (bcrypt) et JWT.

### `generator.js`
Appel à l'API Anthropic pour générer du contenu pédagogique :
- Types supportés : `fiche`, `quiz`, `resume`, `mindmap`
- Niveaux : lycée, licence, master, professionnel
- Gestion des crédits (décrémentation locale)
- Historique des générations (50 dernières)
- `renderMarkdown(text)` — conversion légère du Markdown en HTML

### `payment.js`
Sélection de plan et simulation de paiement :
- Plans : `free` (0€), `standard` (7,99€), `pro` (14,99€)
- Validation côté client des données de carte
- Simulation d'un appel de paiement (délai + 95% succès)
- Mise à jour du plan utilisateur après confirmation

---

## Design system

Le projet utilise un thème **"Dark Academic"** cohérent défini dans `style.css` :

```css
--ink        : #0d0f14   /* Fond principal */
--panel      : #181c27   /* Cartes & sidebar */
--gold       : #e8c96d   /* Couleur accent principale */
--teal       : #4ecdc4   /* Couleur accent secondaire */
--crimson    : #e05c5c   /* Erreurs & danger */
--font-display: 'Playfair Display'   /* Titres */
--font-body  : 'DM Sans'             /* Corps de texte */
--font-mono  : 'JetBrains Mono'      /* Code */
```

---

## Lancement

Aucune installation requise. Ouvrir `index.html` dans un navigateur moderne, ou utiliser un serveur local :

```bash
# Python
python3 -m http.server 8080

# Node (avec npx)
npx serve .
```

Puis ouvrir [http://localhost:8080](http://localhost:8080)

---

## Configuration de l'API

Le fichier `generator.js` appelle directement `https://api.anthropic.com/v1/messages`.

> En production, **ne jamais exposer une clé API côté client**. Passer par un backend (Node/Python) qui reçoit les requêtes et appelle l'API Anthropic de manière sécurisée.

---

## Roadmap

- [ ] Backend Node.js (Express) pour sécuriser les appels API
- [ ] Authentification via JWT
- [ ] Intégration Stripe pour les paiements réels
- [ ] Export PDF des fiches générées
- [ ] Mode hors-ligne (Service Worker)
- [ ] Application mobile (PWA)

---

## Licence

MIT — Projet de démonstration Study-IA
