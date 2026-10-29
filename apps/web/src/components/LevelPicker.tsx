'use client';

import { LEVEL_GROUPS } from '@lenseignement/types';
import { useState } from 'react';

const chip =
  'inline-flex min-h-[44px] cursor-pointer items-center rounded-full border-2 border-primary-line bg-surface px-4 font-bold text-ink-strong has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2';

/** Choix en deux temps : le cycle d'abord, puis les niveaux de ce cycle. Envoie `level`. */
export function LevelPicker({ current }: { current: string | null }) {
  const initial = LEVEL_GROUPS.find((g) => g.levels.some((l) => l.code === current))?.code ?? null;
  const [group, setGroup] = useState<string | null>(initial);
  const levels = LEVEL_GROUPS.find((g) => g.code === group)?.levels ?? [];

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 font-bold">Mon cycle</legend>
        <div className="flex flex-wrap gap-2">
          {LEVEL_GROUPS.map((g) => (
            <label key={g.code} className={chip}>
              <input
                type="radio"
                name="cycle"
                value={g.code}
                checked={group === g.code}
                onChange={() => setGroup(g.code)}
                className="sr-only"
              />
              {g.title}
            </label>
          ))}
        </div>
      </fieldset>
      {levels.length > 0 && (
        <fieldset>
          <legend className="mb-2 font-bold">Mon niveau</legend>
          <div className="flex flex-wrap gap-2">
            {levels.map((l) => (
              <label key={l.code} className={chip}>
                <input
                  type="radio"
                  name="level"
                  value={l.code}
                  defaultChecked={l.code === current}
                  required
                  className="sr-only"
                />
                {l.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
