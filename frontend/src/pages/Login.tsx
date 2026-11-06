import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { Eye, EyeOff, Warehouse } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const success = await login(username, password);
      if (!success) {
        setError('Invalid credentials. Try Login User and Password');
      } else {
        navigate('/', { replace: true });
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-void z-50">
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `linear-gradient(rgba(255,107,53,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,107,53,0.3) 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
      }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-sm mx-4"
      >
        {/* Card */}
        <div className="glass-panel rounded-lg p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-accent-sky rounded-xl flex items-center justify-center mb-4">
              <Warehouse className="w-7 h-7 text-void" />
            </div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">YESI-FULFILLMENT</h1>
            <p className="text-xs text-text-secondary mt-1 uppercase tracking-widest">Warehouse Management System</p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 rounded-md bg-accent-red/10 border border-accent-red/20 text-accent-red text-xs"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors"
                placeholder="Enter username"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 pr-8 focus:outline-none focus:border-accent-sky transition-colors"
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.98 }}
              className="w-full py-3 bg-accent-sky text-void font-semibold text-sm rounded-md hover:bg-accent-sky/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px]"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </motion.button>
          </form>
             <div className="mt-6 pt-4 border-t border-white/[0.06]">
             <p className="text-[15px] text-text-secondary text-center">
              <span className="text-accent-sky font-mono">| YESI-FZCO |</span>
              <br />
              <span className="text-accent-sky font-mono">Warehouse Fulfillment Tool</span> 
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
 
             
