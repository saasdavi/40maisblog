# CLAUDE.md - Project Intelligence Guide

> **DECISÕES DO DONO (prevalecem):** `DECISOES-DO-DONO.md` — a única trava é nota baixa; tema sensível e promessa não travam; NOTA_CHAT ≥ 9 com pontuação técnica < 90 fica segurado.
>
> **ESTADO ATUAL E PRÓXIMOS PASSOS:** `PROXIMOS-PASSOS.md` (1 página; leia antes de tudo e atualize ao terminar).
>
> **LEIA PRIMEIRO:** o fluxo atual (3 artigos/dia, Haiku 4.5, demanda → pauta → Google → fila, banco de palavras, regras de segurança) está em `ESTRATEGIA-E-FLUXO-AUTOMATICO.md`. Onde este arquivo disser "2/day", "Haiku 3.5" ou "Google Custom Search", vale o novo documento.

## Project Overview

**Health 40+ Blog** is an autonomous demand discovery + content production system.

**Goal:** Automatically discover real search demand, validate it, plan editorial content, produce original articles, and publish 2/day to a blog.

**Key Constraint:** This is NOT a blog template. It's a DISCOVERY ENGINE + PRODUCTION SYSTEM.

## Critical Principles

### 1. Never Invent Data

- ❌ Do NOT invent keyword volumes
- ❌ Do NOT invent competition metrics
- ❌ Do NOT guess trending data
- ✅ Always use real API responses

If an API doesn't provide a metric, set it to `null` and mark `validated: false`.

### 2. Separate Collection from Intelligence

```
APIs = collect objective data
Claude = interpret and validate data
```

Never use Claude to replace API functions.

### 3. Haiku for Everything

Use Claude Haiku 3.5 for all analysis:
- Keyword validation
- Cluster analysis
- Opportunity scoring
- Content analysis
- Article generation (yes, Haiku can write articles)
- Editorial review

### 4. Always Analyze 2-3 Competitors

For SERP research:
1. Google Custom Search provides results
2. **Select 2-3 most relevant competitors** (not #1, #2, #3 automatically)
3. Claude analyzes their patterns, lacunas, outliers
4. Claude identifies opportunities in their content
5. Claude produces original content

Never analyze 10+ competitors. Wasted resources.

### 5. Health/Safety First

Because this is health content:
- ❌ No diagnoses
- ❌ No medical claims without sources
- ❌ No promises of cures
- ✅ Evidence-based information
- ✅ Professional consultation recommendations

## Data Structure

### `/data/keywords.json`
- Master list of all discovered keywords
- Each keyword has status: discovered → researched → validated → clustered → planned → writing → review → published

### `/data/clusters.json`
- Grouped keywords by semantic intent
- Prevents content cannibalization
- Maps which keywords will become 1 article

### `/data/opportunities.json`
- Validated editorial opportunities
- Result of validation module
- Ready for SERP research

### `/data/editorial-calendar.json`
- Master publishing schedule
- Max 2 articles per day
- Links keywords to planned articles

### `/data/articles.json`
- Published articles
- Contains SEO metrics
- Health/safety validation flags

### `/data/performance.json`
- Search Console data
- Real queries from your blog
- Feeds back into keyword discovery

## Workflows

### Discovery Phase
1. Start with seed keywords
2. Expand using Keyword Planner + Autocomplete
3. Identify variants and long-tails
4. Store all in `keywords.json`

### Validation Phase
1. For each keyword, check volume/competition
2. Claude evaluates: demande? intention? opportunity?
3. Mark as approved/pending/rejected
4. Create or update clusters

### Planning Phase
1. Claude groups keywords into clusters
2. Select 1-2 opportunities per day (max)
3. Add to editorial calendar
4. Schedule SERP research

### Production Phase
1. Pull next article from calendar
2. Google Custom Search: find 2-3 competitors
3. Claude analyzes their content
4. Claude identifies lacunas and patterns
5. Claude writes original article
6. Claude reviews for quality/health/SEO
7. Publish to content/articles/

### Publication
1. New article → push to GitHub
2. GitHub triggers Vercel deploy
3. Vercel builds static site
4. Publish live

### Measurement
1. Search Console data collected
2. New queries added to keyword discovery
3. Cycle repeats

## Validation Module (Claude)

When Claude sees a keyword, it must validate:

| Criteria | What to Check |
|----------|--------------|
| **Demand** | Volume exists? Consistent trend? Real searches? |
| **Intent** | What does the searcher actually want? |
| **Relevance** | Related to Health 40+ niche? |
| **Opportunity** | Can we create better content than what exists? |
| **Cannibalization** | Does your blog already cover this intent? |
| **Health Safety** | Can we write this responsibly? |
| **SEO Potential** | Keyword clarity? Semantic coverage? |

Output:

```json
{
  "status": "approved|pending|rejected|grouped",
  "intent": "informational|commercial|...",
  "cluster": "cluster_id",
  "decisionReason": "...",
  "nextStep": "serp_research|more_data|..."
}
```

## Content Production Module

When producing an article:

1. **Research Phase**
   - Pull keyword + cluster info
   - Google Custom Search: find 2-3 competitors
   - Claude analyzes: structure, coverage, gaps, outliers

2. **Strategy Phase**
   - What do competitors do well?
   - What are they missing?
   - How can we do better?
   - Define article structure

3. **Writing Phase**
   - Write original content (not rewording competitors)
   - Use semantic keywords naturally
   - Answer user intent fully
   - Include internal links to related articles

4. **Review Phase**
   - Does it answer the search intent?
   - Is SEO natural (not keyword-stuffed)?
   - Health/safety check
   - Fact verification

5. **Publish**
   - Save as markdown
   - Add to articles.json
   - Commit to GitHub
   - Vercel auto-deploys

## Files to Edit

When implementing features:

- `data/*.json` - Update schemas as needed
- `scripts/discovery.js` - Keyword expansion logic
- `scripts/validation.js` - Claude validation logic
- `scripts/production.js` - Content generation
- `.github/workflows/*.yml` - Automation

## Files NOT to Edit Manually

- Published articles (use production script)
- Keyword status (use validation script)
- Editorial calendar (use planning script)

## Running the System

### First Time
```bash
npm run discovery   # Expand keywords from seeds
npm run validation  # Validate with APIs
```

### Continuous
GitHub Actions runs automatically:
- Discovery: daily (expand keywords)
- Validation: daily (validate with Google)
- Planning: daily (create opportunities)
- Production: 2x daily (write + publish)

## Testing

Before automating:
1. Test discovery with 1 seed keyword
2. Test validation with 5 keywords
3. Verify data in `/data/keywords.json`
4. Test production with 1 opportunity
5. Review generated article
6. Only then enable automation

## Secrets

All API keys stored in GitHub Secrets:
- ANTHROPIC_API_KEY
- GOOGLE_ADS_* (4 values)
- GOOGLE_SEARCH_* (2 values)

Scripts read from environment variables.

**NEVER commit .env file with real keys.**

## Commands

```bash
npm run dev              # Local Astro server
npm run build           # Build for production
npm run preview         # Preview build locally
npm run discovery       # Run keyword discovery
npm run validation      # Run validation
npm run production      # Run content production
```

## When You Need to Debug

1. **Keywords not expanding?** → Check discovery.js + Keyword Planner auth
2. **Validation failing?** → Check Claude API key + prompt
3. **Articles not generating?** → Check production script + SERP research
4. **Publish not working?** → Check GitHub + Vercel connection

## Remember

This system is meant to be autonomous. The goal is:

> **Setup once → Runs forever → 2 articles/day automatically**

Make changes only to improve the system, not to override it.

---

**Last Updated:** 2026-10-03  
**Version:** 1.0.0
