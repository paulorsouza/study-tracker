/** Tipos e conversões que as quatro visualizações de tempo compartilham. */

export const DIA = 86_400_000;

export type Lancamento = {
  id: string;
  started_at: number;
  ended_at: number | null;
  activity_type_id: string;
  atividade: string;
  cor: string;
  cor_escura: string | null;
  conta_como_estudo: boolean;
  description: string | null;
  course_id: string | null;
  curso: string | null;
  source: string;
  sobrepoe: boolean;
  observacao: string | null;
  distancia_m: number | null;
  treino: string | null;
  subject_id: string | null;
  materia: string | null;
  aula: string | null;
  /** Ícone da categoria, resolvido na consulta. */
  icone?: string | null;
};

export type Tipo = {
  id: string;
  nome: string;
  cor: string;
  cor_escura: string | null;
  conta_como_estudo: boolean;
  icone: string | null;
  /** "distancia", "treino" ou nada. Decide qual campo extra a tela mostra. */
  campos_extra: string | null;
};

/** O passo escuro é escolhido contra a superfície escura — não é o claro clareado. */
export const corDe = (l: { cor: string; cor_escura: string | null }, tema: string) =>
  tema === "escuro" ? l.cor_escura ?? l.cor : l.cor;

export const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Segunda-feira da semana de `d`, à meia-noite local. */
export function segundaDe(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function meiaNoite(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
