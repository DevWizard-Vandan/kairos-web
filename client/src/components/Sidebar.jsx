import { LogOut, Search, UserPlus } from 'lucide-react';
import { Avatar } from './SettingsModal';

export default function Sidebar({
    user, chats, activeChat, openChat,
    searchTerm, handleSearch, setShowSettings, onLogout, onOpenCreateGroup
}) {
    return (
        <div className="w-[380px] flex flex-col border-r border-[#374045] bg-[#111b21] h-full">
            {/* Header */}
            <div className="h-[64px] bg-[#202c33] flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition p-1 rounded" onClick={() => setShowSettings(true)}>
                    <Avatar url={user.avatar_url} name={user.username} />
                    <span className="font-medium text-[#e9edef]">{user.username}</span>
                </div>
                <div className="flex gap-3">
                    {/* NEW GROUP BUTTON */}
                    <button onClick={onOpenCreateGroup} title="New Group" className="p-2 hover:bg-[#374045] rounded-full transition">
                        <UserPlus size={20} className="text-[#aebac1]" />
                    </button>

                    <button onClick={onLogout} title="Logout" className="p-2 hover:bg-[#374045] rounded-full transition">
                        <LogOut size={20} className="text-[#aebac1]" />
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="p-2 border-b border-[#202c33] bg-[#111b21] shrink-0">
                <div className="bg-[#202c33] rounded-lg flex items-center px-3 h-[38px] border border-[#374045] focus-within:border-[#00a884] transition-colors">
                    <Search size={18} className="text-[#8696a0]" />
                    <input
                        type="text"
                        placeholder="Search or start new chat"
                        className="bg-transparent border-none outline-none text-[#d1d7db] ml-3 w-full text-sm placeholder-[#8696a0]"
                        value={searchTerm}
                        onChange={handleSearch}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {chats.map((chat, idx) => (
                    <div
                        key={idx}
                        onClick={() => openChat(chat)}
                        className={`flex items-center p-3 cursor-pointer border-b border-[#202c33] hover:bg-[#202c33] transition-colors ${activeChat?.id === chat.id ? 'bg-[#2a3942]' : ''}`}
                    >
                        <div className="mr-3 shrink-0"><Avatar url={chat.avatar || chat.avatar_url} name={chat.name || chat.username} size="w-12 h-12" text="text-lg" /></div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline mb-1">
                                <span className="text-[#e9edef] text-base font-normal truncate">{chat.name || chat.username}</span>
                                {chat.updated_at && <span className="text-[#8696a0] text-xs">{new Date(chat.updated_at).toLocaleDateString()}</span>}
                            </div>
                            <div className="text-[#8696a0] text-sm truncate">{chat.last_message}</div>
                        </div>
                    </div>
                ))}

                {chats.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-40 text-[#8696a0] opacity-50">
                        <UserPlus size={40} className="mb-2" />
                        <span className="text-sm">No chats found</span>
                    </div>
                )}
            </div>
        </div>
    );
}