import { Card, PageHeader } from '@/components/ui';

const FAQ: Array<{ q: string; a: string }> = [
  { q: 'Como coloco o jogo na minha LIVE?', a: 'Crie uma LIVE, inicie a sessão, vá em “Saída de vídeo” → “Gerar novo link de overlay” e adicione o link como Fonte de Navegador no OBS ou no TikTok LIVE Studio (1080×1920 para vertical).' },
  { q: 'Preciso de uma LIVE real para testar?', a: 'Não. Use o Simulador na sala de controle ou a aba “Testar” na configuração do jogo. Todo dado simulado aparece marcado como “simulado” e não entra nas estatísticas reais.' },
  { q: 'O jogo travou ou parou. E agora?', a: 'Veja os 4 cartões de estado: Sessão, Fonte de eventos, Jogo e Transmissão. O sistema tenta recuperar sozinho (reconexão automática e restauração do último ponto salvo). Se “Jogo” mostrar Erro, encerre e inicie de novo.' },
  { q: '“Fonte de eventos: Criador não está ao vivo”', a: 'A plataforma só recebe eventos quando você está ao vivo no TikTok. Ela verifica de novo automaticamente a cada minuto.' },
  { q: 'Por que a conexão com o TikTok está indisponível?', a: 'Não existe API oficial pública de eventos de LIVE. A biblioteca open source tem restrições de licença para serviços comerciais, por isso fica desabilitada por padrão. A opção recomendada é um serviço gerenciado com contrato (requer API key).' },
  { q: 'Minha LIVE pode cair por causa da plataforma?', a: 'Nenhum sistema garante 100%. A plataforma separa jogo, fonte de eventos e vídeo em processos independentes, salva o estado do jogo continuamente e reconecta sozinha. Internet, OBS e o próprio TikTok continuam sendo fatores externos.' },
  { q: 'O Plinko envolve dinheiro?', a: 'Não. Todos os jogos usam apenas pontuação virtual, sem apostas, depósitos, saques ou prêmios em dinheiro.' },
];

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Ajuda" description="Guia rápido para PC, celular e tablet." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="💻 No PC / notebook">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
            <li>Experiência completa: configurar jogos, sala de controle, estatísticas e administração.</li>
            <li>Integração direta com o OBS (aba “OBS” na sala de controle).</li>
            <li>Atalhos de teclado: Tab navega; Enter/Espaço aciona botões; Esc fecha janelas.</li>
          </ul>
        </Card>
        <Card title="📱 No celular">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
            <li>Use a barra inferior para Início, LIVES, Jogos e Eventos; “Mais” mostra o resto.</li>
            <li>Inicie/pause/encerre a LIVE, use o simulador e acompanhe eventos em tempo real.</li>
            <li>Instale como aplicativo: no Chrome, “Adicionar à tela inicial”; no iPhone, Compartilhar → “Adicionar à Tela de Início”.</li>
            <li>A transmissão em si continua no app do TikTok, OBS ou LIVE Studio.</li>
          </ul>
        </Card>
        <Card title="📲 No tablet">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
            <li>Menu lateral compacto; pré-visualização e controles lado a lado na horizontal.</li>
            <li>Funciona em pé ou deitado; a pré-visualização mantém a proporção do vídeo.</li>
          </ul>
        </Card>
      </div>
      <Card className="mt-5" title="Perguntas frequentes">
        <div className="divide-y divide-white/5">
          {FAQ.map((f) => (
            <details key={f.q} className="py-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-100">{f.q}</summary>
              <p className="mt-2 text-sm text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </Card>
      <Card className="mt-5" title="Recursos que exigem computador ou servidor">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
          <li>Controle do OBS: apenas no computador onde o OBS está aberto.</li>
          <li>Saída de vídeo via RTMP/gravação: executada no servidor (plano com saída de vídeo).</li>
          <li>Todo o processamento de jogos e eventos roda no servidor — o celular pode ficar bloqueado sem parar o jogo.</li>
        </ul>
      </Card>
    </>
  );
}
