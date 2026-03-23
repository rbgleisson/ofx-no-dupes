import { Button } from '@/components/ui/button';
import { ArrowRight, BarChart3, Shield, Users, Zap } from 'lucide-react';
import logoImg from '@/assets/logo.png';
import futuristicBg from '@/assets/futuristic-bg.jpg';

interface LandingPageProps {
  onGetStarted: () => void;
}

const LandingPage = ({ onGetStarted }: LandingPageProps) => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Coinonia" className="w-16 h-16 rounded-xl" />
          </div>
          <Button onClick={onGetStarted} size="sm">
            Entrar
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <img src={futuristicBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50" />
          <div className="max-w-6xl mx-auto px-6 py-24 md:py-36 relative">
            <div className="max-w-2xl mx-auto text-center space-y-6">
              <div className="inline-flex items-center gap-2 bg-white/10 text-cyan-300 rounded-full px-4 py-1.5 text-sm font-medium backdrop-blur-sm border border-white/10">
                <Zap className="w-3.5 h-3.5" />
                Gestão financeira inteligente
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.1]">
                Gestão financeira{' '}
                <span className="text-cyan-400">simplificada</span>{' '}
                para igrejas
              </h1>
              <p className="text-lg text-white/70 max-w-xl mx-auto leading-relaxed">
                Importe extratos OFX, categorize lançamentos, gere relatórios e
                gerencie múltiplas empresas em uma única plataforma segura.
              </p>
              <div className="flex gap-3 justify-center pt-2">
                <Button onClick={onGetStarted} size="lg" className="px-8">
                  Acessar o sistema
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border/50 bg-card/50">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <h2 className="text-2xl md:text-3xl font-bold text-center text-foreground mb-12">
              Tudo que você precisa
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: BarChart3,
                  title: 'Relatórios detalhados',
                  desc: 'Visualize receitas, despesas e saldos com filtros por período, conta e categoria.',
                },
                {
                  icon: Shield,
                  title: 'Segurança multi-empresa',
                  desc: 'Cada empresa tem seus dados isolados. Controle permissões de cada usuário.',
                },
                {
                  icon: Users,
                  title: 'Gestão de equipe',
                  desc: 'Convide colaboradores, defina o que cada um pode acessar e mantenha o controle total.',
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="bg-card border border-border/60 rounded-2xl p-6 space-y-3 hover:shadow-lg transition-shadow"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <f.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border/50">
          <div className="max-w-6xl mx-auto px-6 py-20 text-center space-y-6">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              Pronto para começar?
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Acesse sua conta ou solicite acesso ao administrador da sua empresa.
            </p>
            <Button onClick={onGetStarted} size="lg" className="px-8">
              Entrar agora
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="Coinonia" className="w-7 h-7 rounded-md" />
          </div>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
