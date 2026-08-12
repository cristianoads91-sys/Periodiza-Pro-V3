// ═══════════════════════════════════════════════════════════════════════
// RELATÓRIO ANUAL - Gera HTML profissional que abre para impressão em PDF
// ═══════════════════════════════════════════════════════════════════════
// Usa window.print() do próprio navegador. Compatível com iOS, macOS, Windows.
// O usuário escolhe "Salvar como PDF" na janela de impressão.
// ═══════════════════════════════════════════════════════════════════════

const CSS_RELATORIO = `
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: #fff; line-height: 1.5; }
.pagina { padding: 40px 50px; max-width: 210mm; margin: 0 auto; page-break-after: always; }
.pagina:last-child { page-break-after: auto; }

header.capa { text-align: center; padding: 100px 40px 60px; }
.logo { display: inline-block; background: #c6f000; color: #07090d; font-weight: 900; padding: 18px 28px; border-radius: 12px; font-size: 34px; letter-spacing: -1px; margin-bottom: 30px; }
h1 { font-size: 32px; font-weight: 900; margin: 20px 0 10px; letter-spacing: 1px; }
h2 { font-size: 20px; font-weight: 700; margin: 24px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #c6f000; color: #07090d; }
h3 { font-size: 14px; font-weight: 700; margin: 16px 0 8px; color: #444; text-transform: uppercase; letter-spacing: 1px; }
p, li { font-size: 12px; margin-bottom: 6px; color: #333; }
strong { color: #07090d; }
.sub-capa { font-size: 14px; color: #666; margin-top: 6px; }

.info-box { background: #f5f5f5; border-left: 4px solid #c6f000; padding: 14px 18px; margin: 12px 0; border-radius: 4px; }
.info-box strong { color: #07090d; }

table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px; }
th { background: #07090d; color: #c6f000; padding: 8px 10px; text-align: left; font-weight: 700; }
td { padding: 7px 10px; border-bottom: 1px solid #ddd; }
tr:nth-child(even) { background: #fafafa; }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 12px 0; }
.grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin: 12px 0; }

.stat { background: #f5f5f5; padding: 10px 12px; border-radius: 6px; border-left: 3px solid #c6f000; }
.stat-value { font-size: 22px; font-weight: 900; color: #07090d; line-height: 1; }
.stat-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-top: 3px; }

.fase { background: #f9f9f9; border: 1px solid #ddd; padding: 12px 15px; margin: 10px 0; border-radius: 6px; }
.fase-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.fase-nome { font-size: 13px; font-weight: 700; color: #07090d; }
.fase-semanas { font-size: 11px; color: #888; }

.ref-cientifica { background: #fffbe6; border-left: 4px solid #f4b400; padding: 10px 14px; margin: 10px 0; font-size: 11px; border-radius: 4px; }
.ref-cientifica strong { color: #b78800; }

footer.rodape { text-align: center; font-size: 10px; color: #888; margin-top: 40px; padding-top: 15px; border-top: 1px solid #eee; }

@media print {
  .no-print { display: none !important; }
  body { padding: 0; }
  .pagina { padding: 20mm 15mm; }
}

.print-bar { position: fixed; top: 0; left: 0; right: 0; background: #07090d; color: #c6f000; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; z-index: 999; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
.print-bar button { background: #c6f000; color: #07090d; border: none; padding: 8px 18px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 13px; margin-left: 8px; }
.print-bar button.secondary { background: transparent; color: #c6f000; border: 1px solid #c6f000; }
body { padding-top: 55px; }
@media print { .print-bar { display: none; } body { padding-top: 0; } }
`;

function fmtData(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR");
  } catch { return iso; }
}

function calcularEstatisticas(macro) {
  const stats = {
    totalSemanas: macro?.length || 0,
    totalTreinos: 0,
    totalExercicios: 0,
    totalSeries: 0,
    totalTonelagem: 0,
    diasFeitos: 0,
    diasDescanso: 0,
    diasNaoTreinou: 0,
    pseMediaGeral: 0,
    psrMediaGeral: 0,
  };
  let pseSum = 0, pseN = 0, psrSum = 0, psrN = 0;

  (macro || []).forEach(w => {
    Object.values(w.dias || {}).forEach(d => {
      if (d.status === "feito" || d.concluido) stats.diasFeitos++;
      if (d.status === "descanso")             stats.diasDescanso++;
      if (d.status === "nao_treinou")          stats.diasNaoTreinou++;
      if (typeof d.pse === "number" && d.pse > 0) { pseSum += d.pse; pseN++; }
      if (typeof d.psr === "number" && d.psr > 0) { psrSum += d.psr; psrN++; }
      (d.treinos || []).forEach(t => {
        stats.totalTreinos++;
        (t.exercicios || []).forEach(ex => {
          stats.totalExercicios++;
          (ex.sets || []).forEach(s => {
            stats.totalSeries++;
            const r = typeof s.reps === "number" ? s.reps : 0;
            const c = typeof s.carga === "number" ? s.carga : 0;
            stats.totalTonelagem += r * c;
          });
        });
      });
    });
  });

  stats.pseMediaGeral = pseN > 0 ? +(pseSum / pseN).toFixed(1) : 0;
  stats.psrMediaGeral = psrN > 0 ? +(psrSum / psrN).toFixed(1) : 0;
  return stats;
}

// Divide semanas em fases (adaptação, desenvolvimento, específica, pico)
function calcularFases(macro) {
  const n = macro?.length || 0;
  return [
    {label:"Fase de Adaptação",       cor:"#3b9cff", range:[0, Math.floor(n*.15)]},
    {label:"Fase de Desenvolvimento", cor:"#19db7e", range:[Math.floor(n*.15), Math.floor(n*.55)]},
    {label:"Fase Específica",         cor:"#ff8020", range:[Math.floor(n*.55), Math.floor(n*.85)]},
    {label:"Fase de Pico",            cor:"#ff3f3f", range:[Math.floor(n*.85), n]},
  ];
}

export function gerarRelatorioAnual({atleta, macro, macroConfig, exercicios, mesociclos}) {
  const stats = calcularEstatisticas(macro);
  const fases = calcularFases(macro);
  const hoje  = new Date().toLocaleDateString("pt-BR");

  // Modelos e objetivos (rótulos)
  const OBJETIVOS_MAP = {
    base:"Base / Adaptação",
    hipertrofia:"Hipertrofia",
    forca:"Força Máxima",
    potencia:"Potência",
    emagrecimento:"Emagrecimento",
    definicao:"Definição / Cutting",
    performance:"Performance Esportiva",
  };
  const MODELOS_MAP = {
    linear:"Linear (Matveev, 1977)",
    ondulatorio:"Ondulatório (DUP)",
    blocos:"Blocos Concentrados (Verkhoshansky, 1985)",
    conjugado:"Conjugado",
  };
  const objetivoLabel = OBJETIVOS_MAP[macroConfig?.objetivo] || macroConfig?.objetivo || "—";
  const modeloLabel   = MODELOS_MAP[macroConfig?.modelo]     || macroConfig?.modelo   || "—";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório Anual — ${atleta?.nome || "Atleta"}</title>
<style>${CSS_RELATORIO}</style>
</head>
<body>

<!-- Barra superior (não imprime) -->
<div class="print-bar no-print">
  <div style="font-weight:900;letter-spacing:2px;">📊 RELATÓRIO PERIODIZA PRO</div>
  <div>
    <button class="secondary" onclick="window.close()">Fechar</button>
    <button onclick="window.print()">🖨 Imprimir / Salvar PDF</button>
  </div>
</div>

<!-- ═══════════ PÁGINA 1 - CAPA ═══════════ -->
<div class="pagina">
  <header class="capa">
    <div class="logo">PP</div>
    <h1>RELATÓRIO ANUAL</h1>
    <div class="sub-capa" style="font-size:16px;color:#c6f000;background:#07090d;padding:8px 20px;display:inline-block;border-radius:6px;margin-top:12px;font-weight:700;letter-spacing:2px;">PERIODIZA PRO</div>
    <p style="margin-top:60px;font-size:18px;font-weight:700;">${atleta?.nome || "—"}</p>
    <p class="sub-capa" style="margin-top:5px;">${atleta?.objetivo || ""} · ${atleta?.esporte || ""}</p>
    <p class="sub-capa" style="margin-top:40px;font-size:12px;">Emitido em ${hoje}</p>
    <div style="margin-top:80px;padding-top:20px;border-top:2px solid #c6f000;">
      <p style="font-size:11px;color:#888;font-style:italic;">Documento gerado pelo aplicativo Periodiza Pro<br/>Baseado nas obras de Matveev, Verkhoshansky, Bompa, ACSM e Antônio Carlos Gomes</p>
    </div>
  </header>
</div>

<!-- ═══════════ PÁGINA 2 - INFORMAÇÕES DO ATLETA ═══════════ -->
<div class="pagina">
  <h2>1. Informações do Atleta</h2>

  <h3>Dados Antropométricos e Fisiológicos</h3>
  <table>
    <tr><td><strong>Nome</strong></td><td>${atleta?.nome || "—"}</td>
        <td><strong>Nascimento</strong></td><td>${fmtData(atleta?.dataNasc)}</td></tr>
    <tr><td><strong>Peso</strong></td><td>${atleta?.peso ?? "—"} kg</td>
        <td><strong>Altura</strong></td><td>${atleta?.altura ?? "—"} cm</td></tr>
    <tr><td><strong>Nível</strong></td><td>${atleta?.nivel || "—"}</td>
        <td><strong>Esporte</strong></td><td>${atleta?.esporte || "—"}</td></tr>
    <tr><td><strong>FC Máxima</strong></td><td>${atleta?.fcMax ?? "—"} bpm</td>
        <td><strong>FC Repouso</strong></td><td>${atleta?.fcRepouso ?? "—"} bpm</td></tr>
    <tr><td><strong>Objetivo</strong></td><td colspan="3">${atleta?.objetivo || "—"}</td></tr>
  </table>

  ${atleta?.observacoesClinicas ? `
  <h3>Observações Clínicas</h3>
  <div class="info-box">${atleta.observacoesClinicas.replace(/\n/g, "<br/>")}</div>
  ` : ""}

  ${atleta?.metasPessoais ? `
  <h3>Metas Pessoais</h3>
  <div class="info-box">${atleta.metasPessoais.replace(/\n/g, "<br/>")}</div>
  ` : ""}

  ${atleta?.historicoClinico ? `
  <h3>Histórico Clínico</h3>
  <div class="info-box">${atleta.historicoClinico.replace(/\n/g, "<br/>")}</div>
  ` : ""}
</div>

<!-- ═══════════ PÁGINA 3 - PLANEJAMENTO CIENTÍFICO ═══════════ -->
<div class="pagina">
  <h2>2. Planejamento Científico do Macrociclo</h2>

  <h3>Configuração</h3>
  <table>
    <tr><td><strong>Duração</strong></td><td>${stats.totalSemanas} semanas</td></tr>
    <tr><td><strong>Objetivo Principal</strong></td><td>${objetivoLabel}</td></tr>
    <tr><td><strong>Modelo de Periodização</strong></td><td>${modeloLabel}</td></tr>
    <tr><td><strong>Data de Início</strong></td><td>${fmtData(macroConfig?.startDate)}</td></tr>
  </table>

  <h3>Estrutura das Fases</h3>
  <p style="margin-bottom:10px;">O macrociclo foi organizado em 4 fases sequenciais, cada uma com objetivo fisiológico específico:</p>
  ${fases.map(f => `
    <div class="fase">
      <div class="fase-header">
        <div class="fase-nome" style="color:${f.cor};">■ ${f.label}</div>
        <div class="fase-semanas">Semanas ${f.range[0]+1} a ${f.range[1]}</div>
      </div>
    </div>
  `).join("")}

  <h3>Fundamentação Científica</h3>
  <div class="ref-cientifica">
    <strong>Modelo aplicado:</strong> ${modeloLabel}<br/>
    <span style="color:#666;">Este modelo organiza as cargas de treinamento em fases sequenciais, permitindo desenvolvimento fisiológico progressivo, adaptação neuromuscular e supercompensação antes dos picos de rendimento.</span>
  </div>
  <div class="ref-cientifica">
    <strong>Autores de referência:</strong><br/>
    <span style="color:#666;">Yuri Verkhoshansky (1985, 2009) — Sistema de Blocos Concentrados<br/>
    Leonid Matveev (1964, 1977) — Teoria da Periodização Clássica<br/>
    Tudor Bompa (1999) — Periodização Aplicada<br/>
    American College of Sports Medicine (ACSM, 2009) — Diretrizes de Prescrição<br/>
    Antônio Carlos Gomes (2009) — Aplicação Brasileira</span>
  </div>
</div>

<!-- ═══════════ PÁGINA 4 - EXECUÇÃO E ADESÃO ═══════════ -->
<div class="pagina">
  <h2>3. Execução e Adesão ao Programa</h2>

  <h3>Estatísticas Globais</h3>
  <div class="grid-4">
    <div class="stat"><div class="stat-value">${stats.diasFeitos}</div><div class="stat-label">Sessões Realizadas</div></div>
    <div class="stat"><div class="stat-value">${stats.totalTreinos}</div><div class="stat-label">Treinos Programados</div></div>
    <div class="stat"><div class="stat-value">${stats.totalExercicios}</div><div class="stat-label">Exercícios Prescritos</div></div>
    <div class="stat"><div class="stat-value">${stats.totalSeries}</div><div class="stat-label">Séries Totais</div></div>
  </div>

  <div class="grid-2" style="margin-top:14px;">
    <div class="stat"><div class="stat-value">${(stats.totalTonelagem / 1000).toFixed(1)}t</div><div class="stat-label">Tonelagem Total Movimentada</div></div>
    <div class="stat"><div class="stat-value">${stats.diasDescanso + stats.diasNaoTreinou}</div><div class="stat-label">Dias de Descanso / Ausência</div></div>
  </div>

  <h3>Controle de Carga Interna (Foster, 1998)</h3>
  <div class="grid-2">
    <div class="stat"><div class="stat-value" style="color:#ff8020;">${stats.pseMediaGeral || "—"}</div><div class="stat-label">PSE Média Anual</div></div>
    <div class="stat"><div class="stat-value" style="color:#19db7e;">${stats.psrMediaGeral || "—"}</div><div class="stat-label">PSR Média Anual</div></div>
  </div>

  <div class="ref-cientifica" style="margin-top:20px;">
    <strong>Interpretação:</strong><br/>
    <span style="color:#666;">
    ${stats.pseMediaGeral < 5 ? "PSE média baixa sugere programa predominantemente de baixa intensidade — adequado para fases de base ou recuperação." : ""}
    ${stats.pseMediaGeral >= 5 && stats.pseMediaGeral < 7 ? "PSE média moderada indica um bom equilíbrio entre estímulo e recuperação ao longo do macrociclo." : ""}
    ${stats.pseMediaGeral >= 7 ? "PSE média elevada indica programa intenso — monitorar sinais de fadiga acumulada e overtraining." : ""}
    ${stats.psrMediaGeral >= 7 ? " A PSR média elevada confirma boa capacidade de recuperação entre sessões." : ""}
    ${stats.psrMediaGeral < 5 && stats.psrMediaGeral > 0 ? " A PSR média baixa sugere recuperação insuficiente — revisar sono, nutrição e dias de descanso." : ""}
    </span>
  </div>
</div>

<!-- ═══════════ PÁGINA 5 - VOLUME POR FASE ═══════════ -->
<div class="pagina">
  <h2>4. Análise de Volume por Fase</h2>

  ${fases.map(f => {
    const semanasFase = (macro || []).slice(f.range[0], f.range[1]);
    let series = 0, tonelagem = 0, dias = 0;
    semanasFase.forEach(w => {
      Object.values(w.dias || {}).forEach(d => {
        if (d.status === "feito" || d.concluido) dias++;
        (d.treinos || []).forEach(t => {
          (t.exercicios || []).forEach(ex => {
            (ex.sets || []).forEach(s => {
              series++;
              const r = typeof s.reps === "number" ? s.reps : 0;
              const c = typeof s.carga === "number" ? s.carga : 0;
              tonelagem += r * c;
            });
          });
        });
      });
    });
    return `
    <div class="fase">
      <div class="fase-header">
        <div class="fase-nome" style="color:${f.cor};">■ ${f.label}</div>
        <div class="fase-semanas">Semanas ${f.range[0]+1} a ${f.range[1]}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:8px;">
        <div><strong>${dias}</strong> sessões</div>
        <div><strong>${series}</strong> séries</div>
        <div><strong>${(tonelagem/1000).toFixed(1)} t</strong> movimentadas</div>
      </div>
    </div>
    `;
  }).join("")}
</div>

<!-- ═══════════ PÁGINA 6 - CONCLUSÃO E RECOMENDAÇÕES ═══════════ -->
<div class="pagina">
  <h2>5. Conclusão e Recomendações</h2>

  <h3>Resumo Executivo</h3>
  <p>Ao longo de <strong>${stats.totalSemanas} semanas</strong>, o atleta ${atleta?.nome || ""} seguiu um programa de periodização científica pelo modelo <strong>${modeloLabel}</strong>, com foco em <strong>${objetivoLabel}</strong>. Foram programados <strong>${stats.totalTreinos} treinos</strong> distribuídos em fases progressivas de adaptação, desenvolvimento, especialização e pico de rendimento.</p>

  <p style="margin-top:10px;">Do total programado, o atleta realizou <strong>${stats.diasFeitos} sessões efetivas</strong>, com um volume acumulado de <strong>${stats.totalSeries} séries</strong> e uma tonelagem total de <strong>${(stats.totalTonelagem / 1000).toFixed(1)} toneladas</strong> movimentadas.</p>

  <h3>Métricas Psicofisiológicas</h3>
  <p>O controle de carga interna, aferido pela Escala de Borg CR-10 (Foster, 1998), registrou uma PSE média de <strong>${stats.pseMediaGeral || "—"}</strong> e uma PSR média de <strong>${stats.psrMediaGeral || "—"}</strong> (Kenttä & Hassmén, 1998), indicadores fundamentais para o monitoramento de fadiga e recuperação.</p>

  <h3>Recomendações Científicas para o Próximo Ciclo</h3>
  <ul style="margin-left:20px;">
    <li style="margin:6px 0;">Manter o princípio da <strong>sobrecarga progressiva</strong> (Matveev, 1977) através do incremento gradual de volume e/ou intensidade.</li>
    <li style="margin:6px 0;">Aplicar <strong>variação de estímulos</strong> (Verkhoshansky, 1985) para evitar acomodação neuromuscular.</li>
    <li style="margin:6px 0;">Respeitar <strong>1 semana de deload a cada 3-5 semanas</strong> de trabalho intenso, permitindo supercompensação (Bompa, 1999).</li>
    <li style="margin:6px 0;">Monitorar o <strong>índice de monotonia semanal &lt; 2</strong> (Foster, 1998) para reduzir risco de overtraining.</li>
    <li style="margin:6px 0;">Manter <strong>PSR ≥ 7 antes de sessões intensas</strong> (Kenttä & Hassmén, 1998).</li>
    <li style="margin:6px 0;">Seguir as diretrizes da <strong>ACSM (2009)</strong> para volumes de treinamento adequados ao objetivo.</li>
  </ul>

  <footer class="rodape">
    <div style="margin-bottom:6px;font-weight:700;color:#07090d;">Periodiza Pro — Periodização Científica de Treinamento</div>
    <div>Emitido em ${hoje} · Este documento é gerado automaticamente com base nos dados registrados pelo profissional responsável.</div>
    <div style="margin-top:10px;font-style:italic;">Documento de acompanhamento profissional. Não substitui orientação médica ou avaliação clínica presencial.</div>
  </footer>
</div>

</body>
</html>`;

  // Abre em nova aba
  const w = window.open("", "_blank");
  if (!w) {
    alert("Popup bloqueado. Habilite popups no navegador para gerar o relatório.");
    return;
  }
  w.document.write(html);
  w.document.close();
}
