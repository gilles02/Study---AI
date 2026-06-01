// api/generate.js
// Vercel Serverless Function — proxy sécurisé vers Gemini Flash
// Ta clé API n'est jamais visible dans le frontend.

export default async function handler(req, res) {

  // ── 1. Autoriser uniquement les requêtes POST ──────────────────────────────
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée. Utilise POST." });
  }

  // ── 2. Lire le corps de la requête envoyée par ton frontend ───────────────
  // ton frontend envoie : { prompt: "La photosynthèse", type: "fiche", level: "lycee" }
  const { prompt, type, level } = req.body;

  // Vérification : le champ prompt est obligatoire
  if (!prompt || prompt.trim() === "") {
    return res.status(400).json({ error: "Le champ 'prompt' est obligatoire." });
  }

  // ── 3. Lire la clé API depuis les variables d'environnement Vercel ─────────
  // Elle est stockée dans le dashboard Vercel, jamais dans le code.
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    // Ce message d'erreur n'est visible que dans les logs Vercel, pas chez l'utilisateur
    console.error("GEMINI_API_KEY manquante dans les variables d'environnement.");
    return res.status(500).json({ error: "Erreur de configuration serveur." });
  }

  // ── 4. Construire le prompt système selon le type et le niveau ─────────────
  const niveaux = {
    lycee:        "lycée (classe de terminale)",
    licence:      "licence universitaire (bac+3)",
    master:       "master ou grande école (bac+5)",
    professionnel:"formation professionnelle",
  };

  const types = {
    fiche:   `Crée une fiche de révision structurée sur : "${prompt}". Inclus les points clés, définitions importantes et un résumé final.`,
    quiz:    `Génère un quiz de 5 questions à choix multiples sur : "${prompt}". Pour chaque question, indique la bonne réponse et une courte explication.`,
    resume:  `Fais un résumé clair et concis (200-300 mots) sur : "${prompt}". Mets en avant uniquement les points essentiels.`,
    mindmap: `Crée un plan structuré hiérarchique (grands axes et sous-points) pour le sujet : "${prompt}".`,
  };

  const niveauLabel  = niveaux[level]  || niveaux.lycee;
  const contenuPrompt = types[type]   || types.fiche;

  const systemInstruction = `Tu es Study-IA, un assistant pédagogique expert. Tu génères du contenu de révision clair et précis, adapté au niveau ${niveauLabel}. Réponds toujours en français.`;

  // ── 5. Appeler l'API Gemini Flash ──────────────────────────────────────────
  // Modèle : gemini-2.0-flash  (rapide et économique)
  // Documentation : https://ai.google.dev/api/generate-content
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  let geminiResponse;

  try {
    geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Instruction système : définit le rôle de l'IA
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        // Le message de l'utilisateur
        contents: [
          {
            role: "user",
            parts: [{ text: contenuPrompt }],
          },
        ],
        // Paramètres de génération (optionnels mais recommandés)
        generationConfig: {
          temperature:     0.7,   // 0 = très factuel, 1 = plus créatif
          maxOutputTokens: 1024,  // limite la longueur de la réponse
          topP:            0.9,
        },
      }),
    });
  } catch (networkError) {
    // Erreur réseau (Vercel ne peut pas atteindre Google)
    console.error("Erreur réseau vers Gemini :", networkError.message);
    return res.status(502).json({ error: "Impossible de contacter l'API Gemini." });
  }

  // ── 6. Vérifier que Gemini a répondu sans erreur ───────────────────────────
  if (!geminiResponse.ok) {
    const erreurGemini = await geminiResponse.json().catch(() => ({}));
    console.error("Erreur Gemini :", JSON.stringify(erreurGemini));
    return res.status(geminiResponse.status).json({
      error: erreurGemini?.error?.message || "Erreur de l'API Gemini.",
    });
  }

  // ── 7. Extraire le texte de la réponse Gemini ──────────────────────────────
  // La réponse Gemini est imbriquée : data.candidates[0].content.parts[0].text
  const data   = await geminiResponse.json();
  const texte  = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!texte) {
    console.error("Réponse Gemini vide ou format inattendu :", JSON.stringify(data));
    return res.status(500).json({ error: "Réponse vide reçue de Gemini." });
  }

  // ── 8. Retourner le texte au frontend ─────────────────────────────────────
  return res.status(200).json({ result: texte });
}