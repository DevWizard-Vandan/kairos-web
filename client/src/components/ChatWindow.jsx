import { Video, Phone, Paperclip, Mic, Send, StopCircle } from 'lucide-react';
import { Avatar } from './SettingsModal';
import MessageBubble from './MessageBubble';
import { useRef } from 'react';

export default function ChatWindow({
    activeChat, messages, user, newMessage, setNewMessage,
    sendMessage, fileInputRef, handleFileUpload,
    status, startRecording, stopRecording, messagesEndRef,
    callUser
}) {
    if (!activeChat) return (
        <div className="flex-1 bg-[#222e35] flex flex-col items-center justify-center border-b-[6px] border-[#00a884]">
            <h1 className="text-[#e9edef] text-4xl font-light mb-4 tracking-tight">Kairos Web</h1>
            <p className="text-[#8696a0] text-sm">Send and receive messages without keeping your phone online.</p>
        </div>
    );

    return (
        <div className="flex-1 flex flex-col relative bg-[#0b141a]">
            {/* Header */}
            <div className="h-[64px] bg-[#202c33] flex items-center justify-between px-4 py-2 border-l border-[#374045] shrink-0">
                <div className="flex items-center gap-4 cursor-pointer">
                    <Avatar url={activeChat.avatar_url} name={activeChat.username} />
                    <div className="text-[#e9edef] font-medium text-lg">{activeChat.username}</div>
                </div>
                <div className="flex gap-6 text-[#aebac1]">
                    <button onClick={callUser} className="hover:text-white transition"><Video size={22} /></button>
                    <button className="hover:text-white transition"><Phone size={22} /></button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-2 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-contain">
                {messages.map((msg, i) => (
                    <MessageBubble key={i} msg={msg} isSent={msg.from === user.id} />
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="bg-[#202c33] px-4 py-3 flex items-center gap-4 shrink-0 z-10">
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                <button onClick={() => fileInputRef.current.click()} className="text-[#8696a0] hover:text-[#d1d7db] transition"><Paperclip size={24} /></button>

                <input
                    className="flex-1 bg-[#2a3942] rounded-lg px-4 py-2.5 text-[#d1d7db] outline-none border border-transparent focus:border-[#00a884]/30 placeholder-[#8696a0] transition-all"
                    placeholder="Type a message"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage(newMessage)}
                />

                {newMessage ? (
                    <button onClick={() => sendMessage(newMessage)} className="text-[#8696a0] hover:text-[#00a884] transition"><Send size={24} /></button>
                ) : (
                    status === "recording" ?
                        <button onClick={stopRecording} className="text-[#ef4444] animate-pulse"><StopCircle size={24} /></button> :
                        <button onClick={startRecording} className="text-[#8696a0] hover:text-[#d1d7db] transition"><Mic size={24} /></button>
                )}
            </div>
        </div>
    );
}