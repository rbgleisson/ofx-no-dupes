import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import logoImg from '@/assets/logo.png';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Lock, Mail } from 'lucide-react';

interface AuthProps {
  onBack?: () => void;
}

const Auth = ({ onBack }: AuthProps) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { data: isAuthorized } = await supabase.rpc('is_email_authorized', { _email: email });
      if (!isAuthorized) {
        setMessage({ type: 'error', text: 'Este e-mail não está autorizado. Solicite acesso ao administrador.' });
        setLoading(false);
        return;
      }

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Conta criada! Verifique seu email para confirmar.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao autenticar.' });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setMessage({ type: 'error', text: 'Digite seu email primeiro.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setMessage({ type: 'success', text: 'Email de recuperação enviado! Verifique sua caixa de entrada.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao enviar email.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent items-center justify-center p-12">
        <div className="max-w-md space-y-8">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Koinonia" className="w-12 h-12 rounded-xl" />
            <span className="text-2xl font-bold text-foreground tracking-tight">Koinonia</span>
          </div>
          <h2 className="text-3xl font-bold text-foreground leading-tight">
            Gestão financeira para sua empresa
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Importe extratos, categorize lançamentos, controle permissões e gere relatórios — tudo em um só lugar, com segurança multi-empresa.
          </p>
          <div className="grid grid-cols-2 gap-4 pt-4">
            {['Importação OFX', 'Multi-empresa', 'Relatórios', 'Controle de acesso'].map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-8">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
          )}

          <div className="space-y-2">
            <div className="lg:hidden flex items-center gap-3 mb-6">
              <img src={logoImg} alt="Koinonia" className="w-10 h-10 rounded-xl" />
              <span className="text-xl font-bold text-foreground">Koinonia</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {isLogin ? 'Entrar na sua conta' : 'Criar sua conta'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isLogin
                ? 'Informe suas credenciais para acessar o sistema'
                : 'Preencha os dados para criar sua conta'}
            </p>
          </div>

          {message && (
            <div
              className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm ${
                message.type === 'success'
                  ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="pl-10"
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isLogin ? 'Entrar' : 'Criar conta'}
            </Button>
          </form>

          {isLogin && (
            <button
              onClick={handleForgotPassword}
              className="text-sm text-muted-foreground hover:text-foreground w-full text-center transition-colors"
            >
              Esqueci minha senha
            </button>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-muted-foreground">
                {isLogin ? 'Não tem conta?' : 'Já tem conta?'}
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setIsLogin(!isLogin);
              setMessage(null);
            }}
          >
            {isLogin ? 'Criar conta' : 'Fazer login'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
