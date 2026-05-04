import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine
} from "recharts";
import { supabase, syncToCloud, loadFromCloud } from "./supabase.js";

// ─── PALETTE ─────────────────────────────────────────────────────────
const C = {
  bg:"#07090d", surface:"#0c1018", card:"#121820", border:"#1a2438",
  accent:"#c6f000", red:"#ff3f3f", green:"#19db7e", blue:"#3b9cff",
  orange:"#ff8020", purple:"#a855f7", teal:"#00c8c0", pink:"#f03080",
  yellow:"#fbbf24", text:"#d4dcef", muted:"#52606e", subtle:"#1c2840",
};

// ─── PURE HELPERS (no closures over C) ───────────────────────────────
const uid       = () => `${Date.now()}${Math.floor(Math.random()*99999)}`;
const safeAvg   = arr => { const v=arr.filter(x=>typeof x==="number"&&!isNaN(x)); return v.length?v.reduce((a,b)=>a+b,0)/v.length:0; };
const calc1RM   = (p,r) => p&&r&&r>0 ? +(p/(1.0278-0.0278*r)).toFixed(1) : null;
const addDays   = (s,n) => { if(!s) return ""; const d=new Date(s); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const fmtDate   = s => { if(!s) return ""; try { const [y,m,d]=s.split("-"); return `${d}/${m}/${y}`; } catch { return s; } };
const weekStart = (start,i) => addDays(start, i*7);

const DIAS_SEMANA = ["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"];
const DIAS_SHORT  = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
const FCZ = ["Z1 – < 50% FCmax","Z2 – 50-60% FCmax","Z3 – 60-70% FCmax","Z4 – 70-80% FCmax","Z5 – 80-90% FCmax","Z6 – 90-100% FCmax"];

// ─── SAÚDE MENTAL E BEM-ESTAR ─────────────────────────────────────────
// Hooper Index (Hooper & Mackinnon, 1995) – escala 1-7 para 4 dimensões
// Pontuação total: <15 ótimo | 15-20 adequado | 21-24 monitorar | >24 alto risco
const HOOPER_DIMS = [
  {k:"humor",       l:"Humor",       icon:"😊", cor:"#c6f000", desc:"Como está seu estado de humor geral?", baixo:"Excelente", alto:"Muito ruim"},
  {k:"sono",        l:"Sono",        icon:"😴", cor:"#3b9cff", desc:"Qualidade do sono na última noite", baixo:"Ótima", alto:"Muito ruim"},
  {k:"estresse",    l:"Estresse",    icon:"😰", cor:"#ff8020", desc:"Nível de estresse percebido", baixo:"Muito baixo", alto:"Muito alto"},
  {k:"fadiga",      l:"Fadiga",      icon:"🔋", cor:"#a855f7", desc:"Nível de fadiga geral", baixo:"Nenhuma", alto:"Extrema"},
];

const HOOPER_CLASSIF = (total) => {
  if (total == null) return {l:"—", c:"#52606e"};
  if (total < 15)  return {l:"ÓTIMO",      c:"#19db7e"};
  if (total <= 20) return {l:"ADEQUADO",   c:"#c6f000"};
  if (total <= 24) return {l:"MONITORAR",  c:"#ff8020"};
  return                  {l:"ALTO RISCO", c:"#ff3f3f"};
};

// ─── PERSISTÊNCIA – localStorage + Export/Import ─────────────────────
const STORAGE_KEY = "periodizapro_v1_data";
const STORAGE_KEY_LEGACY = "fitplan_v6_data"; // Old key – migrated once on first load
const STORAGE_VERSION = 1;

function loadFromStorage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    // Try new key first
    let raw = window.localStorage.getItem(STORAGE_KEY);
    // Fall back to legacy key and migrate
    if (!raw) {
      const legacy = window.localStorage.getItem(STORAGE_KEY_LEGACY);
      if (legacy) {
        window.localStorage.setItem(STORAGE_KEY, legacy);
        try { window.localStorage.removeItem(STORAGE_KEY_LEGACY); } catch (e) { /* noop */ }
        raw = legacy;
      }
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (e) {
    console.warn("Erro ao ler dados salvos:", e);
    return null;
  }
}

function saveToStorage(data) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn("Erro ao salvar:", e);
    return false;
  }
}

function exportBackup(data) {
  const backup = {
    app: "PERIODIZA PRO",
    version: STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type:"application/json"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const ts   = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
  a.href     = url;
  a.download = `periodizapro-backup-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importBackup(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || !parsed.data) throw new Error("Arquivo inválido");
        resolve(parsed.data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
    reader.readAsText(file);
  });
}

// ─── CONSTANTS ────────────────────────────────────────────────────────
const MACRO_DURACOES = [
  {id:"anual",      label:"Anual",          icon:"📅", semanas:52, desc:"Macrociclo clássico de 12 meses (Bompa, 1999). Ideal para atletas com calendário competitivo definido."},
  {id:"semestral",  label:"Semestral",      icon:"📆", semanas:26, desc:"6 meses. Comum em esportes com duas temporadas anuais ou alunos com metas semestrais."},
  {id:"quadrimestral",label:"Quadrimestral",icon:"🗓", semanas:17, desc:"4 meses. Estrutura ágil para objetivos específicos de curto-médio prazo."},
  {id:"trimestral", label:"Trimestral",     icon:"📋", semanas:13, desc:"3 meses. Alta concentração de carga. Útil para peaking rápido ou iniciantes."},
];

const MACRO_OBJETIVOS = [
  {id:"base",        label:"Base / Adaptação",     icon:"🏗", cor:"#3b9cff", intensidade:[40,60], reps:"12-20", desc:"Desenvolvimento da capacidade aeróbia, coordenação e resistência muscular geral (Matveev, 1977; Bompa, 1999)."},
  {id:"hipertrofia", label:"Hipertrofia",           icon:"💪", cor:"#19db7e", intensidade:[65,80], reps:"6-12",  desc:"Maximizar área de secção transversa muscular. Volume-intensidade balanceados (ACSM, 2009)."},
  {id:"forca",       label:"Força Máxima",          icon:"🏋", cor:"#ff8020", intensidade:[80,95], reps:"1-5",   desc:"Recrutamento máximo de unidades motoras. Alta intensidade, volume baixo (Verkhoshansky, 1985; Zatsiorsky, 1995)."},
  {id:"potencia",    label:"Potência",              icon:"⚡", cor:"#c6f000", intensidade:[30,70], reps:"3-6",   desc:"Maximizar taxa de produção de força (RFD). Exercícios explosivos (Verkhoshansky & Siff, 2009)."},
  {id:"emagrecimento",label:"Emagrecimento",        icon:"🔥", cor:"#f03080", intensidade:[55,75], reps:"10-15", desc:"Perda de % de gordura com preservação de massa magra. Circuitos, alta densidade, pausas curtas e déficit calórico (ACSM, 2009; Donnelly et al., 2009)."},
  {id:"definicao",   label:"Definição / Cutting",   icon:"✂", cor:"#00c8c0", intensidade:[60,75], reps:"10-15", desc:"Manutenção de massa magra em déficit calórico. Volume moderado-alto, densidades elevadas."},
  {id:"performance", label:"Performance Esportiva", icon:"🏆", cor:"#ff3f3f", intensidade:[70,90], reps:"4-8",   desc:"Transferência para gestos esportivos específicos. Periodização por blocos (Gomes, 2009; Bompa, 1999)."},
];

const MACRO_MODELOS = [
  {id:"linear",     label:"Linear",     icon:"📈", cor:"#3b9cff", desc:"Progressão contínua volume→intensidade. Modelo clássico de Matveev (1977), amplamente discutido por Bompa (1999) e A. C. Gomes (2009).", estrutura:"Volume decresce e intensidade aumenta semana a semana de forma previsível.", indicado:"Iniciantes e intermediários, modalidades com 1 pico competitivo anual."},
  {id:"ondulatorio",label:"Ondulatório",icon:"〰", cor:"#19db7e", desc:"Variação diária/semanal de volume e intensidade (DUP). Evolução teórica a partir de Matveev, com contribuições de Verkhoshansky sobre a não-linearidade das adaptações.", estrutura:"Estímulos diferentes em cada sessão: força, hipertrofia e resistência na mesma semana.", indicado:"Intermediários e avançados, praticantes com restrição de tempo."},
  {id:"blocos",     label:"Blocos",     icon:"🧱", cor:"#ff8020", desc:"Concentração específica de cargas por blocos. Proposto por Verkhoshansky (1985) como Bloco de Cargas Concentradas. Revisado por Issurin e disseminado por Bompa e A. C. Gomes.", estrutura:"Acumulação (volume) → Transmutação (força específica) → Realização (pico/potência).", indicado:"Atletas avançados, esportes de alto rendimento, múltiplos picos competitivos."},
  {id:"conjugado",  label:"Conjugado",  icon:"🔄", cor:"#a855f7", desc:"Desenvolvimento simultâneo de múltiplas capacidades. Origem no Sistema do Esforço Concentrado de Verkhoshansky, também embasado nos trabalhos de Zatsiorsky (1995) e A. C. Gomes (2009).", estrutura:"Dias de Esforço Máximo (força 90-100%) e Esforço Dinâmico (potência 55-65%).", indicado:"Powerlifters, atletas de força-potência avançados."},
];

const MESO_TIPOS = [
  {id:"adaptacao",  label:"Adaptação Neuromuscular",cor:"#3b9cff",icon:"🧠",semanas:"3-4",volume:"Médio",     intensidade:"40-60%",reps:"12-20",desc:"Prepara o SNC para cargas futuras. Foco em padrões motores e tecido conjuntivo.",ref:"Matveev (1977); Bompa (1999)"},
  {id:"hipertrofia",label:"Hipertrofia",            cor:"#19db7e",icon:"💪",semanas:"4-6",volume:"Alto",      intensidade:"65-80%",reps:"6-12", desc:"Maximiza síntese proteica e área de secção transversa. 10-20 séries/semana por grupo muscular.",ref:"ACSM (2009); A. C. Gomes (2009)"},
  {id:"forca",      label:"Força",                  cor:"#ff8020",icon:"🏋",semanas:"3-5",volume:"Médio-baixo",intensidade:"80-90%",reps:"2-6",  desc:"Recrutamento máximo de fibras tipo II. Exercícios multi-articulares.",ref:"Verkhoshansky (1985); Zatsiorsky (1995)"},
  {id:"potencia",   label:"Potência",               cor:"#c6f000",icon:"⚡",semanas:"3-4",volume:"Baixo",     intensidade:"30-70%",reps:"3-6",  desc:"Maximiza a RFD. Movimentos balísticos, pliométricos e olímpicos.",ref:"Verkhoshansky & Siff (2009)"},
  {id:"resistencia",label:"Resistência Muscular",   cor:"#00c8c0",icon:"🔄",semanas:"3-4",volume:"Alto",      intensidade:"50-70%",reps:"15-25",desc:"Melhora capacidade tampão e eficiência metabólica. Pausas curtas, densidade alta.",ref:"Bompa (1999); ACSM (2009)"},
  {id:"deload",     label:"Deload / Recuperação",   cor:"#52606e",icon:"😴",semanas:"1-2",volume:"Baixo 40-60%",intensidade:"50-60%",reps:"10-15",desc:"Redução programada. Permite supercompensação e previne overtraining.",ref:"Matveev (1977); A. C. Gomes (2009)"},
];

const MICRO_TIPOS = [
  {id:"ordinario",   label:"Ordinário",   icon:"📋", cor:"#19db7e", desc:"Carga habitual do período. PSE alvo 5-7.", aplicacao:"Base semanal. Incrementos graduais de 2-5% por semana."},
  {id:"choque",      label:"Choque",      icon:"💥", cor:"#ff3f3f", desc:"Sobrecarga máxima deliberada. PSE alvo 8-9.", aplicacao:"Máx. 1 consecutivo. Sempre seguido de recuperativo (overreaching funcional)."},
  {id:"recuperativo",label:"Recuperativo",icon:"🌙", cor:"#3b9cff", desc:"Volume -40-60%. Intensidade mantida. PSE alvo 3-4.", aplicacao:"Crítico após choque. Permite supercompensação. Não pular (Kellmann, 2001)."},
  {id:"competitivo", label:"Competitivo", icon:"🏆", cor:"#c6f000", desc:"Volume mínimo, qualidade máxima. PSE alvo 7-8.", aplicacao:"Tapering 8-14 dias. Manter intensidade, -40-60% volume (Mujika & Padilla, 2003)."},
  {id:"controle",    label:"Controle",    icon:"📊", cor:"#a855f7", desc:"Semana de testes (1RM, VO2, composição). Volume baixo.", aplicacao:"Início e fim de cada mesociclo para ajuste de cargas e análise de progresso."},
];

const GRUPOS_M = ["Peito","Costas","Ombro","Bíceps","Tríceps","Quadríceps","Posterior","Glúteo","Panturrilha","Core","Potência","Força Especial","Resistência","Pliometria","Mobilidade","Alongamento","Equilíbrio","Cardio"];
const GRUPOS_E = ["Corrida","Ciclismo","Natação","Futebol","Basquete","Vôlei","Surf","Tênis","Artes Marciais","Crossfit","Triathlon","Musculação Funcional"];
const TODOS_G  = [...GRUPOS_M, ...GRUPOS_E];

const GCOR = {
  Peito:"#3b9cff",Costas:"#19db7e",Ombro:"#c6f000",Bíceps:"#ff8020",Tríceps:"#a855f7",
  Quadríceps:"#ff3f3f",Posterior:"#00c8c0",Glúteo:"#f03080",Panturrilha:"#6ee7b7",
  Core:"#fbbf24",Potência:"#f43f5e","Força Especial":"#ef4444",Resistência:"#10b981",
  Pliometria:"#f97316",Mobilidade:"#06b6d4",Alongamento:"#84cc16",Equilíbrio:"#a78bfa",
  Cardio:"#fb923c",Corrida:"#f59e0b",Ciclismo:"#3b82f6",Natação:"#06b6d4",
  Futebol:"#22c55e",Basquete:"#f97316",Vôlei:"#8b5cf6",Surf:"#0ea5e9",
  Tênis:"#eab308","Artes Marciais":"#dc2626",Crossfit:"#d97706",Triathlon:"#0891b2","Musculação Funcional":"#7c3aed",
};

const PSE_L = {1:"Muito Leve",2:"Leve",3:"Mod. Leve",4:"Moderado",5:"Esf. Moderado",6:"Difícil",7:"Pesado",8:"Muito Pesado",9:"Máximo",10:"Abs. Máximo"};
const PSR_L = {1:"Muito Pouco",2:"Pouco Rec.",3:"Parcialmente",4:"Mod. Rec.",5:"Razoável",6:"Bem Rec.",7:"Muito Bem",8:"Recuperado",9:"Tot. Rec.",10:"Supercomp."};

const DEFAULT_EX = [
  {id:1,nome:"Supino Reto",grupo:"Peito",sp:3,reps:"10",pausa:60,cad:"2:1"},
  {id:2,nome:"Fly Halteres",grupo:"Peito",sp:3,reps:"10",pausa:60,cad:"2:1"},
  {id:3,nome:"Peck Deck",grupo:"Peito",sp:3,reps:"12",pausa:60,cad:"2:1"},
  {id:4,nome:"Supino Inclinado",grupo:"Peito",sp:3,reps:"10",pausa:60,cad:"2:1"},
  {id:5,nome:"Desenvolvimento",grupo:"Ombro",sp:3,reps:"10",pausa:60,cad:"2:1"},
  {id:6,nome:"Elevação Lateral",grupo:"Ombro",sp:3,reps:"12",pausa:60,cad:"2:1"},
  {id:7,nome:"Crucifixo Inv.",grupo:"Ombro",sp:3,reps:"12",pausa:60,cad:"2:1"},
  {id:8,nome:"Pulley Tríceps",grupo:"Tríceps",sp:3,reps:"12",pausa:60,cad:"2:1"},
  {id:9,nome:"Tríceps Testa",grupo:"Tríceps",sp:3,reps:"12",pausa:60,cad:"2:1"},
  {id:10,nome:"Rosca Direta",grupo:"Bíceps",sp:3,reps:"12",pausa:60,cad:"2:1"},
  {id:11,nome:"Rosca Scott",grupo:"Bíceps",sp:3,reps:"12",pausa:60,cad:"2:1"},
  {id:12,nome:"Remada Curvada",grupo:"Costas",sp:4,reps:"10",pausa:90,cad:"2:1"},
  {id:13,nome:"Puxada na Frente",grupo:"Costas",sp:3,reps:"10",pausa:60,cad:"2:1"},
  {id:14,nome:"Serrote",grupo:"Costas",sp:3,reps:"12",pausa:60,cad:"2:1"},
  {id:15,nome:"Agachamento Livre",grupo:"Quadríceps",sp:4,reps:"8",pausa:90,cad:"3:1"},
  {id:16,nome:"Leg Press 45",grupo:"Quadríceps",sp:3,reps:"12",pausa:60,cad:"2:1"},
  {id:17,nome:"Extensora",grupo:"Quadríceps",sp:3,reps:"15",pausa:60,cad:"2:1"},
  {id:18,nome:"Stiff",grupo:"Posterior",sp:3,reps:"12",pausa:60,cad:"2:1"},
  {id:19,nome:"Mesa Flexora",grupo:"Posterior",sp:3,reps:"12",pausa:60,cad:"2:1"},
  {id:20,nome:"Levantamento Terra",grupo:"Posterior",sp:4,reps:"5",pausa:120,cad:"3:2"},
  {id:21,nome:"Glúteo 4 Apoios",grupo:"Glúteo",sp:3,reps:"15",pausa:45,cad:"2:1"},
  {id:22,nome:"Panturrilha Pe",grupo:"Panturrilha",sp:4,reps:"15",pausa:45,cad:"2:2"},
  {id:23,nome:"Prancha Isométrica",grupo:"Core",sp:3,reps:"60s",pausa:60,cad:"Isom."},
  {id:24,nome:"Abdominal Crunch",grupo:"Core",sp:3,reps:"20",pausa:45,cad:"2:1"},
  {id:25,nome:"Clean and Jerk",grupo:"Potência",sp:4,reps:"3",pausa:180,cad:"Explos."},
  {id:26,nome:"Box Jump",grupo:"Pliometria",sp:4,reps:"5",pausa:90,cad:"Explos."},
  {id:27,nome:"Sprint 30m",grupo:"Força Especial",sp:6,reps:"1",pausa:180,cad:"Max"},
  {id:28,nome:"Corrida Z1 Continua",grupo:"Corrida",sp:1,reps:"30min",pausa:0,cad:"Z1"},
  {id:29,nome:"Corrida Z2 Limiar",grupo:"Corrida",sp:1,reps:"45min",pausa:0,cad:"Z2"},
  {id:30,nome:"Intervalado 400m",grupo:"Corrida",sp:6,reps:"400m",pausa:120,cad:"95%"},
  {id:31,nome:"Fartlek 30/30",grupo:"Corrida",sp:10,reps:"30s",pausa:30,cad:"90%"},
  {id:32,nome:"Long Run",grupo:"Corrida",sp:1,reps:"90min",pausa:0,cad:"Convers."},
  {id:33,nome:"Pedalada Z2",grupo:"Ciclismo",sp:1,reps:"60min",pausa:0,cad:"65rpm"},
  {id:34,nome:"Tabata Bike",grupo:"Ciclismo",sp:8,reps:"20s",pausa:10,cad:"Max"},
  {id:35,nome:"Subida de Morro",grupo:"Ciclismo",sp:4,reps:"5min",pausa:180,cad:"80%"},
  {id:36,nome:"Nado Tecnico Drills",grupo:"Natação",sp:4,reps:"50m",pausa:30,cad:"Tec."},
  {id:37,nome:"Series 100m Natacao",grupo:"Natação",sp:6,reps:"100m",pausa:20,cad:"85%"},
  {id:38,nome:"Rondo 4x1",grupo:"Futebol",sp:4,reps:"5min",pausa:60,cad:"Tat."},
  {id:39,nome:"Agilidade Cones",grupo:"Futebol",sp:5,reps:"30s",pausa:30,cad:"Max"},
  {id:40,nome:"Jogo Reduzido 3v3",grupo:"Futebol",sp:4,reps:"4min",pausa:120,cad:"Alta"},
  {id:41,nome:"Remada Prono Surf",grupo:"Surf",sp:4,reps:"100m",pausa:60,cad:"Tec."},
  {id:42,nome:"Take-off Explosivo",grupo:"Surf",sp:5,reps:"10",pausa:45,cad:"Explos."},
  {id:43,nome:"Hip Flexor Stretch",grupo:"Mobilidade",sp:3,reps:"60s",pausa:30,cad:"Passivo"},
  {id:44,nome:"Quadril 90/90",grupo:"Mobilidade",sp:3,reps:"5 giros",pausa:30,cad:"Ativo"},
  {id:45,nome:"Alongamento Cadeia Post.",grupo:"Alongamento",sp:3,reps:"60s",pausa:30,cad:"Estat."},
  {id:46,nome:"Bosu Squat",grupo:"Equilíbrio",sp:3,reps:"12",pausa:45,cad:"2:1"},
  {id:47,nome:"Single Leg Deadlift",grupo:"Equilíbrio",sp:3,reps:"10",pausa:60,cad:"3:1"},
  {id:48,nome:"Battle Rope",grupo:"Resistência",sp:4,reps:"30s",pausa:60,cad:"Max"},
];

const DEFAULT_ATLETA = {
  id:"default1", nome:"Cristiano Augusto da Silva", dataNasc:"1990-03-15",
  peso:80, altura:175, fcMax:190, fcRepouso:60,
  objetivo:"Hipertrofia", nivel:"Intermediário", esporte:"Musculação Funcional",
  // Mental health & wellbeing
  humor:null, sono:null, estresse:null, fadiga:null,
  motivacao:null, ansiedadeTreino:null,
  horasSono:null,
  notasMentais:"", historicoClinico:"",
  // Sleep tracking (Oura-style data)
  registrosSono:[], // array of { id, data, sleepScore, readinessScore, totalSono, tempoCama, latencia, eficiencia, deep, rem, light, acordado, fcRepouso, hrv, tempCorporal, freqResp, observacoes }
};

// Sleep score classification (Oura-inspired)
const SLEEP_SCORE_CLASS = (score) => {
  if (score == null) return {label:"—", cor:"#52606e"};
  if (score >= 85) return {label:"ÓTIMO",      cor:"#19db7e"};
  if (score >= 70) return {label:"BOM",         cor:"#c6f000"};
  if (score >= 60) return {label:"REGULAR",     cor:"#ff8020"};
  return                  {label:"BAIXO",       cor:"#ff3f3f"};
};

const READINESS_CLASS = (score) => {
  if (score == null) return {label:"—",   cor:"#52606e"};
  if (score >= 85) return {label:"PRONTO",      cor:"#19db7e"};
  if (score >= 70) return {label:"OK",          cor:"#c6f000"};
  if (score >= 60) return {label:"ATENÇÃO",     cor:"#ff8020"};
  return                  {label:"DESCANSO",    cor:"#ff3f3f"};
};

// ─── BUILD MACRO WEEKS ───────────────────────────────────────────────
const TIPO_SEQS = {
  linear:    ["ordinario","ordinario","choque","recuperativo"],
  ondulatorio:["ordinario","choque","ordinario","recuperativo","controle","ordinario","choque","recuperativo"],
  blocos:    ["ordinario","ordinario","choque","recuperativo","choque","choque","recuperativo","controle"],
  conjugado: ["ordinario","controle","choque","recuperativo"],
};

function buildMacroWeeks(start, numWeeks, modelo, objetivo) {
  const seq    = TIPO_SEQS[modelo] || TIPO_SEQS.linear;
  const isLin  = modelo === "linear";
  return Array.from({length: numWeeks}, (_, i) => {
    const tipo    = seq[i % seq.length];
    const intBase = isLin ? Math.min(45 + Math.floor(i * 1.2), 90) : [50,65,80,45,70,85,55,40][i%8];
    const volBase = isLin ? Math.max(25 - Math.floor(i * 0.3), 10) : [15,20,25,10,22,27,18,12][i%8];
    return {
      id: i + 1,
      startDate: weekStart(start, i),
      tipo,
      series: volBase,
      intensidade: intBase,
      reps: intBase >= 80 ? "3-5" : intBase >= 65 ? "6-10" : "12-15",
      fase: ["adaptacao","hipertrofia","forca","potencia"][Math.min(Math.floor(i / Math.max(1, Math.floor(numWeeks / 4))), 3)],
      pse: null, psr: null, obs: "", objetivo: "", mesociclo: "", divisao: "",
      dias: {},
    };
  });
}

function makeDefaultData(today) {
  return {
    macroConfig: {duracao:"anual", objetivo:"hipertrofia", modelo:"linear", startDate: today},
    macro: buildMacroWeeks(today, 52, "linear", "hipertrofia"),
    mesociclos: [],
    presenca: {},
    exercicios: DEFAULT_EX.map(e => ({...e})),
  };
}

// ─── UI ATOMS ─────────────────────────────────────────────────────────
function Badge({cor, children, sm}) {
  return (
    <span style={{background:cor+"22",color:cor,border:`1px solid ${cor}44`,borderRadius:4,
      padding:sm?"1px 6px":"3px 10px",fontSize:sm?9:11,fontWeight:700,letterSpacing:.5,
      whiteSpace:"nowrap",display:"inline-block"}}>
      {children}
    </span>
  );
}

function Fld({label, value, onChange, type="text", opts, rows, placeholder, style={}}) {
  const inputStyle = {width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,padding:"7px 9px",fontSize:12,boxSizing:"border-box"};
  return (
    <div style={style}>
      {label && <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:3}}>{label.toUpperCase()}</div>}
      {type === "select" ? (
        <select value={value ?? ""} onChange={e => onChange(e.target.value)} style={inputStyle}>
          {(opts || []).map(o => {
            const v = typeof o === "object" ? o.id : o;
            const l = typeof o === "object" ? o.label : o;
            return <option key={v} value={v}>{l}</option>;
          })}
        </select>
      ) : type === "textarea" ? (
        <textarea value={value ?? ""} onChange={e => onChange(e.target.value)}
          rows={rows || 3} placeholder={placeholder || ""}
          style={{...inputStyle, resize:"vertical"}} />
      ) : (
        <input type={type} value={value ?? ""} placeholder={placeholder || ""}
          onChange={e => onChange(type === "number" ? (e.target.value === "" ? "" : +e.target.value) : e.target.value)}
          style={inputStyle} />
      )}
    </div>
  );
}

function Btn({onClick, children, variant="ghost", color, disabled, style={}}) {
  const col = color || C.accent;
  const base = {border:"none",borderRadius:8,cursor:disabled?"not-allowed":"pointer",fontWeight:700,fontSize:12,padding:"8px 16px",opacity:disabled?0.5:1,transition:"all .13s",...style};
  if (variant === "filled")  return <button onClick={onClick} disabled={disabled} style={{...base,background:col,color:C.bg}}>{children}</button>;
  if (variant === "outline") return <button onClick={onClick} disabled={disabled} style={{...base,background:"none",border:`1px solid ${col}`,color:col}}>{children}</button>;
  return <button onClick={onClick} disabled={disabled} style={{...base,background:"none",color:C.muted,border:`1px solid ${C.border}`}}>{children}</button>;
}

function CardBox({children, accent, style={}}) {
  return <div style={{background:C.card,border:`1px solid ${accent ? accent+"44" : C.border}`,borderRadius:12,...style}}>{children}</div>;
}

function SectionHead({icon, title, sub, color}) {
  return (
    <div style={{padding:"11px 14px",borderBottom:`1px solid ${C.border}`}}>
      <div style={{display:"flex",alignItems:"center",gap:7}}>
        {icon && <span style={{fontSize:15}}>{icon}</span>}
        <div style={{fontSize:13,fontWeight:900,color:color||C.muted,letterSpacing:.5}}>{title}</div>
      </div>
      {sub && <div style={{fontSize:10,color:C.muted,marginTop:2}}>{sub}</div>}
    </div>
  );
}

function TabBar({tabs, active, onSelect}) {
  return (
    <div style={{display:"flex",background:C.card,borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onSelect(t.id)} style={{
          flex:1,border:"none",background:active===t.id?C.accent+"22":"none",
          borderBottom:`2px solid ${active===t.id?C.accent:"transparent"}`,
          color:active===t.id?C.accent:C.muted,padding:"9px 4px",fontSize:11,fontWeight:700,cursor:"pointer"
        }}>{t.l}</button>
      ))}
    </div>
  );
}

// ─── ESCALA DE BORG – GUIA COMPLETO ───────────────────────────────────
// Escala original Borg (1962) 6-20 + CR-10 adaptada por Foster (1998)
const BORG_CR10 = [
  {n:0,  label:"Repouso absoluto",        desc:"Nenhum esforço. Deitado ou parado.",                         cor:"#52606e"},
  {n:1,  label:"Muito leve",               desc:"Mal percebido. Respiração quase normal.",                    cor:"#19db7e"},
  {n:2,  label:"Leve",                     desc:"Consegue conversar confortavelmente.",                       cor:"#19db7e"},
  {n:3,  label:"Moderado leve",            desc:"Respiração perceptível mas controlada.",                     cor:"#19db7e"},
  {n:4,  label:"Moderado",                 desc:"Começa a sentir esforço. Fala mantida mas com pausas leves.",cor:"#ff8020"},
  {n:5,  label:"Esforço moderado",         desc:"Já sente o corpo trabalhando. Fala curta e espaçada.",       cor:"#ff8020"},
  {n:6,  label:"Difícil",                  desc:"Respiração ofegante. Fala em frases curtas.",                cor:"#ff8020"},
  {n:7,  label:"Pesado",                   desc:"Muito desconfortável. Apenas palavras soltas.",              cor:"#ff3f3f"},
  {n:8,  label:"Muito pesado",             desc:"Próximo do limite. Muito difícil falar.",                    cor:"#ff3f3f"},
  {n:9,  label:"Máximo",                   desc:"Quase não consegue continuar. Sem condição de falar.",       cor:"#ff3f3f"},
  {n:10, label:"Absoluto / Extenuante",    desc:"Esforço máximo possível. Exaustão total.",                   cor:"#ff3f3f"},
];

const PSR_LEVELS = [
  {n:1,  label:"Muito mal recuperado",     desc:"Cansaço extremo. Dores musculares intensas. Não deveria treinar forte.", cor:"#ff3f3f"},
  {n:2,  label:"Mal recuperado",            desc:"Fadiga acentuada. Rendimento limitado previsível.",                       cor:"#ff3f3f"},
  {n:3,  label:"Parcialmente recuperado",   desc:"Ainda com cansaço. Apto para treino leve a moderado.",                    cor:"#ff8020"},
  {n:4,  label:"Moderadamente recuperado",  desc:"Melhorando mas não 100%. Treino de manutenção.",                          cor:"#ff8020"},
  {n:5,  label:"Razoavelmente recuperado",  desc:"Sente-se razoável. Apto para treino padrão.",                             cor:"#ff8020"},
  {n:6,  label:"Bem recuperado",            desc:"Disposição normal. Apto para treino regular.",                            cor:"#19db7e"},
  {n:7,  label:"Muito bem recuperado",      desc:"Energia plena. Apto para treino intenso.",                                cor:"#19db7e"},
  {n:8,  label:"Totalmente recuperado",     desc:"Sente-se descansado e pronto para máximo desempenho.",                    cor:"#19db7e"},
  {n:9,  label:"Excelente recuperação",     desc:"Muito bem disposto. Ideal para picos de performance.",                    cor:"#c6f000"},
  {n:10, label:"Supercompensação",          desc:"Sensação de estar acima do normal. Janela ideal para testes/recordes.",   cor:"#c6f000"},
];

function BorgGuide({type, onClose}) {
  const isPSE  = type === "pse";
  const levels = isPSE ? BORG_CR10 : PSR_LEVELS;
  const title  = isPSE ? "📘 Guia – Escala de Borg (PSE)" : "📗 Guia – Percepção de Recuperação (PSR)";
  const intro  = isPSE
    ? "A Escala de Borg CR-10 (Foster, 1998) mede a percepção subjetiva de esforço do atleta durante ou logo após a sessão. Use como referência para escolher um número que represente honestamente como o treino foi sentido."
    : "A Escala de PSR (Kenttä & Hassmén, 1998) mede a percepção de recuperação do atleta ANTES do treino. Avalie como você se sente em relação à última sessão e ao sono das últimas 24-48h.";
  const quando = isPSE
    ? "⏱ Quando responder: 10-30 minutos APÓS o término da sessão, refletindo o esforço total."
    : "⏱ Quando responder: ANTES de iniciar a sessão, para calibrar a intensidade do treino.";

  return (
    <div style={{background:C.card,border:`2px solid ${isPSE?C.orange:C.green}55`,borderRadius:11,padding:0,marginBottom:8,overflow:"hidden"}}>
      <div style={{background:(isPSE?C.orange:C.green)+"18",padding:"10px 13px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:12,fontWeight:900,color:isPSE?C.orange:C.green}}>{title}</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:15}}>✕</button>
      </div>
      <div style={{padding:12}}>
        <div style={{fontSize:11,color:C.muted,lineHeight:1.5,marginBottom:9}}>{intro}</div>
        <div style={{background:C.bg,borderRadius:7,padding:"7px 9px",marginBottom:11,borderLeft:`3px solid ${isPSE?C.orange:C.green}`}}>
          <div style={{fontSize:10,color:isPSE?C.orange:C.green,fontWeight:700}}>{quando}</div>
        </div>
        <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:6}}>INTERPRETAÇÃO DOS VALORES</div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {levels.map(l => (
            <div key={l.n} style={{display:"flex",gap:8,alignItems:"flex-start",background:C.bg,borderRadius:6,padding:"7px 9px",border:`1px solid ${C.border}`}}>
              <div style={{flexShrink:0,width:26,height:26,background:l.cor+"22",border:`1.5px solid ${l.cor}`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",color:l.cor,fontSize:13,fontWeight:900}}>{l.n}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,color:l.cor}}>{l.label}</div>
                <div style={{fontSize:10,color:C.muted,lineHeight:1.35}}>{l.desc}</div>
              </div>
            </div>
          ))}
        </div>
        {isPSE && (
          <div style={{marginTop:10,padding:9,background:C.accent+"14",border:`1px solid ${C.accent}44`,borderRadius:7}}>
            <div style={{fontSize:10,color:C.accent,fontWeight:700,marginBottom:3}}>💡 COMO USAR NO DIA A DIA</div>
            <div style={{fontSize:10,color:C.muted,lineHeight:1.5}}>
              Após o treino, o atleta deve pensar: "Se eu somar o esforço cardiovascular, muscular e mental dessa sessão, que número representa melhor?". Não existe resposta errada — é a percepção honesta.
            </div>
          </div>
        )}
        <div style={{marginTop:8,fontSize:9,color:C.muted,textAlign:"center",fontStyle:"italic"}}>
          Fontes: Borg (1962, 1982); Foster (1998); Kenttä & Hassmén (1998)
        </div>
      </div>
    </div>
  );
}

function PSEPick({value, onChange, type}) {
  const [showGuide, setShowGuide] = useState(false);
  const labels = type === "pse" ? PSE_L : PSR_L;
  const getC   = n => n <= 3 ? C.green : n <= 6 ? C.orange : C.red;
  return (
    <div>
      {showGuide && <BorgGuide type={type} onClose={() => setShowGuide(false)} />}
      <div style={{background:C.bg,borderRadius:9,padding:10,border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontSize:9,color:C.muted,letterSpacing:1}}>
            {type === "pse" ? "PSE – PERCEPÇÃO DE ESFORÇO (Borg/Foster)" : "PSR – PERCEPÇÃO DE RECUPERAÇÃO (Kenttä)"}
          </div>
          <button onClick={() => setShowGuide(s => !s)}
            title="Abrir guia da escala"
            style={{background:showGuide?(type==="pse"?C.orange:C.green)+"22":"none",border:`1px solid ${showGuide?(type==="pse"?C.orange:C.green):C.border}`,color:showGuide?(type==="pse"?C.orange:C.green):C.muted,borderRadius:5,padding:"2px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>
            {showGuide ? "✕" : "? Guia"}
          </button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(10,1fr)",gap:3}}>
          {[1,2,3,4,5,6,7,8,9,10].map(n => {
            const sel = value === n;
            const nc  = getC(n);
            return (
              <button key={n} onClick={() => onChange(value === n ? null : n)} style={{
                aspectRatio:"1",borderRadius:6,border:`2px solid ${sel?nc:C.border}`,
                background:sel?nc+"33":"none",color:sel?nc:C.muted,
                fontSize:13,fontWeight:sel?900:400,cursor:"pointer",transition:"all .1s",
              }}>{n}</button>
            );
          })}
        </div>
        {value != null && <div style={{marginTop:5,fontSize:10,color:getC(value),fontWeight:700}}>● {labels[value]}</div>}
      </div>
    </div>
  );
}

// Custom tooltip for recharts
function ChartTooltip({active, payload, label}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 11px",fontSize:11}}>
      <div style={{color:C.muted,marginBottom:3}}>{label}</div>
      {payload.map((p,i) => <div key={i} style={{color:p.color||C.text}}>{p.name}: <b>{p.value}</b></div>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════
export default function App({ session, offlineMode, onLogout, onExitOffline }) {
  const today = new Date().toISOString().slice(0, 10);
  const userId = session?.user?.id || null;
  const userEmail = session?.user?.email || null;

  // Load persisted data on first render (synchronously to prevent flash)
  const saved = useMemo(() => loadFromStorage(), []);

  const [view,        setView]        = useState("dashboard");
  const [atletas,     setAtletas]     = useState(() => saved?.atletas || [DEFAULT_ATLETA]);
  const [activeAt,    setActiveAt]    = useState(() => saved?.activeAt || "default1");
  const [showPicker,  setShowPicker]  = useState(false);
  const [selectedWeek,setSelWeek]     = useState(1);
  const [selectedDay, setSelDay]      = useState(null);

  const [atletaData, setAD] = useState(() => saved?.atletaData || {
    default1: makeDefaultData(today),
  });

  // Save status (local): "saved" | "saving" | "error"
  const [saveStatus, setSaveStatus] = useState("saved");
  // Cloud sync status: "synced" | "syncing" | "offline" | "error" | "idle"
  const [cloudStatus, setCloudStatus] = useState(userId ? "idle" : "offline");
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const saveTimerRef = useRef(null);
  const cloudTimerRef = useRef(null);
  const firstLoadDoneRef = useRef(false);

  // On first mount with session: pull data from cloud
  useEffect(() => {
    if (!userId || firstLoadDoneRef.current) return;
    firstLoadDoneRef.current = true;
    setCloudStatus("syncing");
    loadFromCloud(userId).then(({ data: cloudData, error }) => {
      if (error) {
        console.warn("Cloud load error:", error);
        setCloudStatus("error");
        return;
      }
      if (cloudData && cloudData.atletas) {
        // Cloud has data → use it (cloud is source of truth on fresh login)
        if (cloudData.atletas)    setAtletas(cloudData.atletas);
        if (cloudData.atletaData) setAD(cloudData.atletaData);
        if (cloudData.activeAt)   setActiveAt(cloudData.activeAt);
      }
      setCloudStatus("synced");
      setLastSyncAt(new Date());
    }).catch(err => {
      console.warn("Cloud load failed:", err);
      setCloudStatus("error");
    });
  }, [userId]);

  // Auto-save LOCAL whenever atletas, atletaData, or activeAt change (debounced 400ms)
  useEffect(() => {
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const ok = saveToStorage({atletas, atletaData, activeAt, savedAt: new Date().toISOString()});
      setSaveStatus(ok ? "saved" : "error");
    }, 400);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [atletas, atletaData, activeAt]);

  // Auto-sync to CLOUD when logged in (debounced 2000ms to avoid spamming)
  useEffect(() => {
    if (!userId || !firstLoadDoneRef.current) return;
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    setCloudStatus("syncing");
    cloudTimerRef.current = setTimeout(async () => {
      try {
        const { error } = await syncToCloud(userId, { atletas, atletaData, activeAt });
        if (error) {
          console.warn("Cloud sync error:", error);
          setCloudStatus("error");
        } else {
          setCloudStatus("synced");
          setLastSyncAt(new Date());
        }
      } catch (e) {
        console.warn("Cloud sync failed:", e);
        setCloudStatus("error");
      }
    }, 2000);
    return () => { if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current); };
  }, [atletas, atletaData, activeAt, userId]);

  // Monitor online/offline network
  useEffect(() => {
    const onOnline  = () => userId && setCloudStatus("syncing");
    const onOffline = () => userId && setCloudStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [userId]);

  // Manual sync trigger
  const syncNow = async () => {
    if (!userId) return;
    setCloudStatus("syncing");
    try {
      const { error } = await syncToCloud(userId, { atletas, atletaData, activeAt });
      if (error) { setCloudStatus("error"); return; }
      setCloudStatus("synced");
      setLastSyncAt(new Date());
    } catch (e) { setCloudStatus("error"); }
  };

  // Export backup
  const handleExport = () => exportBackup({atletas, atletaData, activeAt});

  // Import backup
  const handleImport = async (file) => {
    try {
      const imported = await importBackup(file);
      if (imported.atletas)     setAtletas(imported.atletas);
      if (imported.atletaData)  setAD(imported.atletaData);
      if (imported.activeAt)    setActiveAt(imported.activeAt);
      return true;
    } catch (e) {
      alert("Erro ao importar backup: " + e.message);
      return false;
    }
  };

  // Reset all data
  const handleReset = () => {
    if (!window.confirm("⚠️ Tem certeza? Isso apagará TODOS os dados salvos. Recomendado exportar backup antes.")) return;
    if (!window.confirm("Esta ação não pode ser desfeita. Confirmar exclusão?")) return;
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    setAtletas([DEFAULT_ATLETA]);
    setActiveAt("default1");
    setAD({default1: makeDefaultData(today)});
  };

  // Safe data accessors
  const getData = useCallback(() => atletaData[activeAt] || makeDefaultData(today), [atletaData, activeAt, today]);
  const patch   = useCallback(fn => setAD(p => {
    const cur = p[activeAt] || makeDefaultData(today);
    return {...p, [activeAt]: fn(cur)};
  }), [activeAt, today]);

  const macroConfig  = getData().macroConfig  || {};
  const macro        = getData().macro        || [];
  const mesociclos   = getData().mesociclos   || [];
  const presenca     = getData().presenca     || {};
  const exercicios   = getData().exercicios   || [];

  const setMacroConfig  = fn => patch(d => ({...d, macroConfig: fn(d.macroConfig || {})}));
  const setMacro        = fn => patch(d => ({...d, macro: fn(d.macro || [])}));
  const setMesociclos   = fn => patch(d => ({...d, mesociclos: fn(d.mesociclos || [])}));
  const setPresenca     = fn => patch(d => ({...d, presenca: fn(d.presenca || {})}));
  const setExercicios   = fn => patch(d => ({...d, exercicios: fn(d.exercicios || [])}));

  const atleta = atletas.find(a => a.id === activeAt) || atletas[0] || DEFAULT_ATLETA;
  const week   = macro[selectedWeek - 1] || null;

  const rebuildMacro = useCallback(cfg => {
    const dur  = MACRO_DURACOES.find(d => d.id === cfg.duracao) || MACRO_DURACOES[0];
    const newM = buildMacroWeeks(cfg.startDate || today, dur.semanas, cfg.modelo || "linear", cfg.objetivo || "hipertrofia");
    patch(d => ({...d, macroConfig: {...(d.macroConfig||{}), ...cfg}, macro: newM}));
  }, [today, patch]);

  const addAtleta = () => {
    const id = uid();
    const a  = {id, nome:"Novo Atleta", dataNasc:"", peso:70, altura:170, fcMax:190, fcRepouso:60, objetivo:"Hipertrofia", nivel:"Iniciante", esporte:"Musculação Funcional"};
    setAtletas(p => [...p, a]);
    setAD(p => ({...p, [id]: makeDefaultData(today)}));
    setActiveAt(id);
    setShowPicker(false);
    setView("atletas");
  };

  const NAV = [
    {id:"dashboard", icon:"⚡", label:"Início"},
    {id:"macro",     icon:"📅", label:"Macro"},
    {id:"meso",      icon:"📦", label:"Meso"},
    {id:"micro",     icon:"🏋", label:"Micro"},
    {id:"graficos",  icon:"📊", label:"Gráficos"},
    {id:"exercicios",icon:"💪", label:"Exerc."},
    {id:"atletas",   icon:"👥", label:"Atletas"},
    {id:"backup",    icon:"💾", label:"Backup"},
  ];

  // Save indicator: combines local and cloud status
  let syncInd;
  if (userId) {
    // Logged in → show cloud sync status
    if (cloudStatus === "synced")       syncInd = {c:C.green,  i:"☁", t:"Sincronizado"};
    else if (cloudStatus === "syncing") syncInd = {c:C.orange, i:"⟳", t:"Sincronizando"};
    else if (cloudStatus === "offline") syncInd = {c:C.muted,  i:"📴", t:"Offline"};
    else if (cloudStatus === "error")   syncInd = {c:C.red,    i:"⚠", t:"Erro de sync"};
    else                                 syncInd = {c:C.muted,  i:"●", t:"Aguarde"};
  } else {
    // Offline mode → local save status
    syncInd = saveStatus === "saved" ? {c:C.green, i:"✓", t:"Local"}
            : saveStatus === "saving"? {c:C.orange, i:"●", t:"Salvando"}
            : {c:C.red, i:"⚠", t:"Erro"};
  }

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Barlow Condensed','Barlow','Segoe UI',sans-serif",display:"flex",flexDirection:"column"}}>
      {/* TOP BAR */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 12px",display:"flex",alignItems:"center",justifyContent:"space-between",height:50,position:"sticky",top:0,zIndex:200}}>
        <div style={{display:"flex",alignItems:"center",gap:7,minWidth:0}}>
          <div style={{width:27,height:27,background:C.accent,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:C.bg,letterSpacing:-.5,flexShrink:0}}>PP</div>
          <div style={{minWidth:0}}>
            <div style={{fontWeight:900,fontSize:12,color:C.accent,letterSpacing:2,lineHeight:1}}>PERIODIZA PRO</div>
            <div style={{fontSize:8,color:C.muted,letterSpacing:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
              {userId ? userEmail : "MODO LOCAL"}
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {/* Sync indicator (clickable to force sync if logged in) */}
          <button onClick={userId ? syncNow : undefined}
            title={userId ? "Clique para forçar sincronização" : syncInd.t}
            disabled={!userId}
            style={{display:"flex",alignItems:"center",gap:3,background:syncInd.c+"18",border:`1px solid ${syncInd.c}44`,borderRadius:6,padding:"3px 7px",cursor:userId?"pointer":"default"}}>
            <span style={{color:syncInd.c,fontSize:10,fontWeight:900}}>{syncInd.i}</span>
            <span style={{color:syncInd.c,fontSize:9,fontWeight:700,letterSpacing:.5}}>{syncInd.t.toUpperCase()}</span>
          </button>
          <button onClick={() => setShowPicker(p => !p)} style={{display:"flex",alignItems:"center",gap:5,background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:"4px 9px",cursor:"pointer",color:C.text}}>
            <span>👤</span>
            <span style={{fontSize:11,fontWeight:700,maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{atleta.nome.split(" ")[0]}</span>
            <span style={{fontSize:9,color:C.muted}}>▾</span>
          </button>
        </div>
      </div>

      {/* ATLETA PICKER */}
      {showPicker && (
        <div style={{position:"fixed",top:50,right:0,left:0,zIndex:300,background:C.surface,borderBottom:`1px solid ${C.border}`,boxShadow:"0 8px 32px #000000cc"}}>
          {atletas.map(a => (
            <div key={a.id} onClick={() => {setActiveAt(a.id); setShowPicker(false);}} style={{padding:"10px 15px",display:"flex",alignItems:"center",gap:9,cursor:"pointer",background:a.id===activeAt?C.accent+"0d":"none",borderBottom:`1px solid ${C.border}`}}>
              <div style={{width:30,height:30,background:C.accent+"22",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>👤</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:a.id===activeAt?C.accent:C.text,fontSize:12}}>{a.nome}</div>
                <div style={{fontSize:9,color:C.muted}}>{a.objetivo} · {a.nivel}</div>
              </div>
              {a.id === activeAt && <span style={{color:C.accent}}>✓</span>}
            </div>
          ))}
          <div style={{padding:"9px 15px"}}>
            <button onClick={addAtleta} style={{width:"100%",background:"none",border:`1px solid ${C.accent}`,color:C.accent,borderRadius:7,padding:"8px",fontWeight:700,fontSize:11,cursor:"pointer"}}>+ Adicionar Atleta</button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <div style={{flex:1,maxWidth:900,width:"100%",margin:"0 auto",padding:"10px 9px 74px"}}>
        {view === "dashboard"  && <Dashboard atleta={atleta} macro={macro} macroConfig={macroConfig} selectedWeek={selectedWeek} setSelWeek={setSelWeek} presenca={presenca} setView={setView} mesociclos={mesociclos} />}
        {view === "macro"      && <MacroEditor macro={macro} setMacro={setMacro} macroConfig={macroConfig} rebuildMacro={rebuildMacro} selectedWeek={selectedWeek} setSelWeek={setSelWeek} today={today} />}
        {view === "meso"       && <MesoEditor mesociclos={mesociclos} setMesociclos={setMesociclos} />}
        {view === "micro"      && <MicroEditor week={week} macro={macro} setMacro={setMacro} exercicios={exercicios} selectedWeek={selectedWeek} setSelWeek={setSelWeek} presenca={presenca} setPresenca={setPresenca} selectedDay={selectedDay} setSelDay={setSelDay} />}
        {view === "graficos"   && <Graficos macro={macro} exercicios={exercicios} />}
        {view === "exercicios" && <ExBanco exercicios={exercicios} setExercicios={setExercicios} />}
        {view === "atletas"    && <AtletasList atletas={atletas} setAtletas={setAtletas} activeAt={activeAt} setActiveAt={setActiveAt} atletaData={atletaData} setAD={setAD} today={today} />}
        {view === "backup"     && <BackupView atletas={atletas} atletaData={atletaData} saveStatus={saveStatus} cloudStatus={cloudStatus} lastSyncAt={lastSyncAt} session={session} offlineMode={offlineMode} onExport={handleExport} onImport={handleImport} onReset={handleReset} onLogout={onLogout} onExitOffline={onExitOffline} onSyncNow={syncNow} />}
      </div>

      {/* BOTTOM NAV */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:200,overflowX:"auto"}}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => setView(n.id)} style={{flex:"1 0 auto",minWidth:52,border:"none",background:"none",color:view===n.id?C.accent:C.muted,padding:"7px 2px 5px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:1,fontWeight:view===n.id?700:400,borderTop:view===n.id?`2px solid ${C.accent}`:"2px solid transparent",transition:"all .12s"}}>
            <span style={{fontSize:13}}>{n.icon}</span>
            <span style={{fontSize:8}}>{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════
function Dashboard({atleta, macro, macroConfig, selectedWeek, setSelWeek, presenca, setView, mesociclos}) {
  const week  = macro[selectedWeek - 1];
  const mTipo = MICRO_TIPOS.find(t => t.id === week?.tipo) || MICRO_TIPOS[0];
  const mObj  = MACRO_OBJETIVOS.find(o => o.id === macroConfig?.objetivo) || MACRO_OBJETIVOS[0];
  const mDur  = MACRO_DURACOES.find(d => d.id === macroConfig?.duracao)   || MACRO_DURACOES[0];
  const mMod  = MACRO_MODELOS.find(m => m.id === macroConfig?.modelo)     || MACRO_MODELOS[0];
  const tp    = Object.values(presenca || {}).filter(v => v === "p").length;
  const ta    = Object.values(presenca || {}).filter(v => v === "a").length;
  const imc   = atleta.peso && atleta.altura ? (atleta.peso / Math.pow(atleta.altura / 100, 2)).toFixed(1) : null;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Hero */}
      <div style={{background:`linear-gradient(135deg,${C.card},#111a28)`,border:`1px solid ${C.border}`,borderRadius:14,padding:16,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-18,right:-18,width:90,height:90,background:mTipo.cor+"0c",borderRadius:"50%"}} />
        <div style={{fontSize:10,color:C.muted,letterSpacing:2}}>OLA,</div>
        <div style={{fontSize:21,fontWeight:900,marginBottom:9}}>{(atleta.nome||"Atleta").split(" ")[0].toUpperCase()} 🔥</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
          <Badge cor={mTipo.cor}>{mTipo.icon} {mTipo.label}</Badge>
          <Badge cor={mObj.cor}>{mObj.icon} {mObj.label}</Badge>
          <Badge cor={mMod.cor}>{mMod.icon} {mMod.label}</Badge>
          <Badge cor={C.muted}>SEM {selectedWeek}/{macro.length}</Badge>
          {imc && <Badge cor={C.blue}>IMC {imc}</Badge>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7}}>
          {[
            {l:"Series",  v: week?.series || "—",           c: C.accent},
            {l:"Intens.", v: (week?.intensidade || "—")+"%", c: mTipo.cor},
            {l:"Reps",    v: week?.reps || "—",              c: C.green},
          ].map(s => (
            <div key={s.l} style={{background:C.bg+"88",borderRadius:8,padding:"8px 4px",textAlign:"center"}}>
              <div style={{fontSize:17,fontWeight:900,color:s.c}}>{s.v}</div>
              <div style={{fontSize:9,color:C.muted}}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick info */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
        {[
          {icon:"📅",l:"Duração",v:mDur.label,c:C.blue,  sub:`${mDur.semanas} semanas`},
          {icon:"⚙",  l:"Modelo", v:mMod.label,c:mMod.cor,sub:"Periodização"},
        ].map(s => (
          <div key={s.l} onClick={() => setView("macro")} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:11,padding:11,cursor:"pointer"}}>
            <div style={{fontSize:15,marginBottom:3}}>{s.icon}</div>
            <div style={{fontSize:14,fontWeight:900,color:s.c}}>{s.v}</div>
            <div style={{fontSize:9,color:C.muted}}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
        {[{v:tp,l:"Presenças",c:C.green},{v:ta,l:"Ausências",c:C.red},{v:macro.length,l:"Semanas",c:C.blue},{v:mesociclos.length,l:"Mesociclos",c:C.purple}].map(s => (
          <div key={s.l} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 5px",textAlign:"center"}}>
            <div style={{fontSize:16,fontWeight:900,color:s.c}}>{s.v}</div>
            <div style={{fontSize:9,color:C.muted}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Next weeks */}
      <CardBox>
        <SectionHead icon="📅" title="PROXIMAS SEMANAS" color={C.accent} />
        <div style={{padding:10,display:"flex",flexDirection:"column",gap:5}}>
          {macro.slice(selectedWeek - 1, selectedWeek + 5).map((w, i) => {
            const mt = MICRO_TIPOS.find(t => t.id === w.tipo) || MICRO_TIPOS[0];
            return (
              <div key={w.id} onClick={() => {setSelWeek(w.id); setView("micro");}} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",background:i===0?mt.cor+"12":C.bg,borderRadius:8,border:`1px solid ${i===0?mt.cor+"44":C.border}`,cursor:"pointer"}}>
                <div style={{width:26,height:26,background:mt.cor+"22",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,color:mt.cor}}>S{w.id}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:700,color:i===0?mt.cor:C.text}}>{mt.icon} {mt.label}</div>
                  <div style={{fontSize:9,color:C.muted}}>{fmtDate(w.startDate)} · {w.series}ser · {w.reps} · {w.intensidade}%</div>
                </div>
                {w.objetivo && <span style={{fontSize:9,color:C.accent}}>{w.objetivo}</span>}
              </div>
            );
          })}
        </div>
      </CardBox>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MACRO EDITOR
// ═══════════════════════════════════════════════════════════════════════
function MacroEditor({macro, setMacro, macroConfig, rebuildMacro, selectedWeek, setSelWeek, today}) {
  const [cfg, setCfg]       = useState({...macroConfig});
  const [editWid, setEditWid] = useState(null);
  const [sciTipo, setSciTipo] = useState(null);
  const [tab, setTab]       = useState("config");

  // Keep cfg in sync if macroConfig changes from outside
  useMemo(() => { setCfg({...macroConfig}); }, [macroConfig]);

  const dur = MACRO_DURACOES.find(d => d.id === cfg.duracao) || MACRO_DURACOES[0];
  const obj = MACRO_OBJETIVOS.find(o => o.id === cfg.objetivo) || MACRO_OBJETIVOS[0];
  const mod = MACRO_MODELOS.find(m => m.id === cfg.modelo)     || MACRO_MODELOS[0];

  const editW = (wid, field, val) => setMacro(prev => prev.map(w => w.id === wid ? {...w, [field]: val} : w));
  const ew    = editWid ? macro.find(w => w.id === editWid) : null;

  const numW   = macro.length;
  const phases = [
    {label:"ADAPTAÇÃO",     range:[0,             Math.floor(numW*.15)], cor:C.blue},
    {label:"DESENVOLVIMENTO",range:[Math.floor(numW*.15),Math.floor(numW*.55)], cor:C.green},
    {label:"ESPECIFICA",    range:[Math.floor(numW*.55),Math.floor(numW*.85)], cor:C.orange},
    {label:"PICO",          range:[Math.floor(numW*.85),numW],            cor:C.red},
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:16,fontWeight:900,color:C.accent}}>📅 MACROCICLO</div>
      <TabBar tabs={[{id:"config",l:"⚙ Config."},{id:"semanas",l:"📋 Semanas"},{id:"ciencia",l:"📚 Ciencia"}]} active={tab} onSelect={setTab} />

      {/* CONFIG */}
      {tab === "config" && (
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          {/* Duration */}
          <CardBox>
            <SectionHead icon="📅" title="DURACAO DO MACROCICLO" color={C.blue} />
            <div style={{padding:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {MACRO_DURACOES.map(d => (
                <div key={d.id} onClick={() => setCfg(p => ({...p, duracao: d.id}))} style={{background:cfg.duracao===d.id?C.blue+"22":C.bg,border:`2px solid ${cfg.duracao===d.id?C.blue:C.border}`,borderRadius:10,padding:11,cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
                    <span style={{fontSize:16}}>{d.icon}</span>
                    <span style={{fontWeight:900,fontSize:12,color:cfg.duracao===d.id?C.blue:C.text}}>{d.label}</span>
                    <Badge cor={C.muted} sm>{d.semanas}sem</Badge>
                  </div>
                  <div style={{fontSize:10,color:C.muted,lineHeight:1.4}}>{d.desc}</div>
                </div>
              ))}
            </div>
          </CardBox>

          {/* Objetivo */}
          <CardBox>
            <SectionHead icon="🎯" title="OBJETIVO" color={C.orange} />
            <div style={{padding:12,display:"flex",flexDirection:"column",gap:7}}>
              {MACRO_OBJETIVOS.map(o => (
                <div key={o.id} onClick={() => setCfg(p => ({...p, objetivo: o.id}))} style={{background:cfg.objetivo===o.id?o.cor+"18":C.bg,border:`2px solid ${cfg.objetivo===o.id?o.cor:C.border}`,borderRadius:9,padding:10,cursor:"pointer",display:"flex",gap:9,alignItems:"flex-start"}}>
                  <span style={{fontSize:16,marginTop:1}}>{o.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:12,color:cfg.objetivo===o.id?o.cor:C.text,marginBottom:2}}>{o.label}</div>
                    <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{o.desc}</div>
                    <div style={{display:"flex",gap:6}}>
                      <Badge cor={o.cor} sm>{o.intensidade[0]}-{o.intensidade[1]}% 1RM</Badge>
                      <Badge cor={o.cor} sm>{o.reps} reps</Badge>
                    </div>
                  </div>
                  {cfg.objetivo === o.id && <span style={{color:o.cor}}>✓</span>}
                </div>
              ))}
            </div>
          </CardBox>

          {/* Modelo */}
          <CardBox>
            <SectionHead icon="⚙" title="MODELO DE PERIODIZACAO" color={C.purple} />
            <div style={{padding:12,display:"flex",flexDirection:"column",gap:7}}>
              {MACRO_MODELOS.map(m => (
                <div key={m.id} onClick={() => setCfg(p => ({...p, modelo: m.id}))} style={{background:cfg.modelo===m.id?m.cor+"18":C.bg,border:`2px solid ${cfg.modelo===m.id?m.cor:C.border}`,borderRadius:9,padding:10,cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
                    <span style={{fontSize:15}}>{m.icon}</span>
                    <span style={{fontWeight:900,fontSize:12,color:cfg.modelo===m.id?m.cor:C.text}}>{m.label}</span>
                    {cfg.modelo === m.id && <span style={{color:m.cor,marginLeft:"auto"}}>✓</span>}
                  </div>
                  <div style={{fontSize:10,color:C.muted,marginBottom:3}}>{m.desc}</div>
                  <div style={{fontSize:10,color:m.cor}}>→ {m.indicado}</div>
                </div>
              ))}
            </div>
          </CardBox>

          {/* Start date */}
          <CardBox>
            <div style={{padding:12}}>
              <Fld label="Data de Inicio" value={cfg.startDate || today} type="date" onChange={v => setCfg(p => ({...p, startDate: v}))} />
            </div>
          </CardBox>

          <Btn onClick={() => rebuildMacro(cfg)} variant="filled" style={{width:"100%",padding:"12px",fontSize:13}}>
            ⚡ Aplicar e Reconstruir Macrociclo
          </Btn>

          {/* Summary */}
          <CardBox accent={C.accent}>
            <SectionHead icon="📋" title="RESUMO" color={C.accent} />
            <div style={{padding:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              {[
                {l:"Duração",   v:`${dur.label} (${dur.semanas}sem)`},
                {l:"Objetivo",  v: obj.label},
                {l:"Modelo",    v: mod.label},
                {l:"Inicio",    v: fmtDate(cfg.startDate || today)},
                {l:"Termino",   v: fmtDate(addDays(cfg.startDate || today, (dur.semanas-1)*7))},
                {l:"Intensidade",v:`${obj.intensidade[0]}-${obj.intensidade[1]}% 1RM`},
              ].map(x => (
                <div key={x.l} style={{background:C.bg,borderRadius:6,padding:"6px 8px"}}>
                  <div style={{fontSize:9,color:C.muted}}>{x.l}</div>
                  <div style={{fontSize:11,fontWeight:700,color:C.text}}>{x.v}</div>
                </div>
              ))}
            </div>
          </CardBox>
        </div>
      )}

      {/* SEMANAS */}
      {tab === "semanas" && (
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          {phases.map((fase, pi) => {
            const ws = macro.slice(fase.range[0], fase.range[1]);
            if (!ws.length) return null;
            return (
              <CardBox key={pi}>
                <div style={{background:fase.cor+"14",borderBottom:`1px solid ${fase.cor}33`,padding:"8px 13px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{color:fase.cor,fontWeight:900,fontSize:11,letterSpacing:2}}>{fase.label}</span>
                  <Badge cor={fase.cor} sm>{ws.length} sem.</Badge>
                </div>
                <div style={{padding:9,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(58px,1fr))",gap:5}}>
                  {ws.map(w => {
                    const mt  = MICRO_TIPOS.find(t => t.id === w.tipo) || MICRO_TIPOS[0];
                    const sel = w.id === selectedWeek;
                    return (
                      <div key={w.id} style={{position:"relative"}}>
                        <div onClick={() => setSelWeek(w.id)} style={{background:sel?mt.cor+"2e":C.bg,border:`2px solid ${sel?mt.cor:C.border}`,borderRadius:7,padding:"6px 3px",cursor:"pointer",textAlign:"center",transition:"all .1s"}}>
                          <div style={{fontSize:8,color:C.muted}}>S{w.id}</div>
                          <div style={{fontSize:11,fontWeight:900,color:mt.cor}}>{mt.icon}</div>
                          <div style={{fontSize:8,color:mt.cor,fontWeight:700}}>{w.intensidade}%</div>
                          {w.obs && <div style={{width:4,height:4,background:C.accent,borderRadius:"50%",margin:"1px auto"}} />}
                        </div>
                        <button onClick={() => setEditWid(w.id === editWid ? null : w.id)} style={{position:"absolute",top:-4,right:-4,width:13,height:13,background:C.accent,border:"none",borderRadius:3,fontSize:7,cursor:"pointer",color:C.bg,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}}>✎</button>
                      </div>
                    );
                  })}
                </div>
              </CardBox>
            );
          })}

          {/* Week editor */}
          {ew && (
            <CardBox accent={C.accent}>
              <SectionHead icon="✎" title={`EDITAR SEMANA ${ew.id} – ${fmtDate(ew.startDate)}`} color={C.accent} />
              <div style={{padding:13}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:10}}>
                  <Fld label="Tipo de Microciclo" value={ew.tipo} type="select"
                    opts={MICRO_TIPOS.map(t => ({id:t.id, label:`${t.icon} ${t.label}`}))}
                    onChange={v => editW(ew.id, "tipo", v)} />
                  <Fld label="Intensidade (%1RM)" value={ew.intensidade} type="number" onChange={v => editW(ew.id, "intensidade", v)} />
                  <Fld label="No de Series" value={ew.series} type="number" onChange={v => editW(ew.id, "series", v)} />
                  <Fld label="Zona de Reps" value={ew.reps} onChange={v => editW(ew.id, "reps", v)} />
                  <Fld label="Objetivo da Semana" value={ew.objetivo || ""} onChange={v => editW(ew.id, "objetivo", v)} />
                  <Fld label="Divisao (A/B/C)" value={ew.divisao || ""} onChange={v => editW(ew.id, "divisao", v)} />
                  <Fld label="Observacoes" value={ew.obs || ""} type="textarea" rows={2} onChange={v => editW(ew.id, "obs", v)} style={{gridColumn:"1/-1"}} />
                </div>
                {/* Science hint */}
                {(() => {
                  const mt = MICRO_TIPOS.find(t => t.id === ew.tipo);
                  if (!mt) return null;
                  return (
                    <div style={{background:C.bg,borderRadius:8,padding:9,border:`1px solid ${mt.cor}44`,marginBottom:10}}>
                      <div style={{fontSize:10,color:mt.cor,fontWeight:700,marginBottom:2}}>💡 {mt.label}</div>
                      <div style={{fontSize:10,color:C.muted}}>{mt.desc}</div>
                      <div style={{fontSize:10,color:mt.cor,marginTop:3}}>→ {mt.aplicacao}</div>
                    </div>
                  );
                })()}
                <Btn onClick={() => setEditWid(null)} variant="filled" style={{width:"100%",padding:"9px",fontSize:12}}>✓ Fechar</Btn>
              </div>
            </CardBox>
          )}

          {/* Volume bars */}
          <CardBox>
            <SectionHead icon="📊" title="ONDULACAO DE VOLUME" color={C.muted} />
            <div style={{padding:"8px 12px 12px"}}>
              {macro.slice(0, Math.min(26, macro.length)).map(w => {
                const mt = MICRO_TIPOS.find(t => t.id === w.tipo) || MICRO_TIPOS[0];
                return (
                  <div key={w.id} style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                    <span style={{width:20,fontSize:8,color:C.muted,textAlign:"right"}}>S{w.id}</span>
                    <div style={{flex:1,height:10,background:C.border,borderRadius:3,overflow:"hidden"}}>
                      <div style={{width:`${(w.series/30)*100}%`,height:"100%",background:mt.cor+"99",borderRadius:3}} />
                    </div>
                    <span style={{width:20,fontSize:8,color:mt.cor,fontWeight:700}}>{w.series}</span>
                  </div>
                );
              })}
            </div>
          </CardBox>
        </div>
      )}

      {/* CIENCIA */}
      {tab === "ciencia" && (
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          <CardBox accent={C.accent}>
            <SectionHead icon="📚" title="TEORIA DA PERIODIZAÇÃO" color={C.accent} sub="Base científica do aplicativo" />
            <div style={{padding:13}}>
              <p style={{fontSize:11,color:C.muted,lineHeight:1.5,margin:"0 0 10px"}}>A periodização é a manipulação sistemática das variáveis de treinamento ao longo do tempo para maximizar adaptações fisiológicas e minimizar o overtraining. As abas deste app seguem os modelos consolidados pela literatura clássica e contemporânea.</p>
              {[
                {n:"Sobrecarga Progressiva",  d:"Aumentar gradualmente volume e intensidade para provocar adaptações contínuas (Matveev, 1977)."},
                {n:"Especificidade (SAID)",    d:"O corpo adapta-se especificamente ao tipo de estresse imposto (A. C. Gomes, 2009)."},
                {n:"Variação",                 d:"Alternar estímulos evita acomodação. Fundamento do sistema de blocos concentrados (Verkhoshansky, 1985)."},
                {n:"Individualidade",          d:"Cada atleta responde de forma única — respeitar histórico e capacidades (Bompa, 1999)."},
                {n:"Reversibilidade",          d:"Adaptações são perdidas com inatividade — princípio use it or lose it."},
                {n:"Continuidade & Ciclicidade",d:"Treinamento organizado em micro, meso e macro-ciclos com objetivos específicos (Matveev; A. C. Gomes)."},
              ].map(p => (
                <div key={p.n} style={{background:C.bg,borderRadius:7,padding:"7px 9px",marginBottom:5,border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.accent}}>{p.n}</div>
                  <div style={{fontSize:10,color:C.muted}}>{p.d}</div>
                </div>
              ))}
            </div>
          </CardBox>

          {/* Scientific references - dedicated card */}
          <CardBox accent={C.blue}>
            <SectionHead icon="🔖" title="REFERÊNCIAS CIENTÍFICAS" color={C.blue} sub="Autores que fundamentam este aplicativo" />
            <div style={{padding:13}}>
              {[
                {autor:"Yuri Verkhoshansky",anos:"1985-2009",contrib:"Pai do treinamento por blocos concentrados (Block Periodization). Conceitos de choque pliométrico, efeito residual do treinamento e sistema de esforço concentrado.",obras:"Fundamentals of Special Strength Training (1977); Supertraining (2009, com M. Siff)."},
                {autor:"Leonid Matveev",anos:"1964-1977",contrib:"Fundador da Teoria da Periodização moderna. Propôs o modelo linear clássico com fases preparatória, competitiva e transição. Base de toda periodização contemporânea.",obras:"Problema de la Periodización del Entrenamiento Deportivo (1964); Fundamentos del Entrenamiento Deportivo (1977)."},
                {autor:"Tudor O. Bompa",anos:"1983-2018",contrib:"Disseminou a periodização no ocidente. Adaptou os modelos soviéticos para esportes variados com ênfase em planejamento anual e multianual.",obras:"Periodization: Theory and Methodology of Training (6 edições)."},
                {autor:"American College of Sports Medicine (ACSM)",anos:"desde 1954",contrib:"Entidade científica referência em diretrizes de prescrição de exercício. Position Statements sobre treinamento de força, perda de peso, saúde cardiovascular e adaptações fisiológicas.",obras:"ACSM Guidelines for Exercise Testing and Prescription; Position Stands publicados no Medicine & Science in Sports & Exercise."},
                {autor:"Antônio Carlos Gomes",anos:"1990-presente",contrib:"Referência nacional brasileira em periodização esportiva. Trabalhos com modalidades olímpicas e adaptação de modelos soviéticos à realidade esportiva brasileira.",obras:"Treinamento Desportivo: Estruturação e Periodização (2009); diversos artigos sobre periodização aplicada."},
              ].map(r => (
                <div key={r.autor} style={{background:C.bg,borderRadius:8,padding:10,marginBottom:7,border:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <div style={{fontSize:11,fontWeight:900,color:C.blue}}>{r.autor}</div>
                    <Badge cor={C.muted} sm>{r.anos}</Badge>
                  </div>
                  <div style={{fontSize:10,color:C.muted,lineHeight:1.4,marginBottom:5}}>{r.contrib}</div>
                  <div style={{fontSize:9,color:C.accent,fontStyle:"italic"}}>📖 {r.obras}</div>
                </div>
              ))}
            </div>
          </CardBox>

          {MACRO_MODELOS.map(m => (
            <CardBox key={m.id}>
              <div style={{padding:12}}>
                <div style={{display:"flex",gap:7,alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:15}}>{m.icon}</span>
                  <div style={{fontWeight:900,fontSize:12,color:m.cor}}>{m.label}</div>
                </div>
                <div style={{fontSize:11,color:C.muted,lineHeight:1.4,marginBottom:6}}>{m.desc}</div>
                <div style={{background:C.bg,borderRadius:6,padding:8,border:`1px solid ${m.cor}33`,marginBottom:6}}>
                  <div style={{fontSize:9,color:m.cor,fontWeight:700,marginBottom:2}}>ESTRUTURA</div>
                  <div style={{fontSize:10,color:C.muted}}>{m.estrutura}</div>
                </div>
                <div style={{fontSize:10,color:m.cor}}>✓ Indicado: {m.indicado}</div>
              </div>
            </CardBox>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MESO FORM – declared at module level to avoid re-mount on keystroke ─
// The root cause of the "can't type full words" bug is defining a component
// INSIDE another component: React sees a new component type every render and
// unmounts/remounts it, resetting focus after each character typed.
function MesoForm({form, setForm, onSave, onCancel, saveLabel}) {
  const mt = MESO_TIPOS.find(t => t.id === form.tipo);
  return (
    <div style={{padding:13}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:9}}>
        {/* Use uncontrolled-style: keep value in local state of THIS stable component */}
        <div style={{gridColumn:"1/-1"}}>
          <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:3}}>NOME</div>
          <input
            value={form.nome}
            onChange={e => setForm(p => ({...p, nome: e.target.value}))}
            placeholder="Ex: Bloco de Hipertrofia"
            style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,padding:"7px 9px",fontSize:12,boxSizing:"border-box"}}
          />
        </div>
        <div style={{gridColumn:"1/-1"}}>
          <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:3}}>TIPO</div>
          <select value={form.tipo} onChange={e => setForm(p => ({...p, tipo: e.target.value}))}
            style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,padding:"7px 9px",fontSize:12,boxSizing:"border-box"}}>
            {MESO_TIPOS.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:3}}>SEMANA INICIO</div>
          <input type="number" value={form.semanaInicio} onChange={e => setForm(p => ({...p, semanaInicio: +e.target.value}))}
            style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,padding:"7px 9px",fontSize:12,boxSizing:"border-box"}}/>
        </div>
        <div>
          <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:3}}>SEMANA FIM</div>
          <input type="number" value={form.semanaFim} onChange={e => setForm(p => ({...p, semanaFim: +e.target.value}))}
            style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,padding:"7px 9px",fontSize:12,boxSizing:"border-box"}}/>
        </div>
        <div style={{gridColumn:"1/-1"}}>
          <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:3}}>OBSERVACOES</div>
          <textarea
            value={form.obs}
            onChange={e => setForm(p => ({...p, obs: e.target.value}))}
            rows={3}
            placeholder="Notas sobre este bloco de treinamento..."
            style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,padding:"7px 9px",fontSize:12,boxSizing:"border-box",resize:"vertical"}}
          />
        </div>
      </div>
      {/* Science hint for selected type */}
      {mt && (
        <div style={{background:C.bg,borderRadius:8,padding:9,border:`1px solid ${mt.cor}44`,marginBottom:9}}>
          <div style={{fontSize:10,color:mt.cor,fontWeight:700,marginBottom:3}}>💡 {mt.label}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:6}}>
            {[{l:"Duração",v:mt.semanas},{l:"Volume",v:mt.volume},{l:"Intensidade",v:mt.intensidade},{l:"Reps",v:mt.reps}].map(x => (
              <div key={x.l} style={{background:C.card,borderRadius:5,padding:"5px 7px"}}>
                <div style={{fontSize:8,color:C.muted}}>{x.l}</div>
                <div style={{fontSize:10,fontWeight:700,color:mt.cor}}>{x.v}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:10,color:C.muted}}>{mt.desc}</div>
          <div style={{fontSize:9,color:mt.cor,marginTop:3}}>Ref: {mt.ref}</div>
        </div>
      )}
      <div style={{display:"flex",gap:7}}>
        <Btn onClick={onSave} variant="filled" style={{flex:1}}>{saveLabel}</Btn>
        <Btn onClick={onCancel}>Cancelar</Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MESO EDITOR
// ═══════════════════════════════════════════════════════════════════════
function MesoEditor({mesociclos, setMesociclos}) {
  const [tab, setTab]         = useState("lista");
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId]   = useState(null);
  const blank = {nome:"", tipo:"hipertrofia", semanaInicio:1, semanaFim:4, obs:""};
  const [form, setForm]       = useState(blank);

  const addMeso  = () => { setMesociclos(p => [...p, {...form, id:uid(), semanaInicio:+form.semanaInicio, semanaFim:+form.semanaFim}]); setShowNew(false); setForm(blank); };
  const saveMeso = () => { setMesociclos(p => p.map(m => m.id === editId ? {...form, id:editId, semanaInicio:+form.semanaInicio, semanaFim:+form.semanaFim} : m)); setEditId(null); };
  const delMeso  = id => setMesociclos(p => p.filter(m => m.id !== id));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:16,fontWeight:900,color:C.accent}}>📦 MESOCICLOS</div>
      <TabBar tabs={[{id:"lista",l:"📦 Mesociclos"},{id:"tipos",l:"📚 Tipos"},{id:"ciencia",l:"🔬 Ciencia"}]} active={tab} onSelect={setTab} />

      {tab === "lista" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {!showNew && <Btn onClick={() => {setShowNew(true); setForm(blank);}} variant="filled" style={{width:"100%"}}>+ Novo Mesociclo</Btn>}
          {showNew && (
            <CardBox accent={C.accent}>
              <SectionHead icon="+" title="NOVO MESOCICLO" color={C.accent} />
              <MesoForm form={form} setForm={setForm} onSave={addMeso} onCancel={() => setShowNew(false)} saveLabel="Adicionar" />
            </CardBox>
          )}
          {mesociclos.length === 0 && !showNew && (
            <div style={{textAlign:"center",padding:36,color:C.muted}}>
              <div style={{fontSize:30,marginBottom:6}}>📦</div>
              <div style={{fontSize:12}}>Nenhum mesociclo criado.</div>
              <div style={{fontSize:10,marginTop:4}}>Crie blocos de semanas com objetivos específicos.</div>
            </div>
          )}
          {mesociclos.map(m => {
            const mt     = MESO_TIPOS.find(t => t.id === m.tipo) || MESO_TIPOS[0];
            const isEdit = editId === m.id;
            return (
              <CardBox key={m.id} accent={isEdit ? C.accent : undefined}>
                {isEdit ? (
                  <>
                    <SectionHead icon="✎" title="EDITAR MESOCICLO" color={C.accent} />
                    <MesoForm form={form} setForm={setForm} onSave={saveMeso} onCancel={() => setEditId(null)} saveLabel="Salvar" />
                  </>
                ) : (
                  <div style={{padding:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
                          <span style={{fontSize:15}}>{mt.icon}</span>
                          <span style={{fontWeight:900,fontSize:13,color:mt.cor}}>{m.nome || mt.label}</span>
                          <Badge cor={mt.cor} sm>{mt.label}</Badge>
                        </div>
                        <div style={{fontSize:10,color:C.muted}}>Semanas {m.semanaInicio}–{m.semanaFim} · {m.semanaFim - m.semanaInicio + 1} semanas</div>
                      </div>
                      <div style={{display:"flex",gap:5}}>
                        <button onClick={() => {setEditId(m.id); setForm({nome:m.nome,tipo:m.tipo,semanaInicio:m.semanaInicio,semanaFim:m.semanaFim,obs:m.obs||""});}} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer"}}>✏</button>
                        <button onClick={() => delMeso(m.id)} style={{background:"none",border:`1px solid ${C.red}44`,color:C.red,borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer"}}>🗑</button>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5}}>
                      {[{l:"Duracao",v:mt.semanas},{l:"Volume",v:mt.volume},{l:"Intensidade",v:mt.intensidade},{l:"Reps",v:mt.reps}].map(x => (
                        <div key={x.l} style={{background:C.bg,borderRadius:6,padding:"5px 6px",textAlign:"center"}}>
                          <div style={{fontSize:8,color:C.muted}}>{x.l}</div>
                          <div style={{fontSize:10,fontWeight:700,color:mt.cor}}>{x.v}</div>
                        </div>
                      ))}
                    </div>
                    {m.obs && <div style={{fontSize:10,color:C.muted,borderTop:`1px solid ${C.border}`,paddingTop:6,marginTop:7}}>{m.obs}</div>}
                  </div>
                )}
              </CardBox>
            );
          })}
        </div>
      )}

      {tab === "tipos" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {MESO_TIPOS.map(mt => (
            <CardBox key={mt.id}>
              <div style={{padding:13}}>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:7}}>
                  <span style={{fontSize:17}}>{mt.icon}</span>
                  <div style={{flex:1}}><div style={{fontWeight:900,fontSize:13,color:mt.cor}}>{mt.label}</div><div style={{fontSize:9,color:C.muted}}>{mt.ref}</div></div>
                </div>
                <div style={{fontSize:11,color:C.muted,lineHeight:1.5,marginBottom:9}}>{mt.desc}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:5}}>
                  {[{l:"Duracao tipica",v:mt.semanas},{l:"Volume",v:mt.volume},{l:"Intensidade",v:mt.intensidade},{l:"Reps",v:mt.reps}].map(x => (
                    <div key={x.l} style={{background:C.bg,borderRadius:6,padding:"6px 8px",border:`1px solid ${mt.cor}33`}}>
                      <div style={{fontSize:8,color:C.muted,letterSpacing:1}}>{x.l.toUpperCase()}</div>
                      <div style={{fontSize:11,fontWeight:700,color:mt.cor}}>{x.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </CardBox>
          ))}
        </div>
      )}

      {tab === "ciencia" && (
        <CardBox>
          <SectionHead icon="🔬" title="CIÊNCIA DOS MESOCICLOS" color={C.teal} />
          <div style={{padding:13,fontSize:11,color:C.muted,lineHeight:1.6}}>
            <p style={{marginTop:0}}>O mesociclo representa um bloco de <strong style={{color:C.text}}>3 a 6 semanas</strong> com objetivo fisiológico estável antes de transição estrutural de cargas (Matveev, 1977).</p>
            <p><strong style={{color:C.accent}}>Modelo de Blocos Concentrados:</strong> Verkhoshansky (1985) propôs concentrar cargas específicas em blocos sequenciais — Acumulação (volume alto), Transmutação (força específica) e Realização (pico competitivo).</p>
            <p><strong style={{color:C.accent}}>Supercompensação:</strong> A fadiga acumulada no mesociclo é seguida de supercompensação durante o deload, elevando o patamar de adaptação (Matveev, 1977; Bompa, 1999).</p>
            <p><strong style={{color:C.accent}}>Aplicação Brasileira:</strong> A. C. Gomes (2009) sistematiza a aplicação destes modelos em atletas brasileiros, adaptando-os à realidade de calendários esportivos nacionais.</p>
            <p style={{marginBottom:0}}><strong style={{color:C.accent}}>Volume-referência:</strong> ACSM (2009) recomenda 8-12 séries por grupo muscular em treinos de hipertrofia, com frequência de 2-3x/semana para praticantes intermediários.</p>
          </div>
        </CardBox>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MICRO EDITOR – segunda a domingo
// ═══════════════════════════════════════════════════════════════════════
function MicroEditor({week, macro, setMacro, exercicios, selectedWeek, setSelWeek, presenca, setPresenca, selectedDay, setSelDay}) {
  const [showAddTreino, setShowAddTreino] = useState(false);
  const [nomeTreino,    setNomeTreino]    = useState("");
  const [tab, setTab]                    = useState("semana");
  const [showCopyModal, setShowCopyModal] = useState(null); // {di} when open

  // Guard: if week is null
  if (!week) {
    return (
      <div style={{textAlign:"center",padding:40,color:C.muted}}>
        <div style={{fontSize:30,marginBottom:8}}>📅</div>
        <div>Nenhuma semana selecionada.</div>
      </div>
    );
  }

  const tipo    = MICRO_TIPOS.find(t => t.id === week.tipo) || MICRO_TIPOS[0];
  const updWeek = (field, val) => setMacro(prev => prev.map(w => w.id === week.id ? {...w, [field]:val} : w));
  const getDias = ()          => week.dias || {};
  const getDia  = di          => (getDias()[di] || {treinos:[], pse:null, psr:null, concluido:false, duracao:"", fcZona:""});
  const updDia  = (di, fn)    => {
    const dias = getDias();
    const cur  = getDia(di);
    updWeek("dias", {...dias, [di]: fn(cur)});
  };

  const addTreino = di => {
    if (!nomeTreino.trim()) return;
    const t = {id:uid(), nome:nomeTreino.toUpperCase(), exercicios:[], concluido:false};
    updDia(di, dia => ({...dia, treinos:[...(dia.treinos||[]), t]}));
    setNomeTreino(""); setShowAddTreino(false);
  };

  const removeTreino = (di, tid) => updDia(di, dia => ({...dia, treinos:(dia.treinos||[]).filter(t => t.id !== tid)}));
  const updTreino    = (di, tid, fn) => updDia(di, dia => ({...dia, treinos:(dia.treinos||[]).map(t => t.id === tid ? fn(t) : t)}));

  const addEx    = (di, tid, ex)          => updTreino(di, tid, t => ({...t, exercicios:[...(t.exercicios||[]), {...ex, uid:uid(), sets:[{reps:parseInt(ex.reps)||10,carga:null},{reps:parseInt(ex.reps)||10,carga:null},{reps:parseInt(ex.reps)||10,carga:null}]}]}));
  const removeEx = (di, tid, ei)          => updTreino(di, tid, t => ({...t, exercicios:(t.exercicios||[]).filter((_,i) => i !== ei)}));
  const addSet   = (di, tid, ei)          => updTreino(di, tid, t => ({...t, exercicios:(t.exercicios||[]).map((ex,i) => i!==ei ? ex : {...ex, sets:[...ex.sets, {reps:ex.sets[ex.sets.length-1]?.reps||10, carga:null}]})}));
  const removeSet= (di, tid, ei, si)      => updTreino(di, tid, t => ({...t, exercicios:(t.exercicios||[]).map((ex,i) => i!==ei||ex.sets.length<=1 ? ex : {...ex, sets:ex.sets.filter((_,j)=>j!==si)})}));
  const updSet   = (di, tid, ei, si, f, v)=> updTreino(di, tid, t => ({...t, exercicios:(t.exercicios||[]).map((ex,i) => i!==ei ? ex : {...ex, sets:ex.sets.map((s,j) => j!==si ? s : {...s, [f]:v===""||v===null?null:+v})})}));

  // Update exercise-level field (pausa, cad, obs)
  const updExField = (di, tid, ei, field, val) =>
    updTreino(di, tid, t => ({...t, exercicios:(t.exercicios||[]).map((ex,i) => i!==ei ? ex : {...ex, [field]:val})}));

  // Copy an existing treino from any day of this week into target day
  // Copy treino from source (current week, day, treino) to one or more target weeks/days
  // targetWeekIds: array of week IDs; targetDi: day index in each target week
  const copyTreino = (sourceDi, sourceTid, targetDi, targetWeekIds) => {
    const srcDia    = getDia(sourceDi);
    const srcTreino = (srcDia.treinos||[]).find(t => t.id === sourceTid);
    if (!srcTreino) return;

    // Make a clone (reset loads, new IDs for each target)
    const makeClone = () => ({
      ...srcTreino,
      id: uid(),
      nome: srcTreino.nome,
      concluido: false,
      exercicios: (srcTreino.exercicios||[]).map(ex => ({
        ...ex,
        uid: uid(),
        sets: (ex.sets||[]).map(s => ({...s, carga: null})), // reset cargas
      })),
    });

    // Normalize targetWeekIds (default = current week)
    const weekIds = (targetWeekIds && targetWeekIds.length > 0) ? targetWeekIds : [week.id];

    // Apply to every target week
    setMacro(prev => prev.map(w => {
      if (!weekIds.includes(w.id)) return w;
      const diasCopy = {...(w.dias || {})};
      const cur      = diasCopy[targetDi] || {treinos:[], pse:null, psr:null, concluido:false, duracao:"", fcZona:""};
      diasCopy[targetDi] = {...cur, treinos:[...(cur.treinos||[]), makeClone()]};
      return {...w, dias: diasCopy};
    }));

    setShowCopyModal(null);
  };

  const toggleDia = di => {
    const conc = !getDia(di).concluido;
    updDia(di, d => ({...d, concluido:conc}));
    setPresenca(p => ({...(p||{}), [`${week.id}-${di}`]: conc ? "p" : undefined}));
  };

  const dias          = getDias();
  const totalTreinos  = Object.values(dias).reduce((s,d) => s + (d.treinos?.length||0), 0);
  const diasFeitos    = Object.values(dias).filter(d => d.concluido).length;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:11}}>
      {/* HEADER */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{display:"flex",gap:5,alignItems:"center"}}>
            <button onClick={() => setSelWeek(Math.max(1, selectedWeek-1))} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:5,padding:"2px 9px",cursor:"pointer",fontSize:14}}>‹</button>
            <span style={{fontSize:14,fontWeight:900,color:C.accent}}>SEMANA {week.id}</span>
            <button onClick={() => setSelWeek(Math.min(macro.length, selectedWeek+1))} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:5,padding:"2px 9px",cursor:"pointer",fontSize:14}}>›</button>
          </div>
          <div style={{display:"flex",gap:5}}>
            <Badge cor={tipo.cor}>{tipo.icon} {tipo.label}</Badge>
            <Badge cor={C.muted} sm>{diasFeitos}d · {totalTreinos}t</Badge>
          </div>
        </div>
        <div style={{fontSize:10,color:C.muted,marginBottom:9}}>
          {fmtDate(week.startDate)} – {fmtDate(addDays(week.startDate, 6))}
          {" · "}{week.series}ser · {week.reps} · {week.intensidade}%1RM
          {week.objetivo && <> · <span style={{color:C.accent}}>{week.objetivo}</span></>}
        </div>
        {/* Tipo selector */}
        <div style={{marginBottom:9}}>
          <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:5}}>TIPO DE MICROCICLO</div>
          <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:2}}>
            {MICRO_TIPOS.map(mt => (
              <button key={mt.id} onClick={() => updWeek("tipo", mt.id)} style={{background:week.tipo===mt.id?mt.cor+"22":"none",border:`1px solid ${week.tipo===mt.id?mt.cor:C.border}`,color:week.tipo===mt.id?mt.cor:C.muted,borderRadius:7,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                {mt.icon} {mt.label}
              </button>
            ))}
          </div>
          {tipo && <div style={{fontSize:9,color:tipo.cor,marginTop:4}}>💡 {tipo.desc}</div>}
        </div>
        {/* PSE/PSR semana */}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <PSEPick value={week.pse || null} onChange={v => updWeek("pse", v)} type="pse" />
          <PSEPick value={week.psr || null} onChange={v => updWeek("psr", v)} type="psr" />
        </div>
      </div>

      <TabBar tabs={[{id:"semana",l:"📅 Semana"},{id:"prescricao",l:"📋 Prescricao"},{id:"tipos",l:"📚 Tipos"}]} active={tab} onSelect={setTab} />

      {/* SEMANA TAB */}
      {tab === "semana" && (
        <div style={{display:"flex",flexDirection:"column",gap:9}}>
          {DIAS_SEMANA.map((dNome, di) => {
            const dia    = getDia(di);
            const data   = fmtDate(addDays(week.startDate, di));
            const isOpen = selectedDay === di;
            const hasTr  = (dia.treinos?.length||0) > 0;
            return (
              <div key={di} style={{background:C.card,border:`1px solid ${dia.concluido?C.green+"55":hasTr?C.border:C.border}`,borderRadius:11,overflow:"hidden"}}>
                {/* Day header */}
                <div onClick={() => setSelDay(isOpen ? null : di)} style={{padding:"10px 13px",display:"flex",alignItems:"center",gap:9,cursor:"pointer",background:dia.concluido?C.green+"0a":hasTr?C.accent+"07":"none"}}>
                  <div style={{width:36,height:36,background:dia.concluido?C.green+"33":hasTr?C.accent+"22":C.subtle,border:`2px solid ${dia.concluido?C.green:hasTr?C.accent:C.border}`,borderRadius:9,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <div style={{fontSize:8,color:dia.concluido?C.green:hasTr?C.accent:C.muted,fontWeight:700}}>{DIAS_SHORT[di]}</div>
                    <div style={{fontSize:10,fontWeight:900,color:dia.concluido?C.green:hasTr?C.accent:C.muted}}>{data.slice(0,2)}</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:12,fontWeight:700,color:dia.concluido?C.green:hasTr?C.text:C.muted}}>{dNome}</span>
                      <span style={{fontSize:10,color:C.muted}}>{data}</span>
                      {dia.concluido && <Badge cor={C.green} sm>✓ Feito</Badge>}
                    </div>
                    <div style={{fontSize:10,color:C.muted,marginTop:1}}>
                      {hasTr ? `${dia.treinos.length} treino${dia.treinos.length>1?"s":""} · ${dia.treinos.reduce((s,t)=>s+(t.exercicios?.length||0),0)} exerc.` : "Descanso"}
                      {dia.duracao ? ` · ${dia.duracao}min` : ""}
                      {dia.pse ? ` · PSE ${dia.pse}` : ""}
                      {dia.fcZona ? ` · ${dia.fcZona.split("–")[0].trim()}` : ""}
                    </div>
                  </div>
                  <span style={{color:C.muted,fontSize:12}}>{isOpen ? "▲" : "▼"}</span>
                </div>

                {/* Day detail */}
                {isOpen && (
                  <div style={{borderTop:`1px solid ${C.border}`,padding:11}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:9}}>
                      <Fld label="Duracao (min)" value={dia.duracao||""} type="number" onChange={v => updDia(di, d => ({...d, duracao:v}))} />
                      <Fld label="FC Zona" value={dia.fcZona||""} type="select" opts={["", ...FCZ]} onChange={v => updDia(di, d => ({...d, fcZona:v}))} />
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:9}}>
                      <PSEPick value={dia.pse||null} onChange={v => updDia(di, d => ({...d, pse:v}))} type="pse" />
                      <PSEPick value={dia.psr||null} onChange={v => updDia(di, d => ({...d, psr:v}))} type="psr" />
                    </div>

                    {/* TREINOS */}
                    {(dia.treinos||[]).map(treino => (
                      <div key={treino.id} style={{background:C.bg,borderRadius:9,padding:10,border:`1px solid ${C.border}`,marginBottom:8}}>
                        {/* Treino header */}
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                          <span style={{fontWeight:900,fontSize:12,color:C.accent}}>{treino.nome}</span>
                          <div style={{display:"flex",gap:5}}>
                            <button onClick={() => updTreino(di, treino.id, t => ({...t, concluido:!t.concluido}))}
                              style={{background:treino.concluido?C.green+"22":"none",border:`1px solid ${treino.concluido?C.green:C.border}`,color:treino.concluido?C.green:C.muted,borderRadius:6,padding:"3px 9px",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                              {treino.concluido?"✓":"Marcar"}
                            </button>
                            {/* Copy treino button */}
                            <button onClick={() => setShowCopyModal({srcDi:di, srcTid:treino.id})}
                              title="Copiar este treino para outro dia"
                              style={{background:"none",border:`1px solid ${C.blue}55`,color:C.blue,borderRadius:6,padding:"3px 8px",fontSize:10,cursor:"pointer"}}>📋</button>
                            <button onClick={() => removeTreino(di, treino.id)}
                              style={{background:"none",border:`1px solid ${C.red}44`,color:C.red,borderRadius:6,padding:"3px 8px",fontSize:10,cursor:"pointer"}}>🗑</button>
                          </div>
                        </div>

                        {/* EXERCICIOS */}
                        {(treino.exercicios||[]).map((ex, ei) => {
                          const gc    = GCOR[ex.grupo] || C.blue;
                          const cgs   = (ex.sets||[]).map(s=>s.carga).filter(v=>typeof v==="number"&&v>0);
                          const maxC  = cgs.length ? Math.max(...cgs) : 0;
                          const rps   = (ex.sets||[]).map(s=>s.reps).filter(v=>typeof v==="number"&&v>0);
                          const avgR  = rps.length ? Math.round(safeAvg(rps)) : 0;
                          const rm    = maxC && avgR ? calc1RM(maxC, avgR) : null;
                          return (
                            <div key={ex.uid||ei} style={{background:C.surface,borderRadius:8,padding:10,border:`1px solid ${C.border}`,marginBottom:7}}>
                              {/* Exercise header row */}
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                                <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                                  <Badge cor={gc} sm>{ex.grupo}</Badge>
                                  <span style={{fontSize:12,fontWeight:700}}>{ei+1}. {ex.nome}</span>
                                </div>
                                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                                  {rm && <Badge cor={C.purple} sm>~{rm}kg</Badge>}
                                  <button onClick={() => removeEx(di, treino.id, ei)}
                                    title="Remover exercício"
                                    style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13}}>✕</button>
                                </div>
                              </div>

                              {/* Inline prescription variables – always visible */}
                              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,marginBottom:7}}>
                                <div>
                                  <div style={{fontSize:8,color:C.muted,letterSpacing:.5,marginBottom:2}}>PAUSA (s)</div>
                                  <input type="number" value={ex.pausa??""}
                                    onChange={e => updExField(di, treino.id, ei, "pausa", e.target.value===""?null:+e.target.value)}
                                    placeholder="60"
                                    style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:5,padding:"5px 6px",fontSize:11,boxSizing:"border-box"}}/>
                                </div>
                                <div>
                                  <div style={{fontSize:8,color:C.muted,letterSpacing:.5,marginBottom:2}}>CADÊNCIA</div>
                                  <input type="text" value={ex.cad||""}
                                    onChange={e => updExField(di, treino.id, ei, "cad", e.target.value)}
                                    placeholder="2:1"
                                    style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:5,padding:"5px 6px",fontSize:11,boxSizing:"border-box"}}/>
                                </div>
                                <div>
                                  <div style={{fontSize:8,color:C.muted,letterSpacing:.5,marginBottom:2}}>INTERV. (s)</div>
                                  <input type="number" value={ex.intervalo??""}
                                    onChange={e => updExField(di, treino.id, ei, "intervalo", e.target.value===""?null:+e.target.value)}
                                    placeholder="—"
                                    style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:5,padding:"5px 6px",fontSize:11,boxSizing:"border-box"}}/>
                                </div>
                              </div>

                              {/* Distância total + unidade + tempo – importante para corrida/ciclismo/natação */}
                              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:5,marginBottom:8}}>
                                <div>
                                  <div style={{fontSize:8,color:C.teal,letterSpacing:.5,marginBottom:2,fontWeight:700}}>📏 DISTÂNCIA TOTAL</div>
                                  <input type="number" value={ex.distancia??""}
                                    onChange={e => updExField(di, treino.id, ei, "distancia", e.target.value===""?null:+e.target.value)}
                                    placeholder="ex: 5"
                                    style={{width:"100%",background:ex.distancia?C.teal+"14":C.bg,border:`1px solid ${ex.distancia?C.teal+"55":C.border}`,color:ex.distancia?C.teal:C.text,borderRadius:5,padding:"5px 7px",fontSize:12,fontWeight:ex.distancia?700:400,boxSizing:"border-box"}}/>
                                </div>
                                <div>
                                  <div style={{fontSize:8,color:C.muted,letterSpacing:.5,marginBottom:2}}>UNIDADE</div>
                                  <select value={ex.distUnidade||"km"}
                                    onChange={e => updExField(di, treino.id, ei, "distUnidade", e.target.value)}
                                    style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:5,padding:"5px 6px",fontSize:11,boxSizing:"border-box"}}>
                                    <option value="km">km</option>
                                    <option value="m">m</option>
                                    <option value="mi">mi</option>
                                    <option value="jardas">yd</option>
                                  </select>
                                </div>
                                <div>
                                  <div style={{fontSize:8,color:C.muted,letterSpacing:.5,marginBottom:2}}>⏱ TEMPO (min)</div>
                                  <input type="number" value={ex.tempo??""}
                                    onChange={e => updExField(di, treino.id, ei, "tempo", e.target.value===""?null:+e.target.value)}
                                    placeholder="—"
                                    style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:5,padding:"5px 6px",fontSize:11,boxSizing:"border-box"}}/>
                                </div>
                              </div>

                              {/* Sets row – REPS + KG per set */}
                              <div style={{fontSize:8,color:C.muted,letterSpacing:.5,marginBottom:4}}>SÉRIES – REPS / CARGA</div>
                              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                                {(ex.sets||[]).map((s, si) => {
                                  const pct = rm && s.carga && s.carga > 0 ? Math.round((s.carga/rm)*100) : null;
                                  return (
                                    <div key={si} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,background:s.carga?tipo.cor+"14":C.card,border:`1px solid ${s.carga?tipo.cor+"55":C.border}`,borderRadius:7,padding:"6px 4px",minWidth:48}}>
                                      <div style={{fontSize:7,color:C.muted,fontWeight:700}}>S{si+1}</div>
                                      <div style={{fontSize:7,color:C.muted}}>REPS</div>
                                      <input type="number" value={s.reps??""} onChange={e => updSet(di, treino.id, ei, si, "reps", e.target.value)}
                                        style={{width:40,textAlign:"center",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:4,padding:"2px",fontSize:12,fontWeight:700}} />
                                      <div style={{fontSize:7,color:C.muted,marginTop:1}}>KG</div>
                                      <input type="number" value={s.carga??""} onChange={e => updSet(di, treino.id, ei, si, "carga", e.target.value)}
                                        style={{width:40,textAlign:"center",background:C.bg,border:`1px solid ${s.carga?tipo.cor+"99":C.border}`,color:s.carga?tipo.cor:C.muted,borderRadius:4,padding:"2px",fontSize:12,fontWeight:s.carga?700:400}} />
                                      {pct && <div style={{fontSize:7,color:tipo.cor,fontWeight:700}}>{pct}%</div>}
                                      {ex.sets.length > 1 && (
                                        <button onClick={() => removeSet(di, treino.id, ei, si)}
                                          style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:9,marginTop:1}}>✕</button>
                                      )}
                                    </div>
                                  );
                                })}
                                {/* Add set inline button */}
                                <button onClick={() => addSet(di, treino.id, ei)}
                                  title="Adicionar série"
                                  style={{minWidth:48,background:"none",border:`1px dashed ${C.border}`,color:C.muted,borderRadius:7,padding:"6px 4px",fontSize:10,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                                  <div style={{fontSize:16,lineHeight:1,marginBottom:2}}>+</div>
                                  <div style={{fontSize:8}}>Série</div>
                                </button>
                              </div>

                              {/* Observations – always visible */}
                              <div>
                                <div style={{fontSize:8,color:C.muted,letterSpacing:.5,marginBottom:3}}>📝 OBSERVAÇÕES DO EXERCÍCIO</div>
                                <textarea value={ex.obs||""}
                                  onChange={e => updExField(di, treino.id, ei, "obs", e.target.value)}
                                  rows={2}
                                  placeholder="Técnica, ajustes, sensações, instruções..."
                                  style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:6,padding:"6px 8px",fontSize:11,boxSizing:"border-box",resize:"vertical",fontFamily:"inherit"}}/>
                              </div>
                            </div>
                          );
                        })}
                        <AddExMicro exercicios={exercicios} onAdd={ex => addEx(di, treino.id, ex)} />
                      </div>
                    ))}

                    {/* Add treino */}
                    {showAddTreino === di ? (
                      <div style={{display:"flex",gap:6,marginBottom:8}}>
                        <input value={nomeTreino} onChange={e => setNomeTreino(e.target.value)} placeholder="Nome (ex: A - Peito/Ombro)" autoFocus style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,padding:"7px 9px",fontSize:12}} />
                        <button onClick={() => addTreino(di)} style={{background:C.accent,color:C.bg,border:"none",borderRadius:7,padding:"7px 12px",fontWeight:900,cursor:"pointer",fontSize:12}}>OK</button>
                        <button onClick={() => {setShowAddTreino(false); setNomeTreino("");}} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:7,padding:"7px 9px",cursor:"pointer"}}>✕</button>
                      </div>
                    ) : (
                      <div style={{display:"flex",gap:6,marginBottom:8}}>
                        <button onClick={() => setShowAddTreino(di)} style={{flex:1,background:"none",border:`1px dashed ${C.border}`,color:C.muted,borderRadius:8,padding:"8px",fontSize:11,cursor:"pointer"}}>+ Novo Treino</button>
                        <button onClick={() => setShowCopyModal({targetDi:di})} style={{background:"none",border:`1px dashed ${C.blue}55`,color:C.blue,borderRadius:8,padding:"8px 12px",fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>📋 Repetir Treino</button>
                      </div>
                    )}

                    {/* Copy/Repeat treino modal */}
                    {showCopyModal && (showCopyModal.targetDi === di || showCopyModal.srcDi === di) && (
                      <CopyTreinoModal
                        dias={getDias()}
                        macro={macro}
                        currentWeekId={week.id}
                        targetDi={showCopyModal.targetDi ?? di}
                        srcDi={showCopyModal.srcDi}
                        srcTid={showCopyModal.srcTid}
                        weekStartDate={week.startDate}
                        onCopy={copyTreino}
                        onClose={() => setShowCopyModal(null)}
                      />
                    )}

                    <button onClick={() => toggleDia(di)} style={{width:"100%",background:dia.concluido?C.green+"22":"none",border:`1px solid ${dia.concluido?C.green:C.border}`,color:dia.concluido?C.green:C.muted,borderRadius:7,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                      {dia.concluido ? "✓ Dia Concluido" : "✓ Marcar Dia como Feito"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Summary */}
          <CardBox>
            <SectionHead icon="📊" title="RESUMO DA SEMANA" color={C.muted} />
            <div style={{padding:"10px 12px",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {[
                {l:"Dias Feitos",  v:`${diasFeitos}/7`,    c:C.green},
                {l:"Treinos",      v:totalTreinos,          c:C.blue},
                {l:"PSE Semana",   v:week.pse||"—",         c:week.pse?C.orange:C.muted},
              ].map(s => (
                <div key={s.l} style={{textAlign:"center"}}>
                  <div style={{fontSize:17,fontWeight:900,color:s.c}}>{s.v}</div>
                  <div style={{fontSize:9,color:C.muted}}>{s.l}</div>
                </div>
              ))}
            </div>
          </CardBox>
        </div>
      )}

      {/* PRESCRICAO TAB */}
      {tab === "prescricao" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <CardBox>
            <SectionHead icon="📋" title="VARIAVEIS DE PRESCRICAO" color={C.blue} />
            <div style={{padding:13}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
                <Fld label="Series/Semana"   value={week.series||""}     type="number"  onChange={v => updWeek("series", v)} />
                <Fld label="Intensidade %1RM" value={week.intensidade||""} type="number" onChange={v => updWeek("intensidade", v)} />
                <Fld label="Zona de Reps"    value={week.reps||""}        onChange={v => updWeek("reps", v)} />
                <Fld label="Divisao (A/B/C)" value={week.divisao||""}     onChange={v => updWeek("divisao", v)} />
                <Fld label="Objetivo"        value={week.objetivo||""}    onChange={v => updWeek("objetivo", v)} />
                <Fld label="Mesociclo"       value={week.mesociclo||""}   onChange={v => updWeek("mesociclo", v)} />
                <Fld label="Observacoes"     value={week.obs||""} type="textarea" rows={2} onChange={v => updWeek("obs", v)} style={{gridColumn:"1/-1"}} />
              </div>
            </div>
          </CardBox>
          <CardBox>
            <SectionHead icon="🧠" title="CONTROLE DE CARGA INTERNA" color={C.orange} />
            <div style={{padding:13,fontSize:11,color:C.muted,lineHeight:1.6}}>
              <p style={{marginTop:0}}><strong style={{color:C.accent}}>Escala de Borg (PSE):</strong> Desenvolvida por Gunnar Borg (1962) e adaptada por Foster (1998) para a versão CR-10. Mede esforço percebido em escala 0-10. Carga interna = PSE × duração (min).</p>
              <p><strong style={{color:C.accent}}>Monotonia e Strain:</strong> Foster (1998) — média PSE / desvio padrão semanal. Valores {">"} 2 indicam alto risco de overtraining (A. C. Gomes, 2009).</p>
              <p><strong style={{color:C.accent}}>PSR (Percepção de Recuperação):</strong> Kenttä & Hassmén (1998). PSR ≥ 7 indica prontidão para treino intenso.</p>
              <p style={{marginBottom:0}}><strong style={{color:C.accent}}>Zonas de FC (ACSM):</strong> Z1-Z2 base aeróbica. Z3-Z4 limiar anaeróbico. Z5-Z6 VO2max e potência anaeróbica.</p>
            </div>
          </CardBox>
        </div>
      )}

      {/* TIPOS TAB */}
      {tab === "tipos" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {MICRO_TIPOS.map(mt => (
            <CardBox key={mt.id}>
              <div style={{padding:12}}>
                <div style={{display:"flex",gap:7,alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:17}}>{mt.icon}</span>
                  <div style={{fontWeight:900,fontSize:13,color:mt.cor}}>{mt.label}</div>
                  <Badge cor={mt.cor} sm>{mt.id}</Badge>
                </div>
                <div style={{fontSize:11,color:C.muted,lineHeight:1.4,marginBottom:6}}>{mt.desc}</div>
                <div style={{background:C.bg,borderRadius:7,padding:8,border:`1px solid ${mt.cor}33`}}>
                  <div style={{fontSize:9,color:mt.cor,fontWeight:700,marginBottom:2}}>APLICACAO PRATICA</div>
                  <div style={{fontSize:10,color:C.muted}}>{mt.aplicacao}</div>
                </div>
              </div>
            </CardBox>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── COPY TREINO MODAL ────────────────────────────────────────────────
// Supports copying a treino to:
//   - A different day in the same week
//   - A different day in one or more OTHER weeks (useful for periodization)
function CopyTreinoModal({dias, macro, currentWeekId, targetDi, srcDi, srcTid, weekStartDate, onCopy, onClose}) {
  const [selDi,  setSelDi]  = useState(srcDi !== undefined ? srcDi : null);
  const [selTid, setSelTid] = useState(srcTid || null);
  const [tab, setTab]       = useState("origem"); // "origem" | "destino"
  const [targetDay, setTargetDay] = useState(targetDi);
  const [targetWeeks, setTargetWeeks] = useState([currentWeekId]); // array of week IDs

  // Collect treinos of CURRENT week (source options)
  const allTreinos = [];
  Object.entries(dias).forEach(([diStr, dia]) => {
    const diNum = +diStr;
    (dia.treinos||[]).forEach(t => allTreinos.push({di: diNum, treino: t}));
  });

  const hasTreinos = allTreinos.length > 0;
  const selectedTreino = selDi !== null && selTid
    ? (dias[selDi]?.treinos||[]).find(t => t.id === selTid)
    : null;

  const toggleWeek = (wid) => {
    setTargetWeeks(prev => prev.includes(wid) ? prev.filter(w => w !== wid) : [...prev, wid]);
  };

  const toggleAllWeeks = () => {
    if (targetWeeks.length === macro.length) setTargetWeeks([currentWeekId]);
    else setTargetWeeks(macro.map(w => w.id));
  };

  const canCopy = selectedTreino && targetWeeks.length > 0;

  const handleCopy = () => {
    if (!canCopy) return;
    onCopy(selDi, selTid, targetDay, targetWeeks);
  };

  return (
    <div style={{background:C.card,border:`2px solid ${C.blue}55`,borderRadius:10,padding:13,marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:12,fontWeight:700,color:C.blue}}>📋 Repetir / Copiar Treino</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:15}}>✕</button>
      </div>

      {!hasTreinos && (
        <div style={{fontSize:11,color:C.muted,textAlign:"center",padding:14}}>
          Nenhum treino cadastrado nesta semana ainda.
        </div>
      )}

      {hasTreinos && (
        <>
          {/* Internal tabs */}
          <div style={{display:"flex",background:C.bg,borderRadius:7,padding:3,marginBottom:10}}>
            {[
              {id:"origem", l:"1. Treino Origem"},
              {id:"destino",l:"2. Destino"},
            ].map(t => {
              const done = t.id === "origem" ? selectedTreino : null;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} disabled={t.id==="destino"&&!selectedTreino}
                  style={{flex:1,border:"none",background:tab===t.id?C.blue:"transparent",color:tab===t.id?C.bg:(t.id==="destino"&&!selectedTreino?C.subtle:C.muted),borderRadius:5,padding:"7px 4px",fontSize:10,fontWeight:700,cursor:t.id==="destino"&&!selectedTreino?"not-allowed":"pointer"}}>
                  {done ? "✓ " : ""}{t.l}
                </button>
              );
            })}
          </div>

          {/* TAB: ORIGEM (select source treino) */}
          {tab === "origem" && (
            <>
              <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:6}}>TREINOS DA SEMANA ATUAL</div>
              <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10,maxHeight:200,overflowY:"auto"}}>
                {allTreinos.map(({di: tdi, treino}) => {
                  const isSelected = selDi === tdi && selTid === treino.id;
                  const dataDia    = fmtDate(addDays(weekStartDate, tdi));
                  return (
                    <div key={treino.id} onClick={() => {setSelDi(tdi); setSelTid(treino.id);}}
                      style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:isSelected?C.blue+"22":C.bg,border:`1px solid ${isSelected?C.blue:C.border}`,borderRadius:8,cursor:"pointer"}}>
                      <div style={{width:30,height:30,background:C.blue+"22",borderRadius:7,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <div style={{fontSize:8,color:C.blue,fontWeight:700}}>{DIAS_SHORT[tdi]}</div>
                        <div style={{fontSize:9,color:C.blue,fontWeight:900}}>{dataDia.slice(0,2)}</div>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:700,color:isSelected?C.blue:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{treino.nome}</div>
                        <div style={{fontSize:9,color:C.muted}}>{(treino.exercicios||[]).length} exerc. · {dataDia}</div>
                      </div>
                      {isSelected && <span style={{color:C.blue,fontSize:14}}>✓</span>}
                    </div>
                  );
                })}
              </div>
              {selectedTreino && (
                <button onClick={() => setTab("destino")}
                  style={{width:"100%",background:C.blue,color:C.bg,border:"none",borderRadius:7,padding:"10px",fontWeight:900,fontSize:12,cursor:"pointer",marginBottom:4}}>
                  Próximo: escolher destino →
                </button>
              )}
            </>
          )}

          {/* TAB: DESTINO (day + weeks) */}
          {tab === "destino" && selectedTreino && (
            <>
              {/* Summary of selection */}
              <div style={{background:C.bg,borderRadius:7,padding:"8px 10px",marginBottom:10,border:`1px solid ${C.blue}33`}}>
                <div style={{fontSize:9,color:C.muted,marginBottom:2}}>COPIANDO</div>
                <div style={{fontSize:11,color:C.text,fontWeight:700}}>{selectedTreino.nome}</div>
                <div style={{fontSize:9,color:C.muted,marginTop:2}}>{(selectedTreino.exercicios||[]).length} exercícios · cargas serão zeradas</div>
              </div>

              {/* Target day selector */}
              <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:5}}>DIA DA SEMANA DE DESTINO</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:12}}>
                {DIAS_SHORT.map((d, i) => (
                  <button key={i} onClick={() => setTargetDay(i)}
                    style={{background:targetDay===i?C.blue+"33":C.bg,border:`2px solid ${targetDay===i?C.blue:C.border}`,color:targetDay===i?C.blue:C.muted,borderRadius:7,padding:"8px 2px",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                    {d}
                  </button>
                ))}
              </div>

              {/* Target weeks selector */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <div style={{fontSize:9,color:C.muted,letterSpacing:1}}>SEMANAS DE DESTINO ({targetWeeks.length})</div>
                <button onClick={toggleAllWeeks}
                  style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:5,padding:"3px 8px",fontSize:9,cursor:"pointer"}}>
                  {targetWeeks.length === macro.length ? "Limpar" : "Todas"}
                </button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(50px,1fr))",gap:4,marginBottom:10,maxHeight:200,overflowY:"auto",background:C.bg,borderRadius:7,padding:6,border:`1px solid ${C.border}`}}>
                {(macro||[]).map(w => {
                  const sel = targetWeeks.includes(w.id);
                  const isCurrent = w.id === currentWeekId;
                  return (
                    <button key={w.id} onClick={() => toggleWeek(w.id)}
                      title={isCurrent ? `S${w.id} (atual)` : `S${w.id}`}
                      style={{background:sel?C.blue+"33":C.card,border:`1.5px solid ${sel?C.blue:isCurrent?C.accent+"66":C.border}`,color:sel?C.blue:isCurrent?C.accent:C.muted,borderRadius:6,padding:"7px 2px",fontSize:10,fontWeight:sel?900:500,cursor:"pointer"}}>
                      S{w.id}
                      {isCurrent && <div style={{fontSize:7,lineHeight:1,marginTop:1}}>atual</div>}
                    </button>
                  );
                })}
              </div>

              {/* Confirmation card */}
              <div style={{background:C.accent+"12",borderRadius:7,padding:"8px 10px",marginBottom:10,border:`1px solid ${C.accent}55`}}>
                <div style={{fontSize:10,color:C.accent,fontWeight:700,marginBottom:3}}>✨ RESULTADO</div>
                <div style={{fontSize:10,color:C.text,lineHeight:1.5}}>
                  O treino será copiado para <strong>{DIAS_SEMANA[targetDay]}</strong> de{" "}
                  <strong>{targetWeeks.length} semana{targetWeeks.length !== 1 ? "s" : ""}</strong>
                  {targetWeeks.length <= 6 && targetWeeks.length > 0 && (
                    <span style={{color:C.muted}}> ({targetWeeks.sort((a,b)=>a-b).map(id => "S"+id).join(", ")})</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{display:"flex",gap:7}}>
                <button onClick={() => setTab("origem")}
                  style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:7,padding:"10px 14px",fontSize:11,cursor:"pointer"}}>
                  ← Voltar
                </button>
                <button onClick={handleCopy} disabled={!canCopy}
                  style={{flex:1,background:canCopy?C.blue:C.subtle,color:canCopy?C.bg:C.muted,border:"none",borderRadius:7,padding:"10px",fontWeight:900,fontSize:12,cursor:canCopy?"pointer":"not-allowed"}}>
                  📋 Copiar para {targetWeeks.length} semana{targetWeeks.length !== 1 ? "s" : ""}
                </button>
              </div>
            </>
          )}

          {/* Cancel button (always visible at bottom on origem tab) */}
          {tab === "origem" && (
            <button onClick={onClose} style={{width:"100%",background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:7,padding:"8px",fontSize:11,cursor:"pointer",marginTop:4}}>
              Cancelar
            </button>
          )}
        </>
      )}
    </div>
  );
}

// AddExMicro component
function AddExMicro({exercicios, onAdd}) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const [fg,     setFg]     = useState("todos");
  const [cat,    setCat]    = useState("muscular");
  const grupos = cat === "muscular" ? ["todos",...GRUPOS_M] : ["todos",...GRUPOS_E];
  const filtered = (exercicios||[]).filter(e => {
    const inCat    = cat==="muscular" ? GRUPOS_M.includes(e.grupo) : GRUPOS_E.includes(e.grupo);
    const inGrupo  = fg==="todos" || e.grupo===fg;
    const inSearch = e.nome.toLowerCase().includes(search.toLowerCase());
    return inCat && inGrupo && inSearch;
  });

  if (!open) return (
    <button onClick={() => setOpen(true)} style={{width:"100%",background:"none",border:`1px dashed ${C.border}`,color:C.muted,borderRadius:8,padding:"7px",fontSize:11,cursor:"pointer"}}>
      + Adicionar Exercício
    </button>
  );

  return (
    <div style={{background:C.surface,borderRadius:8,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:4}}>
      <div style={{padding:"7px 8px",display:"flex",gap:5,borderBottom:`1px solid ${C.border}`}}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." autoFocus style={{flex:1,background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:5,padding:"4px 7px",fontSize:11}} />
        <button onClick={() => {setOpen(false); setSearch("");}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>✕</button>
      </div>
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`}}>
        {[{id:"muscular",l:"💪 Muscular"},{id:"esporte",l:"🏅 Esporte"}].map(c => (
          <button key={c.id} onClick={() => {setCat(c.id); setFg("todos");}} style={{flex:1,background:cat===c.id?C.accent+"22":"none",border:"none",borderBottom:`2px solid ${cat===c.id?C.accent:"transparent"}`,color:cat===c.id?C.accent:C.muted,padding:"5px",fontSize:11,cursor:"pointer"}}>{c.l}</button>
        ))}
      </div>
      <div style={{display:"flex",gap:3,padding:"4px 8px",overflowX:"auto",borderBottom:`1px solid ${C.border}`}}>
        {grupos.map(g => (
          <button key={g} onClick={() => setFg(g)} style={{background:fg===g?(GCOR[g]||C.accent)+"22":"none",border:`1px solid ${fg===g?(GCOR[g]||C.accent):C.border}`,color:fg===g?(GCOR[g]||C.accent):C.muted,borderRadius:4,padding:"2px 6px",fontSize:8,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{g==="todos"?"Todos":g}</button>
        ))}
      </div>
      <div style={{maxHeight:160,overflowY:"auto"}}>
        {filtered.map(e => (
          <div key={e.id} onClick={() => {onAdd(e); setOpen(false); setSearch("");}} style={{padding:"6px 9px",cursor:"pointer",display:"flex",gap:6,alignItems:"center",borderBottom:`1px solid ${C.border}`}} onMouseEnter={ev=>ev.currentTarget.style.background=C.card} onMouseLeave={ev=>ev.currentTarget.style.background="none"}>
            <Badge cor={GCOR[e.grupo]||C.blue} sm>{e.grupo}</Badge>
            <div style={{flex:1}}>
              <div style={{fontSize:11}}>{e.nome}</div>
              <div style={{fontSize:9,color:C.muted}}>{e.sp||3}x{e.reps} · {e.pausa}s</div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{padding:12,textAlign:"center",color:C.muted,fontSize:10}}>Sem resultados.</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// GRÁFICOS
// ═══════════════════════════════════════════════════════════════════════
function Graficos({macro, exercicios}) {
  const [tab,   setTab]   = useState("volume");
  const [exNome,setExNome]= useState((exercicios||[])[0]?.nome || "");

  // Ensure exNome is valid
  const safeExNome = useMemo(() => {
    const list = (exercicios||[]).map(e => e.nome);
    return list.includes(exNome) ? exNome : (list[0]||"");
  }, [exercicios, exNome]);

  const volumeData = useMemo(() =>
    (macro||[]).slice(0, Math.min(26, macro?.length||0)).map(w => ({
      semana: `S${w.id}`,
      series: w.series || 0,
      intensidade: w.intensidade || 0,
    })), [macro]);

  const pseData = useMemo(() =>
    (macro||[]).filter(w => w && w.pse != null).map(w => {
      const dias   = Object.values(w.dias||{});
      const sessoes= Math.max(dias.filter(d=>d.concluido).length, 1);
      return {semana:`S${w.id}`, pse:w.pse, psr:w.psr||0, cargaInterna:(w.pse||0)*sessoes};
    }), [macro]);

  const evolData = useMemo(() => {
    if (!safeExNome) return [];
    const pts = [];
    (macro||[]).forEach(w => {
      Object.values(w.dias||{}).forEach(dia => {
        (dia.treinos||[]).forEach(t => {
          (t.exercicios||[]).forEach(ex => {
            if (ex.nome === safeExNome) {
              const cgs = (ex.sets||[]).map(s=>s.carga).filter(v=>typeof v==="number"&&v>0);
              const rps = (ex.sets||[]).map(s=>s.reps).filter(v=>typeof v==="number"&&v>0);
              if (cgs.length) {
                const mc  = Math.max(...cgs);
                const ar  = Math.round(safeAvg(rps));
                const rm1 = mc && ar ? calc1RM(mc, ar) : undefined;
                pts.push({semana:`S${w.id}`, carga:mc, rm1});
              }
            }
          });
        });
      });
    });
    return pts;
  }, [macro, safeExNome]);

  // Convert distance to km regardless of unit (for consistent aggregation)
  const toKm = (dist, unidade) => {
    if (!dist || dist <= 0) return 0;
    const u = unidade || "km";
    if (u === "km") return dist;
    if (u === "m")  return dist / 1000;
    if (u === "mi") return dist * 1.60934;
    if (u === "jardas") return dist * 0.0009144;
    return dist;
  };

  // Weekly total distance (for endurance athletes)
  const distanciaSemanal = useMemo(() =>
    (macro||[]).map(w => {
      let totalKm = 0;
      let totalMin = 0;
      Object.values(w.dias||{}).forEach(dia => {
        (dia.treinos||[]).forEach(t => {
          (t.exercicios||[]).forEach(ex => {
            if (ex.distancia && ex.distancia > 0) {
              totalKm += toKm(ex.distancia, ex.distUnidade);
            }
            if (ex.tempo && ex.tempo > 0) totalMin += ex.tempo;
          });
        });
      });
      return {
        semana: `S${w.id}`,
        distancia: +totalKm.toFixed(2),
        tempo: totalMin,
        ritmo: totalKm > 0 && totalMin > 0 ? +(totalMin / totalKm).toFixed(2) : 0, // min/km
      };
    }).filter(d => d.distancia > 0 || d.tempo > 0)
  , [macro]);

  // Per-exercise distance evolution (for selected exercise)
  const distanciaPorExercicio = useMemo(() => {
    if (!safeExNome) return [];
    const pts = [];
    (macro||[]).forEach(w => {
      let semanaKm = 0;
      let semanaMin = 0;
      let count = 0;
      Object.values(w.dias||{}).forEach(dia => {
        (dia.treinos||[]).forEach(t => {
          (t.exercicios||[]).forEach(ex => {
            if (ex.nome === safeExNome) {
              if (ex.distancia && ex.distancia > 0) {
                semanaKm += toKm(ex.distancia, ex.distUnidade);
                count++;
              }
              if (ex.tempo && ex.tempo > 0) semanaMin += ex.tempo;
            }
          });
        });
      });
      if (semanaKm > 0 || semanaMin > 0) {
        pts.push({
          semana: `S${w.id}`,
          distancia: +semanaKm.toFixed(2),
          tempo: semanaMin,
          sessoes: count,
          ritmo: semanaKm > 0 && semanaMin > 0 ? +(semanaMin / semanaKm).toFixed(2) : 0,
        });
      }
    });
    return pts;
  }, [macro, safeExNome]);

  const exList = useMemo(() => (exercicios||[]).map(e => e.nome), [exercicios]);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:16,fontWeight:900,color:C.accent}}>📊 GRAFICOS & ANALISES</div>
      <TabBar tabs={[{id:"volume",l:"📊 Volume"},{id:"monotonia",l:"🧠 PSE"},{id:"carga",l:"🏋 Carga"},{id:"distancia",l:"🏃 Distância"}]} active={tab} onSelect={setTab} />

      {tab === "volume" && (
        <CardBox>
          <SectionHead icon="📊" title="VOLUME E INTENSIDADE PLANEJADOS" color={C.blue} sub="Issurin (2010) – ondulacao de volume" />
          <div style={{padding:14}}>
            {volumeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={volumeData} margin={{top:4,right:4,left:-24,bottom:0}}>
                  <CartesianGrid strokeDasharray="2 4" stroke={C.border} />
                  <XAxis dataKey="semana" tick={{fill:C.muted,fontSize:8}} interval={1} />
                  <YAxis tick={{fill:C.muted,fontSize:8}} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{fontSize:10}} />
                  <Bar dataKey="series" name="Series" fill={C.blue+"77"} radius={[3,3,0,0]} />
                  <Bar dataKey="intensidade" name="% 1RM" fill={C.orange+"77"} radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div style={{textAlign:"center",padding:30,color:C.muted,fontSize:11}}>Nenhum dado disponivel.</div>}
          </div>
        </CardBox>
      )}

      {tab === "monotonia" && (
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          <CardBox>
            <SectionHead icon="🧠" title="PSE & PSR SEMANAL" color={C.orange} sub="Foster (1998); Kenttä & Hassmén (1998)" />
            <div style={{padding:14}}>
              {pseData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={pseData} margin={{top:4,right:4,left:-24,bottom:0}}>
                    <CartesianGrid strokeDasharray="2 4" stroke={C.border} />
                    <XAxis dataKey="semana" tick={{fill:C.muted,fontSize:8}} />
                    <YAxis domain={[0,10]} tick={{fill:C.muted,fontSize:8}} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{fontSize:10}} />
                    <ReferenceLine y={7} stroke={C.red} strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="pse" name="PSE" stroke={C.orange} strokeWidth={2} dot={{r:3,fill:C.orange}} />
                    <Line type="monotone" dataKey="psr" name="PSR" stroke={C.green} strokeWidth={2} dot={{r:3,fill:C.green}} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div style={{textAlign:"center",padding:30,color:C.muted,fontSize:11}}>Marque PSE no Microciclo para visualizar.</div>}
            </div>
          </CardBox>
          <CardBox>
            <SectionHead icon="⚡" title="CARGA INTERNA" color={C.red} sub="Carga = PSE x sessoes concluidas" />
            <div style={{padding:14}}>
              {pseData.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={pseData} margin={{top:4,right:4,left:-24,bottom:0}}>
                    <CartesianGrid strokeDasharray="2 4" stroke={C.border} />
                    <XAxis dataKey="semana" tick={{fill:C.muted,fontSize:8}} />
                    <YAxis tick={{fill:C.muted,fontSize:8}} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="cargaInterna" name="Carga Interna" fill={C.red+"88"} radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div style={{textAlign:"center",padding:20,color:C.muted,fontSize:11}}>Sem dados de PSE.</div>}
            </div>
          </CardBox>
          <CardBox>
            <SectionHead icon="📖" title="REFERENCIA – MONOTONIA" color={C.muted} />
            <div style={{padding:12}}>
              {[{r:"< 2",l:"Variacao adequada – baixo risco",c:C.green},{r:"2 – 3",l:"Atencao – considere variar carga",c:C.orange},{r:"> 3",l:"Alto risco – risco de overtraining",c:C.red}].map(x => (
                <div key={x.r} style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:x.c}} />
                  <Badge cor={x.c} sm>{x.r}</Badge>
                  <span style={{fontSize:10,color:C.muted}}>{x.l}</span>
                </div>
              ))}
            </div>
          </CardBox>
        </div>
      )}

      {tab === "carga" && (
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          <CardBox>
            <div style={{padding:12}}>
              <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:6}}>EXERCÍCIO</div>
              <select value={safeExNome} onChange={e => setExNome(e.target.value)} style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,padding:"7px 9px",fontSize:12}}>
                {exList.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </CardBox>
          <CardBox>
            <SectionHead icon="🏋" title={`EVOLUÇÃO – ${safeExNome.toUpperCase()}`} color={C.accent} sub="Epley (1985): 1RM = carga / (1.0278 - 0.0278 x reps)" />
            <div style={{padding:14}}>
              {evolData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={evolData} margin={{top:4,right:4,left:-24,bottom:0}}>
                    <CartesianGrid strokeDasharray="2 4" stroke={C.border} />
                    <XAxis dataKey="semana" tick={{fill:C.muted,fontSize:8}} />
                    <YAxis tick={{fill:C.muted,fontSize:8}} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{fontSize:10}} />
                    <Line type="monotone" dataKey="carga" name="Carga Máx (kg)" stroke={C.accent} strokeWidth={2} dot={{r:4,fill:C.accent}} connectNulls={false} />
                    <Line type="monotone" dataKey="rm1" name="1RM Est. (kg)" stroke={C.purple} strokeWidth={2} strokeDasharray="5 3" dot={{r:3,fill:C.purple}} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div style={{textAlign:"center",padding:30,color:C.muted,fontSize:11}}>Sem dados. Registre cargas no Microciclo.</div>}
              {evolData.length > 0 && (
                <div style={{marginTop:12,overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                    <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                      {["Sem.","Carga Máx","1RM Est.","Δ"].map(h => <th key={h} style={{padding:"4px 7px",color:C.muted,fontWeight:700,textAlign:"left",fontSize:9}}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {evolData.map((d, i) => {
                        const prev  = evolData[i-1];
                        const delta = prev != null ? +(d.carga - prev.carga).toFixed(1) : null;
                        const dc    = delta===null?C.muted:delta>0?C.green:delta<0?C.red:C.muted;
                        return (
                          <tr key={i} style={{borderBottom:`1px solid ${C.border}`}}>
                            <td style={{padding:"4px 7px",color:C.text,fontWeight:700}}>{d.semana}</td>
                            <td style={{padding:"4px 7px",color:C.accent,fontWeight:700}}>{d.carga}kg</td>
                            <td style={{padding:"4px 7px",color:C.purple}}>{d.rm1 ? d.rm1+"kg" : "—"}</td>
                            <td style={{padding:"4px 7px",color:dc,fontWeight:700}}>{delta===null?"—":delta>0?"+"+delta:delta}kg</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardBox>
        </div>
      )}

      {tab === "distancia" && (
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          {/* Weekly total distance */}
          <CardBox>
            <SectionHead icon="🏃" title="DISTÂNCIA SEMANAL TOTAL" color={C.teal} sub="Somatório de todas as distâncias registradas (km)" />
            <div style={{padding:14}}>
              {distanciaSemanal.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={distanciaSemanal} margin={{top:4,right:4,left:-20,bottom:0}}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.border} />
                      <XAxis dataKey="semana" tick={{fill:C.muted,fontSize:9}} />
                      <YAxis tick={{fill:C.muted,fontSize:9}} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{fontSize:10}} />
                      <Bar dataKey="distancia" name="Distância (km)" fill={C.teal+"99"} radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginTop:10}}>
                    {(() => {
                      const totalKm = distanciaSemanal.reduce((s,d) => s+d.distancia, 0);
                      const mediaKm = distanciaSemanal.length ? (totalKm/distanciaSemanal.length) : 0;
                      const maxKm   = distanciaSemanal.length ? Math.max(...distanciaSemanal.map(d=>d.distancia)) : 0;
                      return [
                        {l:"Total Macro",v:totalKm.toFixed(1)+"km",c:C.teal},
                        {l:"Média/Sem.",v:mediaKm.toFixed(1)+"km",c:C.blue},
                        {l:"Pico Sem.",v:maxKm.toFixed(1)+"km",c:C.orange},
                      ].map(s => (
                        <div key={s.l} style={{background:C.bg,borderRadius:7,padding:"8px 5px",textAlign:"center",border:`1px solid ${s.c}33`}}>
                          <div style={{fontSize:14,fontWeight:900,color:s.c}}>{s.v}</div>
                          <div style={{fontSize:8,color:C.muted}}>{s.l}</div>
                        </div>
                      ));
                    })()}
                  </div>
                </>
              ) : (
                <div style={{textAlign:"center",padding:30,color:C.muted,fontSize:11}}>
                  <div style={{fontSize:30,marginBottom:8}}>🏃</div>
                  <div>Nenhuma distância registrada.</div>
                  <div style={{fontSize:10,marginTop:4}}>Preencha o campo 📏 DISTÂNCIA TOTAL ao montar o treino.</div>
                </div>
              )}
            </div>
          </CardBox>

          {/* Tempo total + Ritmo */}
          {distanciaSemanal.length > 0 && (
            <CardBox>
              <SectionHead icon="⏱" title="TEMPO & RITMO MÉDIO" color={C.orange} sub="Tempo total e pace (min/km) por semana" />
              <div style={{padding:14}}>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={distanciaSemanal} margin={{top:4,right:4,left:-20,bottom:0}}>
                    <CartesianGrid strokeDasharray="2 4" stroke={C.border} />
                    <XAxis dataKey="semana" tick={{fill:C.muted,fontSize:9}} />
                    <YAxis yAxisId="l" tick={{fill:C.muted,fontSize:9}} />
                    <YAxis yAxisId="r" orientation="right" tick={{fill:C.muted,fontSize:9}} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{fontSize:10}} />
                    <Line yAxisId="l" type="monotone" dataKey="tempo" name="Tempo (min)" stroke={C.orange} strokeWidth={2} dot={{r:3,fill:C.orange}} />
                    <Line yAxisId="r" type="monotone" dataKey="ritmo" name="Ritmo (min/km)" stroke={C.purple} strokeWidth={2} strokeDasharray="5 3" dot={{r:3,fill:C.purple}} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardBox>
          )}

          {/* Per-exercise distance evolution */}
          <CardBox>
            <div style={{padding:12}}>
              <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:6}}>EVOLUÇÃO POR EXERCÍCIO</div>
              <select value={safeExNome} onChange={e => setExNome(e.target.value)} style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,padding:"7px 9px",fontSize:12}}>
                {exList.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </CardBox>

          <CardBox>
            <SectionHead icon="📈" title={`DISTÂNCIA – ${safeExNome.toUpperCase()}`} color={C.teal} sub="Evolução da distância no exercício selecionado" />
            <div style={{padding:14}}>
              {distanciaPorExercicio.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={distanciaPorExercicio} margin={{top:4,right:4,left:-20,bottom:0}}>
                      <CartesianGrid strokeDasharray="2 4" stroke={C.border} />
                      <XAxis dataKey="semana" tick={{fill:C.muted,fontSize:9}} />
                      <YAxis tick={{fill:C.muted,fontSize:9}} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{fontSize:10}} />
                      <Line type="monotone" dataKey="distancia" name="Distância (km)" stroke={C.teal} strokeWidth={2} dot={{r:4,fill:C.teal}} />
                    </LineChart>
                  </ResponsiveContainer>
                  <div style={{marginTop:12,overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                      <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                        {["Sem.","Dist.","Tempo","Ritmo","Sess.","Δ"].map(h => <th key={h} style={{padding:"4px 6px",color:C.muted,fontWeight:700,textAlign:"left",fontSize:9}}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {distanciaPorExercicio.map((d, i) => {
                          const prev  = distanciaPorExercicio[i-1];
                          const delta = prev != null ? +(d.distancia - prev.distancia).toFixed(2) : null;
                          const dc    = delta===null?C.muted:delta>0?C.green:delta<0?C.red:C.muted;
                          return (
                            <tr key={i} style={{borderBottom:`1px solid ${C.border}`}}>
                              <td style={{padding:"4px 6px",color:C.text,fontWeight:700}}>{d.semana}</td>
                              <td style={{padding:"4px 6px",color:C.teal,fontWeight:700}}>{d.distancia}km</td>
                              <td style={{padding:"4px 6px",color:C.orange}}>{d.tempo||"—"}{d.tempo?"min":""}</td>
                              <td style={{padding:"4px 6px",color:C.purple}}>{d.ritmo?d.ritmo+"min/km":"—"}</td>
                              <td style={{padding:"4px 6px",color:C.muted}}>{d.sessoes}</td>
                              <td style={{padding:"4px 6px",color:dc,fontWeight:700}}>{delta===null?"—":delta>0?"+"+delta:delta}km</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div style={{textAlign:"center",padding:30,color:C.muted,fontSize:11}}>Sem dados de distância para este exercício.</div>
              )}
            </div>
          </CardBox>

          {/* Reference card */}
          <CardBox>
            <SectionHead icon="📖" title="REFERÊNCIA – CARGA DE TREINAMENTO POR DISTÂNCIA" color={C.muted} />
            <div style={{padding:12,fontSize:11,color:C.muted,lineHeight:1.6}}>
              <p style={{marginTop:0}}>O volume semanal de corrida/ciclismo é um indicador-chave de carga externa em esportes de endurance.</p>
              <p><strong style={{color:C.accent}}>Regra dos 10%:</strong> Não aumentar o volume semanal em mais de 10% para prevenir lesões por sobrecarga (Nielsen et al., 2012).</p>
              <p style={{marginBottom:0}}><strong style={{color:C.accent}}>ACWR (Acute:Chronic Workload Ratio):</strong> Relação entre carga aguda (1 semana) e crônica (4 semanas) deve ficar entre 0.8 e 1.3 (Gabbett, 2016).</p>
            </div>
          </CardBox>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// EX BANCO
// ═══════════════════════════════════════════════════════════════════════
function ExBanco({exercicios, setExercicios}) {
  const [cat,     setCat]     = useState("muscular");
  const [fg,      setFg]      = useState("todos");
  const [search,  setSearch]  = useState("");
  const [editId,  setEditId]  = useState(null);
  const [ef,      setEf]      = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const blank = {nome:"",grupo:"Peito",sp:3,reps:"10",pausa:60,cad:"2:1"};
  const [nf, setNf] = useState(blank);

  const gList    = cat === "muscular" ? ["todos",...GRUPOS_M] : ["todos",...GRUPOS_E];
  const filtered = (exercicios||[]).filter(e => {
    const inCat   = cat === "muscular" ? GRUPOS_M.includes(e.grupo) : GRUPOS_E.includes(e.grupo);
    return inCat && (fg==="todos"||e.grupo===fg) && e.nome.toLowerCase().includes(search.toLowerCase());
  });

  const save = () => { setExercicios(p => (p||[]).map(e => e.id===ef.id ? ef : e)); setEditId(null); };
  const add  = () => { setExercicios(p => [...(p||[]), {...nf, id:uid()}]); setShowAdd(false); setNf(blank); };
  const del  = id => setExercicios(p => (p||[]).filter(e => e.id !== id));

  const EF = [
    {k:"nome",  l:"Nome",         t:"text",   full:true},
    {k:"grupo", l:"Categoria",    t:"select", opts:TODOS_G},
    {k:"sp",    l:"Series",       t:"number"},
    {k:"reps",  l:"Reps/Tempo",   t:"text"},
    {k:"pausa", l:"Pausa (s)",    t:"number"},
    {k:"cad",   l:"Cadencia",     t:"text"},
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:16,fontWeight:900,color:C.accent}}>💪 EXERCICIOS</div>
        <div style={{display:"flex",gap:7,alignItems:"center"}}>
          <span style={{fontSize:10,color:C.muted}}>{(exercicios||[]).length}</span>
          <Btn onClick={() => {setShowAdd(true); setNf(blank);}} variant="filled" style={{padding:"6px 13px"}}>+ Novo</Btn>
        </div>
      </div>

      <div style={{display:"flex",background:C.card,borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
        {[{id:"muscular",l:"💪 Muscular"},{id:"esporte",l:"🏅 Esporte"}].map(c => (
          <button key={c.id} onClick={() => {setCat(c.id); setFg("todos");}} style={{flex:1,background:cat===c.id?C.accent+"22":"none",border:"none",borderBottom:`2px solid ${cat===c.id?C.accent:"transparent"}`,color:cat===c.id?C.accent:C.muted,padding:"9px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{c.l}</button>
        ))}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar exercicio..." style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"8px 11px",fontSize:12,boxSizing:"border-box"}} />

      <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:3}}>
        {gList.map(g => {
          const gc = GCOR[g] || C.accent;
          return <button key={g} onClick={() => setFg(g)} style={{background:fg===g?gc+"22":"none",border:`1px solid ${fg===g?gc:C.border}`,color:fg===g?gc:C.muted,borderRadius:6,padding:"3px 9px",fontSize:9,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{g==="todos"?"Todos":g}</button>;
        })}
      </div>

      {showAdd && (
        <CardBox accent={C.accent}>
          <SectionHead icon="+" title="NOVO EXERCICIO" color={C.accent} />
          <div style={{padding:13}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
              {EF.map(f => <Fld key={f.k} label={f.l} value={nf[f.k]} type={f.t} opts={f.opts} onChange={v => setNf(p => ({...p, [f.k]: f.t==="number" ? +v : v}))} style={{gridColumn:f.full?"1/-1":"auto"}} />)}
            </div>
            <div style={{display:"flex",gap:7,marginTop:10}}>
              <Btn onClick={add} variant="filled" style={{flex:1}}>Adicionar</Btn>
              <Btn onClick={() => setShowAdd(false)}>Cancelar</Btn>
            </div>
          </div>
        </CardBox>
      )}

      <div style={{fontSize:10,color:C.muted}}>{filtered.length} exercicio{filtered.length!==1?"s":""}</div>

      {filtered.map(ex => {
        const gc     = GCOR[ex.grupo] || C.blue;
        const isEdit = editId === ex.id;
        return (
          <CardBox key={ex.id} accent={isEdit ? C.accent : undefined}>
            {isEdit ? (
              <div style={{padding:13}}>
                <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2,marginBottom:9}}>EDITAR</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {EF.map(f => <Fld key={f.k} label={f.l} value={ef[f.k]} type={f.t} opts={f.opts} onChange={v => setEf(p => ({...p, [f.k]: f.t==="number" ? +v : v}))} style={{gridColumn:f.full?"1/-1":"auto"}} />)}
                </div>
                <div style={{display:"flex",gap:7,marginTop:10}}>
                  <Btn onClick={save} variant="filled" style={{flex:1}}>Salvar</Btn>
                  <Btn onClick={() => setEditId(null)}>Cancelar</Btn>
                </div>
              </div>
            ) : (
              <div style={{padding:"10px 13px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:7,flex:1,minWidth:0}}>
                  <Badge cor={gc} sm>{ex.grupo}</Badge>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ex.nome}</div>
                    <div style={{fontSize:9,color:C.muted}}>{ex.sp||3}x{ex.reps} · {ex.pausa}s · {ex.cad}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:5,flexShrink:0}}>
                  <button onClick={() => {setEditId(ex.id); setEf({...ex});}} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:5,padding:"3px 8px",fontSize:11,cursor:"pointer"}}>✏</button>
                  <button onClick={() => del(ex.id)} style={{background:"none",border:`1px solid ${C.red}44`,color:C.red,borderRadius:5,padding:"3px 8px",fontSize:11,cursor:"pointer"}}>🗑</button>
                </div>
              </div>
            )}
          </CardBox>
        );
      })}
      {filtered.length === 0 && !showAdd && <div style={{textAlign:"center",padding:28,color:C.muted,fontSize:12}}>Nenhum exercicio nesta categoria.</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ATLETAS LIST
// ═══════════════════════════════════════════════════════════════════════
// ─── SONO TRACKER – Sleep tracking with Oura-style fields ─────────────
function SonoTracker({registrosSono, onUpdate}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const today = new Date().toISOString().slice(0, 10);

  // Sort registros by date desc
  const registros = useMemo(() =>
    [...(registrosSono||[])].sort((a, b) => (b.data || "").localeCompare(a.data || "")),
  [registrosSono]);

  // Stats: average of last 7 days
  const stats7d = useMemo(() => {
    if (!registros.length) return null;
    const last7 = registros.slice(0, 7);
    const avg = (key) => {
      const vals = last7.map(r => r[key]).filter(v => typeof v === "number" && v > 0);
      return vals.length ? +(vals.reduce((s,v)=>s+v,0) / vals.length).toFixed(1) : null;
    };
    return {
      sleepScore:   avg("sleepScore"),
      readiness:    avg("readinessScore"),
      totalSono:    avg("totalSono"),
      eficiencia:   avg("eficiencia"),
      hrv:          avg("hrv"),
      fcRepouso:    avg("fcRepouso"),
      count:        last7.length,
    };
  }, [registros]);

  const handleSave = (registro) => {
    const novo = registro.id ? registros.map(r => r.id === registro.id ? registro : r)
                              : [...registros, {...registro, id:"sn_"+Date.now()}];
    onUpdate(novo);
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = (id) => {
    if (!window.confirm("Excluir este registro de sono?")) return;
    onUpdate(registros.filter(r => r.id !== id));
  };

  const openNew = () => {
    setEditing({
      data: today, sleepScore:null, readinessScore:null,
      totalSono:null, tempoCama:null, latencia:null, eficiencia:null,
      deep:null, rem:null, light:null, acordado:null,
      fcRepouso:null, hrv:null, tempCorporal:null, freqResp:null,
      observacoes:"",
    });
    setShowForm(true);
  };

  const openEdit = (reg) => { setEditing(reg); setShowForm(true); };

  // Last 14 days for chart
  const chartData = useMemo(() => {
    return registros.slice(0, 14).reverse().map(r => ({
      data: r.data ? r.data.slice(5) : "",
      sleep: r.sleepScore || null,
      readiness: r.readinessScore || null,
      sono: r.totalSono || null,
    }));
  }, [registros]);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {/* Header with stats */}
      <CardBox accent={C.purple}>
        <SectionHead icon="😴" title="MONITORAMENTO DO SONO" color={C.purple} sub="Padrão Oura/wearables — registro diário" />
        <div style={{padding:13}}>
          {stats7d ? (
            <>
              <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:6}}>MÉDIAS DOS ÚLTIMOS {stats7d.count} REGISTROS</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:6}}>
                {[
                  {l:"Sleep Score", v: stats7d.sleepScore != null ? Math.round(stats7d.sleepScore) : "—", cls: SLEEP_SCORE_CLASS(stats7d.sleepScore)},
                  {l:"Readiness",   v: stats7d.readiness  != null ? Math.round(stats7d.readiness)  : "—", cls: READINESS_CLASS(stats7d.readiness)},
                  {l:"Sono (h)",    v: stats7d.totalSono  != null ? stats7d.totalSono.toFixed(1) : "—",   cls: {cor: stats7d.totalSono >= 7 ? C.green : stats7d.totalSono >= 6 ? C.orange : C.red, label: stats7d.totalSono >= 7 ? "OK" : "BAIXO"}},
                ].map(s => (
                  <div key={s.l} style={{background:C.bg,borderRadius:7,padding:"8px 5px",textAlign:"center",border:`1px solid ${s.cls.cor}33`}}>
                    <div style={{fontSize:16,fontWeight:900,color:s.cls.cor}}>{s.v}</div>
                    <div style={{fontSize:8,color:C.muted}}>{s.l}</div>
                    <div style={{fontSize:7,color:s.cls.cor,fontWeight:700,marginTop:1}}>{s.cls.label}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                {[
                  {l:"Eficiência %", v: stats7d.eficiencia != null ? Math.round(stats7d.eficiencia) + "%" : "—", c: C.blue},
                  {l:"FC Repouso",   v: stats7d.fcRepouso  != null ? Math.round(stats7d.fcRepouso) + "bpm" : "—", c: C.red},
                  {l:"HRV (ms)",     v: stats7d.hrv        != null ? Math.round(stats7d.hrv) : "—", c: C.green},
                ].map(s => (
                  <div key={s.l} style={{background:C.bg,borderRadius:7,padding:"6px 4px",textAlign:"center"}}>
                    <div style={{fontSize:12,fontWeight:700,color:s.c}}>{s.v}</div>
                    <div style={{fontSize:8,color:C.muted}}>{s.l}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{textAlign:"center",padding:20,color:C.muted}}>
              <div style={{fontSize:30,marginBottom:6}}>😴</div>
              <div style={{fontSize:11}}>Nenhum registro de sono ainda.</div>
              <div style={{fontSize:9,marginTop:3}}>Adicione o primeiro para começar a acompanhar.</div>
            </div>
          )}
        </div>
      </CardBox>

      {/* Chart of last 14 days */}
      {chartData.length >= 3 && (
        <CardBox>
          <SectionHead icon="📈" title="EVOLUÇÃO – ÚLTIMOS 14 DIAS" color={C.purple} />
          <div style={{padding:12}}>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{top:4,right:4,left:-20,bottom:0}}>
                <CartesianGrid strokeDasharray="2 4" stroke={C.border} />
                <XAxis dataKey="data" tick={{fill:C.muted,fontSize:8}} />
                <YAxis tick={{fill:C.muted,fontSize:8}} domain={[0,100]} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{fontSize:10}} />
                <Line type="monotone" dataKey="sleep"     name="Sleep Score" stroke={C.purple} strokeWidth={2} dot={{r:3}} connectNulls />
                <Line type="monotone" dataKey="readiness" name="Readiness"   stroke={C.green}  strokeWidth={2} dot={{r:3}} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardBox>
      )}

      {/* Add new */}
      {!showForm && (
        <button onClick={openNew}
          style={{width:"100%",background:C.purple,color:C.bg,border:"none",borderRadius:9,padding:"11px",fontSize:13,fontWeight:900,cursor:"pointer"}}>
          + Adicionar Registro de Sono
        </button>
      )}

      {/* Form */}
      {showForm && editing && (
        <SonoForm registro={editing} onSave={handleSave} onCancel={() => {setShowForm(false); setEditing(null);}} />
      )}

      {/* History list */}
      {registros.length > 0 && (
        <CardBox>
          <SectionHead icon="📋" title={`HISTÓRICO (${registros.length})`} color={C.muted} />
          <div style={{padding:0,maxHeight:340,overflowY:"auto"}}>
            {registros.map(r => {
              const sleepCls = SLEEP_SCORE_CLASS(r.sleepScore);
              const readyCls = READINESS_CLASS(r.readinessScore);
              return (
                <div key={r.id} style={{borderBottom:`1px solid ${C.border}`,padding:"9px 11px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.text}}>{r.data ? r.data.split("-").reverse().join("/") : "—"}</div>
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={() => openEdit(r)} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:5,padding:"3px 7px",fontSize:9,cursor:"pointer"}}>✏️ Editar</button>
                      <button onClick={() => handleDelete(r.id)} style={{background:"none",border:`1px solid ${C.red}55`,color:C.red,borderRadius:5,padding:"3px 7px",fontSize:9,cursor:"pointer"}}>🗑</button>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {r.sleepScore != null && <Badge cor={sleepCls.cor} sm>💤 {Math.round(r.sleepScore)}</Badge>}
                    {r.readinessScore != null && <Badge cor={readyCls.cor} sm>⚡ {Math.round(r.readinessScore)}</Badge>}
                    {r.totalSono != null && <Badge cor={C.blue} sm>🛌 {r.totalSono.toFixed(1)}h</Badge>}
                    {r.eficiencia != null && <Badge cor={C.teal} sm>📊 {Math.round(r.eficiencia)}%</Badge>}
                    {r.hrv != null && <Badge cor={C.green} sm>HRV {Math.round(r.hrv)}</Badge>}
                    {r.fcRepouso != null && <Badge cor={C.red} sm>FC {Math.round(r.fcRepouso)}</Badge>}
                  </div>
                  {r.observacoes && <div style={{fontSize:10,color:C.muted,marginTop:4,fontStyle:"italic"}}>"{r.observacoes}"</div>}
                </div>
              );
            })}
          </div>
        </CardBox>
      )}

      {/* Reference */}
      <CardBox>
        <SectionHead icon="📖" title="REFERÊNCIA – PARÂMETROS DO SONO" color={C.muted} />
        <div style={{padding:12,fontSize:10,color:C.muted,lineHeight:1.6}}>
          <p style={{marginTop:0}}><strong style={{color:C.purple}}>Sleep Score (0-100):</strong> Score consolidado de qualidade do sono (Oura/Whoop/Garmin). Considera duração, eficiência, profundidade e despertares. ≥85 = ótimo.</p>
          <p><strong style={{color:C.green}}>Readiness Score (0-100):</strong> Prontidão para esforço hoje. Combina sono + HRV + FC repouso + atividade prévia. ≥85 = pronto p/ alta intensidade.</p>
          <p><strong style={{color:C.blue}}>Tempo de Sono Total:</strong> Recomendado para adultos: 7-9h (NSF 2015). Atletas: 8-10h em treinos intensos (Mah et al., 2011).</p>
          <p><strong style={{color:C.teal}}>Eficiência do Sono:</strong> (Tempo dormindo / tempo na cama) × 100. Saudável: ≥85%. Abaixo de 75% = sinal de alerta.</p>
          <p><strong style={{color:C.green}}>HRV (Variabilidade da FC):</strong> Marcador de recuperação autonômica. Tendência crescente = boa adaptação. Queda súbita = sinal de fadiga/overtraining.</p>
          <p style={{marginBottom:0}}><strong style={{color:C.red}}>FC de Repouso noturna:</strong> Tendência crescente por vários dias pode indicar fadiga acumulada, infecção ou desidratação.</p>
        </div>
      </CardBox>
    </div>
  );
}

// Sleep registration form
function SonoForm({registro, onSave, onCancel}) {
  const [r, setR] = useState(registro);

  const upd = (k, v) => setR(p => ({...p, [k]: v}));
  const updNum = (k, v) => upd(k, v === "" ? null : +v);

  const handleSave = () => {
    if (!r.data) {
      alert("Informe a data do registro");
      return;
    }
    // Auto-calculate efficiency if missing but we have sono and cama
    if (r.eficiencia == null && r.totalSono > 0 && r.tempoCama > 0) {
      r.eficiencia = +((r.totalSono / r.tempoCama) * 100).toFixed(1);
    }
    onSave(r);
  };

  const FieldNum = ({k, l, ph, max, sub, color}) => (
    <div>
      <div style={{fontSize:9,color:color||C.muted,letterSpacing:.5,marginBottom:2,fontWeight:700}}>{l}</div>
      <input type="number" value={r[k] ?? ""} onChange={e => updNum(k, e.target.value)}
        placeholder={ph} max={max}
        style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:6,padding:"7px 9px",fontSize:12,boxSizing:"border-box"}}/>
      {sub && <div style={{fontSize:8,color:C.muted,marginTop:2}}>{sub}</div>}
    </div>
  );

  return (
    <CardBox accent={C.purple}>
      <SectionHead icon="😴" title={r.id ? "EDITAR REGISTRO DE SONO" : "NOVO REGISTRO DE SONO"} color={C.purple} sub="Preencha o que tiver disponível – todos os campos são opcionais" />
      <div style={{padding:13,display:"flex",flexDirection:"column",gap:10}}>

        {/* Date */}
        <div>
          <div style={{fontSize:9,color:C.purple,letterSpacing:1,marginBottom:3,fontWeight:700}}>📅 DATA *</div>
          <input type="date" value={r.data || ""} onChange={e => upd("data", e.target.value)}
            style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,padding:"8px 10px",fontSize:12,boxSizing:"border-box"}}/>
        </div>

        {/* Scores */}
        <div>
          <div style={{fontSize:10,color:C.purple,fontWeight:700,marginBottom:5}}>⭐ SCORES PRINCIPAIS</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {FieldNum({k:"sleepScore",     l:"💤 SLEEP SCORE",  ph:"0-100", max:100, color:C.purple})}
            {FieldNum({k:"readinessScore", l:"⚡ READINESS",     ph:"0-100", max:100, color:C.green})}
          </div>
        </div>

        {/* Duration */}
        <div>
          <div style={{fontSize:10,color:C.blue,fontWeight:700,marginBottom:5}}>🛌 DURAÇÃO</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            {FieldNum({k:"totalSono", l:"SONO TOTAL (h)",   ph:"7.5"})}
            {FieldNum({k:"tempoCama", l:"NA CAMA (h)",       ph:"8.0"})}
            {FieldNum({k:"latencia",  l:"LATÊNCIA (min)",    ph:"15", sub:"para adormecer"})}
          </div>
          <div style={{marginTop:6}}>
            {FieldNum({k:"eficiencia", l:"EFICIÊNCIA DO SONO (%)", ph:"auto-calculado se vazio", max:100})}
          </div>
        </div>

        {/* Stages */}
        <div>
          <div style={{fontSize:10,color:C.teal,fontWeight:700,marginBottom:5}}>🌙 ESTÁGIOS DO SONO (h)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:5}}>
            {FieldNum({k:"deep",    l:"PROFUNDO",  ph:"1.5"})}
            {FieldNum({k:"rem",     l:"REM",        ph:"1.8"})}
            {FieldNum({k:"light",   l:"LEVE",       ph:"4.0"})}
            {FieldNum({k:"acordado",l:"ACORDADO",   ph:"0.3"})}
          </div>
        </div>

        {/* Physiological */}
        <div>
          <div style={{fontSize:10,color:C.red,fontWeight:700,marginBottom:5}}>❤️ DADOS FISIOLÓGICOS</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:6}}>
            {FieldNum({k:"fcRepouso", l:"FC REPOUSO (bpm)", ph:"55"})}
            {FieldNum({k:"hrv",        l:"HRV MÉDIO (ms)",   ph:"45"})}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {FieldNum({k:"tempCorporal", l:"TEMP. CORPORAL (Δ°C)", ph:"+0.2", sub:"variação da baseline"})}
            {FieldNum({k:"freqResp",     l:"FREQ. RESPIRATÓRIA",   ph:"14"})}
          </div>
        </div>

        {/* Notes */}
        <div>
          <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:3,fontWeight:700}}>📝 OBSERVAÇÕES</div>
          <textarea value={r.observacoes || ""} onChange={e => upd("observacoes", e.target.value)}
            placeholder="Como se sentiu ao acordar? Tomou cafeína? Estresse? Ingestão noturna?"
            rows={2}
            style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,padding:"7px 9px",fontSize:11,boxSizing:"border-box",resize:"vertical",fontFamily:"inherit"}}/>
        </div>

        {/* Actions */}
        <div style={{display:"flex",gap:7}}>
          <button onClick={onCancel} style={{flex:1,background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:7,padding:"10px",fontSize:12,cursor:"pointer"}}>Cancelar</button>
          <button onClick={handleSave} style={{flex:2,background:C.purple,color:C.bg,border:"none",borderRadius:7,padding:"10px",fontSize:12,fontWeight:900,cursor:"pointer"}}>💾 Salvar Registro</button>
        </div>
      </div>
    </CardBox>
  );
}

function AtletasList({atletas, setAtletas, activeAt, setActiveAt, atletaData, setAD, today}) {
  const [editId, setEditId]   = useState(null);
  const [form,   setForm]     = useState({});
  const [editTab,setEditTab]  = useState("fisico"); // fisico | mental

  // Dados físicos e perfil
  const FIELDS_FISICO = [
    {k:"nome",      l:"Nome Completo",    t:"text",   full:true},
    {k:"dataNasc",  l:"Data Nascimento",  t:"date"},
    {k:"peso",      l:"Peso (kg)",         t:"number"},
    {k:"altura",    l:"Altura (cm)",       t:"number"},
    {k:"fcMax",     l:"FC Max (bpm)",      t:"number"},
    {k:"fcRepouso", l:"FC Repouso (bpm)",  t:"number"},
    {k:"objetivo",  l:"Objetivo",          t:"select", opts:["Hipertrofia","Força","Emagrecimento","Definição","Condicionamento","Saúde","Performance","Reabilitação","Esportivo"]},
    {k:"nivel",     l:"Nível",             t:"select", opts:["Iniciante","Intermediário","Avançado","Atleta Amador","Atleta Profissional"]},
    {k:"esporte",   l:"Esporte",           t:"select", opts:["Musculação Funcional",...GRUPOS_E,"Outro"]},
  ];

  const save = () => { setAtletas(p => p.map(a => a.id === form.id ? form : a)); setEditId(null); };
  const del  = id => {
    setAtletas(p => p.filter(a => a.id !== id));
    setAD(p => { const n = {...p}; delete n[id]; return n; });
    if (activeAt === id) { const rem = atletas.filter(a => a.id !== id); if (rem.length) setActiveAt(rem[0].id); }
  };
  const addA = () => {
    const id = uid();
    const a  = {id, nome:"Novo Atleta", dataNasc:"", peso:70, altura:170, fcMax:190, fcRepouso:60, objetivo:"Hipertrofia", nivel:"Iniciante", esporte:"Musculação Funcional",
      humor:null, sono:null, estresse:null, fadiga:null, motivacao:null, ansiedadeTreino:null, horasSono:null, notasMentais:"", historicoClinico:"", registrosSono:[]};
    setAtletas(p => [...p, a]);
    setAD(p => ({...p, [id]: makeDefaultData(today)}));
    setEditId(id); setForm(a); setEditTab("fisico");
  };

  // Hooper score helper
  const hooperTotal = (a) => {
    const vals = [a.humor, a.sono, a.estresse, a.fadiga].filter(v => typeof v === "number");
    return vals.length === 4 ? vals.reduce((s,v)=>s+v,0) : null;
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:16,fontWeight:900,color:C.accent}}>👥 ATLETAS ({atletas.length})</div>
        <Btn onClick={addA} variant="filled" style={{padding:"6px 13px"}}>+ Novo</Btn>
      </div>

      {atletas.map(a => {
        const imc      = a.peso && a.altura ? (a.peso / Math.pow(a.altura/100, 2)).toFixed(1) : null;
        const imcC     = !imc ? C.muted : +imc<18.5?C.blue:+imc<25?C.green:+imc<30?C.orange:C.red;
        const isAct    = a.id === activeAt;
        const isEdit   = editId === a.id;
        const ecor     = GCOR[a.esporte] || C.muted;
        const hoopTot  = hooperTotal(a);
        const hoopCls  = HOOPER_CLASSIF(hoopTot);

        return (
          <CardBox key={a.id} accent={isAct?C.accent:isEdit?C.blue:undefined}>
            {isEdit ? (
              <div style={{padding:14}}>
                <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2,marginBottom:10}}>EDITAR ATLETA</div>

                {/* Tabs Físico / Mental / Sono */}
                <div style={{display:"flex",background:C.bg,borderRadius:7,overflow:"hidden",border:`1px solid ${C.border}`,marginBottom:12}}>
                  {[{id:"fisico",l:"🏋 Físicos"},{id:"mental",l:"🧠 Mental"},{id:"sono",l:"😴 Sono"}].map(t => (
                    <button key={t.id} onClick={() => setEditTab(t.id)} style={{flex:1,border:"none",background:editTab===t.id?C.accent+"22":"none",borderBottom:`2px solid ${editTab===t.id?C.accent:"transparent"}`,color:editTab===t.id?C.accent:C.muted,padding:"8px 4px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{t.l}</button>
                  ))}
                </div>

                {/* TAB: Dados Físicos */}
                {editTab === "fisico" && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
                    {FIELDS_FISICO.map(f => <Fld key={f.k} label={f.l} value={form[f.k]} type={f.t} opts={f.opts} onChange={v => setForm(p => ({...p, [f.k]: f.t==="number" ? (v===""?null:+v) : v}))} style={{gridColumn:f.full?"1/-1":"auto"}} />)}
                  </div>
                )}

                {/* TAB: Saúde Mental */}
                {editTab === "mental" && (
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {/* Hooper Index header */}
                    <div style={{background:C.bg,border:`1px solid ${C.accent}44`,borderRadius:9,padding:11}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                        <div style={{fontSize:11,fontWeight:900,color:C.accent}}>🧠 ÍNDICE DE HOOPER</div>
                        {(() => {
                          const vals = [form.humor, form.sono, form.estresse, form.fadiga].filter(v => typeof v === "number");
                          const tot  = vals.length === 4 ? vals.reduce((s,v)=>s+v,0) : null;
                          const cls  = HOOPER_CLASSIF(tot);
                          return tot != null ? (
                            <div style={{display:"flex",alignItems:"center",gap:5}}>
                              <span style={{fontSize:14,fontWeight:900,color:cls.c}}>{tot}/28</span>
                              <Badge cor={cls.c} sm>{cls.l}</Badge>
                            </div>
                          ) : <span style={{fontSize:10,color:C.muted}}>Preencha os 4</span>;
                        })()}
                      </div>
                      <div style={{fontSize:10,color:C.muted}}>Hooper & Mackinnon (1995). Monitora sinais precoces de overtraining.</div>
                    </div>

                    {/* 4 dimensões do Hooper */}
                    {HOOPER_DIMS.map(d => {
                      const val = form[d.k];
                      return (
                        <div key={d.k} style={{background:C.bg,borderRadius:9,padding:10,border:`1px solid ${C.border}`}}>
                          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                            <span style={{fontSize:15}}>{d.icon}</span>
                            <div style={{flex:1}}>
                              <div style={{fontSize:11,fontWeight:700,color:C.text}}>{d.l}</div>
                              <div style={{fontSize:9,color:C.muted}}>{d.desc}</div>
                            </div>
                            {val != null && <Badge cor={d.cor} sm>{val}/7</Badge>}
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:3}}>
                            {[1,2,3,4,5,6,7].map(n => {
                              const sel = val === n;
                              return (
                                <button key={n} onClick={() => setForm(p => ({...p, [d.k]: sel ? null : n}))}
                                  style={{aspectRatio:"1",borderRadius:6,border:`2px solid ${sel?d.cor:C.border}`,background:sel?d.cor+"33":"none",color:sel?d.cor:C.muted,fontSize:12,fontWeight:sel?900:400,cursor:"pointer"}}>{n}</button>
                              );
                            })}
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:C.muted}}>
                            <span>1 · {d.baixo}</span>
                            <span>{d.alto} · 7</span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Horas de sono */}
                    <div style={{background:C.bg,borderRadius:9,padding:10,border:`1px solid ${C.border}`}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:5}}>⏰ Horas de Sono (última noite)</div>
                      <input type="number" value={form.horasSono ?? ""} step="0.5"
                        onChange={e => setForm(p => ({...p, horasSono: e.target.value===""?null:+e.target.value}))}
                        placeholder="ex: 7.5"
                        style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,padding:"7px 9px",fontSize:12,boxSizing:"border-box"}}/>
                      <div style={{fontSize:9,color:C.muted,marginTop:4}}>Recomendado para atletas: 7-9h (Walker, 2017)</div>
                    </div>

                    {/* Motivação */}
                    <div style={{background:C.bg,borderRadius:9,padding:10,border:`1px solid ${C.border}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                        <span style={{fontSize:14}}>🔥</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.text}}>Motivação para Treinar</div>
                          <div style={{fontSize:9,color:C.muted}}>Quanto você está motivado hoje?</div>
                        </div>
                        {form.motivacao != null && <Badge cor={C.green} sm>{form.motivacao}/10</Badge>}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(10,1fr)",gap:3}}>
                        {[1,2,3,4,5,6,7,8,9,10].map(n => {
                          const sel = form.motivacao === n;
                          const col = n <= 3 ? C.red : n <= 6 ? C.orange : C.green;
                          return (
                            <button key={n} onClick={() => setForm(p => ({...p, motivacao: sel ? null : n}))}
                              style={{aspectRatio:"1",borderRadius:6,border:`2px solid ${sel?col:C.border}`,background:sel?col+"33":"none",color:sel?col:C.muted,fontSize:11,fontWeight:sel?900:400,cursor:"pointer"}}>{n}</button>
                          );
                        })}
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:C.muted,marginTop:3}}>
                        <span>1 · Sem vontade</span>
                        <span>Muito motivado · 10</span>
                      </div>
                    </div>

                    {/* Ansiedade pré-treino */}
                    <div style={{background:C.bg,borderRadius:9,padding:10,border:`1px solid ${C.border}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                        <span style={{fontSize:14}}>😰</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.text}}>Ansiedade Pré-Treino</div>
                          <div style={{fontSize:9,color:C.muted}}>Nível de ansiedade/preocupação</div>
                        </div>
                        {form.ansiedadeTreino != null && <Badge cor={C.orange} sm>{form.ansiedadeTreino}/10</Badge>}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(10,1fr)",gap:3}}>
                        {[1,2,3,4,5,6,7,8,9,10].map(n => {
                          const sel = form.ansiedadeTreino === n;
                          const col = n <= 3 ? C.green : n <= 6 ? C.orange : C.red;
                          return (
                            <button key={n} onClick={() => setForm(p => ({...p, ansiedadeTreino: sel ? null : n}))}
                              style={{aspectRatio:"1",borderRadius:6,border:`2px solid ${sel?col:C.border}`,background:sel?col+"33":"none",color:sel?col:C.muted,fontSize:11,fontWeight:sel?900:400,cursor:"pointer"}}>{n}</button>
                          );
                        })}
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:C.muted,marginTop:3}}>
                        <span>1 · Tranquilo</span>
                        <span>Muito ansioso · 10</span>
                      </div>
                    </div>

                    {/* Notas mentais / observações */}
                    <div>
                      <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:3}}>📝 OBSERVAÇÕES DE SAÚDE MENTAL</div>
                      <textarea value={form.notasMentais || ""}
                        onChange={e => setForm(p => ({...p, notasMentais: e.target.value}))}
                        rows={3}
                        placeholder="Sentimentos, preocupações, pressão competitiva, vida pessoal, eventos recentes..."
                        style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,padding:"7px 9px",fontSize:12,boxSizing:"border-box",resize:"vertical"}}/>
                    </div>

                    {/* Histórico clínico */}
                    <div>
                      <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:3}}>🏥 HISTÓRICO CLÍNICO / ANTECEDENTES</div>
                      <textarea value={form.historicoClinico || ""}
                        onChange={e => setForm(p => ({...p, historicoClinico: e.target.value}))}
                        rows={3}
                        placeholder="Condições médicas, medicações em uso, histórico de burnout, lesões com impacto emocional..."
                        style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,padding:"7px 9px",fontSize:12,boxSizing:"border-box",resize:"vertical"}}/>
                    </div>

                    {/* Acompanhamento psicológico – campos estruturados */}
                    <div style={{background:C.bg,borderRadius:9,padding:11,border:`1px solid ${C.purple}44`}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.purple,marginBottom:8}}>🧑‍⚕️ ACOMPANHAMENTO PSICOLÓGICO</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <div>
                          <div style={{fontSize:9,color:C.muted,letterSpacing:.5,marginBottom:3}}>FAZ ACOMPANHAMENTO?</div>
                          <select value={form.acompanhaPsi||"nao"}
                            onChange={e => setForm(p => ({...p, acompanhaPsi: e.target.value}))}
                            style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:6,padding:"6px 8px",fontSize:12,boxSizing:"border-box"}}>
                            <option value="nao">Não</option>
                            <option value="sim">Sim, regular</option>
                            <option value="esporadico">Sim, esporádico</option>
                            <option value="iniciando">Iniciando</option>
                            <option value="passado">Já fez no passado</option>
                          </select>
                        </div>
                        <div>
                          <div style={{fontSize:9,color:C.muted,letterSpacing:.5,marginBottom:3}}>TIPO DE PROFISSIONAL</div>
                          <select value={form.tipoProfPsi||""}
                            onChange={e => setForm(p => ({...p, tipoProfPsi: e.target.value}))}
                            style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:6,padding:"6px 8px",fontSize:12,boxSizing:"border-box"}}>
                            <option value="">—</option>
                            <option value="Psicólogo">Psicólogo</option>
                            <option value="Psicólogo Esportivo">Psicólogo Esportivo</option>
                            <option value="Psiquiatra">Psiquiatra</option>
                            <option value="Terapeuta">Terapeuta</option>
                            <option value="Coach">Coach</option>
                            <option value="Outro">Outro</option>
                          </select>
                        </div>
                        <div>
                          <div style={{fontSize:9,color:C.muted,letterSpacing:.5,marginBottom:3}}>NOME DO PROFISSIONAL</div>
                          <input type="text" value={form.nomeProfPsi||""}
                            onChange={e => setForm(p => ({...p, nomeProfPsi: e.target.value}))}
                            placeholder="Ex: Dra. Ana Silva"
                            style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:6,padding:"6px 8px",fontSize:12,boxSizing:"border-box"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:9,color:C.muted,letterSpacing:.5,marginBottom:3}}>FREQUÊNCIA</div>
                          <select value={form.freqPsi||""}
                            onChange={e => setForm(p => ({...p, freqPsi: e.target.value}))}
                            style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:6,padding:"6px 8px",fontSize:12,boxSizing:"border-box"}}>
                            <option value="">—</option>
                            <option value="Semanal">Semanal</option>
                            <option value="Quinzenal">Quinzenal</option>
                            <option value="Mensal">Mensal</option>
                            <option value="Esporádica">Esporádica</option>
                          </select>
                        </div>
                        <div style={{gridColumn:"1/-1"}}>
                          <div style={{fontSize:9,color:C.muted,letterSpacing:.5,marginBottom:3}}>DIAGNÓSTICOS / QUESTÕES TRABALHADAS</div>
                          <textarea value={form.diagnosticosPsi||""}
                            onChange={e => setForm(p => ({...p, diagnosticosPsi: e.target.value}))}
                            rows={2}
                            placeholder="Ansiedade, depressão, TOC, burnout esportivo, transtornos alimentares..."
                            style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:6,padding:"6px 8px",fontSize:12,boxSizing:"border-box",resize:"vertical"}}/>
                        </div>
                        <div style={{gridColumn:"1/-1"}}>
                          <div style={{fontSize:9,color:C.muted,letterSpacing:.5,marginBottom:3}}>MEDICAÇÃO PSIQUIÁTRICA (se aplicável)</div>
                          <textarea value={form.medicacaoPsi||""}
                            onChange={e => setForm(p => ({...p, medicacaoPsi: e.target.value}))}
                            rows={2}
                            placeholder="Nome do medicamento, dose, horário, duração..."
                            style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,color:C.text,borderRadius:6,padding:"6px 8px",fontSize:12,boxSizing:"border-box",resize:"vertical"}}/>
                        </div>
                      </div>
                      <div style={{fontSize:9,color:C.muted,marginTop:7,fontStyle:"italic",lineHeight:1.4}}>
                        🔐 Estas informações são confidenciais e ficam armazenadas apenas neste dispositivo. Compartilhe apenas com profissionais autorizados pelo atleta.
                      </div>
                    </div>

                    {/* Save snapshot button */}
                    <button
                      onClick={() => {
                        const snap = {
                          id: uid(),
                          data: today,
                          humor: form.humor, sono: form.sono, estresse: form.estresse, fadiga: form.fadiga,
                          horasSono: form.horasSono, motivacao: form.motivacao, ansiedadeTreino: form.ansiedadeTreino,
                          hooper: [form.humor, form.sono, form.estresse, form.fadiga].filter(v => typeof v === "number").length === 4
                            ? [form.humor, form.sono, form.estresse, form.fadiga].reduce((s,v)=>s+v,0) : null,
                          notas: form.notasMentais || "",
                        };
                        setForm(p => ({...p, historicoRegistros: [...(p.historicoRegistros||[]), snap]}));
                      }}
                      style={{background:C.teal+"22",border:`1px solid ${C.teal}`,color:C.teal,borderRadius:7,padding:"8px",fontSize:11,fontWeight:700,cursor:"pointer",width:"100%"}}>
                      📸 Salvar Snapshot de Hoje no Histórico
                    </button>

                    {/* Histórico de registros */}
                    {form.historicoRegistros && form.historicoRegistros.length > 0 && (
                      <div style={{background:C.bg,borderRadius:9,padding:11,border:`1px solid ${C.border}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.accent}}>📊 HISTÓRICO DE REGISTROS ({form.historicoRegistros.length})</div>
                        </div>
                        <div style={{maxHeight:240,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
                          {form.historicoRegistros.slice().reverse().slice(0, 15).map(r => {
                            const cls = HOOPER_CLASSIF(r.hooper);
                            return (
                              <div key={r.id} style={{background:C.card,borderRadius:6,padding:"7px 9px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
                                <div style={{flexShrink:0,fontSize:10,color:C.muted,fontWeight:700,minWidth:62}}>{fmtDate(r.data)}</div>
                                <div style={{flex:1,display:"flex",gap:4,flexWrap:"wrap"}}>
                                  {r.hooper != null && <Badge cor={cls.c} sm>H {r.hooper}/28</Badge>}
                                  {r.motivacao != null && <Badge cor={C.green} sm>M {r.motivacao}</Badge>}
                                  {r.ansiedadeTreino != null && <Badge cor={C.orange} sm>A {r.ansiedadeTreino}</Badge>}
                                  {r.horasSono != null && <Badge cor={C.blue} sm>{r.horasSono}h</Badge>}
                                </div>
                                <button onClick={() => setForm(p => ({...p, historicoRegistros: (p.historicoRegistros||[]).filter(x => x.id !== r.id)}))}
                                  style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11}}>✕</button>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{fontSize:9,color:C.muted,marginTop:6,fontStyle:"italic"}}>
                          💡 Registre snapshots semanalmente para monitorar tendências de bem-estar e identificar padrões.
                        </div>
                      </div>
                    )}

                    {/* Educational card */}
                    <div style={{background:C.teal+"14",border:`1px solid ${C.teal}44`,borderRadius:8,padding:10}}>
                      <div style={{fontSize:10,color:C.teal,fontWeight:700,marginBottom:5}}>💡 INTERPRETAÇÃO DO ÍNDICE DE HOOPER</div>
                      <div style={{fontSize:10,color:C.muted,lineHeight:1.5}}>
                        <div>• <strong style={{color:C.green}}>&lt; 15:</strong> Ótimo estado – prosseguir com treino planejado</div>
                        <div>• <strong style={{color:C.accent}}>15-20:</strong> Adequado – manter monitoramento</div>
                        <div>• <strong style={{color:C.orange}}>21-24:</strong> Monitorar – considerar redução de carga</div>
                        <div>• <strong style={{color:C.red}}>&gt; 24:</strong> Alto risco – deload ou dia de descanso</div>
                      </div>
                      <div style={{fontSize:9,color:C.muted,marginTop:6,fontStyle:"italic"}}>
                        Esta ferramenta é complementar. Para sinais persistentes de sofrimento psicológico, procure um profissional de saúde mental.
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB: Sono */}
                {editTab === "sono" && (
                  <SonoTracker
                    registrosSono={form.registrosSono || []}
                    onUpdate={novoArr => setForm(p => ({...p, registrosSono: novoArr}))}
                  />
                )}

                <div style={{display:"flex",gap:7,marginTop:13}}>
                  <Btn onClick={save} variant="filled" style={{flex:1}}>Salvar</Btn>
                  <Btn onClick={() => setEditId(null)}>Cancelar</Btn>
                </div>
              </div>
            ) : (
              <div style={{padding:13}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}>
                  <div style={{width:42,height:42,background:isAct?C.accent+"22":C.surface,border:`2px solid ${isAct?C.accent:C.border}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👤</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:900,fontSize:14,color:isAct?C.accent:C.text}}>{a.nome}</div>
                    <div style={{fontSize:10,color:C.muted,display:"flex",gap:5,flexWrap:"wrap",marginTop:2}}>
                      <span>{a.objetivo}</span><span>·</span><span>{a.nivel}</span>
                      {a.esporte && <><span>·</span><span style={{color:ecor}}>{a.esporte}</span></>}
                    </div>
                  </div>
                  {isAct && <Badge cor={C.accent}>ATIVO</Badge>}
                </div>

                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:9}}>
                  {[
                    {l:"Peso",  v:a.peso?a.peso+"kg":"—",    c:C.blue},
                    {l:"Altura",v:a.altura?a.altura+"cm":"—",c:C.purple},
                    {l:"IMC",   v:imc||"—",                  c:imcC},
                    {l:"FCmax", v:a.fcMax?a.fcMax+"bpm":"—", c:C.red},
                  ].map(s => (
                    <div key={s.l} style={{background:C.bg,borderRadius:7,padding:"6px",textAlign:"center"}}>
                      <div style={{fontSize:13,fontWeight:900,color:s.c}}>{s.v}</div>
                      <div style={{fontSize:8,color:C.muted}}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Mental health indicator */}
                {hoopTot != null && (
                  <div style={{background:C.bg,border:`1px solid ${hoopCls.c}44`,borderRadius:7,padding:"7px 9px",marginBottom:9,display:"flex",alignItems:"center",gap:7}}>
                    <span style={{fontSize:13}}>🧠</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:10,color:C.muted,letterSpacing:.5}}>ÍNDICE DE HOOPER</div>
                      <div style={{fontSize:11,fontWeight:700,color:hoopCls.c}}>{hoopTot}/28 · {hoopCls.l}</div>
                    </div>
                    {a.motivacao != null   && <Badge cor={C.green}  sm>Mot {a.motivacao}</Badge>}
                    {a.horasSono != null   && <Badge cor={C.blue}   sm>{a.horasSono}h</Badge>}
                  </div>
                )}

                <div style={{display:"flex",gap:7}}>
                  {!isAct && <button onClick={() => setActiveAt(a.id)} style={{flex:1,background:"none",border:`1px solid ${C.accent}`,color:C.accent,borderRadius:7,padding:"7px",fontWeight:700,fontSize:11,cursor:"pointer"}}>Selecionar</button>}
                  <button onClick={() => {setEditId(a.id); setForm({...a}); setEditTab("fisico");}} style={{flex:1,background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:7,padding:"7px",fontSize:11,cursor:"pointer"}}>✏ Editar</button>
                  {atletas.length > 1 && <button onClick={() => del(a.id)} style={{background:"none",border:`1px solid ${C.red}44`,color:C.red,borderRadius:7,padding:"7px 10px",fontSize:11,cursor:"pointer"}}>🗑</button>}
                </div>
              </div>
            )}
          </CardBox>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// BACKUP VIEW – Export/Import JSON for cross-device sync
// ═══════════════════════════════════════════════════════════════════════
function BackupView({atletas, atletaData, saveStatus, cloudStatus, lastSyncAt, session, offlineMode, onExport, onImport, onReset, onLogout, onExitOffline, onSyncNow}) {
  const fileInputRef = useRef(null);
  const [importStatus, setImportStatus] = useState(null); // null | "success" | "error"
  const userEmail = session?.user?.email;
  const userId = session?.user?.id;

  const totalAtletas  = atletas.length;
  const totalSemanas  = Object.values(atletaData).reduce((s, d) => s + (d?.macro?.length || 0), 0);
  const totalTreinos  = Object.values(atletaData).reduce((s, d) => {
    let c = 0;
    (d?.macro || []).forEach(w => {
      Object.values(w.dias || {}).forEach(dia => {
        c += (dia.treinos || []).length;
      });
    });
    return s + c;
  }, 0);
  const totalExerc    = Object.values(atletaData).reduce((s, d) => s + (d?.exercicios?.length || 0), 0);

  // Estimate storage size
  const sizeKb = useMemo(() => {
    try {
      const str = JSON.stringify({atletas, atletaData});
      return (str.length / 1024).toFixed(1);
    } catch { return "?"; }
  }, [atletas, atletaData]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = await onImport(file);
    setImportStatus(ok ? "success" : "error");
    setTimeout(() => setImportStatus(null), 4000);
    e.target.value = ""; // reset input
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:16,fontWeight:900,color:C.accent}}>💾 BACKUP & SINCRONIZAÇÃO</div>

      {/* ACCOUNT + CLOUD SYNC SECTION */}
      {userId ? (
        // Logged-in user card
        <CardBox accent={cloudStatus === "synced" ? C.green : cloudStatus === "error" ? C.red : C.orange}>
          <SectionHead icon="☁" title="CONTA NA NUVEM" color={cloudStatus === "synced" ? C.green : C.accent} sub="Dados sincronizados automaticamente entre aparelhos" />
          <div style={{padding:13}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:11}}>
              <div style={{width:44,height:44,background:C.accent+"22",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
                👤
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:900,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{userEmail}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>
                  {cloudStatus === "synced" && lastSyncAt ? `✓ Sincronizado às ${new Date(lastSyncAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}` :
                   cloudStatus === "syncing" ? "⟳ Sincronizando..." :
                   cloudStatus === "offline" ? "📴 Sem conexão — dados salvos localmente" :
                   cloudStatus === "error" ? "⚠ Erro ao sincronizar" :
                   "Aguardando..."}
                </div>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:10}}>
              <button onClick={onSyncNow}
                disabled={cloudStatus === "syncing"}
                style={{background:C.accent+"22",border:`1px solid ${C.accent}`,color:C.accent,borderRadius:7,padding:"9px",fontSize:11,fontWeight:700,cursor:cloudStatus==="syncing"?"wait":"pointer",opacity:cloudStatus==="syncing"?.6:1}}>
                ⟳ Sincronizar Agora
              </button>
              <button onClick={onLogout}
                style={{background:"none",border:`1px solid ${C.red}55`,color:C.red,borderRadius:7,padding:"9px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                🚪 Sair da Conta
              </button>
            </div>

            <div style={{background:C.bg,borderRadius:7,padding:"9px 11px",fontSize:10,color:C.muted,lineHeight:1.5}}>
              💡 <strong style={{color:C.green}}>Como funciona:</strong> qualquer mudança que você faz é salva localmente E enviada para a nuvem em ~2 segundos. Ao abrir em outro aparelho logado com esta conta, os dados já estarão lá.
            </div>
          </div>
        </CardBox>
      ) : (
        // Offline mode card
        <CardBox accent={C.orange}>
          <SectionHead icon="📴" title="MODO LOCAL (SEM CONTA)" color={C.orange} sub="Dados ficam apenas neste aparelho" />
          <div style={{padding:13}}>
            <div style={{fontSize:11,color:C.muted,lineHeight:1.5,marginBottom:11}}>
              Você está usando o app sem conta. Isso significa:
              <ul style={{margin:"6px 0 0",paddingLeft:18}}>
                <li>✅ Funciona totalmente offline</li>
                <li>⚠️ Dados ficam só neste aparelho</li>
                <li>⚠️ Não sincroniza entre iPhone, iPad e MacBook</li>
                <li>⚠️ Se limpar dados do Safari, perde tudo</li>
              </ul>
            </div>
            <button onClick={onExitOffline}
              style={{width:"100%",background:C.accent,color:C.bg,border:"none",borderRadius:7,padding:"11px",fontSize:12,fontWeight:900,cursor:"pointer"}}>
              🔐 Criar Conta / Entrar (sincronizar entre aparelhos)
            </button>
            <div style={{fontSize:9,color:C.muted,marginTop:7,textAlign:"center",lineHeight:1.4}}>
              Seus dados atuais serão preservados e sincronizados com sua conta.
            </div>
          </div>
        </CardBox>
      )}

      {/* Status */}
      <CardBox accent={saveStatus === "saved" ? C.green : C.orange}>
        <div style={{padding:13}}>
          <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:9}}>
            <div style={{width:40,height:40,background:(saveStatus==="saved"?C.green:C.orange)+"22",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>
              {saveStatus === "saved" ? "✓" : "●"}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:900,color:saveStatus==="saved"?C.green:C.orange}}>
                {saveStatus === "saved" ? "Dados locais salvos" : "Salvando localmente..."}
              </div>
              <div style={{fontSize:10,color:C.muted}}>
                Cópia local sempre funciona, mesmo sem internet.
              </div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
            {[
              {l:"Atletas",   v:totalAtletas,  c:C.accent},
              {l:"Semanas",   v:totalSemanas,  c:C.blue},
              {l:"Treinos",   v:totalTreinos,  c:C.green},
              {l:"Tamanho",   v:sizeKb+"kb",   c:C.purple},
            ].map(s => (
              <div key={s.l} style={{background:C.bg,borderRadius:7,padding:"7px 5px",textAlign:"center"}}>
                <div style={{fontSize:13,fontWeight:900,color:s.c}}>{s.v}</div>
                <div style={{fontSize:8,color:C.muted}}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </CardBox>

      {/* Export */}
      <CardBox>
        <SectionHead icon="📤" title="EXPORTAR BACKUP" color={C.accent} sub="Baixar arquivo JSON com todos os seus dados" />
        <div style={{padding:13}}>
          <div style={{fontSize:11,color:C.muted,lineHeight:1.5,marginBottom:11}}>
            Gera um arquivo <code style={{background:C.bg,padding:"1px 5px",borderRadius:3,color:C.accent}}>periodizapro-backup-[data].json</code> contendo todos atletas, macrociclos, mesociclos, treinos, exercícios e registros. Use este arquivo para:
            <ul style={{margin:"6px 0 0",paddingLeft:18,color:C.muted}}>
              <li>Transferir dados entre iPhone, iPad e MacBook</li>
              <li>Manter uma cópia de segurança na iCloud, Dropbox ou Google Drive</li>
              <li>Restaurar após trocar de aparelho</li>
            </ul>
          </div>
          <Btn onClick={onExport} variant="filled" style={{width:"100%",padding:"11px",fontSize:13}}>
            📤 Exportar Backup Agora
          </Btn>
        </div>
      </CardBox>

      {/* Import */}
      <CardBox>
        <SectionHead icon="📥" title="IMPORTAR BACKUP" color={C.blue} sub="Restaurar dados de um arquivo JSON exportado" />
        <div style={{padding:13}}>
          <div style={{fontSize:11,color:C.muted,lineHeight:1.5,marginBottom:11}}>
            ⚠️ <strong style={{color:C.orange}}>Atenção:</strong> importar um backup vai <strong>substituir</strong> todos os dados atuais. Exporte o estado atual primeiro se quiser guardá-lo.
          </div>
          <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleFileSelect} style={{display:"none"}} />
          <Btn onClick={() => fileInputRef.current?.click()} variant="outline" color={C.blue} style={{width:"100%",padding:"11px",fontSize:13}}>
            📥 Escolher Arquivo de Backup
          </Btn>
          {importStatus === "success" && (
            <div style={{marginTop:9,background:C.green+"22",border:`1px solid ${C.green}55`,borderRadius:7,padding:"8px 11px",color:C.green,fontSize:11,fontWeight:700}}>
              ✓ Backup importado com sucesso!
            </div>
          )}
          {importStatus === "error" && (
            <div style={{marginTop:9,background:C.red+"22",border:`1px solid ${C.red}55`,borderRadius:7,padding:"8px 11px",color:C.red,fontSize:11,fontWeight:700}}>
              ✕ Erro ao importar. Verifique o arquivo.
            </div>
          )}
        </div>
      </CardBox>

      {/* Sync guide */}
      <CardBox>
        <SectionHead icon="🔄" title="COMO SINCRONIZAR ENTRE APARELHOS" color={C.teal} />
        <div style={{padding:13,fontSize:11,color:C.muted,lineHeight:1.6}}>
          <div style={{marginBottom:9}}>
            <strong style={{color:C.text}}>iPhone ↔ iPad ↔ MacBook (Apple)</strong>
          </div>
          {[
            {n:1,t:"No aparelho de origem",d:"Toque em 📤 Exportar Backup. O arquivo será salvo nos Downloads ou Arquivos."},
            {n:2,t:"Transfira o arquivo",d:"Use AirDrop para enviar instantaneamente entre seus aparelhos Apple. Ou salve no iCloud Drive para acessar em todos."},
            {n:3,t:"No aparelho de destino",d:"Abra o app, vá em Backup, toque em 📥 Importar e selecione o arquivo."},
          ].map(s => (
            <div key={s.n} style={{display:"flex",gap:9,marginBottom:7}}>
              <div style={{flexShrink:0,width:22,height:22,background:C.teal+"22",border:`1px solid ${C.teal}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",color:C.teal,fontSize:11,fontWeight:900}}>{s.n}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:C.text}}>{s.t}</div>
                <div style={{fontSize:10,color:C.muted}}>{s.d}</div>
              </div>
            </div>
          ))}
          <div style={{marginTop:10,padding:9,background:C.accent+"14",border:`1px solid ${C.accent}44`,borderRadius:7}}>
            <div style={{fontSize:10,color:C.accent,fontWeight:700,marginBottom:3}}>💡 DICA PROFISSIONAL</div>
            <div style={{fontSize:10,color:C.muted}}>
              Exporte um backup semanalmente (ex: toda sexta) e salve no iCloud Drive. Assim você tem versões históricas dos seus treinos e pode voltar a qualquer momento.
            </div>
          </div>
        </div>
      </CardBox>

      {/* About storage */}
      <CardBox>
        <SectionHead icon="🔐" title="SOBRE O ARMAZENAMENTO" color={C.muted} />
        <div style={{padding:13,fontSize:11,color:C.muted,lineHeight:1.6}}>
          <p style={{margin:"0 0 7px"}}>✅ <strong style={{color:C.green}}>100% local:</strong> nenhum dado sai do seu aparelho. Não há servidor, não há coleta, não há nuvem automática.</p>
          <p style={{margin:"0 0 7px"}}>✅ <strong style={{color:C.green}}>Funciona offline:</strong> você pode usar sem internet a qualquer momento.</p>
          <p style={{margin:"0 0 7px"}}>⚠️ <strong style={{color:C.orange}}>Limpeza de dados do navegador:</strong> se você limpar cookies/dados do Safari/Chrome, os dados locais serão apagados. Por isso o backup é importante.</p>
          <p style={{margin:0}}>⚠️ <strong style={{color:C.orange}}>Modo anônimo/privado:</strong> dados não persistem. Use o modo normal.</p>
        </div>
      </CardBox>

      {/* Reset */}
      <CardBox accent={C.red}>
        <SectionHead icon="🗑" title="ZONA DE PERIGO" color={C.red} />
        <div style={{padding:13}}>
          <div style={{fontSize:11,color:C.muted,lineHeight:1.5,marginBottom:10}}>
            Apaga <strong style={{color:C.red}}>todos os dados</strong> deste dispositivo e volta ao estado inicial. Recomendamos exportar um backup antes.
          </div>
          <Btn onClick={onReset} variant="outline" color={C.red} style={{width:"100%",padding:"10px",fontSize:12}}>
            🗑 Apagar Todos os Dados
          </Btn>
        </div>
      </CardBox>
    </div>
  );
}
