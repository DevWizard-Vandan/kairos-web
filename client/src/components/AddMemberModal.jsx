import { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Check, Search } from 'lucide-react';
import { Avatar } from './SettingsModal';

export default function AddMemberModal({ show, onClose, onAdd, groupId, currentUserId }) {
    const [users, setUsers] = useState([]);
    const [selected, setSelected] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(false);

    const [existingMembers, setExistingMembers] = useState([]);

    // Fetch existing members when modal opens
    useEffect(() => {
        if (show && groupId) {
            axios.get(`http://localhost:3000/api/groups/${groupId}/members`)
                .then(res => setExistingMembers(res.data.map(m => m.id)))
                .catch(console.error);
        }
    }, [show, groupId]);

    // Search users and filter
    useEffect(() => {
        if (show) {
            setLoading(true);
            const delayDebounceFn = setTimeout(() => {
                axios.get(`http://localhost:3000/api/users/search?query=${searchTerm}`)
                    .then(res => {
                        const filtered = res.data.filter(u =>
                            u.id !== currentUserId && !existingMembers.includes(u.id)
                        );
                        setUsers(filtered);
                        setLoading(false);
                    })
                    .catch(err => {
                        console.error(err);
                        setLoading(false);
                    });
            }, 300);
            return () => clearTimeout(delayDebounceFn);
        }
    }, [show, searchTerm, existingMembers, currentUserId]);

    const toggleUser = (id) => {
        if (selected.includes(id)) setSelected(selected.filter(x => x !== id));
        else setSelected([...selected, id]);
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-[#111b21] w-[450px] rounded-xl shadow-2xl border border-[#374045] overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-4 bg-[#202c33] flex justify-between items-center border-b border-[#374045]">
                    <span className="text-white font-medium text-lg">Add Members</span>
                    <button onClick={onClose}><X className="text-[#aebac1] hover:text-white" /></button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Search Users */}
                    <div className="bg-[#2a3942] rounded-lg flex items-center px-3 py-2 border border-transparent focus-within:border-[#00a884]">
                        <Search size={18} className="text-[#8696a0]" />
                        <input
                            type="text"
                            placeholder="Search users to add..."
                            className="bg-transparent border-none outline-none text-[#d1d7db] ml-3 w-full text-sm placeholder-[#8696a0]"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="text-sm text-[#00a884] font-medium uppercase tracking-wider">Select Users</div>

                    <div className="max-h-[250px] overflow-y-auto space-y-1 custom-scrollbar">
                        {users.map(u => (
                            <div key={u.id} onClick={() => toggleUser(u.id)} className={`flex items-center p-3 rounded-lg cursor-pointer transition ${selected.includes(u.id) ? 'bg-[#00a884]/20' : 'hover:bg-[#202c33]'}`}>
                                <div className={`w-5 h-5 rounded border mr-3 flex items-center justify-center ${selected.includes(u.id) ? 'bg-[#00a884] border-[#00a884]' : 'border-[#8696a0]'}`}>
                                    {selected.includes(u.id) && <Check size={14} className="text-black" />}
                                </div>
                                <Avatar url={u.avatar_url} name={u.username} size="w-8 h-8" />
                                <span className="ml-3 text-white">{u.username}</span>
                            </div>
                        ))}
                        {users.length === 0 && !loading && <div className="text-[#8696a0] text-center py-4">No users found</div>}
                    </div>
                </div>

                <div className="p-4 border-t border-[#374045] flex justify-end">
                    <button
                        onClick={() => onAdd(selected)}
                        disabled={selected.length === 0}
                        className="bg-[#00a884] text-[#111b21] px-6 py-2 rounded-full font-bold hover:bg-[#06cf9c] disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                        Add Selected
                    </button>
                </div>
            </div>
        </div>
    );
}
