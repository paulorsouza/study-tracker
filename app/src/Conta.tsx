import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import * as I from "./icones";

type Estado = { configurado: boolean; conectado: boolean; email: string | null };

type Maquina = {
  origem: string;
  lido_em: number;
  esta_maquina: boolean;
  operacoes: number;
};

type Resumo = { caminho: string; bytes: number; linhas: [string, number][] };

const kb = (b: number) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;

/** Um uuid inteiro não ajuda ninguém a reconhecer a máquina; os extremos, sim. */
const curto = (id: string) =>
  id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;

/**
 * Conta e dados (§3.1).
 *
 * Duas coisas aqui **não** são possíveis do lado do app, e a tela diz isso em
 * vez de escondê-las: listar as sessões de autenticação e apagar a conta em si
 * exigem a chave `service_role` do Supabase, que dá poder de administrador
 * sobre o projeto inteiro. Guardá-la num executável de desktop seria entregar o
 * projeto a quem abrisse o arquivo.
 */
export default function Conta({
  onErro,
  onMudou,
}: {
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [est, setEst] = useState<Estado | null>(null);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [emailRec, setEmailRec] = useState("");
  const [nova, setNova] = useState("");
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);

  const carregar = useCallback(() => {
    invoke<Estado>("supabase_estado")
      .then((e) => {
        setEst(e);
        setEmailRec((a) => a || e.email || "");
      })
      .catch(() => {});
    invoke<Maquina[]>("supabase_maquinas").then(setMaquinas).catch(() => {});
  }, []);

  useEffect(carregar, [carregar]);

  /// Uma porta só para as ações da tela: todas travam os botões, todas
  /// terminam limpando o erro ou mostrando o de verdade. Sem isto, cada botão
  /// teria a sua versão da mesma sequência, e uma delas esqueceria um passo.
  const rodar = async (f: () => Promise<string | void>) => {
    setOcupado(true);
    setRecado(null);
    try {
      const r = await f();
      onErro(null);
      if (typeof r === "string") setRecado(r);
      carregar();
      onMudou();
    } catch (e) {
      onErro(String(e));
    } finally {
      setOcupado(false);
    }
  };

  const exportar = async () => {
    const caminho = await save({
      title: "Exportar meus dados",
      defaultPath: `estudos-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!caminho) return;
    rodar(async () => {
      setResumo(await invoke<Resumo>("exportar_dados", { caminho }));
    });
  };

  return (
    <>
      {recado && (
        <div className="aviso" role="status">
          <I.Alerta />
          <span style={{ flex: 1 }}>{recado}</span>
          <button
            className="btn btn-fantasma btn-icone"
            onClick={() => setRecado(null)}
            aria-label="Dispensar"
          >
            <I.Fechar />
          </button>
        </div>
      )}

      <section className="card">
        <h2>Meus dados</h2>
        <p className="legenda" style={{ marginBottom: 14 }}>
          Tudo o que o app guarda sobre você, num arquivo só. Sem recorte e sem
          filtro — é um arquivo de resgate, não um relatório.
        </p>

        <div className="linha">
          <button className="btn btn-primario" onClick={exportar} disabled={ocupado}>
            <I.Nota size={15} /> Exportar em JSON
          </button>
        </div>

        {resumo && (
          <>
            <hr />
            <p className="nota" style={{ marginTop: 0 }}>
              {resumo.caminho} · {kb(resumo.bytes)}
            </p>
            <table className="medidas">
              <tbody>
                {resumo.linhas
                  .filter(([, n]) => n > 0)
                  .map(([t, n]) => (
                    <tr key={t}>
                      <td style={{ width: "auto" }}>{t}</td>
                      <td className="num" style={{ textAlign: "right" }}>{n}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="card">
        <h2>Máquinas</h2>
        <p className="legenda" style={{ marginBottom: 14 }}>
          De onde vieram os dados que este computador já leu. Não são as sessões
          de login: listá-las exigiria a chave de administrador do projeto, que
          um app instalado no seu computador não deve guardar.
        </p>

        {maquinas.length === 0 ? (
          <div className="vazio">Nenhuma sincronização ainda.</div>
        ) : (
          maquinas.map((m) => (
            <div key={m.origem} className="lanc">
              <span className="lanc-texto num">
                {curto(m.origem)}
                {m.esta_maquina && <span className="selo selo-hoje">esta</span>}
              </span>
              <span className="lanc-curso">
                {m.operacoes} operaç{m.operacoes === 1 ? "ão" : "ões"}
              </span>
              <span className="lanc-dur" style={{ fontWeight: 400, fontSize: 12.5 }}>
                {m.lido_em
                  ? new Date(m.lido_em).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </span>
            </div>
          ))
        )}

        {est?.conectado && (
          <>
            <hr />
            <div className="linha">
              <span style={{ flex: 1, fontSize: 12.5, color: "var(--tx-2)" }}>
                Encerrar a sessão nas outras máquinas. Esta continua conectada.
              </span>
              <button
                className="btn"
                disabled={ocupado}
                onClick={() =>
                  rodar(async () => {
                    await invoke("supabase_encerrar_outras");
                    return "As outras máquinas vão pedir login na próxima sincronização.";
                  })
                }
              >
                Encerrar as outras
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>Senha</h2>

        <div className="grade">
          <div className="campo cresce">
            <label htmlFor="cre">E-mail da conta</label>
            <input
              id="cre"
              type="email"
              value={emailRec}
              onChange={(e) => setEmailRec(e.target.value)}
              autoComplete="username"
            />
          </div>
          <button
            className="btn"
            disabled={ocupado || !emailRec.trim()}
            onClick={() =>
              rodar(async () => {
                await invoke("supabase_recuperar_senha", { email: emailRec });
                return `Link enviado para ${emailRec}, se houver conta com esse e-mail.`;
              })
            }
          >
            Mandar link de redefinição
          </button>
        </div>
        <p className="nota">
          O link abre a página do seu próprio Supabase. O app não vê nem
          intermedeia a senha nova.
        </p>

        {est?.conectado && (
          <>
            <hr />
            <div className="grade">
              <div className="campo cresce">
                <label htmlFor="cnv">Nova senha</label>
                <input
                  id="cnv"
                  type="password"
                  value={nova}
                  onChange={(e) => setNova(e.target.value)}
                  autoComplete="new-password"
                  placeholder="ao menos 8 caracteres"
                />
              </div>
              <button
                className="btn"
                disabled={ocupado || nova.length < 8}
                onClick={() =>
                  rodar(async () => {
                    await invoke("supabase_trocar_senha", { nova });
                    setNova("");
                    return "Senha trocada.";
                  })
                }
              >
                Trocar senha
              </button>
            </div>
            <p className="nota">
              Vai direto para o Supabase e não encosta em disco — nem no banco do
              app, nem no cofre, nem em log.
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h2>Apagar</h2>
        <p className="legenda" style={{ marginBottom: 14 }}>
          Apaga do seu Supabase todas as operações desta conta. O banco local
          <b> não é tocado</b>: seu histórico continua aqui.
        </p>

        {confirmando ? (
          <div className="aviso aviso-erro" role="alert">
            <I.Alerta />
            <span>
              Isto apaga a fila de sincronização no servidor e não tem desfazer.
              As outras máquinas param de receber o que já foi enviado.
            </span>
            <button
              className="btn btn-perigo"
              disabled={ocupado}
              onClick={() =>
                rodar(async () => {
                  const n = await invoke<number>("supabase_apagar_nuvem");
                  setConfirmando(false);
                  return `${n} operaç${n === 1 ? "ão apagada" : "ões apagadas"} do servidor. O banco local continua intacto.`;
                })
              }
            >
              Apagar mesmo assim
            </button>
            <button className="btn btn-fantasma" onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <div className="linha">
            <button
              className="btn btn-perigo"
              disabled={!est?.conectado || ocupado}
              onClick={() => setConfirmando(true)}
            >
              <I.Lixeira /> Apagar os dados do servidor
            </button>
          </div>
        )}

        <p className="nota">
          <b>Excluir a conta em si</b> é feito no painel do Supabase, em
          Authentication → Users. Fazer isso daqui exigiria a chave de
          administrador do projeto — a mesma que apaga qualquer conta, inclusive
          as que não são suas. Ela não deve morar num app de desktop.
        </p>
      </section>
    </>
  );
}
