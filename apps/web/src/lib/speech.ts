/**
 * Voix de synthèse de l'appareil (ADR-008, ADR-015). Rien n'est téléchargé : l'écoute marche
 * hors ligne si l'appareil a une voix dans la langue du cours.
 */

const PICTOGRAMS = /\p{Extended_Pictographic}️?/gu;

/**
 * Découpe le texte en phrases : certains navigateurs coupent une synthèse vocale trop longue,
 * et une phrase à la fois permet de reprendre proprement. On ne coupe qu'en fin de phrase (pas
 * aux deux-points) : moins de pauses, une intonation plus régulière. Les pictogrammes (🪙, 💵…)
 * aident à l'écran mais ne sont pas lus.
 */
export function splitForSpeech(text: string): string[] {
  return text
    .replace(PICTOGRAMS, '')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Meilleure voix de l'appareil pour la langue : les voix « naturelles » (Edge, Windows 11,
 * Android) et Google sonnent bien mieux que les voix système de base ; à égalité, la variante
 * de France, puis la voix par défaut.
 */
export function bestVoice(
  voices: SpeechSynthesisVoice[],
  lang: string,
): SpeechSynthesisVoice | undefined {
  const wanted = lang.toLowerCase();
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online/i.test(v.name) ? 8 : 0) +
    (/google/i.test(v.name) ? 4 : 0) +
    (v.lang.toLowerCase().replace('_', '-') === `${wanted}-${wanted}` ? 2 : 0) +
    (v.default ? 1 : 0);
  return voices
    .filter((v) => v.lang.toLowerCase().startsWith(wanted))
    .sort((a, b) => score(b) - score(a))[0];
}

/** Phrase prête à lire, dans la langue du cours, avec la meilleure voix de l'appareil. */
export function utteranceFor(sentence: string, lang: string, rate = 1): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(sentence);
  utterance.lang = lang === 'fr' ? 'fr-FR' : lang;
  utterance.rate = rate;
  const voice = bestVoice(window.speechSynthesis.getVoices(), lang);
  if (voice) utterance.voice = voice;
  return utterance;
}

/** Lit un texte phrase par phrase, après avoir arrêté toute autre lecture. */
export function speak(text: string, lang: string, onDone?: () => void): void {
  window.speechSynthesis.cancel();
  const queue = splitForSpeech(text);
  const next = () => {
    const sentence = queue.shift();
    if (sentence === undefined) {
      onDone?.();
      return;
    }
    const utterance = utteranceFor(sentence, lang);
    utterance.onend = next;
    window.speechSynthesis.speak(utterance);
  };
  next();
}
