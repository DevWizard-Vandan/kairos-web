import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Lock, User, ArrowRight, Loader2 } from 'lucide-react';

export default function Auth({ onLoginSuccess }) {
    const [isRegistering, setIsRegistering] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({ username: '', password: '' });
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError(''); // Clear error on typing
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        // FORCE DIRECT CONNECTION
        const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
        const apiUrl = `http://localhost:3000${endpoint}`;

        console.log(`🚀 Attempting to connect to: ${apiUrl}`);
        console.log("Payload:", formData);

        try {
            const res = await axios.post(apiUrl, formData);
            console.log("✅ Success!", res.data);

            localStorage.setItem('user', JSON.stringify(res.data.user));
            localStorage.setItem('token', res.data.token);

            // TRIGGER APP UPDATE (This fixes the stuck page)
            onLoginSuccess(res.data.user);

        } catch (err) {
            console.error("❌ Login Failed:", err);
            // Show the EXACT error from the server, or the network error
            const serverMessage = err.response?.data?.error;
            const networkMessage = err.message;
            setError(serverMessage || networkMessage || "Unknown Error");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex w-full h-screen bg-[#111b21] overflow-hidden">
            {/* LEFT: VISUAL SIDE */}
            <div className="hidden lg:flex flex-1 relative bg-black items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=2532&auto=format&fit=crop')] bg-cover bg-center opacity-60"></div>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#111b21]"></div>

                <div className="relative z-10 p-12 text-white max-w-lg">
                    <h1 className="text-6xl font-bold mb-6 tracking-tighter">Kairos<span className="text-[#00a884]">.</span></h1>
                    <p className="text-xl text-gray-300 leading-relaxed">
                        Experience the next evolution of secure communication.
                        Encrypted. Ephemeral. Limitless.
                    </p>
                </div>
            </div>

            {/* RIGHT: FORM SIDE */}
            <div className="flex-1 flex items-center justify-center p-8 relative">
                <div className="w-full max-w-md space-y-8 fade-in">

                    <div className="text-center lg:text-left">
                        <h2 className="text-3xl font-bold text-[#e9edef] mb-2">
                            {isRegistering ? 'Create Account' : 'Welcome Back'}
                        </h2>
                        <p className="text-[#8696a0]">
                            {isRegistering ? 'Join the network today.' : 'Enter your credentials to access the mesh.'}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-4">
                            {/* Username Input */}
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <User className="h-5 w-5 text-[#8696a0] group-focus-within:text-[#00a884] transition-colors" />
                                </div>
                                <input
                                    name="username"
                                    type="text"
                                    required
                                    className="block w-full pl-10 pr-3 py-3 bg-[#202c33] border border-[#2a3942] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] transition-all"
                                    placeholder="Username"
                                    onChange={handleChange}
                                />
                            </div>

                            {/* Password Input */}
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-[#8696a0] group-focus-within:text-[#00a884] transition-colors" />
                                </div>
                                <input
                                    name="password"
                                    type="password"
                                    required
                                    className="block w-full pl-10 pr-3 py-3 bg-[#202c33] border border-[#2a3942] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] transition-all"
                                    placeholder="Password"
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 rounded bg-red-900/20 border border-red-900/50 text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg text-sm font-bold text-[#111b21] bg-[#00a884] hover:bg-[#06cf9c] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00a884] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {isLoading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <>
                                    {isRegistering ? 'Register' : 'Sign In'}
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="text-center">
                        <button
                            onClick={() => setIsRegistering(!isRegistering)}
                            className="text-sm text-[#00a884] hover:text-[#06cf9c] font-medium transition-colors"
                        >
                            {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Register"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}