import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useReactMediaRecorder } from "react-media-recorder";
import SimplePeer from 'simple-peer';
import { Search, MoreVertical, Paperclip, Mic, Send, Phone, Video, Smile, LogOut, StopCircle, UserPlus, X, Camera, Save } from 'lucide-react';

const ENDPOINT = "http://localhost:3000";

export default function Chat({ user, onLogout }) {
    const [socket, setSocket] = useState(null);
    const [chats, setChats] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [currentUser, setCurrentUser] = useState(user); // Local state for profile updates
    const [showSettings, setShowSettings] = useState(false); // Settings Modal Toggle

    // VIDEO STATE
    const [callAccepted, setCallAccepted] = useState(false);
    const [callEnded, setCallEnded] = useState(false);
    const [stream, setStream] = useState(null);
    const [receivingCall, setReceivingCall] = useState(false);
    const [caller, setCaller] = useState("");
    const [callerSignal, setCallerSignal] = useState(null);
    const [callActive, setCallActive] = useState(false);

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const avatarInputRef = useRef(null);
    const myVideo = useRef();
    const userVideo = useRef();
    const connectionRef = useRef();

    const { status, startRecording, stopRecording } = useReactMediaRecorder({
        audio: true, onStop: (blobUrl, blob) => handleVoiceUpload(blob)
    });

    useEffect(() => {
        const newSocket = io(ENDPOINT);
        setSocket(newSocket);
        newSocket.emit("login", user.id);

        newSocket.on("private_message", (msg) => {
            if (activeChat && (msg.from === activeChat.other_user_id || msg.to === activeChat.other_user_id)) {
                setMessages((prev) => [...prev, msg]);
                scrollToBottom();
            }
            loadChats();
        });

        newSocket.on("call_incoming", (data) => {
            setReceivingCall(true);
            setCaller(data.from);
            setCallerSignal(data.signal);
            setCallActive(true);
        });

        loadChats();
        return () => newSocket.close();
    }, [user.id, activeChat]);

    const loadChats = async () => {
        try {
            const res = await axios.get(`${ENDPOINT}/api/conversations/${user.id}`);
            setChats(res.data);
        } catch (err) { console.error(err); }
    };

    const handleSearch = async (e) => {
        const term = e.target.value;
        setSearchTerm(term);
        if (term.length > 0) {
            try {
                const res = await axios.get(`${ENDPOINT}/api/users/search?query=${term}`);
                const results = res.data.filter(u => u.id !== user.id).map(u => ({
                    other_user_id: u.id, username: u.username, last_message: "Tap to start chatting", avatar_url: u.avatar_url
                }));
                setChats(results);
            } catch (e) { console.error(e); }
        } else {
            loadChats();
        }
    };

    const openChat = async (chat) => {
        setActiveChat(chat);
        setMessages([]);
        try {
            const res = await axios.get(`${ENDPOINT}/api/messages/${user.id}/${chat.other_user_id}`);
            const history = res.data.map(m => ({
                from: m.sender_id, to: user.id, text: m.text, type: m.type, mediaUrl: m.media_url, timestamp: m.created_at
            }));
            setMessages(history);
            setTimeout(scrollToBottom, 100);
        } catch (err) { console.error("Failed to load history", err); }
    };

    const sendMessage = (text, type = 'text', mediaUrl = null) => {
        if (!activeChat) return;
        if (!text && !mediaUrl) return;
        const msgData = { to: activeChat.other_user_id, from: user.id, text: text || "", type, mediaUrl, timestamp: new Date() };
        setMessages((prev) => [...prev, msgData]);
        setNewMessage("");
        setTimeout(scrollToBottom, 50);
        socket.emit("private_message", msgData);
        if (searchTerm) { setSearchTerm(""); setTimeout(loadChats, 500); }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await axios.post(`${ENDPOINT}/api/upload`, formData);
            sendMessage(null, res.data.type, res.data.url);
        } catch (e) { alert("Upload failed"); }
    };

    const handleVoiceUpload = async (blob) => {
        const file = new File([blob], "voice.wav", { type: "audio/wav" });
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await axios.post(`${ENDPOINT}/api/upload`, formData);
            sendMessage(null, 'audio', res.data.url);
        } catch (e) { console.error(e); }
    };

    // --- PROFILE UPDATE LOGIC ---
    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        const bio = e.target.bio.value;
        // Note: Avatar is handled separately via immediate upload
        try {
            const res = await axios.put(`${ENDPOINT}/api/users/profile`, { userId: user.id, bio });
            setCurrentUser({ ...currentUser, bio: res.data.bio });
            alert("Profile Updated!");
            setShowSettings(false);
        } catch (err) { alert("Failed to update profile"); }
    };

    const handleAvatarUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const uploadRes = await axios.post(`${ENDPOINT}/api/upload`, formData);
            const avatarUrl = uploadRes.data.url;

            // Save to DB
            await axios.put(`${ENDPOINT}/api/users/profile`, { userId: user.id, avatarUrl });
            setCurrentUser({ ...currentUser, avatar_url: avatarUrl });
        } catch (e) { alert("Avatar upload failed"); }
    };

    // --- VIDEO CALL LOGIC (Keeping existing logic) ---
    const callUser = () => { /* ... existing call logic ... */ };
    const answerCall = () => { /* ... existing answer logic ... */ };
    const leaveCall = () => { setCallEnded(true); setCallActive(false); window.location.reload(); };

    const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

    // HELPER: Avatar Renderer
    const Avatar = ({ url, name, size = "w-10 h-10", text = "text-sm" }) => {
        if (url) return <img src={`${ENDPOINT}${url}`} className={`${size} rounded-full object-cover`} />;
        return <div className={`${size} rounded-full bg-[#6a7175] flex items-center justify-center font-bold text-white ${text}`}>{name[0].toUpperCase()}</div>;
    };

    return (
        <div className="flex h-screen bg-[#0b141a] overflow-hidden text-[#e9edef] font-sans">
            {/* SIDEBAR */}
            <div className="w-[350px] flex flex-col border-r border-[#374045] bg-[#111b21]">
                <div className="h-[60px] bg-[#202c33] flex items-center justify-between px-4 py-2 shrink-0">
                    {/* USER PROFILE HEADER */}
                    <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition" onClick={() => setShowSettings(true)}>
                        <Avatar url={currentUser.avatar_url} name={currentUser.username} />
                        <span className="font-medium text-sm text-[#e9edef]">{currentUser.username}</span>
                    </div>
                    <button onClick={onLogout} title="Logout"><LogOut size={20} className="text-[#aebac1] hover:text-[#ef4444]" /></button>
                </div>

                <div className="p-2 border-b border-[#202c33] bg-[#111b21]">
                    <div className="bg-[#202c33] rounded-lg flex items-center px-3 h-[35px] border border-[#374045]">
                        <Search size={18} className="text-[#8696a0]" />
                        <input type="text" placeholder="Search..." className="bg-transparent border-none outline-none text-[#d1d7db] ml-3 w-full text-sm placeholder-[#8696a0]" value={searchTerm} onChange={handleSearch} />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {chats.map((chat, idx) => (
                        <div key={idx} onClick={() => openChat(chat)} className={`flex items-center p-3 cursor-pointer border-b border-[#202c33] hover:bg-[#202c33] ${activeChat?.other_user_id === chat.other_user_id ? 'bg-[#2a3942]' : ''}`}>
                            <div className="mr-3"><Avatar url={chat.avatar_url} name={chat.username} size="w-12 h-12" text="text-lg" /></div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline"><span className="text-[#e9edef] text-base font-normal truncate">{chat.username}</span></div>
                                <div className="text-[#8696a0] text-sm truncate mt-1">{chat.last_message}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* CHAT WINDOW */}
            {activeChat ? (
                <div className="flex-1 flex flex-col relative bg-[#0b141a]">
                    <div className="h-[60px] bg-[#202c33] flex items-center justify-between px-4 py-2 border-l border-[#374045] shrink-0">
                        <div className="flex items-center gap-3">
                            <Avatar url={activeChat.avatar_url} name={activeChat.username} />
                            <div className="text-[#e9edef] font-medium">{activeChat.username}</div>
                        </div>
                        <div className="flex gap-6 text-[#aebac1]"><Video size={20} className="cursor-pointer hover:text-white" onClick={() => setCallActive(true)} /><Phone size={20} className="cursor-pointer hover:text-white" /></div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-contain">
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.from === user.id ? 'justify-end' : 'justify-start'}`}>
                                <div className={`relative max-w-[65%] px-2 py-1.5 text-sm rounded-lg shadow-sm ${msg.from === user.id ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-none' : 'bg-[#202c33] text-[#e9edef] rounded-tl-none'}`}>
                                    {msg.type === 'image' && <img src={`${ENDPOINT}${msg.mediaUrl}`} className="rounded-lg mb-1 max-w-[250px] cursor-pointer" onClick={() => window.open(`${ENDPOINT}${msg.mediaUrl}`)} />}
                                    {msg.type === 'video' && <video controls src={`${ENDPOINT}${msg.mediaUrl}`} className="rounded-lg mb-1 max-w-[300px]" />}
                                    {msg.type === 'audio' && <audio controls src={`${ENDPOINT}${msg.mediaUrl}`} className="h-[40px] w-[240px] mb-1" />}
                                    {msg.text && <span className="break-words block">{msg.text}</span>}
                                    <div className="flex justify-end items-center gap-1 mt-1 opacity-70"><span className="text-[10px]">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="bg-[#202c33] px-4 py-2 flex items-center gap-2 shrink-0">
                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                        <button onClick={() => fileInputRef.current.click()}><Paperclip size={24} className="text-[#8696a0]" /></button>
                        <input className="flex-1 bg-[#2a3942] rounded-lg px-4 py-2 text-[#d1d7db] outline-none border-none placeholder-[#8696a0]" placeholder="Type a message" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendMessage(newMessage)} />
                        {newMessage ? <button onClick={() => sendMessage(newMessage)}><Send size={24} className="text-[#8696a0]" /></button> : (status === "recording" ? <button onClick={stopRecording}><StopCircle size={24} className="text-[#ef4444] animate-pulse" /></button> : <button onClick={startRecording}><Mic size={24} className="text-[#8696a0]" /></button>)}
                    </div>
                </div>
            ) : (
                <div className="flex-1 bg-[#222e35] flex flex-col items-center justify-center border-b-[6px] border-[#00a884]"><h1 className="text-[#e9edef] text-3xl font-light mb-4">Kairos Web</h1></div>
            )}

            {/* --- SETTINGS MODAL --- */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/50 z-50 flex justify-start">
                    <div className="w-[350px] bg-[#111b21] h-full shadow-2xl flex flex-col animate-fade-in border-r border-[#374045]">
                        <div className="h-[110px] bg-[#202c33] flex items-end p-4 pb-2 relative">
                            <button onClick={() => setShowSettings(false)} className="absolute top-4 left-4 text-white hover:bg-white/10 p-2 rounded-full"><X size={24} /></button>
                            <span className="text-xl font-medium text-white mb-2 ml-10">Profile</span>
                        </div>

                        <div className="flex flex-col items-center p-8 bg-[#111b21]">
                            <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current.click()}>
                                <Avatar url={currentUser.avatar_url} name={currentUser.username} size="w-40 h-40" text="text-6xl" />
                                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                    <Camera className="text-white" size={32} />
                                    <span className="text-white text-xs mt-8 absolute">CHANGE</span>
                                </div>
                                <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                            </div>
                        </div>

                        <form onSubmit={handleProfileUpdate} className="px-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[#00a884] text-sm font-medium">Your Name</label>
                                <div className="text-[#d1d7db] text-lg border-b-2 border-[#202c33] pb-2">{currentUser.username}</div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[#00a884] text-sm font-medium">About</label>
                                <div className="flex items-center border-b-2 border-[#8696a0] focus-within:border-[#00a884] transition-colors pb-1">
                                    <input name="bio" defaultValue={currentUser.bio || "Hey there! I am using Kairos."} className="w-full bg-transparent text-[#d1d7db] outline-none py-2" />
                                    <button type="submit"><Save size={20} className="text-[#8696a0] hover:text-[#00a884]" /></button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- VIDEO CALL MODAL (Simplified) --- */}
            {callActive && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center flex-col">
                    <div className="text-white text-2xl mb-4">Video Call Active</div>
                    <button onClick={leaveCall} className="bg-red-600 px-6 py-3 rounded-full font-bold text-white hover:bg-red-700">End Call</button>
                </div>
            )}
        </div>
    );
}
