import { useState } from "react";
import { Curso } from "./App";
import Hoje from "./Hoje";
import Semana from "./Semana";
import Calendario from "./Calendario";
import Historico from "./Historico";

type Vista = "dia" | "semana" | "calendario" | "historico";

const VISTAS: { id: Vista; nome: string }[] = [
  { id: "dia", nome: "Dia" },
  { id: "semana", nome: "Semana" },
  { id: "calendario", nome: "Calendário" },
  { id: "historico", nome: "Histórico" },
];

/**
 * As quatro visões do mesmo tempo (§3.5).
 *
 * Ficam juntas porque são recortes de uma única tabela, não telas diferentes:
 * separá-las na navegação faria parecer que existem quatro registros de tempo.
 * O dia é a padrão — é a pergunta que se faz todo dia.
 */
export default function Tempo({
  cursos,
  versao,
  tema,
  onErro,
  onMudou,
}: {
  cursos: Curso[];
  versao: number;
  tema: string;
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [vista, setVista] = useState<Vista>("dia");
  const [dia, setDia] = useState<Date | null>(null);

  return (
    <>
      <div className="abas" style={{ marginBottom: 20 }}>
        {VISTAS.map((v) => (
          <button
            key={v.id}
            className="aba"
            aria-current={vista === v.id ? "page" : undefined}
            onClick={() => setVista(v.id)}
          >
            {v.nome}
          </button>
        ))}
      </div>

      {vista === "dia" && (
        <Hoje
          cursos={cursos}
          versao={versao}
          tema={tema}
          diaInicial={dia}
          onErro={onErro}
          onMudou={onMudou}
        />
      )}
      {vista === "semana" && (
        <Semana
          versao={versao}
          tema={tema}
          onErro={onErro}
          onAbrirDia={(d) => {
            setDia(d);
            setVista("dia");
          }}
        />
      )}
      {vista === "calendario" && (
        <Calendario
          cursos={cursos}
          versao={versao}
          tema={tema}
          onErro={onErro}
          onMudou={onMudou}
        />
      )}
      {vista === "historico" && (
        <Historico cursos={cursos} versao={versao} tema={tema} onErro={onErro} />
      )}
    </>
  );
}
