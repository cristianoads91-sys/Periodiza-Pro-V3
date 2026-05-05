export const trainingMethods = [
  {
    id: 'tradicional',
    name: 'Tradicional',
    category: 'Básico',
    description: 'Execução padrão do exercício com amplitude completa e cadência controlada.'
  },
  {
    id: 'super-set',
    name: 'Super-set',
    category: 'Intensificação',
    description: 'Dois exercícios em sequência sem descanso, geralmente para músculos antagonistas (ex: bíceps + tríceps).'
  },
  {
    id: 'bi-set',
    name: 'Bi-set',
    category: 'Intensificação',
    description: 'Dois exercícios para o mesmo grupo muscular executados sem descanso entre eles.'
  },
  {
    id: 'tri-set',
    name: 'Tri-set',
    category: 'Intensificação',
    description: 'Três exercícios consecutivos para o mesmo grupo muscular sem intervalo.'
  },
  {
    id: 'set-gigante',
    name: 'Set Gigante',
    category: 'Intensificação',
    description: 'Quatro ou mais exercícios para o mesmo grupo muscular executados em sequência sem descanso.'
  },
  {
    id: 'drop-set',
    name: 'Drop-set',
    category: 'Intensificação',
    description: 'Redução progressiva da carga (20-30%) imediatamente após atingir a falha, sem descanso.'
  },
  {
    id: 'rest-pause',
    name: 'Rest-pause',
    category: 'Intensificação',
    description: 'Pausas curtas de 10-15 segundos durante a série para completar mais repetições após a falha inicial.'
  },
  {
    id: 'fst-7',
    name: 'FST-7',
    category: 'Intensificação',
    description: 'Sete séries com 30-45 segundos de descanso executadas como última série do treino para máximo pump muscular.'
  },
  {
    id: '21s',
    name: '21s',
    category: 'Intensificação',
    description: 'Divisão da amplitude em três fases: 7 reps na metade inferior + 7 na metade superior + 7 completas.'
  },
  {
    id: 'cluster-set',
    name: 'Cluster Set',
    category: 'Intensificação',
    description: 'Micro-pausas de 15-30 segundos dentro da mesma série para manter alta intensidade.'
  },
  {
    id: 'isometrico',
    name: 'Isométrico',
    category: 'Contração',
    description: 'Contração muscular mantida em posição estática sem movimento articular (ex: prancha, wall sit).'
  },
  {
    id: 'excentrico',
    name: 'Excêntrico',
    category: 'Contração',
    description: 'Ênfase na fase negativa do movimento, controlando a descida por 3-6 segundos.'
  },
  {
    id: 'concentrico',
    name: 'Concêntrico',
    category: 'Contração',
    description: 'Ênfase na fase positiva do movimento, geralmente com execução explosiva.'
  },
  {
    id: 'isodinamico',
    name: 'Isodinâmico',
    category: 'Contração',
    description: 'Velocidade constante mantida durante toda a amplitude do movimento (requer equipamento específico).'
  },
  {
    id: 'pliometrico',
    name: 'Pliométrico',
    category: 'Velocidade/Potência',
    description: 'Exercícios explosivos que utilizam o ciclo alongamento-encurtamento para desenvolver potência (ex: saltos, arremessos).'
  },
  {
    id: 'balistico',
    name: 'Balístico',
    category: 'Velocidade/Potência',
    description: 'Movimentos de alta velocidade com fase de desaceleração, como arremessos de medicine ball.'
  },
  {
    id: 'cat',
    name: 'CAT',
    category: 'Velocidade/Potência',
    description: 'Compensatory Acceleration Training - aceleração máxima intencional em toda amplitude do movimento.'
  },
  {
    id: 'piramide-crescente',
    name: 'Pirâmide Crescente',
    category: 'Pirâmide',
    description: 'Aumento progressivo de carga com redução de repetições a cada série (ex: 12-10-8-6 reps).'
  },
  {
    id: 'piramide-decrescente',
    name: 'Pirâmide Decrescente',
    category: 'Pirâmide',
    description: 'Redução progressiva de carga com aumento de repetições a cada série (ex: 6-8-10-12 reps).'
  },
  {
    id: 'piramide-truncada',
    name: 'Pirâmide Truncada',
    category: 'Pirâmide',
    description: 'Pirâmide crescente sem retornar às cargas leves, mantendo apenas a fase ascendente.'
  },
  {
    id: 'repeticoes-forcadas',
    name: 'Repetições Forçadas',
    category: 'Repetição',
    description: 'Repetições adicionais realizadas com auxílio do parceiro após atingir a falha muscular concêntrica.'
  },
  {
    id: 'repeticoes-parciais',
    name: 'Repetições Parciais',
    category: 'Repetição',
    description: 'Execução em amplitude reduzida (geralmente 1/3 a 1/2) para prolongar a série após a falha.'
  },
  {
    id: 'repeticoes-negativas',
    name: 'Repetições Negativas',
    category: 'Repetição',
    description: 'Apenas a fase excêntrica com carga supra-máxima (110-130% de 1RM), requer assistência.'
  },
  {
    id: '1-1-4-rep',
    name: '1-1/4 Rep',
    category: 'Repetição',
    description: 'Uma repetição completa seguida de 1/4 de amplitude adicional para aumentar tempo sob tensão.'
  },
  {
    id: 'tut',
    name: 'TUT (Time Under Tension)',
    category: 'Tensão/Tempo',
    description: 'Cadência controlada para prolongar o tempo sob tensão (ex: 4 seg descida, 2 seg pausa, 4 seg subida).'
  },
  {
    id: 'isometria-funcional',
    name: 'Isometria Funcional',
    category: 'Tensão/Tempo',
    description: 'Pausas isométricas de 2-5 segundos em pontos estratégicos do movimento (geralmente no pico de contração).'
  },
  {
    id: 'contraste-carga',
    name: 'Contraste de Carga',
    category: 'Tensão/Tempo',
    description: 'Alternância entre séries pesadas (85-95% 1RM) e leves (40-60% 1RM) na mesma sessão.'
  },
  {
    id: 'bfr',
    name: 'Oclusão Vascular (BFR)',
    category: 'Tensão/Tempo',
    description: 'Blood Flow Restriction - restrição parcial do fluxo sanguíneo usando faixas para hipertrofia com cargas leves (20-40% 1RM).'
  },
  {
    id: 'pre-exaustao',
    name: 'Pré-exaustão',
    category: 'Avançado',
    description: 'Exercício isolado seguido imediatamente de exercício composto para o mesmo músculo (ex: crucifixo + supino).'
  },
  {
    id: 'pos-exaustao',
    name: 'Pós-exaustão',
    category: 'Avançado',
    description: 'Exercício composto seguido de exercício isolado para finalizar o músculo (ex: supino + crucifixo).'
  },
  {
    id: 'onda',
    name: 'Onda',
    category: 'Avançado',
    description: 'Alternância de cargas em padrão ondulatório (ex: pesada-leve-pesada) para otimizar força e hipertrofia.'
  },
  {
    id: 'contrast-loading',
    name: 'Contrast Loading',
    category: 'Avançado',
    description: 'Exercício de força máxima seguido de exercício de potência similar (ex: agachamento pesado + salto).'
  },
  {
    id: 'complex-training',
    name: 'Complex Training',
    category: 'Avançado',
    description: 'Combinação de exercício de força com pliométrico para o mesmo padrão motor, explorando potenciação pós-ativação.'
  },
  {
    id: 'edt',
    name: 'EDT',
    category: 'Avançado',
    description: 'Escalating Density Training - máximo volume possível em tempo fixo (geralmente 15-20 minutos).'
  },
  {
    id: 'dc-training',
    name: 'DC Training',
    category: 'Avançado',
    description: 'Doggcrapp Training - rest-pause estruturado com alongamento extremo entre séries.'
  },
  {
    id: 'gvt',
    name: 'GVT (10x10)',
    category: 'Avançado',
    description: 'German Volume Training - 10 séries de 10 repetições com 60 segundos de descanso e 60% de 1RM.'
  },
  {
    id: '5x5',
    name: '5x5',
    category: 'Avançado',
    description: 'Cinco séries de cinco repetições com carga progressiva, focado em ganho de força máxima.'
  },
  {
    id: 'stripping',
    name: 'Stripping',
    category: 'Avançado',
    description: 'Remoção sequencial de peso (geralmente anilhas) até a falha total, similar ao drop-set.'
  },
  {
    id: 'burns',
    name: 'Burns',
    category: 'Avançado',
    description: 'Repetições rápidas e parciais (5-10cm) executadas no final da amplitude após a falha, para queimação muscular máxima.'
  }
];

// Função auxiliar para buscar método por ID
export const getMethodById = (id) => {
  return trainingMethods.find(method => method.id === id);
};

// Função auxiliar para agrupar por categoria
export const getMethodsByCategory = () => {
  return trainingMethods.reduce((acc, method) => {
    if (!acc[method.category]) {
      acc[method.category] = [];
    }
    acc[method.category].push(method);
    return acc;
  }, {});
};
