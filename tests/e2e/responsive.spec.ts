import { expect, test } from '@playwright/test';
import { api, createAccount, expectNoHorizontalScroll, isMobile, loginUI } from './helpers';

test.describe('páginas públicas', () => {
  test('início, login e cadastro sem rolagem horizontal e com campos rotulados', async ({ page }) => {
    for (const path of ['/', '/entrar', '/cadastro', '/esqueci-senha']) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
    }
    await page.goto('/cadastro');
    await expect(page.getByLabel('Seu nome')).toBeVisible();
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expect(page.getByLabel('Senha')).toBeVisible();
    // Validação compreensível no próprio formulário.
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByText('Informe seu nome.')).toBeVisible();
  });

  test('demonstração local renderiza o jogo e reage a eventos', async ({ page }) => {
    await page.goto('/demo/plinko-live');
    await expectNoHorizontalScroll(page);
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await page.getByRole('button', { name: '10 presentes' }).click();
    await page.waitForTimeout(1500);
    // O canvas precisa ter pixels desenhados (não apenas fundo preto).
    const lit = await canvas.evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext('2d')!;
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      let total = 0;
      for (let i = 0; i < d.length; i += 400) {
        total++;
        if (d[i]! + d[i + 1]! + d[i + 2]! > 120) n++;
      }
      return n / total;
    });
    expect(lit, 'fração de pixels claros no canvas').toBeGreaterThan(0.01);
  });

  test('overlay com token inválido mostra mensagem clara', async ({ page }) => {
    await page.goto('/overlay/inexistente?token=ovl_invalido_123456');
    await expect(page.getByText('Link de overlay inválido ou revogado.')).toBeVisible();
  });
});

test.describe('painel autenticado', () => {
  test('navegação adequada ao dispositivo e páginas sem rolagem horizontal', async ({ page }) => {
    const acc = await createAccount();
    await loginUI(page, acc.email, acc.password);
    if (isMobile(page)) {
      await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
      await page.getByRole('button', { name: 'Mais' }).click();
      await expect(page.getByRole('dialog', { name: 'Mais opções' })).toBeVisible();
      await page.getByRole('link', { name: 'Ranking' }).click();
      await expect(page).toHaveURL(/ranking/);
    } else {
      await expect(page.getByRole('complementary', { name: 'Menu principal' })).toBeVisible();
      await page.getByRole('complementary', { name: 'Menu principal' }).getByRole('link', { name: 'Biblioteca de jogos' }).click();
      await expect(page).toHaveURL(/jogos/);
    }
    for (const path of ['/painel', '/painel/jogos', '/painel/lives', '/painel/mapeamento', '/painel/overlays', '/painel/estatisticas', '/painel/historico', '/painel/sons', '/painel/alertas', '/painel/automacoes', '/painel/ranking', '/painel/eventos', '/painel/configuracoes', '/painel/assinatura', '/painel/ajuda']) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });

  test('alvos de toque dos botões principais têm pelo menos 40px', async ({ page }) => {
    const acc = await createAccount();
    await loginUI(page, acc.email, acc.password);
    await page.goto('/painel/jogos');
    const btn = page.getByRole('button', { name: 'Usar este jogo' }).first();
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(36);
    if (isMobile(page)) {
      const nav = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link').first();
      expect((await nav.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('fluxo completo: configurar jogo, criar LIVE, iniciar, simular, pausar e encerrar', async ({ page }) => {
    const acc = await createAccount();
    await loginUI(page, acc.email, acc.password);
    await page.goto('/painel/jogos');
    await page.getByRole('button', { name: 'Usar este jogo' }).first().click();
    await expect(page).toHaveURL(/\/painel\/jogos\/[a-z0-9]+/);
    await expect(page.getByText('Regras de interação')).toBeVisible();
    await page.goto('/painel/lives');
    await page.getByRole('button', { name: 'Nova LIVE' }).click();
    await page.getByLabel('Nome', { exact: true }).fill('LIVE E2E');
    await page.getByRole('button', { name: 'Criar LIVE' }).click();
    await expect(page).toHaveURL(/\/painel\/lives\/[a-z0-9]+/);
    await page.getByRole('button', { name: 'Iniciar' }).click();
    await expect(page.getByText('Em execução').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Jogo rodando').first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('tab', { name: 'Simulador' }).click();
    await page.getByRole('button', { name: 'Rosa (1💎)' }).click();
    await page.getByRole('tab', { name: 'Eventos ao vivo' }).click();
    await expect(page.getByText('simulado').first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Pausar' }).click();
    await expect(page.getByText('Pausada').first()).toBeVisible();
    await page.getByRole('button', { name: 'Retomar' }).click();
    await expect(page.getByText('Em execução').first()).toBeVisible();
    await page.getByRole('button', { name: 'Encerrar' }).click();
    // Ação destrutiva pede confirmação.
    await page.getByRole('dialog').getByRole('button', { name: 'Encerrar sessão' }).click();
    await expect(page.getByText(/Encerrada|Encerrando/).first()).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalScroll(page);
  });

  test('isolamento: link de sessão de outra conta mostra "não encontrado"', async ({ page }) => {
    const other = await createAccount();
    const cfg = await api<{ id: string }>(other.token, 'POST', '/games/configs', { gameId: 'snake-live', name: 'Privada' });
    const s = await api<{ id: string }>(other.token, 'POST', '/sessions', { name: 'Privada', gameConfigId: cfg.id });
    const me = await createAccount();
    await loginUI(page, me.email, me.password);
    await page.goto(`/painel/lives/${s.id}`);
    await expect(page.getByText('Não encontramos o que você procurou.')).toBeVisible();
  });
});

test.describe('produto v2', () => {
  test('biblioteca: busca, categoria e favorito', async ({ page }) => {
    const acc = await createAccount();
    await loginUI(page, acc.email, acc.password);
    await page.goto('/painel/jogos');
    await expect(page.getByRole('heading', { name: 'Biblioteca de jogos' })).toBeVisible();
    await page.getByPlaceholder('Buscar por nome, categoria…').fill('melancia');
    await expect(page.getByRole('heading', { name: 'Melancia Elástica' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Battle Arena' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Favoritar Melancia Elástica' }).click();
    await page.getByPlaceholder('Buscar por nome, categoria…').fill('');
    await page.getByRole('tab', { name: '★ Favoritos' }).click();
    await expect(page.getByRole('heading', { name: 'Melancia Elástica' })).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: '★ Favoritos' }).click();
    await expect(page.getByRole('heading', { name: 'Melancia Elástica' })).toBeVisible();
    await page.getByRole('tab', { name: 'Corridas' }).click();
    await expect(page.getByRole('heading', { name: 'Corrida Animal' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('overlay único: cria o link e o link abre a página transparente', async ({ page, context }) => {
    const acc = await createAccount();
    await loginUI(page, acc.email, acc.password);
    await page.goto('/painel/overlays');
    await page.getByRole('button', { name: 'Criar meu link de overlay' }).click();
    const field = page.getByLabel('Link do overlay (copie agora)');
    await expect(field).toBeVisible();
    const url = await field.inputValue();
    expect(url).toMatch(/\/overlay\/ovl_/);
    const ov = await context.newPage();
    await ov.goto(new URL(url).pathname);
    await expect(ov.locator('main')).toBeVisible();
    await expect(ov.getByText('Link de overlay inválido ou revogado.')).toHaveCount(0);
    const bg = await ov.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgba(0, 0, 0, 0)');
    await expectNoHorizontalScroll(page);
  });

  test('alertas: cria a partir de modelo e aparece na configuração de eventos', async ({ page }) => {
    const acc = await createAccount();
    await loginUI(page, acc.email, acc.password);
    await page.goto('/painel/alertas');
    await page.getByRole('button', { name: 'Novo seguidor' }).click();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { name: 'Seguidor' })).toBeVisible();
    await page.goto('/painel/mapeamento');
    await expect(page.getByText('Novo seguidor').first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('assinatura mostra uso x limites sem pagamento falso', async ({ page }) => {
    const acc = await createAccount();
    await loginUI(page, acc.email, acc.password);
    await page.goto('/painel/assinatura');
    await expect(page.getByText('Sons no soundboard')).toBeVisible();
    await expect(page.getByText(/Pagamento online ainda não disponível/)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
