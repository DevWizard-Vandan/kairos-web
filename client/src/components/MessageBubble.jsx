import { ENDPOINT } from '../pages/Chat'; // We will export this constant later

export default function MessageBubble({ msg, isSent }) {
    return (
        <div className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}>
            <div className={`
        relative max-w-[65%] px-2 py-1.5 text-sm rounded-lg shadow-sm
        ${isSent ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-none' : 'bg-[#202c33] text-[#e9edef] rounded-tl-none'}
      `}>
                {/* IMAGE */}
                {msg.type === 'image' && (
                    <img
                        src={`${ENDPOINT}${msg.mediaUrl}`}
                        className="rounded-lg mb-1 max-w-[250px] cursor-pointer hover:opacity-90 transition"
                        onClick={() => window.open(`${ENDPOINT}${msg.mediaUrl}`)}
                    />
                )}

                {/* VIDEO */}
                {msg.type === 'video' && (
                    <video controls src={`${ENDPOINT}${msg.mediaUrl}`} className="rounded-lg mb-1 max-w-[300px]" />
                )}

                {/* AUDIO */}
                {msg.type === 'audio' && (
                    <audio controls src={`${ENDPOINT}${msg.mediaUrl}`} className="h-[40px] w-[240px] mb-1" />
                )}

                {/* FILE / DOC */}
                {msg.type === 'file' && (
                    <div onClick={() => window.open(`${ENDPOINT}${msg.mediaUrl}`)} className="flex items-center gap-3 p-3 bg-black/20 rounded-lg cursor-pointer hover:bg-black/30 transition border border-white/5">
                        <div className="bg-red-500 text-white text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider">DOC</div>
                        <div className="flex flex-col">
                            <span className="underline text-xs font-medium text-blue-300">Download File</span>
                            <span className="text-[10px] text-white/50 uppercase">Click to open</span>
                        </div>
                    </div>
                )}

                {/* TEXT */}
                {msg.text && <span className="break-words block px-1">{msg.text}</span>}

                {/* TIMESTAMP */}
                <div className="flex justify-end items-center gap-1 mt-1 opacity-60">
                    <span className="text-[10px]">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            </div>
        </div>
    );
}