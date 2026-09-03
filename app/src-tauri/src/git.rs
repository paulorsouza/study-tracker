//! Sincronização do vault por git (D-023).
//!
//! O app **não sincroniza**: ele orquestra o git, que é quem faz diferença,
//! mesclagem e detecção de conflito. A diferença importa — construir mesclagem
//! de Markdown seria refazer, pior, o que o git já faz há vinte anos.
//!
//! Três regras que definem o comportamento e não são negociáveis:
//!
//! 1. **`git add` só na pasta de exportação.** Nunca `-A`. Se o vault é um
//!    repositório com outras coisas dentro — e ele quase sempre é — commitar
//!    tudo significaria empacotar o rascunho que o usuário estava escrevendo
//!    naquele instante.
//! 2. **Nenhuma credencial passa por aqui.** `push` usa o que o git já tem
//!    configurado na máquina (gerenciador de credenciais, agente SSH). O app
//!    não lê, não guarda e não pede senha.
//! 3. **Conflito não vira meia-mesclagem.** Se o rebase falhar, o app aborta e
//!    devolve o repositório ao estado anterior, dizendo quais arquivos
//!    conflitaram. Repositório em rebase pela metade, dentro de um vault, é
//!    exatamente o tipo de estado que ninguém sabe desfazer.

use crate::db::Db;
use crate::obsidian;
use serde::Serialize;
use std::path::{Path, PathBuf, MAIN_SEPARATOR};
use std::process::Command;

fn git(dir: &Path, args: &[&str]) -> Result<String, String> {
    let saida = Command::new("git")
        .current_dir(dir)
        .args(args)
        // Impede o git de abrir prompt gráfico de senha e travar o app
        // esperando alguém que não está olhando.
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .output()
        .map_err(|e| format!("git não pôde ser executado: {e}"))?;

    let texto = String::from_utf8_lossy(&saida.stdout).trim().to_string();
    if saida.status.success() {
        Ok(texto)
    } else {
        let erro = String::from_utf8_lossy(&saida.stderr).trim().to_string();
        Err(if erro.is_empty() { texto } else { erro })
    }
}

/// Raiz do repositório que contém a pasta de exportação — pode ser o vault
/// inteiro, e normalmente é.
fn raiz_repo(pasta: &Path) -> Result<PathBuf, String> {
    let saida = git(pasta, &["rev-parse", "--show-toplevel"])?;
    Ok(PathBuf::from(saida))
}

#[derive(Serialize)]
pub struct Estado {
    pub repositorio: Option<String>,
    pub ramo: Option<String>,
    pub remoto: Option<String>,
    /// Arquivos modificados **dentro da pasta de exportação**, que são os
    /// únicos que este app se propõe a commitar.
    pub pendentes: Vec<String>,
    /// Alterações fora da pasta de exportação. O app não toca nelas; a conta
    /// existe para a tela poder dizer que elas ficam de fora.
    pub fora_do_escopo: usize,
    pub atras: i64,
    pub adiante: i64,
    pub erro: Option<String>,
}

/// Onde a pasta de exportação fica dentro do repositório.
///
/// Vazio significa "a pasta **é** a raiz", e só isso. Falhar em descobrir é
/// **erro**, nunca "tudo" — a versão anterior caía em `unwrap_or_default()`, e
/// a string vazia virava `git add -- .` mais adiante: o vault inteiro no
/// commit, que é exatamente o que D-021 promete que nunca acontece.
///
/// Os dois caminhos são canonicalizados antes de comparar porque o git devolve
/// o caminho já resolvido — sem nome curto 8.3, sem junção — e comparar isso
/// com o caminho cru do sistema falha justamente onde ninguém testa. Foi o CI
/// do Windows que pegou: lá o temporário aparece como `RUNNER~1`, aqui não, e
/// o mesmo código commitava coisas diferentes.
fn caminho_relativo(raiz: &Path, pasta: &Path) -> Result<String, String> {
    let resolver = |p: &Path| {
        std::fs::canonicalize(p)
            .map_err(|e| format!("não consegui resolver {}: {e}", p.display()))
    };
    let (r, p) = (resolver(raiz)?, resolver(pasta)?);
    p.strip_prefix(&r)
        .map(|x| x.to_string_lossy().replace(MAIN_SEPARATOR, "/"))
        .map_err(|_| {
            format!(
                "a pasta de exportação não está dentro do repositório: {} fora de {}",
                p.display(),
                r.display()
            )
        })
}

#[tauri::command]
pub fn git_estado(db: tauri::State<Db>) -> Estado {
    let vazio = |erro: Option<String>| Estado {
        repositorio: None,
        ramo: None,
        remoto: None,
        pendentes: vec![],
        fora_do_escopo: 0,
        atras: 0,
        adiante: 0,
        erro,
    };

    let cfg = obsidian::config_de(&db);
    let Some(pasta) = cfg.pasta.clone().filter(|p| !p.is_empty()) else {
        return vazio(Some("escolha a pasta do vault primeiro".into()));
    };
    let pasta = PathBuf::from(pasta);

    let raiz = match raiz_repo(&pasta) {
        Ok(r) => r,
        Err(_) => return vazio(Some("a pasta não está dentro de um repositório git".into())),
    };

    let relativo = match caminho_relativo(&raiz, &pasta) {
        Ok(r) => r,
        Err(e) => return vazio(Some(e)),
    };
    let ramo = git(&raiz, &["rev-parse", "--abbrev-ref", "HEAD"]).ok();
    let remoto = git(&raiz, &["remote"])
        .ok()
        .and_then(|s| s.lines().next().map(str::to_string));

    // `--porcelain` é estável entre versões do git; a saída "amigável" não é.
    let status = git(&raiz, &["status", "--porcelain"]).unwrap_or_default();
    let mut pendentes = Vec::new();
    let mut fora = 0usize;
    for linha in status.lines() {
        let arquivo = linha.get(3..).unwrap_or("").trim().to_string();
        if arquivo.is_empty() {
            continue;
        }
        if relativo.is_empty() || arquivo.starts_with(&relativo) {
            pendentes.push(arquivo);
        } else {
            fora += 1;
        }
    }

    let (mut atras, mut adiante) = (0, 0);
    if let (Some(r), Some(b)) = (remoto.as_ref(), ramo.as_ref()) {
        if let Ok(c) = git(
            &raiz,
            &["rev-list", "--left-right", "--count", &format!("{r}/{b}...HEAD")],
        ) {
            let mut p = c.split_whitespace();
            atras = p.next().and_then(|x| x.parse().ok()).unwrap_or(0);
            adiante = p.next().and_then(|x| x.parse().ok()).unwrap_or(0);
        }
    }

    Estado {
        repositorio: Some(raiz.to_string_lossy().to_string()),
        ramo,
        remoto,
        pendentes,
        fora_do_escopo: fora,
        atras,
        adiante,
        erro: None,
    }
}

#[derive(Serialize, Debug)]
pub struct Sincronizacao {
    pub passos: Vec<String>,
    pub commitou: bool,
    pub enviou: bool,
    pub conflitos: Vec<String>,
    pub erro: Option<String>,
}

/// Commit da pasta de exportação, rebase sobre o remoto e push.
///
/// Falha em qualquer etapa devolve o que já foi feito, em vez de mascarar: o
/// usuário precisa saber se o commit existe localmente mesmo quando o push não
/// passou.
#[tauri::command]
pub fn git_sincronizar(db: tauri::State<Db>, mensagem: Option<String>) -> Sincronizacao {
    let cfg = obsidian::config_de(&db);
    match cfg.pasta.filter(|p| !p.is_empty()) {
        Some(p) => sincronizar_em(Path::new(&p), mensagem),
        None => Sincronizacao {
            passos: vec![],
            commitou: false,
            enviou: false,
            conflitos: vec![],
            erro: Some("escolha a pasta do vault primeiro".into()),
        },
    }
}

/// Núcleo, separado do comando para poder ser exercitado contra um git de
/// verdade nos testes. Orquestração de processo externo não se valida lendo.
pub fn sincronizar_em(pasta: &Path, mensagem: Option<String>) -> Sincronizacao {
    let mut s = Sincronizacao {
        passos: vec![],
        commitou: false,
        enviou: false,
        conflitos: vec![],
        erro: None,
    };

    let raiz = match raiz_repo(pasta) {
        Ok(r) => r,
        Err(e) => {
            s.erro = Some(format!("não é um repositório git: {e}"));
            return s;
        }
    };
    let relativo = match caminho_relativo(&raiz, pasta) {
        Ok(r) => r,
        Err(e) => {
            s.erro = Some(e);
            return s;
        }
    };
    // Vazio aqui só pode significar que a pasta de exportação é a própria
    // raiz do repositório — o único caso em que `.` está certo.
    let alvo = if relativo.is_empty() { ".".to_string() } else { relativo };

    // 1. Preparar só o que é nosso. O `--` separa caminho de opção e evita
    //    que uma pasta chamada, digamos, "-f" vire argumento.
    if let Err(e) = git(&raiz, &["add", "--", &alvo]) {
        s.erro = Some(format!("git add falhou: {e}"));
        return s;
    }

    // 2. Commitar, se houver algo preparado. Sem isso, um `commit` sem
    //    mudanças devolveria erro e pararia a sincronização à toa.
    let preparado = git(&raiz, &["diff", "--cached", "--name-only"]).unwrap_or_default();
    if !preparado.trim().is_empty() {
        let msg = mensagem.unwrap_or_else(|| "Estudos: exportação".into());
        match git(&raiz, &["commit", "-m", &msg]) {
            Ok(_) => {
                s.commitou = true;
                s.passos.push(format!(
                    "commit de {} arquivo(s)",
                    preparado.lines().count()
                ));
            }
            Err(e) => {
                s.erro = Some(format!("commit falhou: {e}"));
                return s;
            }
        }
    } else {
        s.passos.push("nada novo para commitar".into());
    }

    let remoto = match git(&raiz, &["remote"])
        .ok()
        .and_then(|r| r.lines().next().map(str::to_string))
    {
        Some(r) => r,
        None => {
            s.passos.push("sem remoto configurado — parou no commit local".into());
            return s;
        }
    };
    let ramo = git(&raiz, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();

    // 3. Trazer o que veio da outra máquina.
    if let Err(e) = git(&raiz, &["fetch", &remoto]) {
        s.erro = Some(format!("fetch falhou: {e}"));
        return s;
    }

    // 4. Rebase. Se conflitar, aborta e devolve o repositório ao estado
    //    anterior — repositório parado no meio de um rebase, dentro de um
    //    vault, é o estado que ninguém sabe desfazer.
    let alvo_remoto = format!("{remoto}/{ramo}");
    if git(&raiz, &["rev-parse", "--verify", &alvo_remoto]).is_ok() {
        if let Err(e) = git(&raiz, &["rebase", &alvo_remoto]) {
            let conflitantes = git(&raiz, &["diff", "--name-only", "--diff-filter=U"])
                .unwrap_or_default();
            s.conflitos = conflitantes
                .lines()
                .map(str::to_string)
                .filter(|l| !l.is_empty())
                .collect();
            let _ = git(&raiz, &["rebase", "--abort"]);
            s.erro = Some(format!(
                "conflito ao juntar com a outra máquina; nada foi alterado. Resolva no git ou no Obsidian. ({e})"
            ));
            return s;
        }
        s.passos.push(format!("atualizado a partir de {alvo_remoto}"));
    } else {
        s.passos.push(format!("{alvo_remoto} ainda não existe no remoto"));
    }

    // 5. Enviar. Nunca com `--force`: reescrever histórico do vault de outra
    //    máquina é perda de trabalho, não sincronização.
    match git(&raiz, &["push", &remoto, &ramo]) {
        Ok(_) => {
            s.enviou = true;
            s.passos.push("enviado".into());
        }
        Err(e) => {
            s.erro = Some(format!(
                "push falhou: {e}. O commit está salvo aqui — só não subiu."
            ));
        }
    }

    s
}

#[cfg(test)]
mod testes {
    use super::{caminho_relativo, git, sincronizar_em};
    use std::path::{Path, PathBuf};

    /// Monta um remoto nu e dois clones — o cenário real de duas máquinas.
    fn cenario(nome: &str) -> (PathBuf, PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!("estudos-git-{nome}"));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();

        let remoto = base.join("remoto.git");
        std::fs::create_dir_all(&remoto).unwrap();
        git(&remoto, &["init", "--bare", "--initial-branch=main"]).unwrap();

        let maquina = |sufixo: &str| {
            let dir = base.join(sufixo);
            std::fs::create_dir_all(&dir).unwrap();
            git(&dir, &["init", "--initial-branch=main"]).unwrap();
            git(&dir, &["config", "user.email", "teste@exemplo"]).unwrap();
            git(&dir, &["config", "user.name", "Teste"]).unwrap();
            git(&dir, &["remote", "add", "origin", remoto.to_str().unwrap()]).unwrap();
            std::fs::create_dir_all(dir.join("Estudos")).unwrap();
            dir
        };

        let a = maquina("a");
        let b = maquina("b");
        (base, a, b)
    }

    fn escrever(dir: &Path, rel: &str, txt: &str) {
        let p = dir.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, txt).unwrap();
    }

    #[test]
    fn commita_envia_e_a_outra_maquina_recebe() {
        let (_base, a, b) = cenario("feliz");

        escrever(&a, "Estudos/diario/dia.md", "primeiro dia");
        let r = sincronizar_em(&a.join("Estudos"), Some("primeiro".into()));
        assert!(r.erro.is_none(), "{:?}", r.erro);
        assert!(r.commitou && r.enviou, "{r:?}");

        // A outra máquina traz o que a primeira mandou.
        escrever(&b, "Estudos/outro.md", "b escreveu");
        let r2 = sincronizar_em(&b.join("Estudos"), Some("de b".into()));
        assert!(r2.erro.is_none(), "{:?}", r2.erro);
        assert!(b.join("Estudos/diario/dia.md").exists(), "não recebeu o arquivo de A");
    }

    /// A regra nº 1 do módulo: só a pasta de exportação entra no commit.
    #[test]
    fn nao_commita_fora_da_pasta_de_exportacao() {
        let (_base, a, _b) = cenario("escopo");

        escrever(&a, "Estudos/nota.md", "minha nota");
        escrever(&a, "Pessoal/rascunho.md", "rascunho que estou escrevendo agora");

        let r = sincronizar_em(&a.join("Estudos"), None);
        assert!(r.erro.is_none(), "{:?}", r.erro);

        let commitados = git(&a, &["show", "--name-only", "--format=", "HEAD"]).unwrap();
        assert!(commitados.contains("Estudos/nota.md"));
        assert!(
            !commitados.contains("Pessoal/rascunho.md"),
            "commitou arquivo fora do escopo: {commitados}"
        );

        // E o rascunho continua lá, intocado e fora do índice. O `status`
        // colapsa diretório não rastreado em `?? Pessoal/`, então a checagem é
        // pelo diretório — e pelo conteúdo, que é o que de fato importa.
        let status = git(&a, &["status", "--porcelain"]).unwrap();
        assert!(status.contains("Pessoal"), "status: {status}");
        assert_eq!(
            std::fs::read_to_string(a.join("Pessoal/rascunho.md")).unwrap(),
            "rascunho que estou escrevendo agora"
        );
    }

    /// A regra nº 3: conflito não pode deixar o repositório no meio de um
    /// rebase. O usuário precisa achar o vault do jeito que deixou.
    #[test]
    fn conflito_aborta_e_nao_deixa_rebase_pela_metade() {
        let (_base, a, b) = cenario("conflito");

        escrever(&a, "Estudos/mesmo.md", "versão de A");
        assert!(sincronizar_em(&a.join("Estudos"), None).erro.is_none());

        // B começa do zero e escreve outra coisa no mesmo arquivo: as duas
        // histórias não têm ancestral comum no arquivo.
        escrever(&b, "Estudos/mesmo.md", "versão de B");
        let r = sincronizar_em(&b.join("Estudos"), None);

        assert!(r.erro.is_some(), "deveria ter reportado conflito");
        assert!(!r.enviou, "não pode ter enviado com conflito");

        // O ponto do teste: nada de rebase pendente.
        let dir_git = b.join(".git");
        assert!(!dir_git.join("rebase-merge").exists(), "ficou em rebase");
        assert!(!dir_git.join("rebase-apply").exists(), "ficou em rebase");

        // E o conteúdo local de B continua o de B.
        let txt = std::fs::read_to_string(b.join("Estudos/mesmo.md")).unwrap();
        assert_eq!(txt, "versão de B");
    }

    #[test]
    fn sem_remoto_para_no_commit_local_sem_erro() {
        let base = std::env::temp_dir().join("estudos-git-sem-remoto");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        git(&base, &["init", "--initial-branch=main"]).unwrap();
        git(&base, &["config", "user.email", "teste@exemplo"]).unwrap();
        git(&base, &["config", "user.name", "Teste"]).unwrap();
        escrever(&base, "Estudos/nota.md", "só local");

        let r = sincronizar_em(&base.join("Estudos"), None);
        assert!(r.commitou);
        assert!(!r.enviou);
        assert!(r.erro.is_none(), "sem remoto não é erro: {:?}", r.erro);
    }

    /// O defeito que o CI do Windows pegou.
    ///
    /// Antes, quando `strip_prefix` falhava — nome curto 8.3, junção, qualquer
    /// diferença entre o caminho que o git devolve e o que o sistema entrega —
    /// a função caía em `unwrap_or_default()`. A string vazia virava
    /// `git add -- .` e o vault inteiro entrava no commit. Falhar tem de ser
    /// erro; "tudo" nunca é um palpite aceitável aqui.
    #[test]
    fn pasta_fora_da_raiz_e_erro_e_nao_a_raiz_inteira() {
        let base = std::env::temp_dir().join("estudos-git-escopo-relativo");
        let _ = std::fs::remove_dir_all(&base);
        let (raiz, fora) = (base.join("repo"), base.join("outro/lugar"));
        std::fs::create_dir_all(&raiz).unwrap();
        std::fs::create_dir_all(&fora).unwrap();

        let r = caminho_relativo(&raiz, &fora);
        assert!(r.is_err(), "devolveu {r:?} em vez de erro");

        // A raiz sendo a própria pasta continua valendo vazio: é o único caso
        // em que `git add -- .` está certo.
        assert_eq!(caminho_relativo(&raiz, &raiz).unwrap(), "");

        let dentro = raiz.join("Estudos/diario");
        std::fs::create_dir_all(&dentro).unwrap();
        assert_eq!(
            caminho_relativo(&raiz, &dentro).unwrap(),
            "Estudos/diario",
            "o separador tem de sair normalizado para o git"
        );
        let _ = std::fs::remove_dir_all(&base);
    }
}
