import { X, Camera, Save } from 'lucide-react';
import { useRef } from 'react';

// Simple Avatar Component for reuse
export const Avatar = ({ url, name, size = "w-10 h-10", text = "text-sm" }) => {
    if (url) return <img src={`http://localhost:3000${url}`} className={`${size} rounded-full object-cover border border-white/10`} />;
    return <div className={`${size} rounded-full bg-[#6a7175] flex items-center justify-center font-bold text-white ${text} border border-white/10`}>{name?.[0]?.toUpperCase()}</div>;
};

export default function SettingsModal({ show, onClose, currentUser, onUpdateProfile, onUploadAvatar }) {
    const avatarInputRef = useRef(null);
    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-start backdrop-blur-sm">
            <div className="w-[400px] bg-[#111b21] h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300 border-r border-[#374045]">
                {/* Header */}
                <div className="h-[120px] bg-[#202c33] flex items-end p-5 pb-4 relative">
                    <button onClick={onClose} className="absolute top-5 left-4 text-white hover:bg-white/10 p-2 rounded-full transition">
                        <X size={24} />
                    </button>
                    <span className="text-2xl font-medium text-white ml-2">Profile</span>
                </div>

                {/* Avatar Section */}
                <div className="flex flex-col items-center py-10 bg-[#111b21]">
                    <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current.click()}>
                        <Avatar url={currentUser.avatar_url} name={currentUser.username} size="w-48 h-48" text="text-7xl" />
                        <div className="absolute inset-0 bg-black/50 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300">
                            <Camera className="text-white mb-2" size={32} />
                            <span className="text-white text-xs font-bold tracking-widest uppercase">Change Photo</span>
                        </div>
                        <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={onUploadAvatar} />
                    </div>
                </div>

                {/* Form Section */}
                <form onSubmit={onUpdateProfile} className="px-8 space-y-8">
                    <div className="space-y-2">
                        <label className="text-[#00a884] text-sm font-medium tracking-wide">YOUR NAME</label>
                        <div className="text-[#d1d7db] text-lg border-b-2 border-[#202c33] pb-2 font-light">{currentUser.username}</div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[#00a884] text-sm font-medium tracking-wide">ABOUT</label>
                        <div className="flex items-center border-b-2 border-[#8696a0] focus-within:border-[#00a884] transition-colors pb-1">
                            <input name="bio" defaultValue={currentUser.bio || "Hey there! I am using Kairos."} className="w-full bg-transparent text-[#d1d7db] outline-none py-2 text-lg font-light" />
                            <button type="submit" className="p-2 hover:bg-[#202c33] rounded-full transition"><Save size={20} className="text-[#8696a0] hover:text-[#00a884]" /></button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}