import type { OralModel, OralPart } from '@lenseignement/types';

/**
 * Modèles d'épreuves orales : la forme des parties, avec des exemples écrits pour la plateforme
 * (aucun item d'EGRA, d'EGMA ou d'une autre évaluation). Les équipes les remplacent par les leurs.
 */

/** Mélange fixe (toujours le même ordre), pour que l'exemple ne change pas d'une fois à l'autre. */
function spread<T>(values: readonly T[], count: number, step = 7): T[] {
  const out: T[] = [];
  for (let i = 0; out.length < count; i += 1) out.push(values[(i * step) % values.length]!);
  return out;
}

const LETTERS = [
  'a',
  'i',
  'o',
  'u',
  'é',
  'm',
  'l',
  'r',
  's',
  't',
  'p',
  'n',
  'd',
  'b',
  'f',
  'v',
  'ou',
  'on',
  'an',
  'ch',
  'e',
  'k',
  'j',
  'g',
  'z',
  'è',
  'in',
  'oi',
  'y',
  'c',
];
const WORDS = [
  'la',
  'le',
  'un',
  'il',
  'elle',
  'est',
  'papa',
  'maman',
  'ami',
  'école',
  'lit',
  'mur',
  'eau',
  'riz',
  'pain',
  'table',
  'livre',
  'porte',
  'soleil',
  'maison',
  'route',
  'arbre',
  'chat',
  'poule',
  'robe',
  'midi',
  'jour',
  'nuit',
  'banane',
  'vélo',
];
const PSEUDO = [
  'tipo',
  'mafu',
  'lori',
  'bidé',
  'sorpa',
  'nuvé',
  'kalo',
  'fipé',
  'rodu',
  'vami',
  'lubo',
  'pirta',
  'dolu',
  'sémi',
  'tafo',
  'nolé',
  'bura',
  'mévi',
  'gopa',
  'zilu',
];
const DAILY = [
  'eau',
  'pain',
  'riz',
  'prix',
  'marché',
  'santé',
  'école',
  'bus',
  'argent',
  'travail',
  'maison',
  'savon',
  'huile',
  'sucre',
  'lait',
  'carte',
  'nom',
  'date',
  'heure',
  'mairie',
];

function numbers(count: number, max: number, step: number): string[] {
  return Array.from({ length: count }, (_, i) => String((i * step + 3) % (max + 1)));
}

function sums(count: number, sign: '+' | '−'): string[] {
  return Array.from({ length: count }, (_, i) => {
    const a = ((i * 3) % 8) + 2;
    const b = ((i * 5) % (sign === '+' ? 7 : a)) + 1;
    return sign === '+' ? `${a} + ${b}` : `${a} − ${Math.min(b, a)}`;
  });
}

const base = { instruction: '', items: [], text: '', questions: [], seconds: 60, reference: false };

export function oralModel(model: OralModel | null): OralPart[] {
  if (model === 'lecture-debut') {
    return [
      {
        ...base,
        kind: 'grille',
        title: 'Sons des lettres',
        instruction:
          'Montre-moi chaque lettre et dis-moi son son. Commence ici et va ligne par ligne.',
        items: spread(LETTERS, 50),
      },
      {
        ...base,
        kind: 'grille',
        title: 'Mots familiers',
        instruction: 'Lis ces mots le mieux que tu peux, ligne par ligne.',
        items: spread(WORDS, 50, 11),
      },
      {
        ...base,
        kind: 'grille',
        title: 'Mots inventés',
        instruction: 'Ces mots n’existent pas. Essaie de les lire quand même.',
        items: spread(PSEUDO, 50, 3),
      },
      {
        ...base,
        kind: 'texte',
        title: 'Petit texte',
        instruction: 'Lis cette histoire à voix haute. Ensuite, je te poserai des questions.',
        text:
          'Awa va à l’école avec son petit frère. Ils marchent sous le soleil. ' +
          'En classe, Awa lit un livre sur les animaux. À midi, elle mange du riz avec sa maman. ' +
          'Le soir, elle aide son frère à écrire son nom.',
        questions: [
          { prompt: 'Avec qui Awa va-t-elle à l’école ?', answer: 'Avec son petit frère.' },
          { prompt: 'Que lit Awa en classe ?', answer: 'Un livre sur les animaux.' },
          { prompt: 'Que mange-t-elle à midi ?', answer: 'Du riz.' },
          { prompt: 'Que fait-elle le soir ?', answer: 'Elle aide son frère à écrire son nom.' },
        ],
        reference: true,
      },
    ];
  }
  if (model === 'maths-debut') {
    return [
      {
        ...base,
        kind: 'grille',
        title: 'Reconnaître les nombres',
        instruction: 'Dis-moi chaque nombre, ligne par ligne.',
        items: numbers(20, 99, 37),
        reference: true,
      },
      {
        ...base,
        kind: 'grille',
        title: 'Le plus grand',
        instruction: 'Pour chaque paire, montre-moi le nombre le plus grand.',
        items: Array.from({ length: 10 }, (_, i) => `${(i * 7 + 2) % 20} ou ${(i * 4 + 5) % 20}`),
        seconds: 60,
      },
      {
        ...base,
        kind: 'grille',
        title: 'Nombre manquant',
        instruction: 'Quel nombre manque ?',
        items: Array.from({ length: 10 }, (_, i) => {
          const s = (i * 2 + 1) % 15;
          const step = (i % 3) + 1;
          return `${s}  ${s + step}  …  ${s + 3 * step}`;
        }),
      },
      {
        ...base,
        kind: 'grille',
        title: 'Additions',
        instruction: 'Calcule.',
        items: sums(20, '+'),
      },
      {
        ...base,
        kind: 'grille',
        title: 'Soustractions',
        instruction: 'Calcule.',
        items: sums(20, '−'),
      },
    ];
  }
  if (model === 'alpha') {
    return [
      {
        ...base,
        kind: 'grille',
        title: 'Lettres',
        instruction: 'Dites le son de chaque lettre, ligne par ligne.',
        items: spread(LETTERS, 40),
      },
      {
        ...base,
        kind: 'grille',
        title: 'Mots du quotidien',
        instruction: 'Lisez ces mots, ligne par ligne.',
        items: spread(DAILY, 40, 3),
      },
      {
        ...base,
        kind: 'texte',
        title: 'Petit texte',
        instruction: 'Lisez ce texte à voix haute, puis répondez aux questions.',
        text:
          'Le marché ouvre tôt le matin. Fatou achète des tomates et du poisson. ' +
          'Elle paie mille francs et garde la monnaie pour le bus.',
        questions: [
          { prompt: 'Qu’achète Fatou ?', answer: 'Des tomates et du poisson.' },
          { prompt: 'Combien paie-t-elle ?', answer: 'Mille francs.' },
        ],
        reference: true,
      },
    ];
  }
  return [
    {
      ...base,
      kind: 'grille',
      title: 'Première partie',
      instruction: '',
      items: ['a', 'e', 'i', 'o', 'u'],
    },
  ];
}
