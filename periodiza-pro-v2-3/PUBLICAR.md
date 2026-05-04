# 🚀 COMO PUBLICAR E USAR O PERIODIZA PRO V2

---

## ⚡ ETAPA 1 — Publicar no Vercel (10 minutos)

### 1.1. Se você **já tem o projeto antigo no Vercel**

Opção mais simples: **atualizar o deploy existente**.

1. Acesse seu painel em https://vercel.com/dashboard
2. Abra o projeto **periodiza-pro** (o antigo)
3. Menu lateral → **Deployments**
4. No topo há um botão **"..." → Redeploy** ou arraste o novo ZIP direto

### 1.2. Se quiser criar novo deploy

1. Acesse https://vercel.com/new
2. Arraste a pasta `periodiza-pro-v2` OU o arquivo ZIP
3. Framework Preset: **Vite** (auto-detectado)
4. Clique em **Deploy**
5. Aguarde 2-3 minutos

A URL nova será tipo `https://periodiza-pro-v2.vercel.app` ou similar.

---

## 📱 ETAPA 2 — Instalar em cada aparelho

### 2.1. iPhone 11 (primário)

1. Abra a URL no **Safari**
2. Veja a tela de **Login / Criar Conta**
3. Clique em **"Criar Conta"** → use seu email + senha de 6+ caracteres
4. ✅ Você está dentro! Note o indicador ☁ **SINCRONIZADO** no topo
5. Ainda no Safari, toque no botão compartilhar ⬆️ → **"Adicionar à Tela de Início"**
6. Nomeie como "Periodiza Pro" → toque **Adicionar**
7. Abra pelo ícone na tela de início → use normalmente

### 2.2. iPad Mini 2

1. Abra a mesma URL no **Safari** do iPad
2. Deve carregar normalmente agora (versão compatível com iOS 12)
3. Faça login com o **MESMO email/senha** do iPhone
4. ✨ Você verá que **os dados do iPhone já estão lá!**
5. Adicione à tela de início do iPad também

### 2.3. MacBook

1. Abra a URL no **Safari**
2. Faça login com a mesma conta
3. Dados sincronizam automaticamente
4. Para criar atalho: **Arquivo → Adicionar ao Dock...** (Safari 17+)
   - Ou use o Chrome/Edge: ícone de "instalar" aparece na barra

---

## ✅ ETAPA 3 — Testar a sincronização

**Teste rápido:**

1. No **iPhone** → Atletas → adicione um atleta de teste "João Teste"
2. Aguarde 2 segundos → indicador fica ☁ SINCRONIZADO
3. No **iPad Mini 2** → atualize a página (pull-to-refresh no Safari)
4. Vá em Atletas → **"João Teste" deve aparecer** 🎉

Se não aparecer, clique no indicador ☁ SINCRONIZADO no topo para forçar sincronização.

---

## 🔐 ETAPA 4 — Segurança (IMPORTANTE)

### Regenere a chave anon do Supabase

A chave foi colada em conversa. Para segurança máxima:

1. Acesse https://supabase.com → seu projeto
2. Settings → API → "Legacy API Keys"
3. Clique em **"Reset anon key"**
4. Copie a nova chave
5. No projeto, edite `src/supabase.js` → substitua a chave
6. Faça novo deploy no Vercel

**Nota:** a chave anon é pública por design (fica no JavaScript do navegador), então isso é mais por boa prática do que por necessidade crítica.

---

## ❓ Problemas comuns

### "iPad Mini 2 ainda com tela branca"

- Certifique-se que está usando **Safari**, não Chrome iOS
- Limpe o cache: **Ajustes → Safari → Limpar Histórico e Dados**
- Tente abrir em modo privado primeiro

### "Dados não aparecem no outro aparelho"

- Verifique se fez login com o **mesmo email** nos dois
- Clique no indicador ☁ no topo para forçar sincronização
- Confirme que o indicador está **verde** (SINCRONIZADO)

### "Quero usar sem conta / sem internet"

- Na tela de login, toque em **"Usar sem conta (apenas neste aparelho)"**
- Para voltar a ter conta depois: aba Backup → "Criar Conta / Entrar"

### "Esqueci minha senha"

- Atualmente não há fluxo de recuperação integrado
- Acesse https://supabase.com → Authentication → Users → reset manual
- (Podemos adicionar fluxo de reset no app se quiser)

---

## 🎨 Conta compartilhada vs. pessoal

**Cenário 1 — Só você usa (recomendado)**
- Uma conta com seu email
- Instale nos 3 aparelhos com a mesma conta
- Tudo sincroniza

**Cenário 2 — Múltiplos profissionais**
- Cada profissional cria a própria conta
- Dados ficam **totalmente separados** (cada um só vê seus atletas)
- Por padrão não há compartilhamento entre contas

**Cenário 3 — Quer compartilhar atletas?**
- Pode ser implementado depois (sistema de permissões)
- Me chame se for o caso

---

## 📞 Ajuda

Qualquer dúvida, pode perguntar! 💪
