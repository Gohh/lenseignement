/**
 * Voix de synthèse de l'appareil (ADR-008, ADR-015). Rien n'est téléchargé : l'écoute marche
 * hors ligne si l'appareil a une voix dans la langue du cours.
 */

const PICTOGRAMS = /\p{Extended_Pictographic}️?/gu;

/**
 * Découpe le texte en phrases courtes : certains navigateurs coupent une synthèse vocale trop
 * longue, et une phrase à la fois permet de reprendre proprement. Les pictogrammes (🪙, 💵…)
 * aident à l'écran mais ne sont pas lus.
 */
export function splitForSpeech(text: string): string[] {
  return text
    .replace(PICTOGRAMS, '')
    .split(/(?<=[.!?…:;])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Phrase prête à lire, dans la langue du cours, avec la voix de l'appareil si elle existe. */
export function utteranceFor(sentence: string, lang: string, rate = 1): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(sentence);
  utterance.lang = lang === 'fr' ? 'fr-FR' : lang;
  utterance.rate = rate;
  const voice = window.speechSynthesis
    .getVoices()
    .find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
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
