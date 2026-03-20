import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import logoImg from '@/assets/logo.png';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

const Auth = () => {
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
      // Check if email is authorized
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
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src={logoImg} alt="Sistema Financeiro" className="w-14 h-14 rounded-xl" />
          <h1 className="text-xl font-bold text-foreground">Sistema Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            {isLogin ? 'Entre na sua conta' : 'Crie sua conta'}
          </p>
        </div>

        {message && (
          <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30' : 'bg-destructive/10 text-destructive'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isLogin ? 'Entrar' : 'Criar conta'}
          </Button>
        </form>

        {isLogin && (
          <button
            onClick={handleForgotPassword}
            className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
          >
            Esqueci minha senha
          </button>
        )}

        <p className="text-sm text-center text-muted-foreground">
          {isLogin ? 'Não tem conta? ' : 'Já tem conta? '}
          <button
            onClick={() => { setIsLogin(!isLogin); setMessage(null); }}
            className="text-primary font-medium hover:underline"
          >
            {isLogin ? 'Criar conta' : 'Entrar'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Auth;
