// Converte a saída colada do "Prompt unificado" (IA do Google) no formato do importador (data/entrada/LEIA-ME.md).
// A saída vem com: blocos da Fase 1, cabeçalho da Fase 2 (CAPA_URL, CAPA_ID, FONTE com 3 campos...), o corpo
// (muitas vezes em texto puro, porque as tags somem ao copiar da tela) e a Fase 3 (autoavaliação).
// normalizarEntradaGoogle devolve { texto, avisos, erros }: erros impedem a importação; avisos só aparecem no log.
import { norm } from '../demanda-lib.js';

const slugify = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LIMITE_TITULO = 49; // o site soma " | Saúde 40+" (11 caracteres) e o total deve ficar em até 60

export const ehSaidaGoogle = (raw) => /FASE 2/i.test(raw) || /^(CAPA_URL|CAPA_ID|CAPA_CREDITO|FOTO1_URL|FOTO1_ID):/m.test(raw);

// Página inicial ou seção genérica não é fonte (regra A2 do projeto): sem caminho, ou um único trecho só de letras ("/saude").
export function ehPaginaInicial(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean);
    return seg.length === 0 || (seg.length === 1 && /^[a-z]+$/i.test(seg[0]) && !u.search);
  } catch { return true; }
}

// Lê as linhas FONTE do cabeçalho: "Título | URL" ou "Título | Publicador | URL". Devolve { fontes, erros }.
export function lerFontes(linhas) {
  const fontes = [], erros = [];
  for (const valor of linhas) {
    const partes = valor.split('|').map((p) => p.trim()).filter(Boolean);
    const url = partes[partes.length - 1] || '';
    if (!/^https?:\/\/\S+$/.test(url)) { erros.push(`FONTE sem link direto (precisa de https://...): "${valor}"`); continue; }
    if (ehPaginaInicial(url)) { erros.push(`FONTE é página inicial, não a página do dado: ${url}`); continue; }
    fontes.push({ title: partes.slice(0, -1).join(' — ') || url, url });
  }
  return { fontes, erros };
}

// Título do site: até 49 caracteres. Corta os últimos itens depois do ":" (", ", " e ") sem perder a palavra-chave.
export function ajustarTitulo(titulo, palavraChave) {
  const t = titulo.trim();
  if (t.length <= LIMITE_TITULO) return t;
  const i = t.indexOf(':');
  if (i < 0) return t;
  const prefixo = t.slice(0, i + 1);
  let itens = t.slice(i + 1).split(/,\s*|\s+e\s+/).map((x) => x.trim()).filter(Boolean);
  const monta = (it) => `${prefixo} ${it.length > 1 ? `${it.slice(0, -1).join(', ')} e ${it[it.length - 1]}` : it[0] || ''}`.trim();
  while (itens.length > 1 && monta(itens).length > LIMITE_TITULO) itens = itens.slice(0, -1);
  const r = monta(itens);
  return r.toLowerCase().includes(String(palavraChave).toLowerCase()) ? r : t;
}

const PT_EN = {
  sangue: 'blood', laboratório: 'laboratory', laboratorio: 'laboratory', médico: 'doctor', medico: 'doctor', exame: 'test', exames: 'test',
  tireoide: 'thyroid', vegetais: 'vegetables', legumes: 'vegetables', alimentos: 'food', alimentação: 'healthy food', mulher: 'woman', homem: 'man',
  consulta: 'consultation', paciente: 'patient', cabelo: 'hair', pele: 'skin', coração: 'heart', dor: 'pain', exercício: 'exercise', exercicio: 'exercise',
  idoso: 'senior', idosa: 'senior', maduro: 'mature', madura: 'mature', frutas: 'fruits', amostra: 'sample', amostras: 'sample', tubos: 'tubes',
  fígado: 'liver', figado: 'liver', rim: 'kidney', sono: 'sleep', cansada: 'tired', cansado: 'tired', enfermagem: 'nurse', cientista: 'scientist',
  caminhada: 'walking', academia: 'gym', dieta: 'diet', água: 'water', agua: 'water', coleta: 'blood draw', computador: 'computer', tela: 'screen',
};
// Busca em inglês para o banco de fotos, tirada do texto alternativo (o id do Pexels, quando existe, tem prioridade no importador).
function buscaDoAlt(alt, palavraChave) {
  const achados = [];
  for (const w of String(alt).toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/)) if (PT_EN[w] && !achados.includes(PT_EN[w])) achados.push(PT_EN[w]);
  return (achados.slice(0, 4).join(' ') || `${slugify(palavraChave).replace(/-/g, ' ')} health`).trim();
}

const legendaDoAlt = (alt) => (alt.length <= 90 ? alt : alt.slice(0, 90).replace(/\s+\S*$/, ''));
const ehTitulo = (l) => l.length <= 90 && !/[.;:,!]$/.test(l) && !/^[-•*]\s/.test(l);

// Texto puro (uma linha por parágrafo) → HTML simples: títulos, listas e parágrafos.
export function textoParaHtml(linhas) {
  const out = [];
  let anteriorTitulo = false;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (ehTitulo(l)) {
      const forcaH2 = /^(quando procurar um médico|resumindo)\??$/i.test(l);
      const tag = anteriorTitulo && !forcaH2 ? 'h3' : 'h2';
      out.push(`<${tag}>${esc(l)}</${tag}>`); anteriorTitulo = true; continue;
    }
    anteriorTitulo = false;
    out.push(`<p>${esc(l)}</p>`);
    if (/:$/.test(l)) { // lista logo depois de uma linha terminada em ":"
      const itens = [];
      while (i + 1 < linhas.length && linhas[i + 1].length <= 170 && /[;.,]$/.test(linhas[i + 1]) && !ehTitulo(linhas[i + 1])) itens.push(linhas[++i]);
      if (itens.length >= 2) {
        out.push('<ul>' + itens.map((it) => {
          const m = it.match(/^([^:]{2,40}):\s+(.*)$/);
          return `<li>${m ? `<strong>${esc(m[1])}:</strong> ${esc(m[2])}` : esc(it)}</li>`;
        }).join('') + '</ul>');
      } else if (itens.length === 1) { out.push(`<p>${esc(itens[0])}</p>`); }
    }
  }
  return out.join('\n');
}

const jaccard = (a, b) => { const i = [...a].filter((x) => b.has(x)).length; return i / Math.max(1, a.size + b.size - i); };
const toks = (s) => new Set(norm(s).split(' ').filter((t) => t.length > 3).map((t) => t.slice(0, 4))); // prefixo de 4 letras: ferro ~ ferritina

// 2 links internos para artigos publicados parecidos com o tema (a regra do blog pede pelo menos 2, todos válidos).
export function paragrafoLinksInternos(palavraChave, publicados) {
  if (publicados.length < 2) return '';
  const meu = toks(palavraChave);
  const top = [...publicados].sort((a, b) => jaccard(meu, toks(`${b.slug.replace(/-/g, ' ')} ${b.title}`)) - jaccard(meu, toks(`${a.slug.replace(/-/g, ' ')} ${a.title}`))).slice(0, 2);
  const nome = (a) => a.title.replace(/:.*$/, '').trim();
  return `<p>Para ampliar o assunto, veja também <a href="/${top[0].slug}/">${esc(nome(top[0]))}</a> e <a href="/${top[1].slug}/">${esc(nome(top[1]))}</a>.</p>`;
}

export function normalizarEntradaGoogle(raw, { artigos = [], publicados = [], precisaRevisao = () => false } = {}) {
  const avisos = [], erros = [];
  const linhas = raw.replace(/\r\n/g, '\n').split('\n');
  const ini = linhas.findIndex((l) => /^PALAVRA_CHAVE:\s*\S/.test(l));
  if (ini < 0) return { texto: raw, avisos, erros: ['não achei a linha PALAVRA_CHAVE: (Fase 2)'] };

  // cabeçalho = linhas CHAVE: valor seguidas
  const cab = {}, fontesBrutas = [];
  let i = ini;
  for (; i < linhas.length; i++) {
    const m = linhas[i].match(/^([A-Z][A-Z0-9_]*):\s*(.*)$/);
    if (!m) { if (!linhas[i].trim()) continue; break; }
    if (m[1] === 'FONTE') fontesBrutas.push(m[2].trim()); else cab[m[1]] = m[2].trim();
  }
  // corpo = depois do separador do cabeçalho, até o separador seguinte / Fase 3
  let corpoIni = i;
  while (corpoIni < linhas.length && (/^-{3,}\s*$/.test(linhas[corpoIni]) || !linhas[corpoIni].trim())) corpoIni++;
  let corpoFim = linhas.length;
  for (let j = corpoIni; j < linhas.length; j++) if (/^-{5,}\s*$/.test(linhas[j]) || /^#*\s*FASE 3/i.test(linhas[j])) { corpoFim = j; break; }
  let corpo = linhas.slice(corpoIni, corpoFim).map((l) => l.trim().replace(/^#{1,6}\s+/, '')).filter((l) => l && !/^```/.test(l));
  const iFontes = corpo.map((l, k) => (/^Fontes:?$/i.test(l) ? k : -1)).filter((k) => k >= 0).pop();
  if (iFontes !== undefined) corpo = corpo.slice(0, iFontes); // a seção Fontes e o aviso final o robô acrescenta sozinho
  while (corpo.length && /^Este (material|conteúdo)[^.]*(informativ|educativ)/i.test(corpo[corpo.length - 1])) corpo.pop();
  if (!corpo.length) return { texto: raw, avisos, erros: ['corpo do artigo vazio'] };

  const palavraChave = cab.PALAVRA_CHAVE;
  const { fontes, erros: errosFonte } = lerFontes(fontesBrutas);
  if (errosFonte.length) avisos.push(...errosFonte.map((e) => `FONTE (aviso, não bloqueia): ${e}`));
  if (fontes.length < 3) avisos.push(`só ${fontes.length} fonte(s) com URL válida (o padrão editorial é 3, com 2 oficiais); isso não bloqueia a importação`);

  const titulo = ajustarTitulo(cab.TITLE || '', palavraChave);
  if (titulo !== (cab.TITLE || '').trim()) avisos.push(`título reduzido de ${cab.TITLE.length} para ${titulo.length} caracteres: "${titulo}"`);
  if (!titulo) erros.push('falta TITLE');
  if (!cab.DESCRIPTION) erros.push('falta DESCRIPTION');
  else if (cab.DESCRIPTION.length < 120 || cab.DESCRIPTION.length > 160) avisos.push(`DESCRIPTION com ${cab.DESCRIPTION.length} caracteres (o padrão é 120 a 160)`);

  // artigo que já existe com a mesma palavra-chave: mantém o endereço e herda o REVISADO dos temas sensíveis em revisão
  const existente = artigos.find((a) => norm(a.primaryKeyword) === norm(palavraChave));
  const cabeca = [`PALAVRA_CHAVE: ${palavraChave}`];
  if (existente && existente.slug !== slugify(palavraChave)) cabeca.push(`SLUG: ${existente.slug}`);
  cabeca.push(`TITLE: ${titulo}`, `DESCRIPTION: ${cab.DESCRIPTION || ''}`);
  const capaAlt = cab.CAPA_ALT || titulo;
  cabeca.push(`CAPA_BUSCA: ${cab.CAPA_BUSCA || buscaDoAlt(capaAlt, palavraChave)}`, `CAPA_ALT: ${capaAlt}`);
  if (/^\d+$/.test(cab.CAPA_ID || '')) cabeca.push(`CAPA_PEXELS_ID: ${cab.CAPA_ID}`);
  [1, 2].forEach((n) => {
    const alt = cab[`FOTO${n}_ALT`]; if (!alt) return;
    cabeca.push(`FOTO${n}_BUSCA: ${cab[`FOTO${n}_BUSCA`] || buscaDoAlt(alt, palavraChave)}`, `FOTO${n}_ALT: ${alt}`,
      `FOTO${n}_LEGENDA: ${cab[`FOTO${n}_LEGENDA`] || legendaDoAlt(alt)}`);
    if (/^\d+$/.test(cab[`FOTO${n}_ID`] || '')) cabeca.push(`FOTO${n}_PEXELS_ID: ${cab[`FOTO${n}_ID`]}`);
    cabeca.push(`FOTO${n}_SECAO: ${cab[`FOTO${n}_SECAO`] || (n === 1 ? 2 : 4)}`);
  });
  fontes.forEach((f) => cabeca.push(`FONTE: ${f.title} | ${f.url}`));
  if (cab.NOTA_CHAT) cabeca.push(`NOTA_CHAT: ${cab.NOTA_CHAT}`);
  if (existente && precisaRevisao(existente) && (existente.scores?.atencao || []).some((m) => m.includes('tema sensível'))) cabeca.push('REVISADO: sim');

  let html = corpo.some((l) => /<\/?(p|h2|ul)\b/i.test(l)) ? corpo.join('\n') : textoParaHtml(corpo);
  if (!/href="\/[a-z0-9-]+\/"/.test(html)) {
    const p = paragrafoLinksInternos(palavraChave, publicados);
    if (p) html = /<h2>Resumindo<\/h2>/i.test(html) ? html.replace(/<h2>Resumindo<\/h2>/i, `${p}\n<h2>Resumindo</h2>`) : `${html}\n${p}`;
    else avisos.push('sem links internos e menos de 2 artigos publicados para linkar');
  }
  return { texto: `${cabeca.join('\n')}\n---\n${html}\n`, avisos, erros };
}
