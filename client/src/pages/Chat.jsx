import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useReactMediaRecorder } from "react-media-recorder";
import SimplePeer from 'simple-peer';
import { Search, MoreVertical, Paperclip, Mic, Send, Phone, Video, Smile, LogOut, StopCircle, UserPlus, X, VideoOff, MicOff } from 'lucide-react';

const ENDPOINT = "http://localhost:3000";

export default function Chat({ user, onLogout }) {
    const [socket, setSocket] = useState(null);
    const [chats, setChats] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [isSearching, setIsSearching] = useState(false);

    // VIDEO STATE
    const [callAccepted, setCallAccepted] = useState(false);
    const [callEnded, setCallEnded] = useState(false);
    const [stream, setStream] = useState(null);
    const [receivingCall, setReceivingCall] = useState(false);
    const [caller, setCaller] = useState("");
    const [callerSignal, setCallerSignal] = useState(null);
    const [callActive, setCallActive] = useState(false); // Controls Modal Visibility

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
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

        // --- VIDEO LISTENERS ---
        newSocket.on("call_incoming", (data) => {
            setReceivingCall(true);
            setCaller(data.from);
            setCallerSignal(data.signal);
            setCallActive(true); // Open modal to show "Incoming Call"
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
            setIsSearching(true);
            try {
                const res = await axios.get(`${ENDPOINT}/api/users/search?query=${term}`);
                const results = res.data.filter(u => u.id !== user.id).map(u => ({
                    other_user_id: u.id, username: u.username, last_message: "Tap to start chatting", avatar_color: u.avatar_color
                }));
                setChats(results);
            } catch (e) { console.error(e); }
        } else {
            setIsSearching(false);
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
        if (isSearching) { setIsSearching(false); setSearchTerm(""); setTimeout(loadChats, 500); }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await axios.post(`${ENDPOINT}/api/upload`, formData);
            sendMessage(null, res.data.type, res.data.url); // Use type returned by server (image/video/file)
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

    // --- VIDEO LOGIC ---
    const callUser = () => {
        setCallActive(true);
        setCallEnded(false);

        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((currentStream) => {
            setStream(currentStream);
            if (myVideo.current) myVideo.current.srcObject = currentStream;

            const peer = new SimplePeer({ initiator: true, trickle: false, stream: currentStream });

            peer.on("signal", (data) => {
                socket.emit("call_user", { userToCall: activeChat.other_user_id, signalData: data, from: user.id });
            });
            peer.on("stream", (currentStream) => {
                if (userVideo.current) userVideo.current.srcObject = currentStream;
            });
            socket.on("call_accepted", (signal) => {
                setCallAccepted(true);
                peer.signal(signal);
            });
            connectionRef.current = peer;
        });
    };

    const answerCall = () => {
        setCallAccepted(true);
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((currentStream) => {
            setStream(currentStream);
            if (myVideo.current) myVideo.current.srcObject = currentStream;

            const peer = new SimplePeer({ initiator: false, trickle: false, stream: currentStream });

            peer.on("signal", (data) => {
                socket.emit("answer_call", { signal: data, to: caller });
            });
            peer.on("stream", (currentStream) => {
                if (userVideo.current) userVideo.current.srcObject = currentStream;
            });
            peer.signal(callerSignal);
            connectionRef.current = peer;
        });
    };

    const leaveCall = () => {
        setCallEnded(true);
        setCallActive(false);
        if (connectionRef.current) connectionRef.current.destroy();
        if (stream) stream.getTracks().forEach(track => track.stop()); // Stop camera light
        setStream(null);
        setReceivingCall(false);

        // Quick reload to clean up SimplePeer state completely
        window.location.reload();
    };

    const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

    return (
        <div className="flex h-screen bg-[#0b141a] overflow-hidden text-[#e9edef] font-sans">
            {/* SIDEBAR */}
            <div className="w-[350px] flex flex-col border-r border-[#374045] bg-[#111b21]">
                <div className="h-[60px] bg-[#202c33] flex items-center justify-between px-4 py-2 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#6a7175] flex items-center justify-center font-bold text-white">{user.username[0].toUpperCase()}</div>
                        <span className="font-medium text-sm text-[#e9edef]">{user.username}</span>
                    </div>
                    <button onClick={onLogout} title="Logout"><LogOut size={20} className="text-[#aebac1] hover:text-[#ef4444]" /></button>
                </div>

                <div className="p-2 border-b border-[#202c33] bg-[#111b21]">
                    <div className="bg-[#202c33] rounded-lg flex items-center px-3 h-[35px] border border-[#374045]">
                        <Search size={18} className="text-[#8696a0]" />
                        <input type="text" placeholder="Search users..." className="bg-transparent border-none outline-none text-[#d1d7db] ml-3 w-full text-sm placeholder-[#8696a0]" value={searchTerm} onChange={handleSearch} />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {chats.map((chat, idx) => (
                        <div key={idx} onClick={() => openChat(chat)} className={`flex items-center p-3 cursor-pointer border-b border-[#202c33] hover:bg-[#202c33] ${activeChat?.other_user_id === chat.other_user_id ? 'bg-[#2a3942]' : ''}`}>
                            <div className="w-12 h-12 rounded-full bg-[#6a7175] flex items-center justify-center text-white text-lg font-medium mr-3 shrink-0">{chat.username[0].toUpperCase()}</div>
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
                            <div className="w-10 h-10 rounded-full bg-[#6a7175] flex items-center justify-center text-white">{activeChat.username[0].toUpperCase()}</div>
                            <div className="text-[#e9edef] font-medium">{activeChat.username}</div>
                        </div>
                        <div className="flex gap-6 text-[#aebac1]">
                            <Video size={20} className="cursor-pointer hover:text-white" onClick={callUser} />
                            <Phone size={20} className="cursor-pointer hover:text-white" />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-contain">
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.from === user.id ? 'justify-end' : 'justify-start'}`}>
                                <div className={`relative max-w-[65%] px-2 py-1.5 text-sm rounded-lg shadow-sm ${msg.from === user.id ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-none' : 'bg-[#202c33] text-[#e9edef] rounded-tl-none'}`}>
                                    {msg.type === 'image' && <img src={`${ENDPOINT}${msg.mediaUrl}`} className="rounded-lg mb-1 max-w-[250px] cursor-pointer" onClick={() => window.open(`${ENDPOINT}${msg.mediaUrl}`)} />}
                                    {msg.type === 'video' && <video controls src={`${ENDPOINT}${msg.mediaUrl}`} className="rounded-lg mb-1 max-w-[300px]" />}
                                    {msg.type === 'audio' && <audio controls src={`${ENDPOINT}${msg.mediaUrl}`} className="h-[40px] w-[240px] mb-1" />}
                                    {msg.type === 'file' && (
                                        <div onClick={() => window.open(`${ENDPOINT}${msg.mediaUrl}`)} className="flex items-center gap-2 p-2 bg-black/20 rounded cursor-pointer hover:bg-black/30">
                                            <div className="bg-red-500 text-white text-[10px] px-1 font-bold">DOC</div>
                                            <span className="underline text-xs">Download File</span>
                                        </div>
                                    )}
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

            {/* --- VIDEO CALL MODAL --- */}
            {callActive && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center flex-col">
                    <div className="relative w-full max-w-4xl aspect-video bg-black rounded-lg overflow-hidden border border-gray-800 shadow-2xl">
                        {/* REMOTE VIDEO (THEM) */}
                        <video playsInline ref={userVideo} autoPlay className="w-full h-full object-cover" />

                        {/* LOCAL VIDEO (ME) */}
                        <div className="absolute top-4 right-4 w-48 aspect-video bg-gray-900 rounded border border-gray-700 shadow-lg overflow-hidden">
                            <video playsInline muted ref={myVideo} autoPlay className="w-full h-full object-cover" />
                        </div>

                        {/* CONTROLS */}
                        <div className="absolute bottom-8 left-0 w-full flex justify-center items-center gap-6">
                            {receivingCall && !callAccepted ? (
                                <div className="flex flex-col items-center animate-bounce">
                                    <span className="text-white mb-2 text-lg font-bold shadow-black drop-shadow-md">Incoming Call...</span>
                                    <button onClick={answerCall} className="bg-green-500 p-4 rounded-full hover:bg-green-600 transition shadow-lg shadow-green-500/50">
                                        <Phone size={32} className="text-white" />
                                    </button>
                                </div>
                            ) : (
                                <button onClick={leaveCall} className="bg-red-600 p-4 rounded-full hover:bg-red-700 transition shadow-lg shadow-red-600/50">
                                    <Phone size={32} className="text-white rotate-[135deg]" />
                                </button>
                            )}
                        </div>
                    </div>
                    {!callAccepted && !receivingCall && (
                        <div className="text-white mt-4 text-xl animate-pulse">Calling {activeChat?.username}...</div>
                    )}
                </div>
            )}
        </div>
    );
}
