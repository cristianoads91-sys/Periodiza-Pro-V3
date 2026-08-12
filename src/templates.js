// ═══════════════════════════════════════════════════════════════════════
// TEMPLATES DE TREINOS - Geração automática baseada em regras
// ═══════════════════════════════════════════════════════════════════════
//
// Estrutura de decisão:
//   objetivo × modalidade × frequência → escolhe divisão + exercícios
//
// Cada template retorna: { divisao: "A/B/C", treinos: [ { nome, exercicios: [...] } ] }
// que serão distribuídos nos dias selecionados da semana.
//
// ═══════════════════════════════════════════════════════════════════════

// ─── EXERCÍCIOS BASE POR MODALIDADE ──────────────────────────────────
const EX_MUSCULACAO = {
  peito: [
    {nome:"Supino Reto Barra",        sp:3, reps:"8-10", pausa:90, grupo:"peito"},
    {nome:"Supino Inclinado Halter",  sp:3, reps:"10-12", pausa:75, grupo:"peito"},
    {nome:"Crucifixo Reto",           sp:3, reps:"12-15", pausa:60, grupo:"peito"},
    {nome:"Crossover",                sp:3, reps:"12-15", pausa:60, grupo:"peito"},
    {nome:"Flexão de Braço",          sp:3, reps:"AMRAP", pausa:60, grupo:"peito"},
  ],
  costas: [
    {nome:"Barra Fixa",               sp:3, reps:"6-10", pausa:120, grupo:"costas"},
    {nome:"Puxada Frontal",           sp:3, reps:"10-12", pausa:90, grupo:"costas"},
    {nome:"Remada Curvada Barra",     sp:3, reps:"8-10", pausa:90, grupo:"costas"},
    {nome:"Remada Baixa (Cabo)",      sp:3, reps:"10-12", pausa:75, grupo:"costas"},
    {nome:"Remada Unilateral Halter", sp:3, reps:"10-12", pausa:60, grupo:"costas"},
  ],
  ombro: [
    {nome:"Desenvolvimento Militar",   sp:3, reps:"8-10", pausa:90, grupo:"ombro"},
    {nome:"Desenvolvimento Halter",    sp:3, reps:"10-12", pausa:75, grupo:"ombro"},
    {nome:"Elevação Lateral",          sp:3, reps:"12-15", pausa:60, grupo:"ombro"},
    {nome:"Elevação Frontal",          sp:3, reps:"12-15", pausa:60, grupo:"ombro"},
    {nome:"Encolhimento",              sp:3, reps:"12-15", pausa:60, grupo:"ombro"},
  ],
  biceps: [
    {nome:"Rosca Direta Barra",        sp:3, reps:"10-12", pausa:60, grupo:"biceps"},
    {nome:"Rosca Alternada Halter",    sp:3, reps:"10-12", pausa:60, grupo:"biceps"},
    {nome:"Rosca Scott",               sp:3, reps:"12-15", pausa:60, grupo:"biceps"},
    {nome:"Rosca Martelo",             sp:3, reps:"10-12", pausa:60, grupo:"biceps"},
  ],
  triceps: [
    {nome:"Tríceps Testa",             sp:3, reps:"10-12", pausa:60, grupo:"triceps"},
    {nome:"Tríceps Corda",             sp:3, reps:"12-15", pausa:60, grupo:"triceps"},
    {nome:"Tríceps Francês",           sp:3, reps:"10-12", pausa:60, grupo:"triceps"},
    {nome:"Mergulho no Banco",         sp:3, reps:"10-15", pausa:60, grupo:"triceps"},
  ],
  quadriceps: [
    {nome:"Agachamento Livre",         sp:4, reps:"8-10", pausa:120, grupo:"quadriceps"},
    {nome:"Leg Press 45°",             sp:4, reps:"10-12", pausa:90, grupo:"quadriceps"},
    {nome:"Cadeira Extensora",         sp:3, reps:"12-15", pausa:60, grupo:"quadriceps"},
    {nome:"Afundo",                    sp:3, reps:"10-12", pausa:75, grupo:"quadriceps"},
    {nome:"Hack Machine",              sp:3, reps:"10-12", pausa:90, grupo:"quadriceps"},
  ],
  posterior: [
    {nome:"Stiff",                     sp:3, reps:"10-12", pausa:90, grupo:"posterior"},
    {nome:"Mesa Flexora",              sp:3, reps:"12-15", pausa:60, grupo:"posterior"},
    {nome:"Cadeira Flexora",           sp:3, reps:"12-15", pausa:60, grupo:"posterior"},
    {nome:"Levantamento Terra",        sp:3, reps:"6-8", pausa:120, grupo:"posterior"},
  ],
  gluteo: [
    {nome:"Elevação Pélvica",          sp:3, reps:"10-12", pausa:75, grupo:"gluteo"},
    {nome:"Coice na Máquina",          sp:3, reps:"12-15", pausa:60, grupo:"gluteo"},
    {nome:"Abdução Máquina",           sp:3, reps:"15-20", pausa:45, grupo:"gluteo"},
    {nome:"Búlgaro",                   sp:3, reps:"10-12", pausa:75, grupo:"gluteo"},
  ],
  panturrilha: [
    {nome:"Panturrilha em Pé",         sp:4, reps:"15-20", pausa:45, grupo:"panturrilha"},
    {nome:"Panturrilha Sentado",       sp:4, reps:"15-20", pausa:45, grupo:"panturrilha"},
  ],
  core: [
    {nome:"Prancha Ventral",           sp:3, reps:"30-60s", pausa:45, grupo:"core"},
    {nome:"Abdominal Supra",           sp:3, reps:"15-20", pausa:30, grupo:"core"},
    {nome:"Abdominal Infra",           sp:3, reps:"15-20", pausa:30, grupo:"core"},
    {nome:"Prancha Lateral",           sp:3, reps:"20-40s", pausa:45, grupo:"core"},
  ],
  cardio: [
    {nome:"Esteira Contínua",          sp:1, reps:"20-40min", pausa:0, grupo:"cardio"},
    {nome:"Bike Ergométrica",          sp:1, reps:"20-40min", pausa:0, grupo:"cardio"},
    {nome:"Elíptico",                  sp:1, reps:"20-30min", pausa:0, grupo:"cardio"},
  ],
};

const EX_CASA = {
  membros_superiores: [
    {nome:"Flexão de Braço",           sp:3, reps:"AMRAP",     pausa:60, grupo:"peito"},
    {nome:"Flexão Fechada (Diamante)", sp:3, reps:"8-12",      pausa:60, grupo:"triceps"},
    {nome:"Flexão Inclinada",          sp:3, reps:"10-15",     pausa:60, grupo:"peito"},
    {nome:"Remada com Elástico",       sp:3, reps:"12-15",     pausa:60, grupo:"costas"},
    {nome:"Rosca Elástico",            sp:3, reps:"12-15",     pausa:45, grupo:"biceps"},
    {nome:"Extensão Tríceps Elástico", sp:3, reps:"12-15",     pausa:45, grupo:"triceps"},
    {nome:"Elevação Lateral Halter",   sp:3, reps:"12-15",     pausa:45, grupo:"ombro"},
  ],
  membros_inferiores: [
    {nome:"Agachamento Livre (peso corporal)", sp:3, reps:"15-20", pausa:60, grupo:"quadriceps"},
    {nome:"Afundo Alternado",          sp:3, reps:"10 cada",     pausa:60, grupo:"quadriceps"},
    {nome:"Búlgaro",                   sp:3, reps:"10-12",       pausa:75, grupo:"gluteo"},
    {nome:"Elevação Pélvica no Chão",  sp:3, reps:"12-15",       pausa:60, grupo:"gluteo"},
    {nome:"Stiff (com elástico ou peso doméstico)", sp:3, reps:"12-15", pausa:60, grupo:"posterior"},
    {nome:"Panturrilha em Pé Uni.",    sp:3, reps:"15-20 cada",  pausa:45, grupo:"panturrilha"},
    {nome:"Agachamento Sumô",          sp:3, reps:"15-20",       pausa:45, grupo:"gluteo"},
  ],
  core: [
    {nome:"Prancha Ventral",           sp:3, reps:"30-60s", pausa:45, grupo:"core"},
    {nome:"Mountain Climber",          sp:3, reps:"30-40s", pausa:45, grupo:"core"},
    {nome:"Abdominal Supra",           sp:3, reps:"15-20",  pausa:30, grupo:"core"},
    {nome:"Dead Bug",                  sp:3, reps:"10 cada", pausa:30, grupo:"core"},
  ],
  full_body: [
    {nome:"Burpee",                    sp:3, reps:"10-15", pausa:60, grupo:"full"},
    {nome:"Polichinelo",               sp:3, reps:"30s",   pausa:30, grupo:"cardio"},
    {nome:"Corrida no Lugar",          sp:3, reps:"30s",   pausa:30, grupo:"cardio"},
    {nome:"Salto Agachamento",         sp:3, reps:"10-12", pausa:60, grupo:"quadriceps"},
  ],
};

const EX_AR_LIVRE = [
  {nome:"Corrida Contínua",          sp:1, reps:"20-40min", pausa:0,  grupo:"cardio"},
  {nome:"Tiros de 100m",             sp:6, reps:"100m",     pausa:120,grupo:"cardio", distancia:100, distUnidade:"m"},
  {nome:"Sprint 40m",                sp:8, reps:"40m",      pausa:90, grupo:"cardio", distancia:40,  distUnidade:"m"},
  {nome:"Escada de Estádio",         sp:5, reps:"1 subida", pausa:90, grupo:"cardio"},
  {nome:"Trilha / Caminhada Rápida", sp:1, reps:"30-60min", pausa:0,  grupo:"cardio"},
  {nome:"Flexão em Banco",           sp:3, reps:"12-15",    pausa:60, grupo:"peito"},
  {nome:"Barra Fixa (barras públicas)", sp:3, reps:"AMRAP", pausa:90, grupo:"costas"},
  {nome:"Paralelas (bar. públicas)", sp:3, reps:"AMRAP",    pausa:75, grupo:"triceps"},
  {nome:"Agachamento em Grama",      sp:3, reps:"15-20",    pausa:60, grupo:"quadriceps"},
  {nome:"Prancha em Grama",          sp:3, reps:"30-60s",   pausa:45, grupo:"core"},
];

const EX_CORRIDA = {
  base: [
    {nome:"Corrida Contínua Regenerativa", sp:1, reps:"30-40min", pausa:0, grupo:"cardio", tempo:35},
    {nome:"Corrida Contínua Ritmo Fácil",  sp:1, reps:"40-60min", pausa:0, grupo:"cardio", tempo:50},
    {nome:"Aquecimento + Alongamento",     sp:1, reps:"10-15min", pausa:0, grupo:"cardio", tempo:12},
  ],
  intervalado: [
    {nome:"Fartlek (1min forte / 1min leve)", sp:8, reps:"1min",    pausa:60,  grupo:"cardio"},
    {nome:"Tiros de 400m",                    sp:6, reps:"400m",    pausa:120, grupo:"cardio", distancia:400, distUnidade:"m"},
    {nome:"Tiros de 800m",                    sp:5, reps:"800m",    pausa:180, grupo:"cardio", distancia:800, distUnidade:"m"},
    {nome:"Tiros de 1000m",                   sp:4, reps:"1000m",   pausa:180, grupo:"cardio", distancia:1000,distUnidade:"m"},
  ],
  longao: [
    {nome:"Longão de Rodagem",         sp:1, reps:"60-90min",  pausa:0, grupo:"cardio", tempo:75},
    {nome:"Corrida Longa Progressiva", sp:1, reps:"70-90min",  pausa:0, grupo:"cardio", tempo:80},
  ],
  forca_corrida: [
    {nome:"Agachamento Livre",  sp:3, reps:"8-10",  pausa:90, grupo:"quadriceps"},
    {nome:"Afundo Alternado",   sp:3, reps:"10 cada",pausa:60, grupo:"quadriceps"},
    {nome:"Stiff",              sp:3, reps:"10-12", pausa:90, grupo:"posterior"},
    {nome:"Panturrilha",        sp:4, reps:"15-20", pausa:45, grupo:"panturrilha"},
    {nome:"Prancha Ventral",    sp:3, reps:"45-60s",pausa:45, grupo:"core"},
    {nome:"Prancha Lateral",    sp:3, reps:"30-40s",pausa:45, grupo:"core"},
  ],
};

const EX_FUNCIONAL = [
  {nome:"Kettlebell Swing",          sp:4, reps:"15-20", pausa:60,  grupo:"posterior"},
  {nome:"Burpee com Salto",          sp:4, reps:"10-15", pausa:75,  grupo:"full"},
  {nome:"Agachamento Goblet",        sp:4, reps:"12-15", pausa:60,  grupo:"quadriceps"},
  {nome:"Turkish Get-Up",            sp:3, reps:"5 cada",pausa:90,  grupo:"full"},
  {nome:"Salto no Caixote",          sp:4, reps:"8-10",  pausa:75,  grupo:"quadriceps"},
  {nome:"Wall Ball",                 sp:4, reps:"15",    pausa:60,  grupo:"full"},
  {nome:"Farmer Walk",               sp:3, reps:"30m",   pausa:75,  grupo:"full"},
  {nome:"Prancha Dinâmica",          sp:3, reps:"45s",   pausa:45,  grupo:"core"},
  {nome:"Corda Naval",               sp:4, reps:"30s",   pausa:60,  grupo:"full"},
  {nome:"Air Squat",                 sp:4, reps:"20",    pausa:45,  grupo:"quadriceps"},
];

// ─── AJUSTES DE PARÂMETROS POR OBJETIVO ──────────────────────────────
function ajustarParametros(exercicios, objetivo) {
  const map = {
    hipertrofia:   {sp: 4, reps: "8-12",  pausa: 75},
    forca:         {sp: 5, reps: "3-6",   pausa: 180},
    potencia:      {sp: 4, reps: "3-5",   pausa: 150},
    emagrecimento: {sp: 3, reps: "12-15", pausa: 45},
    definicao:     {sp: 4, reps: "10-15", pausa: 50},
    base:          {sp: 3, reps: "12-15", pausa: 60},
    performance:   {sp: 4, reps: "6-8",   pausa: 120},
  };
  const p = map[objetivo] || map.hipertrofia;
  return exercicios.map(e => ({
    ...e,
    sp:    e.grupo === "cardio" || e.grupo === "core" ? e.sp : p.sp,
    reps:  e.grupo === "cardio" || e.grupo === "core" ? e.reps : p.reps,
    pausa: e.grupo === "cardio" || e.grupo === "core" ? e.pausa : p.pausa,
  }));
}

// ─── DIVISÕES DE TREINO POR FREQUÊNCIA ───────────────────────────────
function divisoesPorFrequencia(freq, modalidade) {
  if (modalidade === "corrida") {
    // Corrida tem estrutura própria (variar tipos de sessão)
    if (freq === 1) return ["Base"];
    if (freq === 2) return ["Base", "Longão"];
    if (freq === 3) return ["Base", "Intervalado", "Longão"];
    if (freq === 4) return ["Base", "Intervalado", "Força", "Longão"];
    return ["Base", "Intervalado", "Base", "Força", "Longão"]; // 5+
  }
  if (freq === 1) return ["Full Body"];
  if (freq === 2) return ["Upper", "Lower"];
  if (freq === 3) return ["A - Peito/Tríceps/Ombro", "B - Costas/Bíceps", "C - Pernas"];
  if (freq === 4) return ["A - Peito/Tríceps", "B - Costas/Bíceps", "C - Pernas", "D - Ombro/Core"];
  return ["A - Peito", "B - Costas", "C - Pernas", "D - Ombro/Braços", "E - Full/Cardio"]; // 5+
}

// ─── COMPOSIÇÃO DOS TREINOS POR DIVISÃO ──────────────────────────────
function composicaoTreino(divisaoNome, modalidade, objetivo) {
  const pick = (arr, n) => arr.slice(0, n).map(e => ({...e}));

  // MODALIDADE: CORRIDA
  if (modalidade === "corrida") {
    if (divisaoNome === "Base")         return pick(EX_CORRIDA.base, 2);
    if (divisaoNome === "Intervalado")  return [...pick(EX_CORRIDA.base, 1), ...pick(EX_CORRIDA.intervalado, 1)];
    if (divisaoNome === "Longão")       return pick(EX_CORRIDA.longao, 1);
    if (divisaoNome === "Força")        return pick(EX_CORRIDA.forca_corrida, 5);
    return pick(EX_CORRIDA.base, 2);
  }

  // MODALIDADE: EM CASA
  if (modalidade === "casa") {
    if (divisaoNome === "Full Body") return [
      ...pick(EX_CASA.membros_superiores, 2),
      ...pick(EX_CASA.membros_inferiores, 2),
      ...pick(EX_CASA.core, 1),
      ...pick(EX_CASA.full_body, 1),
    ];
    if (divisaoNome === "Upper") return [
      ...pick(EX_CASA.membros_superiores, 5),
      ...pick(EX_CASA.core, 1),
    ];
    if (divisaoNome === "Lower") return [
      ...pick(EX_CASA.membros_inferiores, 5),
      ...pick(EX_CASA.core, 1),
    ];
    if (divisaoNome.includes("Peito")) return [
      ...pick(EX_CASA.membros_superiores.filter(e => ["peito","triceps","ombro"].includes(e.grupo)), 4),
      ...pick(EX_CASA.core, 1),
    ];
    if (divisaoNome.includes("Costas")) return [
      ...pick(EX_CASA.membros_superiores.filter(e => ["costas","biceps"].includes(e.grupo)), 3),
      ...pick(EX_CASA.core, 1),
    ];
    if (divisaoNome.includes("Pernas")) return [
      ...pick(EX_CASA.membros_inferiores, 5),
    ];
    return pick(EX_CASA.full_body, 4);
  }

  // MODALIDADE: AR LIVRE
  if (modalidade === "ar_livre") {
    return pick(EX_AR_LIVRE, divisaoNome.includes("Full") ? 5 : 4);
  }

  // MODALIDADE: FUNCIONAL
  if (modalidade === "funcional") {
    return pick(EX_FUNCIONAL, 6);
  }

  // MODALIDADE: MUSCULAÇÃO (padrão)
  const compose = (grupos, extra = []) => {
    const list = [];
    grupos.forEach(g => list.push(...pick(EX_MUSCULACAO[g] || [], 2)));
    if (extra.length) extra.forEach(g => list.push(...pick(EX_MUSCULACAO[g] || [], 1)));
    return list;
  };

  if (divisaoNome === "Full Body")     return compose(["peito","costas","quadriceps"], ["ombro","core"]);
  if (divisaoNome === "Upper")         return compose(["peito","costas","ombro"], ["biceps","triceps"]);
  if (divisaoNome === "Lower")         return compose(["quadriceps","posterior","gluteo"], ["panturrilha","core"]);
  if (divisaoNome.startsWith("A - Peito/Tríceps/Ombro"))  return compose(["peito","triceps","ombro"], ["core"]);
  if (divisaoNome.startsWith("A - Peito/Tríceps"))        return compose(["peito","triceps"], ["core"]);
  if (divisaoNome.startsWith("A - Peito"))                return compose(["peito"], ["triceps","core"]);
  if (divisaoNome.startsWith("B - Costas/Bíceps"))        return compose(["costas","biceps"], ["core"]);
  if (divisaoNome.startsWith("B - Costas"))               return compose(["costas"], ["biceps","core"]);
  if (divisaoNome.startsWith("C - Pernas"))               return compose(["quadriceps","posterior","gluteo"], ["panturrilha"]);
  if (divisaoNome.startsWith("D - Ombro/Core"))           return compose(["ombro"], ["core","panturrilha"]);
  if (divisaoNome.startsWith("D - Ombro/Braços"))         return compose(["ombro","biceps","triceps"]);
  if (divisaoNome.startsWith("E - Full"))                 return [...compose(["peito","costas"]), ...pick(EX_MUSCULACAO.cardio, 1)];
  return compose(["peito","costas","quadriceps"]);
}

// ─── FUNÇÃO PRINCIPAL: GERAR TEMPLATE DE SEMANA ──────────────────────
export function gerarTemplateSemana(config) {
  const {
    objetivo    = "hipertrofia",   // hipertrofia, forca, potencia, emagrecimento, base, definicao, performance
    modalidade  = "musculacao",    // musculacao, casa, ar_livre, corrida, funcional
    frequencia  = 3,               // 1-6
    diasSemana  = [1, 3, 5],       // dias da semana (0=Dom, 1=Seg, ...)
  } = config;

  const divisoes = divisoesPorFrequencia(frequencia, modalidade);
  const treinos  = divisoes.slice(0, frequencia).map((div, i) => ({
    nome:       div,
    diaSemana:  diasSemana[i] !== undefined ? diasSemana[i] : (i + 1),
    exercicios: ajustarParametros(composicaoTreino(div, modalidade, objetivo), objetivo),
  }));

  return {
    divisoes: divisoes.slice(0, frequencia),
    treinos,
    objetivo,
    modalidade,
    frequencia,
  };
}

// ─── APLICA TEMPLATE NO MACROCICLO ───────────────────────────────────
export function aplicarTemplateNoMacro(macro, template, uid) {
  return (macro || []).map(w => {
    const novasDias = {...(w.dias || {})};
    template.treinos.forEach(t => {
      const di = t.diaSemana;
      const diaAtual = novasDias[di] || {treinos: [], pse: null, psr: null, concluido: false, duracao: "", fcZona: ""};
      const treinoObj = {
        id:  uid(),
        nome: t.nome,
        concluido: false,
        exercicios: t.exercicios.map(ex => ({
          uid:      uid(),
          nome:     ex.nome,
          grupo:    ex.grupo || "",
          sp:       ex.sp,
          reps:     ex.reps,
          pausa:    ex.pausa,
          cad:      "",
          intervalo:null,
          distancia:ex.distancia || null,
          distUnidade:ex.distUnidade || "km",
          tempo:    ex.tempo || null,
          obs:      "",
          metodo:   "",
          sets:     Array.from({length: typeof ex.sp === "number" ? ex.sp : 3}, () => ({reps: null, carga: null})),
        })),
      };
      novasDias[di] = {...diaAtual, treinos: [...(diaAtual.treinos || []), treinoObj]};
    });
    return {...w, dias: novasDias};
  });
}

// Constantes exportadas para UI
export const MODALIDADES = [
  {id:"musculacao", label:"Musculação (academia)", icon:"🏋"},
  {id:"casa",       label:"Em Casa",                icon:"🏠"},
  {id:"ar_livre",   label:"Ar Livre",               icon:"🌳"},
  {id:"corrida",    label:"Corrida / Endurance",    icon:"🏃"},
  {id:"funcional",  label:"Treinamento Funcional",  icon:"⚡"},
];
