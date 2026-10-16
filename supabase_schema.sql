-- ==============================================================================
-- SCHEMA INICIAL POSTGRESQL PARA SUPABASE - OFERTAS DO GP / OFERTOU!
-- ==============================================================================
-- Como usar:
-- 1. Acesse o painel do seu projeto no Supabase (https://supabase.com/dashboard)
-- 2. Vá no menu lateral em "SQL Editor"
-- 3. Crie uma "New query", cole todo este código e clique em "Run"
-- ==============================================================================

-- 1. Habilitar extensão para geração de UUIDs (já vem ativa na maioria dos projetos)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. FUNÇÃO E TRIGGER PARA ATUALIZAR 'updated_at' AUTOMATICAMENTE
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 3. TABELA DE PERFIS DE USUÁRIOS (vinculada ao Supabase Auth)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  nome TEXT,
  tipo TEXT CHECK (tipo IN ('consumidor', 'empresa', 'afiliado', 'admin')) DEFAULT 'consumidor',
  avatar_url TEXT,
  telefone TEXT,
  cpf TEXT UNIQUE,
  cnpj TEXT UNIQUE,
  empresa_nome TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('onboarding', 'pending', 'active', 'suspended', 'banned')),
  pode_postar BOOLEAN NOT NULL DEFAULT false,
  plano TEXT DEFAULT 'free',
  assinatura_ate TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Trigger para atualizar 'updated_at' em profiles
DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger automático para criar o perfil público quando um usuário se cadastra no Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 4. TABELA DE LOJAS / EMPRESAS PARCEIRAS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.lojas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  descricao TEXT,
  logo_url TEXT,
  site_url TEXT,
  whatsapp TEXT,
  oculta BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DROP TRIGGER IF EXISTS trigger_lojas_updated_at ON public.lojas;
CREATE TRIGGER trigger_lojas_updated_at
  BEFORE UPDATE ON public.lojas
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 5. TABELA PRINCIPAL DE OFERTAS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID REFERENCES public.lojas(id) ON DELETE SET NULL,
  store_id TEXT NOT NULL, -- ex: 'mercadolivre', 'amazon', 'shopee', 'magalu', 'loja_local'
  store_product_id TEXT NOT NULL,
  plataforma TEXT NOT NULL,
  produto TEXT NOT NULL,
  preco_atual NUMERIC(10, 2) NOT NULL CHECK (preco_atual >= 0),
  preco_anterior NUMERIC(10, 2) NOT NULL DEFAULT 0,
  desconto_pct INTEGER NOT NULL DEFAULT 0,
  categoria TEXT,
  subcategoria TEXT,
  imagem TEXT,
  original_url TEXT NOT NULL,
  affiliate_url TEXT,
  cupom_codigo TEXT,
  frete_gratis BOOLEAN NOT NULL DEFAULT false,
  fonte TEXT NOT NULL DEFAULT 'auto', -- 'auto' (minerador) ou 'manual'
  oculto BOOLEAN NOT NULL DEFAULT false,
  destaque BOOLEAN NOT NULL DEFAULT false,
  link_clicks INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMPTZ,
  CONSTRAINT unq_store_product UNIQUE (store_id, store_product_id)
);

DROP TRIGGER IF EXISTS trigger_offers_updated_at ON public.offers;
CREATE TRIGGER trigger_offers_updated_at
  BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 6. HISTÓRICO DE PREÇOS (para gráfico de variação de preços)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.price_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  price NUMERIC(10, 2) NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 7. TABELA DE FAVORITOS (Lista de desejos do usuário)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.favoritos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unq_user_offer UNIQUE (user_id, offer_id)
);

-- ==============================================================================
-- 8. TABELA DE BANNERS E PUBLICIDADE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anunciante TEXT NOT NULL,
  espaco TEXT NOT NULL, -- ex: 'topo', 'lateral', 'home'
  link TEXT NOT NULL,
  imagem TEXT NOT NULL,
  imagem_mobile TEXT,
  video TEXT,
  video_mobile TEXT,
  texto_alt TEXT,
  inicio TIMESTAMPTZ NOT NULL,
  fim TIMESTAMPTZ NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  impressoes INTEGER NOT NULL DEFAULT 0,
  cliques INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 9. TABELA DE LINKS DE AFILIADOS (Gerenciamento e Rastreamento de Links)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.affiliate_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL,
  plataforma TEXT NOT NULL, -- ex: 'mercadolivre', 'amazon', 'shopee', 'magalu', 'aliexpress'
  titulo TEXT,
  url_original TEXT NOT NULL,
  url_afiliado TEXT NOT NULL,
  tag_afiliado TEXT, -- SubID, tag de parceiro ou tracking code
  slug_curto TEXT UNIQUE, -- Código/slug para redirecionamento (ex: seudominio.com/r/xyz123)
  cliques INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DROP TRIGGER IF EXISTS trigger_affiliate_links_updated_at ON public.affiliate_links;
CREATE TRIGGER trigger_affiliate_links_updated_at
  BEFORE UPDATE ON public.affiliate_links
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Função RPC para incrementar o contador de cliques de forma atômica e segura
CREATE OR REPLACE FUNCTION public.increment_affiliate_click(target_link_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.affiliate_links
  SET cliques = cliques + 1
  WHERE id = target_link_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 10. ÍNDICES DE ALTA PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_offers_categoria ON public.offers (categoria);
CREATE INDEX IF NOT EXISTS idx_offers_desconto ON public.offers (desconto_pct DESC);
CREATE INDEX IF NOT EXISTS idx_offers_created ON public.offers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offers_loja ON public.offers (loja_id);
CREATE INDEX IF NOT EXISTS idx_history_offer ON public.price_history (offer_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_favoritos_user ON public.favoritos (user_id);
CREATE INDEX IF NOT EXISTS idx_banners_ativo ON public.banners (ativo, espaco);
CREATE INDEX IF NOT EXISTS idx_affiliate_links_user ON public.affiliate_links (user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_links_offer ON public.affiliate_links (offer_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_links_plataforma ON public.affiliate_links (plataforma);
CREATE INDEX IF NOT EXISTS idx_affiliate_links_slug ON public.affiliate_links (slug_curto) WHERE slug_curto IS NOT NULL;

-- ==============================================================================
-- 11. SEGURANÇA E POLÍTICAS RLS (Row Level Security)
-- ==============================================================================

-- Ativar RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favoritos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_links ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS: PROFILES
DROP POLICY IF EXISTS "Perfis visíveis para usuários autenticados" ON public.profiles;
CREATE POLICY "Perfis visíveis para usuários autenticados"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Usuário edita próprio perfil" ON public.profiles;
CREATE POLICY "Usuário edita próprio perfil"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- POLÍTICAS: LOJAS
DROP POLICY IF EXISTS "Lojas públicas visíveis para todos" ON public.lojas;
CREATE POLICY "Lojas públicas visíveis para todos"
  ON public.lojas FOR SELECT
  TO anon, authenticated
  USING (oculta = false);

DROP POLICY IF EXISTS "Dono gerencia sua loja" ON public.lojas;
CREATE POLICY "Dono gerencia sua loja"
  ON public.lojas FOR ALL
  TO authenticated
  USING (owner_id = auth.uid());

-- POLÍTICAS: OFERTAS
DROP POLICY IF EXISTS "Ofertas ativas visíveis publicamente" ON public.offers;
CREATE POLICY "Ofertas ativas visíveis publicamente"
  ON public.offers FOR SELECT
  TO anon, authenticated
  USING (oculto = false);

DROP POLICY IF EXISTS "Service role tem acesso total a ofertas" ON public.offers;
CREATE POLICY "Service role tem acesso total a ofertas"
  ON public.offers FOR ALL
  TO service_role
  USING (true);

-- POLÍTICAS: HISTÓRICO DE PREÇOS
DROP POLICY IF EXISTS "Histórico de preços público" ON public.price_history;
CREATE POLICY "Histórico de preços público"
  ON public.price_history FOR SELECT
  TO anon, authenticated
  USING (true);

-- POLÍTICAS: FAVORITOS
DROP POLICY IF EXISTS "Usuário gerencia seus próprios favoritos" ON public.favoritos;
CREATE POLICY "Usuário gerencia seus próprios favoritos"
  ON public.favoritos FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- POLÍTICAS: BANNERS
DROP POLICY IF EXISTS "Banners ativos visíveis para todos" ON public.banners;
CREATE POLICY "Banners ativos visíveis para todos"
  ON public.banners FOR SELECT
  TO anon, authenticated
  USING (ativo = true AND now() BETWEEN inicio AND fim);

-- POLÍTICAS: LINKS DE AFILIADOS
DROP POLICY IF EXISTS "Usuário gerencia seus próprios links de afiliados" ON public.affiliate_links;
CREATE POLICY "Usuário gerencia seus próprios links de afiliados"
  ON public.affiliate_links FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Links de afiliados ativos visíveis para redirecionamento" ON public.affiliate_links;
CREATE POLICY "Links de afiliados ativos visíveis para redirecionamento"
  ON public.affiliate_links FOR SELECT
  TO anon, authenticated
  USING (ativo = true);

DROP POLICY IF EXISTS "Service role tem acesso total a affiliate_links" ON public.affiliate_links;
CREATE POLICY "Service role tem acesso total a affiliate_links"
  ON public.affiliate_links FOR ALL
  TO service_role
  USING (true);

-- ==============================================================================
-- 12. CONFIGURAÇÕES E MINERADORES (Backend / Admin)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.store_status (
  store_id TEXT PRIMARY KEY, -- ex: 'mercadolivre', 'amazon', 'shopee', etc.
  status TEXT,
  message TEXT,
  found INTEGER DEFAULT 0,
  saved INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ
);

-- ==============================================================================
-- 13. DETALHES DE ANÚNCIOS LOCAIS E LEADS DE PUBLICIDADE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ad_details (
  offer_id UUID PRIMARY KEY REFERENCES public.offers(id) ON DELETE CASCADE,
  descricao TEXT,
  marca TEXT,
  modelo TEXT,
  condicao TEXT,
  garantia TEXT,
  parcelamento TEXT,
  frete TEXT,
  frete_valor NUMERIC(10, 2),
  prazo_entrega TEXT,
  estoque INTEGER,
  sku TEXT,
  ean TEXT,
  cupom_codigo TEXT,
  cupom_descricao TEXT,
  whatsapp TEXT,
  imagens JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DROP TRIGGER IF EXISTS trigger_ad_details_updated_at ON public.ad_details;
CREATE TRIGGER trigger_ad_details_updated_at
  BEFORE UPDATE ON public.ad_details
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Pedidos de contato de empresas interessadas em anunciar (página /anuncie)
CREATE TABLE IF NOT EXISTS public.ad_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  empresa TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  espaco TEXT,
  mensagem TEXT,
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_contato', 'fechado', 'arquivado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 14. AUTOMAÇÃO DE REDES SOCIAIS (Postagens Agendadas e Histórico)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.post_queue (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offer_id UUID REFERENCES public.offers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  texto TEXT,
  autor TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'postado', 'falhou')),
  resultado TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  posted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_post_queue_status ON public.post_queue (status, id);

CREATE TABLE IF NOT EXISTS public.social_posts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  produto TEXT,
  rede TEXT NOT NULL, -- ex: 'telegram', 'whatsapp', 'instagram'
  ok BOOLEAN NOT NULL DEFAULT false,
  mensagem TEXT,
  autor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_social_posts_offer ON public.social_posts (offer_id);

-- ==============================================================================
-- 15. ASSINATURAS E PAGAMENTOS (Mercado Pago / PIX)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  plano TEXT NOT NULL,
  valor NUMERIC(10, 2) NOT NULL,
  dias INTEGER NOT NULL,
  metodo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'recusado', 'cancelado', 'expirado')),
  email TEXT NOT NULL,
  nome TEXT,
  dados JSONB DEFAULT '{}'::jsonb,
  mp_payment_id TEXT,
  mp_preference_id TEXT,
  pix_qr TEXT,
  pix_qr_base64 TEXT,
  pix_expira TIMESTAMPTZ,
  validade_ate TIMESTAMPTZ,
  login_entregue BOOLEAN NOT NULL DEFAULT false,
  email_enviado BOOLEAN NOT NULL DEFAULT false,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  aprovado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON public.pagamentos (status, created_at DESC);

-- ==============================================================================
-- 16. RLS PARA AS TABELAS COMPLEMENTARES
-- ==============================================================================
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;

-- Configurações e status de minerador: acessíveis via service_role ou leitura por admin
DROP POLICY IF EXISTS "Service role acessa settings" ON public.settings;
CREATE POLICY "Service role acessa settings" ON public.settings FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "Service role acessa store_status" ON public.store_status;
CREATE POLICY "Service role acessa store_status" ON public.store_status FOR ALL TO service_role USING (true);

-- Detalhes de anúncios (ad_details): visíveis publicamente
DROP POLICY IF EXISTS "Detalhes de anúncios públicos" ON public.ad_details;
CREATE POLICY "Detalhes de anúncios públicos" ON public.ad_details FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Service role gerencia ad_details" ON public.ad_details;
CREATE POLICY "Service role gerencia ad_details" ON public.ad_details FOR ALL TO service_role USING (true);

-- Leads: Qualquer visitante pode enviar um pedido de orçamento via /anuncie
DROP POLICY IF EXISTS "Qualquer um pode enviar lead de anúncio" ON public.ad_leads;
CREATE POLICY "Qualquer um pode enviar lead de anúncio" ON public.ad_leads FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Service role gerencia ad_leads" ON public.ad_leads;
CREATE POLICY "Service role gerencia ad_leads" ON public.ad_leads FOR ALL TO service_role USING (true);

-- Fila e Histórico de postagens sociais: service_role gerencia
DROP POLICY IF EXISTS "Service role gerencia post_queue" ON public.post_queue;
CREATE POLICY "Service role gerencia post_queue" ON public.post_queue FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "Service role gerencia social_posts" ON public.social_posts;
CREATE POLICY "Service role gerencia social_posts" ON public.social_posts FOR ALL TO service_role USING (true);

-- Pagamentos: Usuário vê seus pagamentos e service_role controla
DROP POLICY IF EXISTS "Usuário consulta seus pagamentos" ON public.pagamentos;
CREATE POLICY "Usuário consulta seus pagamentos" ON public.pagamentos FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role gerencia pagamentos" ON public.pagamentos;
CREATE POLICY "Service role gerencia pagamentos" ON public.pagamentos FOR ALL TO service_role USING (true);

-- ==============================================================================
-- 17. MODERAÇÃO E SEGURANÇA (Admin)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.moderation_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_email TEXT,
  acao TEXT NOT NULL,
  detalhe TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.blocked_emails (
  email TEXT PRIMARY KEY,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.moderation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role gerencia moderation_log" ON public.moderation_log;
CREATE POLICY "Service role gerencia moderation_log" ON public.moderation_log FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "Service role gerencia blocked_emails" ON public.blocked_emails;
CREATE POLICY "Service role gerencia blocked_emails" ON public.blocked_emails FOR ALL TO service_role USING (true);



