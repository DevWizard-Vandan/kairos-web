import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useReactMediaRecorder } from "react-media-recorder";
import SimplePeer from 'simple-peer';

// Components
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import VideoCall from '../components/VideoCall';
import SettingsModal from '../components/SettingsModal';

export const ENDPOINT = "http://localhost:3000";

export default function Chat({ user, onLogout }) {
    // --- STATE ---
    const [socket, setSocket] = useState(null);
    const [chats, setChats] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [currentUser, setCurrentUser] = useState(user);
    const [showSettings, setShowSettings] = useState(false);

    // Video State
    const [callActive, setCallActive] = useState(false);
    const [callAccepted, setCallAccepted] = useState(false);
    const [receivingCall, setReceivingCall] = useState(false);
    const [stream, setStream] = useState(null);
    const [caller, setCaller] = useState("");
    const [callerSignal, setCallerSignal] = useState(null);

    // Refs
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const myVideo = useRef();
    const userVideo = useRef();
    const connectionRef = useRef();

    // Hooks
    const { status, startRecording, stopRecording } = useReactMediaRecorder({
        audio: true, onStop: (blobUrl, blob) => handleVoiceUpload(blob)
    });

    // --- SOCKET INIT ---
    useEffect(() => {
        const newSocket = io(ENDPOINT);
        setSocket(newSocket);
        newSocket.emit("login", user.id);

        newSocket.on("private_message", (msg) => {
            if (activeChat && (msg.from === activeChat.other_user_id || msg.to === activeChat.other_user_id)) {
                setMessages((prev) => [...prev, msg]);
                setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
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

    // --- API FUNCTIONS ---
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
        } else { loadChats(); }
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
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        } catch (err) { console.error(err); }
    };

    const sendMessage = (text, type = 'text', mediaUrl = null) => {
        if (!activeChat || (!text && !mediaUrl)) return;
        const msgData = { to: activeChat.other_user_id, from: user.id, text: text || "", type, mediaUrl, timestamp: new Date() };
        setMessages((prev) => [...prev, msgData]);
        setNewMessage("");
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        socket.emit("private_message", msgData);
        if (searchTerm) { setSearchTerm(""); setTimeout(loadChats, 500); }
    };

    // --- UPLOAD HANDLERS ---
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

    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.put(`${ENDPOINT}/api/users/profile`, { userId: user.id, bio: e.target.bio.value });
            setCurrentUser({ ...currentUser, bio: res.data.bio });
            setShowSettings(false);
        } catch (err) { alert("Failed"); }
    };

    const handleAvatarUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const uploadRes = await axios.post(`${ENDPOINT}/api/upload`, formData);
            await axios.put(`${ENDPOINT}/api/users/profile`, { userId: user.id, avatarUrl: uploadRes.data.url });
            setCurrentUser({ ...currentUser, avatar_url: uploadRes.data.url });
        } catch (e) { alert("Failed"); }
    };

    // --- VIDEO LOGIC ---
    const callUser = () => {
        setCallActive(true);
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((currentStream) => {
            setStream(currentStream);
            if (myVideo.current) myVideo.current.srcObject = currentStream;
            const peer = new SimplePeer({ initiator: true, trickle: false, stream: currentStream });
            peer.on("signal", (data) => socket.emit("call_user", { userToCall: activeChat.other_user_id, signalData: data, from: user.id }));
            peer.on("stream", (currentStream) => { if (userVideo.current) userVideo.current.srcObject = currentStream; });
            socket.on("call_accepted", (signal) => { setCallAccepted(true); peer.signal(signal); });
            connectionRef.current = peer;
        });
    };

    const answerCall = () => {
        setCallAccepted(true);
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((currentStream) => {
            setStream(currentStream);
            if (myVideo.current) myVideo.current.srcObject = currentStream;
            const peer = new SimplePeer({ initiator: false, trickle: false, stream: currentStream });
            peer.on("signal", (data) => socket.emit("answer_call", { signal: data, to: caller }));
            peer.on("stream", (currentStream) => { if (userVideo.current) userVideo.current.srcObject = currentStream; });
            peer.signal(callerSignal);
            connectionRef.current = peer;
        });
    };

    const leaveCall = () => {
        setCallActive(false);
        connectionRef.current?.destroy();
        window.location.reload();
    };

    // --- RENDER ---
    return (
        <div className="flex h-screen bg-[#0b141a] overflow-hidden text-[#e9edef] font-sans">
            <Sidebar
                user={currentUser} chats={chats} activeChat={activeChat} openChat={openChat}
                searchTerm={searchTerm} handleSearch={handleSearch} setShowSettings={setShowSettings} onLogout={onLogout}
            />

            <ChatWindow
                activeChat={activeChat} messages={messages} user={user}
                newMessage={newMessage} setNewMessage={setNewMessage} sendMessage={sendMessage}
                fileInputRef={fileInputRef} handleFileUpload={handleFileUpload}
                status={status} startRecording={startRecording} stopRecording={stopRecording}
                messagesEndRef={messagesEndRef} callUser={callUser}
            />

            <VideoCall
                callActive={callActive} receivingCall={receivingCall} callAccepted={callAccepted}
                activeChat={activeChat} userVideo={userVideo} myVideo={myVideo}
                answerCall={answerCall} leaveCall={leaveCall}
            />

            <SettingsModal
                show={showSettings} onClose={() => setShowSettings(false)}
                currentUser={currentUser} onUpdateProfile={handleProfileUpdate} onUploadAvatar={handleAvatarUpload}
            />
        </div>
    );
}