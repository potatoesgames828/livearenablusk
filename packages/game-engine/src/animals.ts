/** Animais da Corrida Animal: atributos usados pela simulação e pelo renderer. */
export type AnimalKind = 'raposa' | 'coelho' | 'tartaruga' | 'galinha' | 'porco' | 'sapo' | 'cavalo' | 'pinguim';

export const ANIMALS: Array<{ kind: AnimalKind; name: string; color: string; speed: number; accel: number; stamina: number; trait: string }> = [
  { kind: 'raposa', name: 'Raposa', color: '#f97316', speed: 1.05, accel: 1.0, stamina: 0.9, trait: 'Arranque rápido' },
  { kind: 'coelho', name: 'Coelho', color: '#e5e7eb', speed: 1.1, accel: 1.15, stamina: 0.75, trait: 'Pula obstáculos' },
  { kind: 'tartaruga', name: 'Tartaruga', color: '#22c55e', speed: 0.8, accel: 0.7, stamina: 1.4, trait: 'Casco: ignora tropeços' },
  { kind: 'galinha', name: 'Galinha', color: '#fde68a', speed: 0.95, accel: 1.25, stamina: 0.85, trait: 'Bate as asas no turbo' },
  { kind: 'porco', name: 'Porco', color: '#f9a8d4', speed: 0.92, accel: 0.9, stamina: 1.2, trait: 'Atropela lama' },
  { kind: 'sapo', name: 'Sapo', color: '#4ade80', speed: 1.0, accel: 1.05, stamina: 1.0, trait: 'Saltos longos' },
  { kind: 'cavalo', name: 'Cavalo', color: '#a16207', speed: 1.15, accel: 0.85, stamina: 1.0, trait: 'Velocidade máxima alta' },
  { kind: 'pinguim', name: 'Pinguim', color: '#1f2937', speed: 0.9, accel: 1.0, stamina: 1.1, trait: 'Desliza na reta final' },
];
