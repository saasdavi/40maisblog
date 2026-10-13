// Configuração central do site - Saúde 40+
// Nada aqui depende de hospedagem

export const SITE = {
  name: 'Saúde 40+',
  // Host canônico
  url: 'https://40mais.blog',
  lang: 'pt-BR',
  locale: 'pt_BR',
  tagline: 'Saúde e bem-estar para quem tem 40+',
  description:
    'Artigos baseados em evidências científicas sobre saúde, nutrição e bem-estar para mulheres 40+. Conteúdo original com E-E-A-T profissional.',
  defaultAuthor: 'Saúde 40+',
  defaultImage: '/images/hero-bg.svg',
  contactEmail: 'contato@saude40mais.com',
  // Dados do responsável (Decreto 7.962/2013). Vazio = o rodapé não exibe.
  legal: {
    razaoSocial: 'DAVI BURATO CUSTODIO',
    cnpj: '27.648.939/0001-13',
    endereco: '',
  },
  // Perfis oficiais: aparecem no rodapé e no schema (sameAs). Vazio = não exibe.
  social: {
    facebook: '',
    instagram: '',
    pinterest: '',
  },
  // Tamanho padrão de todas as imagens de capa (1200×675, 16:9)
  image: { width: 1200, height: 675 },
  // Verificação do Search Console por meta tag (opcional)
  googleSiteVerification: '',
  // Código de verificação do domínio no Pinterest
  pinterestDomainVerify: '',
} as const;

// Slugs que não podem ser usados por artigos (colidem com páginas do site)
export const RESERVED_SLUGS = [
  'categoria',
  'sobre',
  'contato',
  'politica-privacidade',
  'termos-uso',
  'social',
  'images',
  'feed',
  'sitemap',
  'page',
  'tag',
  'wp-admin',
  'wp-content',
] as const;
