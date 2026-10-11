#!/usr/bin/env node

/**
 * ARTICLE ROBOT — padrão Mente Curiosa (REGRAS_OURO / PADRAO_SEO)
 *
 * redator (Claude) -> auditoria automática (nota >= 80, sem bloqueantes)
 *   -> validador (Claude, 2ª chamada) -> imagem (Pexels) -> publica
 * Máximo 2 voltas por artigo; reprovado vira draft (nunca vai ao ar).
 *
 * Env: ANTHROPIC_API_KEY (validador e reserva do redator) | GEMINI_API_KEY (redator principal, opcional) | PEXEL_API_KEY (imagem) | BATCH_SIZE (padrão 1)
 *      NOVO_COM_IA=1 (1 artigo novo escrito por IA e publicado; senão só publica do estoque) | SEM_API=1 (só estoque)
 *      ROBOT_MODEL (redator, padrão Haiku 4.5) | VALIDATOR_MODEL (padrão Haiku 4.5) | DRY_RUN=1 (não grava) | ALLOW_NO_IMAGE=1 (só para teste local)
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTICLES_FILE = path.join(__dirname, '../data/articles.json');
const KEYWORDS_FILE = path.join(__dirname, '../data/keywords-validated.json');

const BATCH_SIZE = Number(process.env.BATCH_SIZE || 1);
// Teto de publicações por dia (dia de Brasília). Padrão 3: cada execução agendada faz 1, e nenhuma execução (manual ou repetida) passa de 3 no dia.
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 3);
// Originalidade: no máximo este % de sequências de 7 palavras iguais às fontes e aos concorrentes lidos (o artigo é nosso, não cópia).
const MAX_SEMELHANCA = Number(process.env.MAX_SEMELHANCA || 6);
// Modo ESTOQUE (ESTOQUE=1): escreve os artigos e guarda no GitHub como rascunho pronto (status 'draft' + estoque:true, o site NÃO mostra).
// As execuções agendadas (sem ESTOQUE) publicam do estoque primeiro, no máximo DAILY_LIMIT por dia, e só escrevem na hora se o estoque acabar.
// ESTOQUE_ALVO = quantos artigos prontos manter guardados (padrão 21 = 7 dias).
const ESTOQUE = process.env.ESTOQUE === '1';
// SEM_API=1: só publica do estoque (artigos escritos fora); nunca chama a API de escrita nem exige chave.
const SEM_API = process.env.SEM_API === '1';
const ESTOQUE_ALVO = Number(process.env.ESTOQUE_ALVO || 21);
// NOVO_COM_IA=1: escreve 1 artigo novo da fila com IA (Gemini primeiro; Claude assume se o Gemini falhar ou reprovar) e publica na hora.
// Sem isso, a execução só publica do estoque. Programação do dia: 1 execução NOVO_COM_IA + as outras publicando do estoque (SEM_API=1).
const NOVO_COM_IA = process.env.NOVO_COM_IA === '1';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const MAX_GEMINI_CHAMADAS_DIA = Number(process.env.MAX_GEMINI_CALLS_PER_DAY || 50);
// Estado do dia do redator: depois que o Gemini falha (cota, erro, reprovação), o resto do dia segue no Claude.
// Pautas que reprovaram: depois de 2 tentativas a pauta é pulada (não gasta Gemini/Claude de novo). Para tentar outra vez, apague a entrada.
const PAUTAS_FALHAS = process.env.PAUTAS_FALHAS || path.join(__dirname, '../data/pesquisa/pautas-falhas.json');
const LLM_ESTADO = process.env.LLM_ESTADO || path.join(__dirname, '../data/llm-estado.json');
const WRITER_MODEL = process.env.ROBOT_MODEL || 'claude-haiku-4-5-20251001';
const VALIDATOR_MODEL = process.env.VALIDATOR_MODEL || 'claude-haiku-4-5-20251001';
const MIN_SCORE = 80;
const SITE_SUFFIX = ' | Saúde 40+';
const MAX_VOLTAS = 3;
// US$ por milhão de tokens [entrada, saída]
const PRECOS = { 'claude-haiku-4-5-20251001': [1, 5], 'claude-sonnet-5-5': [2, 10] };
const METRICS_FILE = path.join(__dirname, '../data/robot-metrics.json');

const DISCLAIMER = 'Este conteúdo é informativo e não substitui a orientação de um profissional de saúde.';

// Fontes: o modelo escolhe pela chave; os links vêm daqui (nunca inventados).
const FONTES = {
  ms: ['Ministério da Saúde', 'https://www.gov.br/saude/pt-br'],
  oms: ['Organização Mundial da Saúde (OMS)', 'https://www.who.int/'],
  nih: ['National Institutes of Health (NIH)', 'https://www.nih.gov/'],
  mayo: ['Mayo Clinic', 'https://www.mayoclinic.org/'],
  sbc: ['Sociedade Brasileira de Cardiologia', 'https://www.cardiol.br/'],
  febrasgo: ['Febrasgo — Federação Brasileira das Associações de Ginecologia e Obstetrícia', 'https://www.febrasgo.org.br/'],
  sbem: ['Sociedade Brasileira de Endocrinologia e Metabologia', 'https://www.endocrino.org.br/'],
  sbgg: ['Sociedade Brasileira de Geriatria e Gerontologia', 'https://sbgg.org.br/'],
  harvard: ['Harvard Health Publishing', 'https://www.health.harvard.edu/']
};

const PROIBIDAS = [
  'neste artigo', 'vamos explorar', 'mergulhar', 'jornada', 'vale ressaltar', 'é importante destacar',
  'em suma', 'concluindo', 'fascinante mundo', 'desvendar os mistérios', 'no cenário atual'
];
const RESTOS_IA = [/como uma ia/i, /\[inserir/i, /lorem ipsum/i, /como modelo de linguagem/i];
// Promessas proibidas (cura/resultado garantido, "milagre", "sem efeitos colaterais", perda de peso com prazo). A trava é pela PROMESSA, não pela palavra:
// "não tem cura", "tem cura?" e "não existe milagre" passam (negação ou pergunta perto do trecho); "cura garantida" e "fórmula milagrosa" bloqueiam.
const CLAIMS = [
  /\bcura\s+(garantida|definitiva|total|r[aá]pida|imediata|certa|milagrosa|em\s+\d+)/i,
  /\bgarant(imos|e|ido|ida|idos|idas)\s+(a\s+cura|resultados?|o\s+emagrecimento)/i,
  /\bgarantimos\b/i,
  /\bgarant(e|ido)\s+que\s+voc[eê]\s+(vai|ir[aá])\s+(emagrec|cur|perd)/i,
  /\b(resultados?|efeitos?|emagrecimento|perda\s+de\s+peso|sucesso)\s+garantid[oa]s?\b/i,
  /\b(com|oferece|tem)\s+garantia\s+de\s+(resultado|cura|sucesso)/i,
  /\bmilagr(e|es|oso|osa|osos|osas)\b/i,
  /\bsem\s+(nenhum\s+)?efeitos?\s+colaterais?\b/i,
  /\bperca?\s+\d+\s*kg\s+em\b/i,
  /\b100\s*%\s*(seguro|natural|eficaz)/i,
];
const NEGA = /\b(n[aã]o|nem|nunca|jamais|sem\s+garantia|nenhum\w*|mito|promessas?\s+de|falsas?)\b/i;
// Devolve os trechos que prometem; ignora o que vem negado logo antes ou em forma de pergunta logo depois.
export function achaPromessas(texto) {
  const achados = [];
  for (const re of CLAIMS) {
    const g = new RegExp(re.source, 'gi');
    for (const m of texto.matchAll(g)) {
      const antes = texto.slice(Math.max(0, m.index - 40), m.index);
      const depois = texto.slice(m.index + m[0].length, m.index + m[0].length + 3);
      if (NEGA.test(antes) || /^\s*\?/.test(depois)) continue;
      achados.push(texto.slice(Math.max(0, m.index - 25), m.index + m[0].length + 25).replace(/\s+/g, ' ').trim());
    }
  }
  return achados;
}

const NOMES_FONTE = {
  'tuasaude.com': 'Tua Saúde', 'rededorsaoluiz.com.br': "Rede D'Or", 'altadiagnosticos.com.br': 'Alta Diagnósticos',
  'posenato.med.br': 'Posenato Diagnósticos', 'lusiadas.pt': 'Lusíadas Saúde', 'einstein.br': 'Hospital Israelita Albert Einstein',
  'labvital.com.br': 'LabVital', 'continentalhospitals.com': 'Continental Hospitals', 'labsl.com.br': 'Laboratório São Lucas',
  'saude.abril.com.br': 'Veja Saúde', 'h9j.com.br': 'Hospital Nove de Julho', 'socesp.org.br': 'SOCESP (Sociedade de Cardiologia do Estado de São Paulo)', 'nav.dasa.com.br': 'Nav Dasa', 'drauziovarella.uol.com.br': 'Portal Drauzio Varella', 'piracanjubaproforce.com.br': 'ProForce', 'portal.pucrs.br': 'PUCRS', 'revistagalileu.globo.com': 'Revista Galileu', 'valesaude.com.br': 'Vale Saúde', 'pesquisa.bvsalud.org': 'BVS Saúde'
};
const palavras = (t) => t.split(/\s+/).filter(Boolean).length;
const semHtml = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

class ArticleRobot {
  constructor() {
    this.db = this.readJson(ARTICLES_FILE, { articles: [], stats: { total: 0, published: 0 } });
    if (!this.db.stats) this.db.stats = { total: 0, published: 0 };
    this.kw = this.readJson(KEYWORDS_FILE, { keywords: [] }).keywords;
    this.stats = { generated: 0, approved: 0, published: 0, failed: 0 };
    this.uso = {};
  }

  readJson(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } }

  // ---------- 1. pauta ----------
  escolherPauta() {
    const usadas = new Set();
    for (const a of this.db.articles) {
      if (a.status === 'draft' && !a.estoque) continue;
      usadas.add((a.primaryKeyword || '').toLowerCase());
      usadas.add(a.slug);
    }
    const porSlug = new Map(this.db.articles.map(a => [a.slug, a]));
    const falhas = this.lerFalhasPauta();
    const livres = this.kw.filter(k => {
      if ((falhas[k.keyword]?.tentativas || 0) >= 2) return false; // reprovou 2 vezes: pula
      if (k.serp?.facil !== true || !k.fontes?.length) return false;
      // tema sensível (remédio, urgência, sexualidade...) só publica depois de revisão humana: tire `sensivel`/`revisar` da pauta
      if (k.sensivel === true && k.revisar === true) return false;
      if (ESTOQUE && k.substitui) return false; // reescrita de artigo no ar não passa pelo estoque
      if (k.substitui) return !!porSlug.get(k.substitui) && porSlug.get(k.substitui).validador !== 'APROVADO';
      return !usadas.has(k.keyword.toLowerCase()) && !usadas.has(slugify(k.keyword));
    });
    // Torres: pilar antes dos satélites; alterna a categoria do último artigo publicado; depois por volume
    const publicados = this.db.articles.filter(a => a.status === 'published');
    const ultima = publicados[publicados.length - 1]?.cluster;
    const saiu = (kw) => publicados.some(a => (a.primaryKeyword || '').toLowerCase() === String(kw || '').toLowerCase());
    const espera = (k) => (k.papel === 'satelite' && k.pilar && !saiu(k.pilar) ? 1 : 0);
    livres.sort((a, b) => espera(a) - espera(b) || (a.cluster === ultima ? 1 : 0) - (b.cluster === ultima ? 1 : 0) || b.volume - a.volume);
    // o teto diário (DAILY_LIMIT) limita só a PUBLICAÇÃO; escrever para o estoque usa o lote inteiro
    return livres.slice(0, ESTOQUE ? BATCH_SIZE : Math.min(BATCH_SIZE, this.restanteHoje()));
  }

  lerFalhasPauta() { try { return JSON.parse(fs.readFileSync(PAUTAS_FALHAS, 'utf8')); } catch { return {}; } }
  registrarFalhaPauta(keyword, motivo) {
    const f = this.lerFalhasPauta();
    const e = f[keyword] || { tentativas: 0 };
    e.tentativas++; e.ultima = new Date().toISOString().slice(0, 10); e.motivo = String(motivo).slice(0, 300);
    f[keyword] = e;
    fs.mkdirSync(path.dirname(PAUTAS_FALHAS), { recursive: true });
    fs.writeFileSync(PAUTAS_FALHAS, JSON.stringify(f, null, 1));
  }

  // Já saiu hoje (dia de Brasília) o artigo novo escrito por IA? Então as outras execuções só publicam do estoque.
  novoHoje() {
    if (process.env.FORCAR_NOVO === '1') return false; // teste manual: ignora o artigo novo que já saiu hoje
    const inicio = new Date(new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10) + 'T03:00:00Z').getTime();
    return this.db.articles.some(a => a.status === 'published' && a.escritoPor && Date.parse(a.publishedAt) >= inicio);
  }

  // Quantos artigos ainda cabem hoje (dia de Brasília, UTC-3) pelo teto DAILY_LIMIT
  restanteHoje() {
    const dia = (iso) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
    const hoje = dia(new Date().toISOString());
    const feitos = this.db.articles.filter(a => a.status === 'published' && a.publishedAt && dia(a.publishedAt) === hoje).length;
    return Math.max(0, DAILY_LIMIT - feitos);
  }

  // ---------- estoque de artigos prontos ----------
  // Só publica do estoque o que foi aprovado pelo robô ou importado (ChatGPT etc.) E tem auditoria acima de 85; abaixo disso fica retido para correção.
  // Artigo do estoque que o dono precisa revisar antes de ir ao ar: nota final abaixo de 90 ou tema sensível sem REVISADO: sim.
  precisaRevisao(a) { return (a.scores?.total ?? 100) < 90 || (a.scores?.atencao || []).some(m => m.includes('tema sensível')); }
  prontosNoEstoque() { return this.db.articles.filter(a => a.status === 'draft' && a.estoque === true && (a.validador === 'APROVADO' || a.origem === 'importado') && (a.scores?.auditoria ?? 100) > 85 && !this.precisaRevisao(a)); }

  // Publica do estoque (no máximo `quantos`, respeitando o teto do dia). Devolve quantos publicou.
  // Artigo guardado sem foto (fotoPendente) busca a foto AGORA, na hora de publicar; se as APIs de foto
  // ainda estiverem no limite, ele fica no estoque e a vez passa para o próximo (nunca vai ao ar sem imagem).
  async publicarDoEstoque(quantos) {
    const agora = new Date().toISOString();
    const limite = Math.max(0, Math.min(quantos, this.restanteHoje()));
    let publicados = 0;
    for (const a of this.prontosNoEstoque()) {
      if (publicados >= limite) break;
      if (a.fotoPendente) {
        let ok = false;
        try { ok = await this.imagem(a); } catch (e) { console.log(`  ⚠️  ${e.message}`); }
        if (!ok) {
          for (const k of ['featuredImage', 'imageAlt', 'imageCredit', 'images', 'imageIds']) delete a[k];
          console.log(`  📷 sem foto agora para /${a.slug}/: continua no estoque e tenta de novo na próxima execução`);
          continue;
        }
        delete a.fotoPendente;
      }
      a.status = 'published'; a.publishedAt = agora; a.estoque = false; a.publicadoDoEstoqueEm = agora;
      this.stats.published++; publicados++;
      console.log(`  📤 publicado do estoque: /${a.slug}/`);
    }
    return publicados;
  }

  // Briefing salvo no GitHub (scripts/briefing.js): perguntas do Google, buscas relacionadas, meta de escrita e pontes de link.
  // Só acrescenta ao prompt; sem arquivo, não muda nada. Os FATOS continuam vindo só dos trechos das fontes.
  briefing(p) {
    const b = this.readJson(`data/briefings/${slugify(p.keyword)}.json`, null);
    if (!b) return '';
    const partes = [];
    if (b.perguntasDoGoogle?.length) partes.push(`PERGUNTAS REAIS que o Google mostra para este tema (responda cada uma, de forma curta, em seções H2 ou na seção de perguntas frequentes, SÓ com o que as fontes sustentam): ${b.perguntasDoGoogle.join(' | ')}.`);
    if (b.buscasRelacionadas?.length) partes.push(`Buscas relacionadas (use como variações naturais): ${b.buscasRelacionadas.join('; ')}.`);
    if (b.metaEscrita) partes.push(`META vinda do topo orgânico do Google: cerca de ${b.metaEscrita.medianaPalavras} palavras, ${b.metaEscrita.medianaH2} seções H2 e ${b.metaEscrita.medianaImagens} imagens${b.metaEscrita.secoesQueOTopoCobre?.length ? `; o topo cobre: ${b.metaEscrita.secoesQueOTopoCobre.join('; ')}` : ''}. Seja mais completo e mais claro, sem passar de 1.800 palavras.`);
    const pontes = (b.pontes || []).map((x) => ({ x, art: this.artigoPorKeyword(x.para) })).filter((y) => y.art).slice(0, 3);
    if (pontes.length) partes.push(`PONTES de link interno (use quando fizer sentido no texto; âncora natural): ${pontes.map(({ x, art }) => `/${art.slug}/ — âncoras possíveis: ${x.ancoras.slice(0, 3).join(' | ')}`).join(' ;; ')}.`);
    return partes.join('\n');
  }

  // O concorrente PRINCIPAL = a página orgânica em 1º lugar no Google para a frase da pauta (decisão do usuário: estudar e melhorar só ele).
  // Usa o briefing (top 3 orgânico, sem anúncio); sem briefing, a primeira fonte lida que não seja rede social/wiki/Q&A.
  concorrentePrincipal(p, fontesLidas) {
    const b = this.readJson(`data/briefings/${slugify(p.keyword)}.json`, null);
    const urlTopo = b?.google?.top3Organicos?.[0];
    const achada = urlTopo && fontesLidas.find((f) => f.url === urlTopo);
    if (achada) return achada;
    const FRACOS = /(instagram|facebook|youtube|tiktok|pinterest|reddit|quora|wikipedia|doctoralia\.com\.br\/perguntas|ident\.com\.br\/ia)/;
    return fontesLidas.find((f) => !FRACOS.test(f.url)) || fontesLidas[0] || null;
  }

  artigoPorKeyword(kw) {
    return this.db.articles.find(a => a.status === 'published' && a.validador === 'APROVADO' && (a.primaryKeyword || '').toLowerCase() === String(kw || '').toLowerCase());
  }

  // Torre de conteúdo: satélite linka o pilar; pilar linka os satélites já publicados
  linksTorre(p) {
    if (p.pilar) {
      const pil = this.artigoPorKeyword(p.pilar);
      if (pil) return `LINK OBRIGATÓRIO para o guia principal desta torre de conteúdo: <a href="/${pil.slug}/">…</a> ("${pil.title}"), com texto âncora natural que contenha "${p.pilar}". Esse link conta entre os 2 links internos.`;
    }
    if (p.papel === 'pilar') {
      const sats = this.kw.filter(k => k.pilar === p.keyword).map(k => this.artigoPorKeyword(k.keyword)).filter(Boolean).slice(0, 8);
      if (sats.length) return `Este artigo é o guia principal de uma torre. Linke (com âncora natural) os artigos de apoio já publicados que fizerem sentido: ${sats.map(x => `/${x.slug}/ — ${x.title}`).join(' | ')}.`;
    }
    return '';
  }

  linksInternos() {
    return this.db.articles
      .filter(a => a.status === 'published' && a.validador === 'APROVADO' && /^[a-z0-9-]+$/.test(a.slug || ''))
      .map(a => ({ slug: a.slug, title: a.title }));
  }

  // ---------- 1b. fontes reais ----------
  async buscarFontes(p) {
    const ok = [];
    for (const url of p.fontes) {
      try {
        const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Saude40Bot/1.0)', 'accept-language': 'pt-BR' }, signal: AbortSignal.timeout(25000), redirect: 'follow' });
        if (!r.ok) { console.log(`  ⚠️  fonte ${r.status}: ${url}`); continue; }
        const html = await r.text();
        const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, url])[1].replace(/\s+/g, ' ').trim().slice(0, 140);
        const texto = html.replace(/<(script|style|noscript|nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
        if (texto.length < 1500) { console.log(`  ⚠️  fonte com pouco texto: ${url}`); continue; }
        const host = new URL(url).hostname.replace(/^www\./, '');
        const site = (html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i) || [])[1];
        // Subtítulos da página: mostram o que o concorrente bem posicionado cobre (roteiro de seções, não fonte de fatos)
        const topicos = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)].map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()).filter((t) => t.length >= 8 && t.length <= 110 && !/leia (também|mais)|compartilh|coment[aá]rio|newsletter|siga|inscreva|publicidade|cookies|menu|pesquis/i.test(t)).slice(0, 14);
        // Sinais de SEO da página (referência do que está no topo): título, descrição, tamanho, imagens e alt
        const meta = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) || [])[1] || '';
        const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
        const seo = { titulo: title, descricao: meta.trim(), palavras: texto.split(/\s+/).length, imagens: imgs.length, imagensComAlt: imgs.filter((t) => /\balt=["'][^"']{8,}["']/i.test(t)).length, faq: /perguntas frequentes|\bfaq\b/i.test(html) };
        ok.push({ title, nome: NOMES_FONTE[host] || (site && site.trim().slice(0, 60)) || host, url, texto: texto.slice(0, 7000), topicos, seo });
        console.log(`  📄 fonte lida (${texto.length} chars): ${url}`);
      } catch (e) { console.log(`  ⚠️  fonte inacessível (${e.message}): ${url}`); }
    }
    return ok;
  }

  // ---------- 2. redator ----------
  async claude(prompt, maxTokens = 16000, model = WRITER_MODEL, papel = 'redator') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] })
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    this.registrarUso(model, papel, data.usage);
    if (data.stop_reason === 'max_tokens') throw new Error('TRUNCADO');
    return data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  }

  registrarUso(model, papel, usage) {
    const k = `${papel}:${model}`;
    const u = (this.uso[k] ||= { chamadas: 0, entrada: 0, saida: 0 });
    u.chamadas++;
    u.entrada += usage?.input_tokens || 0;
    u.saida += usage?.output_tokens || 0;
  }

  relatorioCusto() {
    let total = 0;
    const linhas = [];
    for (const [k, u] of Object.entries(this.uso)) {
      const [papel, model] = k.split(':');
      const [pe, ps] = PRECOS[model] || [0, 0];
      const custo = (u.entrada * pe + u.saida * ps) / 1e6;
      total += custo;
      linhas.push(`  ${papel} (${model}): ${u.chamadas} chamadas | ${u.entrada} tokens entrada | ${u.saida} saída | US$ ${custo.toFixed(4)}`);
    }
    const entregues = this.stats.published + (this.stats.estocados || 0);
    const porPublicado = total / Math.max(1, entregues);
    console.log('\n💰 CUSTO DA EXECUÇÃO');
    linhas.forEach(l => console.log(l));
    console.log(`  total US$ ${total.toFixed(4)} | por artigo entregue US$ ${porPublicado.toFixed(4)} | tentativas de redação ${this.stats.generated} (${(this.stats.generated / Math.max(1, entregues)).toFixed(1)} por artigo entregue) | entregues ${entregues}`);
    if (process.env.DRY_RUN) return;
    const hist = this.readJson(METRICS_FILE, []);
    hist.push({ data: new Date().toISOString(), modeloRedator: WRITER_MODEL, modeloValidador: VALIDATOR_MODEL, tentativas: this.stats.generated, aprovados: this.stats.approved, publicados: this.stats.published, estocados: this.stats.estocados || 0, falhas: this.stats.failed, porArtigo: this.stats.porArtigo || [], uso: this.uso, custoUSD: Number(total.toFixed(4)), custoPorPublicadoUSD: Number(porPublicado.toFixed(4)) });
    fs.writeFileSync(METRICS_FILE, JSON.stringify(hist, null, 2));
  }

  // Estado do redator no dia de Brasília: { data, provedor: null|'claude', chamadas } em data/llm-estado.json
  estadoLLM() {
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    try { const e = JSON.parse(fs.readFileSync(LLM_ESTADO, 'utf8')); if (e.data === hoje) return e; } catch { /* sem estado de hoje */ }
    return { data: hoje, provedor: null, chamadas: 0 };
  }
  gravarEstadoLLM(e) { fs.mkdirSync(path.dirname(LLM_ESTADO), { recursive: true }); fs.writeFileSync(LLM_ESTADO, JSON.stringify(e)); }
  // O Gemini escreveu e o artigo foi reprovado: o Claude assume as próximas voltas e o resto do dia.
  geminiFalhou() {
    if (this.provedorUsado !== 'gemini') return;
    const e = this.estadoLLM(); e.provedor = 'claude'; this.gravarEstadoLLM(e);
    console.log('  ↪️  artigo do Gemini reprovado: o Claude assume a pauta e o resto do dia');
  }

  async gemini(prompt) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': (process.env.GEMINI_API_KEY || '').trim() },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = await res.json();
    const cand = j.candidates?.[0];
    const texto = (cand?.content?.parts || []).map(x => x.text || '').join('').trim();
    if (!texto) throw new Error('Gemini: resposta vazia');
    this.registrarUso(GEMINI_MODEL, 'redator', { input_tokens: j.usageMetadata?.promptTokenCount, output_tokens: j.usageMetadata?.candidatesTokenCount });
    if (cand?.finishReason === 'MAX_TOKENS') throw new Error('Gemini: resposta truncada');
    return texto;
  }

  // Gemini primeiro (se houver chave, não tiver falhado hoje e estiver dentro do teto de chamadas); qualquer erro passa ao Claude.
  async redigir(prompt, limite) {
    const e = this.estadoLLM();
    if ((process.env.GEMINI_API_KEY || '').trim() && e.provedor !== 'claude' && e.chamadas < MAX_GEMINI_CHAMADAS_DIA) {
      e.chamadas++; this.gravarEstadoLLM(e);
      try { const t = await this.gemini(prompt); this.provedorUsado = 'gemini'; return t; }
      catch (err) { console.log(`  ↪️  Gemini falhou, o Claude assume e fica com o resto do dia: ${err.message}`); e.provedor = 'claude'; this.gravarEstadoLLM(e); }
    }
    this.provedorUsado = 'claude';
    return await this.claude(prompt, limite);
  }

  async escrever(prompt) {
    let limite = 16000;
    for (let t = 1; t <= 3; t++) {
      try { return await this.redigir(prompt, limite); }
      catch (e) { if (e.message !== 'TRUNCADO' || t === 3) throw e; limite = Math.min(limite * 2, 48000); console.log(`  ↻ resposta truncada, repetindo com limite ${limite}`); }
    }
  }

  promptRedator(p, links, devolucao, fontesLidas, anterior) {
    const trechos = fontesLidas.map((f, i) => `[FONTE ${i + 1}] NOME PARA CITAR: ${f.nome}\nTítulo da página: ${f.title}\nURL: ${f.url}\nTEXTO:\n${f.texto}`).join('\n\n---\n\n');
    const lista = links.map(l => `/${l.slug}/ — ${l.title}`).join('\n') || '(nenhum)';
    return `Você é redator do blog Saúde 40+ (saúde após os 40, público principal mulheres). Escreva UM artigo em português do Brasil.

PALAVRA-CHAVE PRINCIPAL: "${p.keyword}" (${p.volume} buscas/mês no Brasil). Uma pauta = uma intenção = uma URL.
${p.absorve?.length ? `Variações que viram SEÇÕES H2 deste mesmo artigo (não artigos novos): ${p.absorve.join('; ')}.` : ''}
${this.linksTorre(p)}
${this.briefing(p)}
${p.secundarias?.length ? `Palavras secundárias com busca comprovada (cubra a demanda delas de forma natural em títulos de seção ou no texto, só quando as fontes sustentarem; sem forçar nem repetir): ${p.secundarias.map((s) => `${s.palavra} (${s.volume})`).join('; ')}.` : ''}
${(() => {
      const prin = this.concorrentePrincipal(p, fontesLidas);
      const seo = prin?.seo ? [prin.seo] : [];
      if (!seo.length) return '';
      const pal = seo.map((x) => x.palavras).sort((a, b) => a - b);
      const mediana = pal[Math.floor(pal.length / 2)];
      const alvo = Math.min(1800, Math.max(1300, Math.round(mediana * 1.1 / 50) * 50));
      return `REFERÊNCIA DE SEO (SÓ o concorrente principal, a página em 1º lugar no Google; estude, melhore e escreva o seu próprio, sem copiar): ${seo.map((x) => `"${x.titulo.slice(0, 70)}" (~${x.palavras} palavras, ${x.imagens} imagens, ${x.imagensComAlt} com alt${x.faq ? ', tem FAQ' : ''})`).join(' | ')}. Meta: cobrir tudo que elas cobrem e ser mais claro e mais seguro; mire cerca de ${alvo} palavras (nunca passe de 1.800). TITLE e DESCRIPTION devem ser diferentes dos títulos e descrições delas, com a palavra-chave e um benefício concreto para o leitor. Cada ALT descreve a cena e, quando natural, usa uma variação da palavra-chave (sem repetir o alt de outra imagem).`;
    })()}
${(() => { const t = [...new Set(this.concorrentePrincipal(p, fontesLidas)?.topicos || [])].slice(0, 20); return t.length ? `Assuntos que o concorrente principal (1º do Google) cobre (use como ponto de partida para o artigo ser tão completo quanto elas; escreva uma seção só se o assunto estiver nos TRECHOS DAS FONTES, nunca copie títulos nem frases): ${t.join(' | ')}.` : ''; })()}

ORIGINALIDADE (exigência do dono do blog: conteúdo AUTÊNTICO e EXCLUSIVO, não modelado em concorrente):
- As páginas do topo e as fontes mostram O QUE o leitor espera encontrar. Elas NÃO são modelo de texto: não siga a ordem das seções delas, não reaproveite frases nem a mesma estrutura de lista, não faça paráfrase linha a linha.
- Construa um ângulo próprio e útil, começando pelo problema real de quem busca "${p.keyword}". Organize você mesmo o conhecimento das fontes em ferramentas práticas, SEM acrescentar fatos novos: um passo a passo claro, um "o que observar em você" (checklist), "erros comuns", "perguntas para levar ao médico" e "como usar isso no seu dia a dia".
- Voz própria do blog Saúde 40+: direta, acolhedora, sem jargão. TITLE e DESCRIPTION originais.
- O sistema compara o seu texto com as fontes: qualquer trecho com 7 ou mais palavras seguidas iguais a uma fonte conta como cópia e o artigo é devolvido.

REGRAS (padrão Mente Curiosa):
1. Primeiro parágrafo responde a pergunta direto, em ATÉ 45 palavras, e COMEÇA com a palavra-chave exata (ela deve aparecer nas 6 primeiras palavras do parágrafo).
2. 1.300 a 1.800 palavras de conteúdo útil, sem enchimento. Cada seção precisa ensinar algo.
3. HTML sem <html>/<body>/<h1>. No mínimo 5 seções <h2> (um <h2> a cada ~300 palavras), <h3> opcional, <p>, <ul>/<li>. NUNCA use <h1>.
4. Ordem sugerida: resposta direta → explicado de forma simples → o que muda depois dos 40 → o que a ciência sabe → o que fazer no dia a dia → mitos e verdades → perguntas frequentes → <h2>Resumindo</h2>. Inclua <h2>Quando procurar um médico</h2>.
5. Parágrafos de no máximo 45 palavras (conte; divida os longos); frases de até 22 palavras em média.
6. NÃO escreva a seção de Fontes (o sistema anexa). Use SOMENTE fatos presentes nos TRECHOS DAS FONTES abaixo; reescreva com suas palavras (não copie frases). Se um fato não está nos trechos, não escreva. Se as fontes divergirem num número, omita o número. Ao citar uma fonte no texto, use EXATAMENTE o "NOME PARA CITAR" dela e só atribua o que o trecho dessa fonte realmente diz. Não escreva comparações, imagens ou exemplos de cotidiano que não estejam nos trechos.
7. Pelo menos 2 links internos no corpo no formato <a href="/slug/">texto natural</a>, escolhendo SÓ desta lista (se a lista tiver menos de 2, use o que houver):
${lista}
8. NUNCA invente números, estudos, nomes, depoimentos, antes/depois ou resultados. Na dúvida, corte. Sem PROMESSA de cura, de emagrecimento garantido ou de "sem efeitos colaterais" (as palavras podem aparecer quando negam ou explicam, ex.: "não tem cura"). Sem diagnóstico, sem dose de medicamento ou suplemento.
9. "Depois dos 40" é só o público do blog: NÃO afirme nada específico de idade, menopausa, hormônios ou "após os 40" que não esteja escrito nos trechos das fontes. Se as fontes não falam de 40+, escreva de forma geral e use "você".
9b. Tom humano: "você", exemplos do dia a dia. PROIBIDO: ${PROIBIDAS.map(x => `"${x}"`).join(', ')}.
10. Não mencione marcas de suplemento nem venda produtos.
${devolucao ? `\nA VERSÃO ANTERIOR FOI DEVOLVIDA. Reescreva o artigo COMPLETO corrigindo SOMENTE estes pontos, sem encurtar (mantenha 1.300+ palavras e todas as seções, incluindo "Quando procurar um médico" e "Resumindo"). Remova ou reformule qualquer frase apontada como sem apoio nas fontes:\n- ${devolucao.join('\n- ')}\n\nVERSÃO ANTERIOR (HTML) PARA VOCÊ CORRIGIR:\n${anterior || ''}\n` : ''}
TRECHOS DAS FONTES (única base factual permitida):
${trechos}

FORMATO DA RESPOSTA (exatamente, sem cercas de código):
TITLE: <título que contenha a palavra-chave, NO MÁXIMO 46 caracteres contando espaços (conte!)>
DESCRIPTION: <entre 125 e 155 caracteres contando espaços, contendo a palavra-chave exata>
CAPA_BUSCA: <busca de foto em INGLÊS, cena concreta e fotografável, sem marcas>
CAPA_ALT: <alt em português descrevendo o que aparece na foto, 25+ caracteres>
FOTO1_BUSCA: <busca em INGLÊS, cena diferente da capa>
FOTO1_ALT: <alt em português, 25+ caracteres>
FOTO1_LEGENDA: <legenda que liga a foto ao texto, até 120 caracteres>
FOTO1_SECAO: <número do <h2> (1 = primeiro h2 do corpo) em cujo fim a foto entra>
FOTO2_BUSCA: <busca em INGLÊS, cena diferente da capa e da foto 1>
FOTO2_ALT: <alt em português, 25+ caracteres>
FOTO2_LEGENDA: <legenda, até 120 caracteres>
FOTO2_SECAO: <número do <h2>, diferente do da foto 1>
---
<corpo em HTML>`;
  }

  parse(raw) {
    const i = raw.indexOf('\n---\n');
    if (i < 0) throw new Error('resposta sem separador ---');
    const header = raw.slice(0, i), body = raw.slice(i + 5);
    const get = (k) => (header.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim();
    const title = get('TITLE'), description = get('DESCRIPTION'), capaBusca = get('CAPA_BUSCA'), capaAlt = get('CAPA_ALT'), capaPexelsId = get('CAPA_PEXELS_ID');
    if (!title || !description || !capaBusca || !capaAlt) throw new Error('cabeçalho incompleto');
    const fotos = [1, 2].map(n => ({ busca: get(`FOTO${n}_BUSCA`), alt: get(`FOTO${n}_ALT`), legenda: get(`FOTO${n}_LEGENDA`), pexelsId: get(`FOTO${n}_PEXELS_ID`), secao: parseInt(get(`FOTO${n}_SECAO`), 10) || n + 1 })).filter(f => f.busca && f.alt);
    return { title, description, capaBusca, capaAlt, capaPexelsId, fotos, body: body.trim().replace(/^```html\n?|```\s*$/g, '').trim() };
  }

  montar(p, d, fontesLidas) {
    let body = d.body;
    body += `\n<h2>Fontes</h2>\n<ul>\n${fontesLidas.map(f => `<li><a href="${f.url}" rel="noopener nofollow" target="_blank">${f.title}</a></li>`).join('\n')}\n</ul>`;
    body += `\n<p><em>${DISCLAIMER}</em></p>`;
    const words = palavras(semHtml(body));
    const now = new Date().toISOString();
    return {
      id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: d.title,
      slug: p.slug || slugify(p.keyword),
      _substitui: p.substitui || null,
      primaryKeyword: p.keyword,
      cluster: p.cluster,
      pilar: p.pilar || null,
      papel: p.papel || null,
      description: d.description,
      excerpt: d.description,
      content: body,
      wordCount: words,
      readingTime: Math.max(1, Math.round(words / 200)),
      sources: fontesLidas.map(f => ({ title: f.title, url: f.url })),
      bodyOriginal: d.body,
      imagePlan: { capa: { busca: d.capaBusca, alt: d.capaAlt, pexelsId: d.capaPexelsId }, fotos: d.fotos },
      volume: p.volume,
      status: 'generated',
      createdAt: now
    };
  }

  // ---------- 3. auditoria automática (B01–B06 + pontuação) ----------
  // Originalidade: fração de sequências de 7 palavras do artigo que aparecem iguais em alguma fonte/concorrente lida.
  semelhanca(html, fontesLidas) {
    const palavrasDe = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    const N = 7;
    const corpo = html.replace(/<h2>\s*Fontes[\s\S]*$/i, ' ');
    const meu = palavrasDe(semHtml(corpo));
    if (meu.length < N * 4) return { pct: 0, exemplos: [] };
    const deles = new Set();
    for (const f of fontesLidas || []) { const w = palavrasDe(f.texto || ''); for (let i = 0; i + N <= w.length; i++) deles.add(w.slice(i, i + N).join(' ')); }
    let iguais = 0; const exemplos = [];
    const total = meu.length - N + 1;
    for (let i = 0; i < total; i++) { const sh = meu.slice(i, i + N).join(' '); if (deles.has(sh)) { iguais++; if (exemplos.length < 3 && (!exemplos.length || i - exemplos.ultimo > N)) { exemplos.push(sh); exemplos.ultimo = i; } } }
    return { pct: Math.round(iguais / total * 1000) / 10, exemplos };
  }

  auditar(a, fontesLidas) {
    const html = a.content, texto = semHtml(html), kw = a.primaryKeyword.toLowerCase();
    const bloqueios = [];
    if (/<h1/i.test(html)) bloqueios.push('B01: H1 no corpo');
    if (a.wordCount < 1000) bloqueios.push(`B02: ${a.wordCount} palavras (mín 1000)`);
    if (!a.sources.length) bloqueios.push('B03: sem fonte');
    if (this.db.articles.some(x => x.status !== 'draft' && x.slug === a.slug && x.slug !== a._substitui)) bloqueios.push('B04: keyword/slug já existe (canibalização)');
    if (!texto.includes('não substitui a orientação de um profissional de saúde')) bloqueios.push('B05: sem aviso de saúde');
    if (RESTOS_IA.some(r => r.test(texto))) bloqueios.push('B06: resto de rascunho/IA');
    const promessas = achaPromessas(texto);
    if (promessas.length) bloqueios.push(`SEG: promessa proibida (cura/resultado garantido, milagre, sem efeitos colaterais): "${promessas[0]}"`);
    if (fontesLidas?.length) {
      const sim = this.semelhanca(html, fontesLidas);
      if (sim.pct > MAX_SEMELHANCA) bloqueios.push(`B07: ${sim.pct}% do texto tem sequências de 7 palavras iguais às fontes/concorrentes (máx ${MAX_SEMELHANCA}%); reescreva com SUAS palavras e estrutura própria. Exemplos copiados: "${sim.exemplos.join('" | "')}"`);
    }

    let nota = 100; const alertas = [];
    const perde = (pts, msg) => { nota -= pts; alertas.push(msg); };
    if (a.title.length + SITE_SUFFIX.length > 60) perde(5, `title ${a.title.length + SITE_SUFFIX.length} chars com sufixo (máx 60)`);
    if (!a.title.toLowerCase().includes(kw)) perde(5, 'keyword fora do title');
    if (a.description.length < 120 || a.description.length > 160) perde(4, `description ${a.description.length} chars (120–160)`);
    if (!a.description.toLowerCase().includes(kw)) perde(3, 'keyword fora da description');
    const paragrafos = [...html.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map(m => semHtml(m[1])).filter(Boolean);
    const p1 = paragrafos[0] || '';
    if (!p1.toLowerCase().includes(kw)) perde(8, 'keyword fora do 1º parágrafo');
    if (palavras(p1) > 50) perde(6, `1º parágrafo com ${palavras(p1)} palavras (máx 50)`);
    if (a.wordCount < 1200) perde(4, `${a.wordCount} palavras (ideal ≥ 1200)`);
    const h2 = (html.match(/<h2/gi) || []).length;
    if (h2 < 4) perde(8, `${h2} seções H2 (mín 4)`);
    if (!/<h2>\s*Resumindo/i.test(html)) perde(3, 'sem resumo final');
    if (!/<h2>[^<]*Quando procurar um m[eé]dico/i.test(html)) perde(6, 'sem "Quando procurar um médico"');
    const internos = [...html.matchAll(/href="(\/[a-z0-9-]+\/)"/g)].map(m => m[1]);
    const validos = new Set(this.linksInternos().map(l => `/${l.slug}/`));
    const ruins = internos.filter(l => !validos.has(l));
    if (ruins.length) bloqueios.push(`LINK: links internos inexistentes ${ruins.join(', ')}`);
    if (internos.length < 2 && validos.size >= 2) perde(8, `${internos.length} links internos (mín 2)`);
    const pil = a.pilar && this.artigoPorKeyword(a.pilar);
    if (pil && !internos.includes(`/${pil.slug}/`)) perde(6, `sem link para o guia principal "${a.pilar}"`);
    if (a.sources.length < 2) perde(6, 'menos de 2 fontes');
    const longos = paragrafos.filter(p => palavras(p) > 50).length;
    if (longos) perde(Math.min(8, longos * 2), `${longos} parágrafos > 50 palavras`);
    const frases = texto.split(/(?<=[.!?])\s+/).filter(Boolean);
    const media = frases.reduce((s, f) => s + palavras(f), 0) / Math.max(1, frases.length);
    if (media > 22) perde(5, `frases com média de ${media.toFixed(1)} palavras (máx 22)`);
    const dens = (texto.toLowerCase().split(kw).length - 1) * palavras(kw) / Math.max(1, a.wordCount) * 100;
    if (dens > 5) bloqueios.push(`B08: densidade da palavra-chave ${dens.toFixed(1)}% (máx 5%; ideal até 3%). Reduza as repetições: use sinônimos, pronomes e variações naturais em vez de repetir "${a.primaryKeyword}"`);
    else if (dens > 3) perde(8, `densidade da keyword ${dens.toFixed(1)}% (máx 3%): varie com sinônimos e pronomes`);
    const usadas = PROIBIDAS.filter(f => texto.toLowerCase().includes(f));
    if (usadas.length) perde(Math.min(10, usadas.length * 3), `frases proibidas: ${usadas.join(', ')}`);
    return { nota: Math.max(0, nota), bloqueios, alertas };
  }

  // ---------- 4. validador (2ª chamada, fatos e segurança) ----------
  async validar(a, fontesLidas) {
    const prompt = `Você é o VALIDADOR do blog Saúde 40+. Não reescreva; aprove ou devolva com motivos objetivos.

IMPORTANTE: links internos do site (href="/slug/") apontam para outros artigos do próprio blog; NÃO os julgue nem reprove por eles (não há trechos deles aqui). Reprove (DEVOLVER) somente por V1 (fato, número ou afirmação específica sem apoio nos trechos), V2 ou V6; nos demais itens, no máximo sugira.

Checklist: V1 fatos batem com as fontes citadas (qualquer número, estudo, nome ou estatística sem apoio reprova) · V2 fontes são pertinentes ao assunto · V3 o 1º parágrafo responde a pergunta · V4 cada seção ensina algo (sem enchimento) · V5 tom humano (apenas sugestão, NÃO reprove por tom ou estilo) · V6 é seguro (sem diagnóstico, dose, promessa de cura/emagrecimento, nem orientação perigosa) · V7 nada de marca ou venda.

TRECHOS DAS FONTES (única base factual permitida; V1 reprova qualquer fato, número ou afirmação específica que não esteja aqui):\n${fontesLidas.map((f, i) => `[FONTE ${i + 1}] ${f.nome} (${f.url})\n${f.texto}`).join('\n\n---\n\n')}\n\nFontes citadas: ${a.sources.map(s => s.title).join('; ')}
Palavra-chave: ${a.primaryKeyword}

TÍTULO: ${a.title}
CORPO:
${a.content}

Responda SOMENTE com um objeto JSON válido (sem texto antes ou depois, sem cercas de código), no formato: {"decisao":"APROVADO"|"DEVOLVER","motivos":["V1: ...","V4: ..."]}`;
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      let raw;
      try { raw = await this.claude(prompt, 12000, VALIDATOR_MODEL, 'validador'); } catch (e) { if (e.message === 'TRUNCADO') { console.log('  ↻ validador truncado'); continue; } throw e; }
      const m = raw.match(/\{[\s\S]*"decisao"[\s\S]*\}/);
      if (m) { try { const j = JSON.parse(m[0]); if (j.decisao) return j; } catch { /* tenta de novo */ } }
      console.log(`  ↻ validador fora do formato (tentativa ${tentativa}): ${raw.slice(0, 200).replace(/\n/g, ' ')}`);
    }
    throw new Error('validador sem JSON após 3 tentativas');
  }

  async produzir(p) {
    let devolucao = null, art = null, ultimo = null;
    const fontesLidas = await this.buscarFontes(p);
    if (fontesLidas.length < 2) throw new Error(`só ${fontesLidas.length} fonte(s) legível(is); mínimo 2, artigo não gerado`);
    for (let volta = 1; volta <= MAX_VOLTAS; volta++) {
      art = this.montar(p, this.parse(await this.escrever(this.promptRedator(p, this.linksInternos().filter(l => l.slug !== (p.slug || slugify(p.keyword))), devolucao, fontesLidas, art?.bodyOriginal))), fontesLidas);
      this.stats.generated++;
      const aud = this.auditar(art, fontesLidas);
      console.log(`  volta ${volta}: ${art.wordCount} palavras | auditoria ${aud.nota}/100${aud.bloqueios.length ? ' | BLOQUEIOS: ' + aud.bloqueios.join('; ') : ''}`);
      aud.alertas.forEach(x => console.log(`     · ${x}`));
      if (aud.bloqueios.length || aud.nota < MIN_SCORE) { devolucao = [...aud.bloqueios, ...aud.alertas]; ultimo = { art, motivos: devolucao }; this.geminiFalhou(); continue; }
      const v = await this.validar(art, fontesLidas);
      console.log(`  validador: ${v.decisao}${v.motivos?.length ? ' — ' + v.motivos.join(' | ') : ''}`);
      if (v.decisao === 'APROVADO') { art.scores = { auditoria: aud.nota }; art.validador = 'APROVADO'; delete art.bodyOriginal; return art; }
      devolucao = v.motivos || ['validador devolveu'];
      ultimo = { art, motivos: devolucao };
      this.geminiFalhou();
    }
    delete ultimo.art.bodyOriginal; delete ultimo.art._substitui;
    ultimo.art.status = 'draft';
    ultimo.art.issues = ultimo.motivos;
    this.reprovado = ultimo.art;
    return null;
  }

  // ---------- 5. imagem ----------
  // ---------- 5. imagens (Pexels + Pixabay + Unsplash) ----------
  async buscarFoto(busca, preferir, usadas, pexelsId) {
    if (pexelsId && process.env.PEXEL_API_KEY) {
      const r = await fetch(`https://api.pexels.com/v1/photos/${pexelsId}`, { headers: { Authorization: process.env.PEXEL_API_KEY } });
      if (r.ok) { const f = await r.json(); return { id: `pexels:${f.id}`, url: f.src.large, width: 940, height: Math.round(940 * f.height / f.width), credit: { author: f.photographer, source: 'Pexels', url: f.url, license: 'Licença Pexels', licenseUrl: 'https://www.pexels.com/license/' } }; }
      console.log(`  ⚠️  Pexels id ${pexelsId}: ${r.status}; usando busca`);
    }
    const pexels = async () => {
      if (!process.env.PEXEL_API_KEY) return null;
      const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(busca)}&per_page=20&orientation=landscape`, { headers: { Authorization: process.env.PEXEL_API_KEY.trim() } });
      if (!r.ok) {
        const h = (n) => r.headers.get(n);
        const reset = h('x-ratelimit-reset') ? new Date(Number(h('x-ratelimit-reset')) * 1000).toISOString() : '?';
        throw new Error(`Pexels ${r.status} (limite: ${h('x-ratelimit-limit') ?? '?'}/período, restantes: ${h('x-ratelimit-remaining') ?? '?'}, zera em: ${reset})`);
      }
      const j = await r.json();
      const f = (j.photos || []).find(x => !usadas.has(`pexels:${x.id}`));
      if (!f) return null;
      return { id: `pexels:${f.id}`, url: f.src.large, width: 940, height: Math.round(940 * f.height / f.width), credit: { author: f.photographer, source: 'Pexels', url: f.url, license: 'Licença Pexels', licenseUrl: 'https://www.pexels.com/license/' } };
    };
    const pixabay = async () => {
      const chave = (process.env.PIXABAY_API_KEY || '').trim().replace(/^["']|["']$/g, '');
      if (!chave) return null;
      const r = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(chave)}&q=${encodeURIComponent(busca.slice(0, 100))}&image_type=photo&orientation=horizontal&safesearch=true&per_page=20`);
      if (!r.ok) throw new Error(`Pixabay ${r.status}: ${(await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120)}`);
      const j = await r.json();
      const f = (j.hits || []).find(x => !usadas.has(`pixabay:${x.id}`));
      if (!f) return null;
      return { id: `pixabay:${f.id}`, url: f.largeImageURL, width: 1280, height: Math.round(1280 * f.imageHeight / f.imageWidth), credit: { author: f.user, source: 'Pixabay', url: f.pageURL, license: 'Licença Pixabay', licenseUrl: 'https://pixabay.com/service/license-summary/' } };
    };
    // Unsplash (reserva): exige hotlink, crédito com UTM e aviso de download (regras da API deles)
    const unsplash = async () => {
      if (!process.env.UNSPLASH_ACCESS_KEY) return null;
      const h = { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY.trim()}`, 'Accept-Version': 'v1' };
      const r = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(busca)}&per_page=20&orientation=landscape&content_filter=high`, { headers: h });
      if (!r.ok) throw new Error(`Unsplash ${r.status}`);
      const j = await r.json();
      const f = (j.results || []).find(x => !usadas.has(`unsplash:${x.id}`));
      if (!f) return null;
      if (f.links?.download_location) fetch(f.links.download_location, { headers: h }).catch(() => {});
      const utm = '?utm_source=40maisblog&utm_medium=referral';
      return { id: `unsplash:${f.id}`, url: f.urls.regular, width: 1080, height: Math.round(1080 * f.height / f.width), credit: { author: f.user.name, source: 'Unsplash', url: `${f.user.links.html}${utm}`, license: 'Licença Unsplash', licenseUrl: 'https://unsplash.com/license' } };
    };
    const ordem = preferir === 'pixabay' ? [pixabay, pexels, unsplash] : [pexels, pixabay, unsplash];
    for (const t of ordem) {
      try { const f = await t(); if (f) return f; } catch (e) { console.log(`  ⚠️  ${e.message}`); }
    }
    return null;
  }

  async baixar(foto, slug, nome) {
    if (foto.credit?.source === 'Unsplash') return foto.url; // Unsplash exige hotlink (não guardar cópia)
    const r = await fetch(foto.url);
    if (!r.ok) throw new Error(`download ${r.status}`);
    const dir = path.join(__dirname, '../public/images', slug);
    fs.mkdirSync(dir, { recursive: true });
    const arquivo = `${slugify(nome).slice(0, 60)}.jpg`;
    fs.writeFileSync(path.join(dir, arquivo), Buffer.from(await r.arrayBuffer()));
    return `/images/${slug}/${arquivo}`;
  }

  figura(f) {
    const c = f.credit;
    return `\n<figure class="article-figure"><img src="${f.src}" alt="${f.alt.replace(/"/g, '&quot;')}" width="${f.width}" height="${f.height}" loading="lazy" /><figcaption>${f.legenda ? f.legenda + ' ' : ''}<span class="credit">Foto: <a href="${c.url}" rel="noopener nofollow" target="_blank">${c.author}</a> / ${c.source}</span></figcaption></figure>\n`;
  }

  inserirFotos(a, fotos) {
    const partes = a.content.split(/(?=<h2)/);
    const iFontes = partes.findIndex(x => /^<h2>\s*Fontes/i.test(x));
    const limite = (iFontes === -1 ? partes.length : iFontes) - 1;
    const usadasSecoes = new Set();
    for (const f of fotos) {
      let n = Math.min(Math.max(f.secao, 1), limite);
      while (usadasSecoes.has(n) && n < limite) n++;
      while (usadasSecoes.has(n) && n > 1) n--;
      usadasSecoes.add(n);
      partes[n] = partes[n].replace(/\s*$/, '') + this.figura(f);
    }
    a.content = partes.join('');
  }

  async imagem(a) {
    if (!process.env.PEXEL_API_KEY && !process.env.PIXABAY_API_KEY && !process.env.UNSPLASH_ACCESS_KEY) {
      if (process.env.ALLOW_NO_IMAGE) { console.log('  ⚠️  sem chaves de imagem (ALLOW_NO_IMAGE=1, só teste)'); return true; }
      console.log('  ⛔ sem PEXEL_API_KEY/PIXABAY_API_KEY/UNSPLASH_ACCESS_KEY: regra "todo artigo sobe com imagem"'); return false;
    }
    const usadas = new Set(this.db.articles.flatMap(x => x.imageIds || []));
    const ids = [];
    const capa = await this.buscarFoto(a.imagePlan.capa.busca, 'pexels', usadas, a.imagePlan.capa.pexelsId);
    if (!capa) { console.log('  ⛔ sem foto de capa'); return false; }
    usadas.add(capa.id); ids.push(capa.id);
    a.featuredImage = await this.baixar(capa, a.slug, `${a.slug}-capa`);
    a.imageAlt = a.imagePlan.capa.alt;
    a.imageCredit = capa.credit;
    console.log(`  🖼️  capa: ${capa.credit.source} / ${capa.credit.author}`);

    const corpo = [];
    for (const [i, plano] of (a.imagePlan.fotos || []).entries()) {
      const foto = await this.buscarFoto(plano.busca, i % 2 === 0 ? 'pixabay' : 'pexels', usadas, plano.pexelsId);
      if (!foto) { console.log(`  ⚠️  sem foto para "${plano.busca}"`); continue; }
      usadas.add(foto.id); ids.push(foto.id);
      const src = await this.baixar(foto, a.slug, plano.alt);
      corpo.push({ src, alt: plano.alt, legenda: plano.legenda, secao: plano.secao, width: foto.width, height: foto.height, credit: foto.credit });
      console.log(`  🖼️  corpo ${i + 1}: ${foto.credit.source} / ${foto.credit.author}`);
    }
    if (!corpo.length) { console.log('  ⛔ nenhuma foto no corpo (mín 1)'); return false; }
    this.inserirFotos(a, corpo);
    a.images = corpo;
    a.imageIds = ids;
    a.altConferido = false;
    return true;
  }

  gravar() {
    if (process.env.DRY_RUN) return console.log('(DRY_RUN: nada gravado)');
    this.db.stats.total = this.db.articles.length;
    this.db.stats.published = this.db.articles.filter(a => a.status === 'published').length;
    fs.writeFileSync(ARTICLES_FILE, JSON.stringify(this.db, null, 2));
  }

  async executar() {
    if (!SEM_API && !process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY ausente');
    console.log(`\n🤖 ARTICLE ROBOT — ${new Date().toISOString()}`);
    if (!ESTOQUE) {
      if (this.restanteHoje() === 0) { console.log(`⏸️  Teto do dia atingido (${DAILY_LIMIT} artigos publicados hoje). Nada a fazer.`); return this.stats; }
      if (NOVO_COM_IA && !this.novoHoje()) {
        console.log(`✍️  NOVO_COM_IA: 1 artigo novo da fila, escrito por ${(process.env.GEMINI_API_KEY || '').trim() ? 'Gemini (Claude de reserva)' : 'Claude (sem GEMINI_API_KEY)'}; o estoque publica nas outras execuções.`);
      } else {
        const n = await this.publicarDoEstoque(BATCH_SIZE);
        if (n > 0) { this.gravar(); console.log(`\n📦 ${n} artigo(s) publicado(s) do estoque (${this.prontosNoEstoque().length} ainda guardados).`); return this.stats; }
        if (SEM_API || this.prontosNoEstoque().length > 0) { // com estoque (aguardando foto) não escreve nada novo; sem estoque e com API, escreve
          const aguardando = this.prontosNoEstoque().length;
          console.log(aguardando ? `📷 ${aguardando} artigo(s) no estoque aguardam foto (limite das APIs de imagem): nada publicado agora, tenta de novo na próxima execução.` : '📦 Estoque vazio e SEM_API=1: nada a publicar (sem gasto de API). Importe mais artigos em data/entrada/.');
          this.gravar();
          return this.stats;
        }
        console.log('📦 Estoque vazio: escrevendo e publicando na hora.');
      }
    } else {
      const faltam = ESTOQUE_ALVO - this.prontosNoEstoque().length;
      if (faltam <= 0) { console.log(`📦 Estoque cheio (${this.prontosNoEstoque().length}/${ESTOQUE_ALVO}). Nada a escrever.`); return this.stats; }
      console.log(`📦 Modo ESTOQUE: ${this.prontosNoEstoque().length}/${ESTOQUE_ALVO} guardados; escrevendo até ${Math.min(BATCH_SIZE, faltam)}.`);
    }
    const pauta = ESTOQUE ? this.escolherPauta().slice(0, Math.max(0, ESTOQUE_ALVO - this.prontosNoEstoque().length)) : this.escolherPauta();
    if (!pauta.length) { console.error('❌ FILA VAZIA: não há palavra validada livre em data/keywords-validated.json. Adicione palavras (volume + SERP fácil + fontes).'); process.exitCode = 1; return this.stats; }

    for (const p of pauta) {
      console.log(`\n📝 "${p.keyword}" (${p.volume}/mês)`);
      const geradosAntes = this.stats.generated;
      const registrar = (resultado) => { (this.stats.porArtigo ||= []).push({ palavra: p.keyword, tentativas: this.stats.generated - geradosAntes, resultado }); };
      try {
        const art = await this.produzir(p);
        if (!art) { this.stats.failed++; registrar('reprovado'); if (!ESTOQUE) this.registrarFalhaPauta(p.keyword, (this.reprovado?.issues || []).join('; ') || 'reprovado'); console.log('  ⛔ reprovado após 2 voltas, não publicado'); continue; }
        this.stats.approved++;
        if (!(await this.imagem(art))) {
          if (!ESTOQUE) { // sem foto agora (limite das APIs de imagem): guarda no estoque; a foto é buscada na hora de publicar
            for (const k of ['featuredImage', 'imageAlt', 'imageCredit', 'images', 'imageIds']) delete art[k];
            Object.assign(art, { fotoPendente: true, status: 'draft', estoque: true, estocadoEm: new Date().toISOString(), escritoPor: this.provedorUsado || 'claude' });
            delete art._substitui;
            this.db.articles.push(art);
            this.stats.estocados = (this.stats.estocados || 0) + 1;
            registrar('sem foto: guardado no estoque');
            console.log(`  📷 sem foto agora: guardado no estoque (/${art.slug}/); a foto é buscada na hora de publicar`);
            continue;
          }
          this.stats.failed++; registrar('sem imagem'); continue;
        }
        registrar('aprovado');
        const agora = new Date().toISOString();
        art.status = ESTOQUE ? 'draft' : 'published';
        if (!ESTOQUE) art.escritoPor = this.provedorUsado || 'claude';
        if (ESTOQUE) {
          art.estoque = true; art.estocadoEm = agora;
          // ficha de validação: por que esta pauta foi aprovada e o que o topo do Google mostra (copiada do briefing e da pauta)
          art.validacao = { palavraChave: p.keyword, volume: p.volume, cluster: p.cluster, apoio: (p.secundarias || []).map((x) => x.palavra), perguntasDoGoogle: p.absorve || [], serp: p.serp || null, fontesDaPauta: p.fontes || [], notas: p.notas || '', briefing: this.readJson(`data/briefings/${slugify(p.keyword)}.json`, null), validadoEm: agora };
        }
        const idx = p.substitui ? this.db.articles.findIndex(x => x.slug === p.substitui) : -1;
        if (idx >= 0) {
          const antigo = this.db.articles[idx];
          art.createdAt = antigo.createdAt || art.createdAt;
          art.publishedAt = antigo.publishedAt || agora;
          art.updatedAt = agora;
          delete art._substitui;
          this.db.articles[idx] = art;
          console.log(`  ♻️  reescrito no mesmo endereço (era ${antigo.wordCount || '?'} palavras)`);
        } else {
          if (!ESTOQUE) art.publishedAt = agora;
          delete art._substitui;
          this.db.articles.push(art);
        }
        if (ESTOQUE) { this.stats.estocados = (this.stats.estocados || 0) + 1; console.log(`  📦 guardado no estoque: /${art.slug}/`); } else { this.stats.published++; console.log(`  ✅ publicado: /${art.slug}/`); }
      } catch (e) {
        this.stats.failed++;
        registrar('erro');
        console.error(`  ❌ ${e.message}`);
        if (!ESTOQUE && /^só \d+ fonte/.test(e.message)) this.registrarFalhaPauta(p.keyword, e.message); // fontes legíveis insuficientes: a pauta não presta agora
      }
    }
    this.gravar();
    this.relatorioCusto();
    console.log(`\n📊 gerados ${this.stats.generated} | aprovados ${this.stats.approved} | publicados ${this.stats.published} | falhas ${this.stats.failed}`);
    if ((ESTOQUE ? (this.stats.estocados || 0) : this.stats.published + (this.stats.estocados || 0)) === 0) process.exitCode = 1;
    return this.stats;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  new ArticleRobot().executar().catch(e => { console.error('❌ FATAL:', e.message); process.exit(1); });
}

export default ArticleRobot;
