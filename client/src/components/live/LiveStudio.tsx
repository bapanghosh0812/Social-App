import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Mic, MicOff, Video, VideoOff, SwitchCamera, Radio, Heart, Eye, Clock } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useFeedStore } from '../../store/useFeedStore.js';
import { api } from '../../services/api.js';
import { realtime } from '../../services/realtime.js';
import type { LiveChatMessage, LiveSession } from '../../types/index.js';
import { Avatar } from '../ui/Avatar.js';
import { Button, Spinner } from '../ui/primitives.js';
import { ConfirmDialog } from '../ui/Sheet.js';
import { FloatingHearts, LiveBadge, LiveChat, LiveComposer } from './LiveOverlay.js';

type Phase = 'camera' | 'starting' | 'live' | 'ended' | 'error';

/**
 * Host side of a live broadcast: camera capture + one WebRTC peer connection
 * per viewer (mesh), signaled through the realtime channel.
 */
export const LiveStudio: React.FC = () => {
  const { liveStudioTitle, openLiveStudio, addToast } = useAppStore();
  const { user } = useAuthStore();
  const fetchLives = useFeedStore((s) => s.fetchLives);
  const open = liveStudioTitle !== null;

  const [phase, setPhase] = useState<Phase>('camera');
  const [error, setError] = useState('');
  const [session, setSession] = useState<LiveSession | null>(null);
  const [viewers, setViewers] = useState(0);
  const [peak, setPeak] = useState(0);
  const [likes, setLikes] = useState(0);
  const [chat, setChat] = useState<LiveChatMessage[]>([]);
  const [hearts, setHearts] = useState<number[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [elapsed, setElapsed] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const iceRef = useRef<RTCIceServer[]>([]);
  const sessionRef = useRef<LiveSession | null>(null);

  const spawnHeart = () => setHearts((h) => [...h.slice(-20), Date.now() + Math.random()]);

  const stopAll = useCallback(() => {
    peers.current.forEach((pc) => pc.close());
    peers.current.clear();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // 1) Camera, 2) create session, 3) attach as host.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase('camera');
    setChat([]);
    setLikes(0);
    setViewers(0);
    setPeak(0);
    setElapsed(0);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPhase('starting');
        const res = await api.startLive(liveStudioTitle || 'Campus Live');
        if (cancelled) {
          api.endLive(res.session.id).catch(() => {});
          return;
        }
        iceRef.current = res.iceServers;
        sessionRef.current = res.session;
        setSession(res.session);
        realtime.send({ type: 'LIVE_HOST_ATTACH', sessionId: res.session.id });
        setPhase('live');
        fetchLives();
      } catch (err: any) {
        if (cancelled) return;
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera and microphone access is needed to go live. Allow it in your browser settings and try again.'
            : err?.message || 'Could not start the live.'
        );
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
      if (sessionRef.current) api.endLive(sessionRef.current.id).catch(() => {});
      sessionRef.current = null;
      stopAll();
      fetchLives();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Signaling + live events.
  useEffect(() => {
    if (!session) return;
    const sid = session.id;

    const createPeer = async (viewerKey: string) => {
      const stream = streamRef.current;
      if (!stream) return;
      peers.current.get(viewerKey)?.close();
      const pc = new RTCPeerConnection({ iceServers: iceRef.current });
      peers.current.set(viewerKey, pc);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.onicecandidate = (e) => {
        if (e.candidate) realtime.send({ type: 'LIVE_SIGNAL', sessionId: sid, to: viewerKey, data: { candidate: e.candidate.toJSON() } });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') pc.restartIce();
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      realtime.send({ type: 'LIVE_SIGNAL', sessionId: sid, to: viewerKey, data: { sdp: pc.localDescription } });
    };

    const offs = [
      realtime.on('LIVE_VIEWER_JOINED', (m) => m.sessionId === sid && createPeer(m.viewerKey).catch(() => {})),
      realtime.on('LIVE_VIEWER_LEFT', (m) => {
        if (m.sessionId !== sid) return;
        peers.current.get(m.viewerKey)?.close();
        peers.current.delete(m.viewerKey);
      }),
      realtime.on('LIVE_SIGNAL', async (m) => {
        if (m.sessionId !== sid) return;
        const pc = peers.current.get(m.from);
        if (!pc) return;
        try {
          if (m.data?.sdp) await pc.setRemoteDescription(m.data.sdp);
          else if (m.data?.candidate) await pc.addIceCandidate(m.data.candidate);
        } catch {
          /* ignore stale signaling */
        }
      }),
      realtime.on('LIVE_STATS', (m) => {
        if (m.sessionId !== sid) return;
        setViewers(m.viewerCount);
        setPeak((p) => Math.max(p, m.viewerCount));
        setLikes(m.likes);
      }),
      realtime.on('LIVE_CHAT', (m) => m.sessionId === sid && setChat((c) => [...c.slice(-60), m.message])),
      realtime.on('LIVE_HEART', (m) => {
        if (m.sessionId !== sid) return;
        setLikes(m.likes);
        spawnHeart();
      }),
      realtime.on('READY', () => realtime.send({ type: 'LIVE_HOST_ATTACH', sessionId: sid })), // re-attach after reconnect
      realtime.on('LIVE_ENDED', (m) => m.sessionId === sid && setPhase('ended')),
    ];
    return () => offs.forEach((off) => off());
  }, [session?.id]);

  useEffect(() => {
    if (phase !== 'live') return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const flip = async () => {
    const next = facing === 'user' ? 'environment' : 'user';
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: next, width: { ideal: 720 }, height: { ideal: 1280 } } });
      const newTrack = camStream.getVideoTracks()[0];
      const stream = streamRef.current;
      if (!stream) return;
      const old = stream.getVideoTracks()[0];
      peers.current.forEach((pc) => pc.getSenders().find((s) => s.track?.kind === 'video')?.replaceTrack(newTrack));
      if (old) {
        stream.removeTrack(old);
        old.stop();
      }
      newTrack.enabled = camOn;
      stream.addTrack(newTrack);
      if (videoRef.current) videoRef.current.srcObject = stream;
      setFacing(next);
    } catch {
      addToast('Could not switch camera on this device', 'error');
    }
  };

  const toggleTrack = (kind: 'audio' | 'video') => {
    const track = kind === 'audio' ? streamRef.current?.getAudioTracks()[0] : streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    kind === 'audio' ? setMicOn(track.enabled) : setCamOn(track.enabled);
  };

  const end = async () => {
    const s = sessionRef.current;
    sessionRef.current = null;
    if (s) await api.endLive(s.id).catch(() => {});
    stopAll();
    setPhase('ended');
    fetchLives();
  };

  const close = () => openLiveStudio(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] flex justify-center bg-black">
      <div className="relative h-full w-full max-w-[480px] overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className={`h-full w-full object-cover ${facing === 'user' ? '-scale-x-100' : ''} ${camOn ? '' : 'opacity-0'}`} />
        {!camOn && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Avatar src={user?.avatarUrl} name={user?.fullName} size={120} ring="live" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/75" />

        {/* Header */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4 safe-top">
          <div className="flex min-w-0 items-center gap-2.5 text-white">
            <Avatar src={user?.avatarUrl} name={user?.fullName} size={40} ring="live" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{liveStudioTitle}</p>
              {phase === 'live' ? <LiveBadge viewers={viewers} elapsed={elapsed} /> : <p className="text-xs text-white/70">Getting ready…</p>}
            </div>
          </div>
          <button
            onClick={() => (phase === 'live' ? setConfirmEnd(true) : close())}
            aria-label="End"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {(phase === 'camera' || phase === 'starting') && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-white">
            <Spinner size={34} />
            <p className="text-sm">{phase === 'camera' ? 'Starting your camera…' : 'Going live…'}</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/80 px-8 text-center text-white">
            <Radio className="h-10 w-10 text-[#FF5A5F]" />
            <p className="text-sm leading-relaxed">{error}</p>
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
          </div>
        )}

        {phase === 'ended' && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/85 px-8 text-center text-white backdrop-blur">
            <div>
              <p className="font-display text-3xl font-semibold">Live ended</p>
              <p className="mt-1 text-sm text-white/70">Thanks for going live with your campus.</p>
            </div>
            <div className="grid w-full max-w-xs grid-cols-3 gap-3">
              {[
                { icon: <Clock className="h-4 w-4" />, label: 'Duration', value: `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` },
                { icon: <Eye className="h-4 w-4" />, label: 'Peak viewers', value: String(peak) },
                { icon: <Heart className="h-4 w-4" />, label: 'Hearts', value: String(likes) },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border border-white/15 bg-white/5 p-3">
                  <div className="flex justify-center text-gold">{s.icon}</div>
                  <p className="mt-1 text-lg font-semibold">{s.value}</p>
                  <p className="text-[10px] uppercase tracking-wider text-white/60">{s.label}</p>
                </div>
              ))}
            </div>
            <Button onClick={close}>Done</Button>
          </div>
        )}

        {phase === 'live' && (
          <>
            <FloatingHearts hearts={hearts} />
            <div className="absolute inset-x-0 bottom-0 z-20 space-y-3 p-4 safe-bottom">
              {chat.length === 0 && viewers === 0 && (
                <p className="rounded-2xl bg-black/40 px-4 py-2.5 text-center text-xs text-white/80 backdrop-blur">
                  You're live! Followers were notified — viewers will appear here.
                </p>
              )}
              <LiveChat messages={chat} />
              <div className="flex items-center justify-center gap-3">
                <StudioButton on={micOn} onClick={() => toggleTrack('audio')} label={micOn ? 'Mute mic' : 'Unmute mic'}>
                  {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                </StudioButton>
                <StudioButton on={camOn} onClick={() => toggleTrack('video')} label={camOn ? 'Turn camera off' : 'Turn camera on'}>
                  {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </StudioButton>
                <StudioButton on onClick={flip} label="Switch camera">
                  <SwitchCamera className="h-5 w-5" />
                </StudioButton>
                <button onClick={() => setConfirmEnd(true)} className="h-12 rounded-full bg-live-grad px-6 text-sm font-bold text-white shadow-lg">
                  End live
                </button>
              </div>
              <LiveComposer
                placeholder="Say something to viewers…"
                onSend={(text) => session && realtime.send({ type: 'LIVE_CHAT', sessionId: session.id, text })}
                onHeart={() => session && realtime.send({ type: 'LIVE_HEART', sessionId: session.id })}
              />
            </div>
          </>
        )}
      </div>
      <ConfirmDialog open={confirmEnd} onClose={() => setConfirmEnd(false)} onConfirm={end} title="End your live video?" confirmLabel="End live" danger />
    </div>
  );
};

const StudioButton: React.FC<{ on: boolean; onClick: () => void; label: string; children: React.ReactNode }> = ({ on, onClick, label, children }) => (
  <button
    onClick={onClick}
    aria-label={label}
    className={`flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-md transition-colors ${
      on ? 'border-white/25 bg-black/40 text-white' : 'border-transparent bg-white text-black'
    }`}
  >
    {children}
  </button>
);
