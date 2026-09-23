import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Clapperboard, Sparkles, Radio, X, Plus, Link2, Upload, Music2, Film, Globe2, Video } from 'lucide-react';
import { useAppStore, type PublishTab } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useFeedStore } from '../../store/useFeedStore.js';
import { useVerificationStore } from '../../store/useVerificationStore.js';
import { api } from '../../services/api.js';
import { shortCollege } from '../../lib/format.js';
import { Sheet } from '../ui/Sheet.js';
import { Avatar } from '../ui/Avatar.js';
import { Button, Progress, Segmented } from '../ui/primitives.js';

const MAX_FILES = 10;
const TAGS = ['CampusLife', 'Placements', 'TechFest', 'Hackathon', 'ExamNotes', 'Sports', 'Music', 'Startups'];

interface Picked {
  file: File;
  url: string;
  type: 'image' | 'video';
}

/** Grab a frame from a local video file to use as the reel's cover image. */
function captureThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (b: Blob | null) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(b);
    };
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, (video.duration || 3) / 3);
    };
    video.onseeked = () => {
      const scale = Math.min(1, 720 / (video.videoWidth || 720));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round((video.videoWidth || 720) * scale);
      canvas.height = Math.round((video.videoHeight || 1280) * scale);
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => finish(b), 'image/jpeg', 0.82);
    };
    video.onerror = () => finish(null);
    setTimeout(() => finish(null), 8000);
  });
}

/** Client-side recognition of pasted reel links (the server re-validates). */
function detectLink(url: string): { provider: string; thumb?: string } | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:') return null;
    const h = u.hostname.replace(/^www\.|^m\./, '');
    if (h === 'youtu.be' || h.endsWith('youtube.com')) {
      const id = h === 'youtu.be' ? u.pathname.slice(1) : u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/') ? u.pathname.split('/')[2] : u.searchParams.get('v');
      return id && /^[\w-]{11}$/.test(id) ? { provider: 'YouTube', thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } : null;
    }
    if (h.endsWith('instagram.com') && /\/(reel|reels|p)\//.test(u.pathname)) return { provider: 'Instagram' };
    if (h.endsWith('tiktok.com') && /\/video\/\d+/.test(u.pathname)) return { provider: 'TikTok' };
    if (h.endsWith('vimeo.com') && /\/\d{5,}/.test(u.pathname)) return { provider: 'Vimeo' };
    if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { provider: 'Video link' };
    return null;
  } catch {
    return null;
  }
}

export const PublishHubModal: React.FC = () => {
  const { publish, closePublish, openLiveStudio, addToast, setActiveTab } = useAppStore();
  const { user } = useAuthStore();
  const { prependPost, addStory } = useFeedStore();
  const openLock = useVerificationStore((s) => s.openPermissionLockModal);

  const [tab, setTab] = useState<PublishTab>(publish.tab);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  // Post
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Picked[]>([]);
  const postInput = useRef<HTMLInputElement>(null);

  // Reel
  const [reelMode, setReelMode] = useState<'upload' | 'link'>('upload');
  const [reelFile, setReelFile] = useState<Picked | null>(null);
  const [reelLink, setReelLink] = useState('');
  const [reelCaption, setReelCaption] = useState('');
  const [reelAudio, setReelAudio] = useState('');
  const reelInput = useRef<HTMLInputElement>(null);

  // Story
  const [storyFile, setStoryFile] = useState<Picked | null>(null);
  const [storyCaption, setStoryCaption] = useState('');
  const storyInput = useRef<HTMLInputElement>(null);

  // Live
  const [liveTitle, setLiveTitle] = useState('');

  useEffect(() => {
    if (publish.open) setTab(publish.tab);
  }, [publish.open, publish.tab]);

  useEffect(() => {
    if (publish.open && user && user.verificationStatus !== 'Verified Member') {
      closePublish();
      openLock();
    }
  }, [publish.open]);

  const link = useMemo(() => detectLink(reelLink), [reelLink]);

  const reset = () => {
    files.forEach((f) => URL.revokeObjectURL(f.url));
    if (reelFile) URL.revokeObjectURL(reelFile.url);
    if (storyFile) URL.revokeObjectURL(storyFile.url);
    setText('');
    setFiles([]);
    setReelFile(null);
    setReelLink('');
    setReelCaption('');
    setReelAudio('');
    setStoryFile(null);
    setStoryCaption('');
    setLiveTitle('');
    setProgress(0);
  };

  const close = () => {
    if (busy) return;
    closePublish();
  };

  const pick = (list: FileList | null, accept: ('image' | 'video')[], maxMb: number): Picked[] => {
    const out: Picked[] = [];
    for (const file of Array.from(list || [])) {
      const type = file.type.startsWith('video') ? 'video' : file.type.startsWith('image') ? 'image' : null;
      if (!type || !accept.includes(type)) {
        addToast(`${file.name}: unsupported file type`, 'error');
        continue;
      }
      if (file.size > maxMb * 1024 * 1024) {
        addToast(`${file.name} is larger than ${maxMb} MB`, 'error');
        continue;
      }
      out.push({ file, url: URL.createObjectURL(file), type });
    }
    return out;
  };

  const publishPost = async () => {
    if (!text.trim() && files.length === 0) return addToast('Write something or add a photo/video', 'error');
    setBusy(true);
    setProgress(0);
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const up = await api.uploadMedia(files[i].file, 'posts', (p) => setProgress((i + p) / files.length));
        urls.push(up.url);
      }
      const res = await api.createPost({ content: text.trim(), mediaUrls: urls });
      prependPost(res.post);
      addToast('Posted to your campus feed', 'success');
      reset();
      closePublish();
      setActiveTab('home');
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const publishReel = async () => {
    setBusy(true);
    setProgress(0);
    try {
      if (reelMode === 'link') {
        if (!link) throw new Error('Paste a YouTube, Instagram, TikTok, Vimeo or direct video link.');
        await api.createReel({ externalUrl: reelLink.trim(), caption: reelCaption.trim(), musicTrack: reelAudio.trim() });
      } else {
        if (!reelFile) throw new Error('Choose a video for your reel.');
        const thumbBlob = await captureThumbnail(reelFile.file);
        const up = await api.uploadMedia(reelFile.file, 'reels', (p) => setProgress(p * 0.95));
        let thumbnailUrl: string | undefined;
        if (thumbBlob) {
          try {
            thumbnailUrl = (await api.uploadMedia(thumbBlob, 'posts', undefined, 'cover.jpg')).url;
          } catch {
            /* cover is optional */
          }
        }
        setProgress(1);
        await api.createReel({ videoUrl: up.url, thumbnailUrl, caption: reelCaption.trim(), musicTrack: reelAudio.trim() });
      }
      addToast('Reel published', 'success');
      reset();
      closePublish();
      window.dispatchEvent(new Event('cc:reel-created'));
      setActiveTab('reels');
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const publishStory = async () => {
    if (!storyFile) return addToast('Choose a photo or video', 'error');
    setBusy(true);
    try {
      const up = await api.uploadMedia(storyFile.file, 'stories', setProgress);
      const res = await api.createStory({ mediaUrl: up.url, caption: storyCaption.trim() });
      addStory(res.story);
      addToast('Added to your story for 24 hours', 'success');
      reset();
      closePublish();
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const goLive = () => {
    openLiveStudio(liveTitle.trim() || `${user?.fullName.split(' ')[0]}'s live`);
    setLiveTitle('');
  };

  const footer = (() => {
    if (tab === 'post')
      return (
        <Button full size="lg" loading={busy} onClick={publishPost} disabled={!text.trim() && !files.length}>
          {busy && files.length ? `Uploading ${Math.round(progress * 100)}%` : 'Share post'}
        </Button>
      );
    if (tab === 'reel')
      return (
        <Button full size="lg" loading={busy} onClick={publishReel} disabled={reelMode === 'upload' ? !reelFile : !link}>
          {busy && reelMode === 'upload' ? `Uploading ${Math.round(progress * 100)}%` : 'Publish reel'}
        </Button>
      );
    if (tab === 'story')
      return (
        <Button full size="lg" loading={busy} onClick={publishStory} disabled={!storyFile}>
          Share to story
        </Button>
      );
    return (
      <Button full size="lg" onClick={goLive} icon={<Radio className="h-5 w-5" />}>
        Go live now
      </Button>
    );
  })();

  return (
    <Sheet open={publish.open} onClose={close} title="Create" height="full" zIndex={66} footer={footer}>
      <div className="space-y-5 px-5 pb-6 pt-4">
        <Segmented
          id="publish-tab"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'post', label: 'Post', icon: <ImagePlus className="h-4 w-4" /> },
            { value: 'reel', label: 'Reel', icon: <Clapperboard className="h-4 w-4" /> },
            { value: 'story', label: 'Story', icon: <Sparkles className="h-4 w-4" /> },
            { value: 'live', label: 'Live', icon: <Radio className="h-4 w-4" /> },
          ]}
        />

        {busy && <Progress value={progress} />}

        {tab === 'post' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar src={user?.avatarUrl} name={user?.fullName} size={44} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{user?.fullName}</p>
                <p className="flex items-center gap-1 text-xs text-ink3">
                  <Globe2 className="h-3 w-3" /> {user?.isPrivate ? 'Followers only' : 'Everyone'} · {shortCollege(user?.collegeName) || 'Campus'}
                </p>
              </div>
            </div>
            <div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                maxLength={5000}
                autoFocus
                placeholder="What's happening on campus?"
                className="w-full resize-none bg-transparent font-display text-xl leading-snug text-ink outline-none placeholder:text-ink3"
              />
              <p className="text-right text-[11px] text-ink3">{text.length}/5000</p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {TAGS.map((t) => (
                <button key={t} onClick={() => setText((v) => `${v}${v && !v.endsWith(' ') ? ' ' : ''}#${t} `)} className="chip">
                  #{t}
                </button>
              ))}
            </div>

            <input
              ref={postInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
              multiple
              hidden
              onChange={(e) => {
                const picked = pick(e.target.files, ['image', 'video'], 60);
                setFiles((f) => [...f, ...picked].slice(0, MAX_FILES));
                e.target.value = '';
              }}
            />
            {files.length === 0 ? (
              <button
                onClick={() => postInput.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-line2 py-10 text-ink2 transition-colors hover:border-brand/50 hover:text-brand"
              >
                <ImagePlus className="h-8 w-8" />
                <span className="text-sm font-semibold">Add photos or videos</span>
                <span className="text-xs text-ink3">Up to {MAX_FILES} · 60 MB each</span>
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {files.map((f, i) => (
                  <div key={f.url} className="relative aspect-square overflow-hidden rounded-2xl bg-sunken">
                    {f.type === 'video' ? <video src={f.url} muted className="h-full w-full object-cover" /> : <img src={f.url} alt="" className="h-full w-full object-cover" />}
                    {f.type === 'video' && <Video className="absolute left-2 top-2 h-4 w-4 text-white drop-shadow" />}
                    <button
                      onClick={() => {
                        URL.revokeObjectURL(f.url);
                        setFiles((list) => list.filter((_, j) => j !== i));
                      }}
                      aria-label="Remove"
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {files.length < MAX_FILES && (
                  <button onClick={() => postInput.current?.click()} className="flex aspect-square items-center justify-center rounded-2xl border-2 border-dashed border-line2 text-ink3 hover:border-brand/50 hover:text-brand">
                    <Plus className="h-6 w-6" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'reel' && (
          <div className="space-y-4">
            <Segmented
              id="reel-mode"
              size="sm"
              value={reelMode}
              onChange={setReelMode}
              options={[
                { value: 'upload', label: 'Upload video', icon: <Upload className="h-3.5 w-3.5" /> },
                { value: 'link', label: 'Paste a link', icon: <Link2 className="h-3.5 w-3.5" /> },
              ]}
            />
            {reelMode === 'upload' ? (
              <>
                <input
                  ref={reelInput}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  hidden
                  onChange={(e) => {
                    const [picked] = pick(e.target.files, ['video'], 100);
                    if (picked) {
                      if (reelFile) URL.revokeObjectURL(reelFile.url);
                      setReelFile(picked);
                    }
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => reelInput.current?.click()}
                  className="relative mx-auto flex aspect-[9/16] w-48 items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-line2 bg-sunken text-ink2 transition-colors hover:border-brand/50"
                >
                  {reelFile ? (
                    <video src={reelFile.url} autoPlay muted loop playsInline className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex flex-col items-center gap-2 px-4 text-center">
                      <Film className="h-8 w-8 text-brand" />
                      <span className="text-sm font-semibold">Choose a vertical video</span>
                      <span className="text-[11px] text-ink3">MP4 / WebM / MOV · up to 100 MB</span>
                    </span>
                  )}
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="label">Video link</label>
                  <input
                    value={reelLink}
                    onChange={(e) => setReelLink(e.target.value)}
                    placeholder="https://youtube.com/shorts/… or instagram.com/reel/…"
                    className="input"
                    inputMode="url"
                  />
                  <p className="mt-1.5 text-[11px] text-ink3">Works with YouTube & Shorts, Instagram Reels, TikTok, Vimeo and direct .mp4/.webm links.</p>
                </div>
                {reelLink && (
                  <div className={`flex items-center gap-3 rounded-2xl border p-3 ${link ? 'border-success/40 bg-success/10' : 'border-danger/30 bg-danger/10'}`}>
                    {link?.thumb ? (
                      <img src={link.thumb} alt="" className="h-14 w-20 rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-ink/10">
                        <Link2 className="h-5 w-5 text-ink2" />
                      </div>
                    )}
                    <p className="text-sm font-semibold text-ink">{link ? `${link.provider} video detected ✓` : 'This link isn’t supported'}</p>
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="label">Caption</label>
              <textarea value={reelCaption} onChange={(e) => setReelCaption(e.target.value)} rows={2} maxLength={1000} placeholder="Say something… #hashtags work" className="input resize-none" />
            </div>
            <div>
              <label className="label">Audio name</label>
              <div className="relative">
                <Music2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
                <input value={reelAudio} onChange={(e) => setReelAudio(e.target.value)} maxLength={80} placeholder="Original audio" className="input pl-10" />
              </div>
            </div>
          </div>
        )}

        {tab === 'story' && (
          <div className="space-y-4">
            <input
              ref={storyInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              hidden
              onChange={(e) => {
                const [picked] = pick(e.target.files, ['image', 'video'], 60);
                if (picked) {
                  if (storyFile) URL.revokeObjectURL(storyFile.url);
                  setStoryFile(picked);
                }
                e.target.value = '';
              }}
            />
            <div className="relative mx-auto aspect-[9/16] w-56 overflow-hidden rounded-3xl border border-line bg-sunken">
              {storyFile ? (
                storyFile.type === 'video' ? (
                  <video src={storyFile.url} autoPlay muted loop playsInline className="h-full w-full object-cover" />
                ) : (
                  <img src={storyFile.url} alt="" className="h-full w-full object-cover" />
                )
              ) : (
                <button onClick={() => storyInput.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink2 hover:text-brand">
                  <Sparkles className="h-8 w-8 text-brand" />
                  <span className="text-sm font-semibold">Choose photo or video</span>
                  <span className="text-[11px] text-ink3">Disappears after 24 hours</span>
                </button>
              )}
              {storyFile && storyCaption && (
                <span className="absolute inset-x-4 bottom-8 rounded-2xl bg-black/50 px-3 py-2 text-center font-display text-base text-white backdrop-blur">{storyCaption}</span>
              )}
              {storyFile && (
                <button onClick={() => storyInput.current?.click()} className="absolute right-2 top-2 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                  Change
                </button>
              )}
            </div>
            <input value={storyCaption} onChange={(e) => setStoryCaption(e.target.value)} maxLength={300} placeholder="Add a caption (optional)" className="input" />
          </div>
        )}

        {tab === 'live' && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-[#E0245E]/20 via-elev to-elev p-5">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-live-grad px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
                <Radio className="h-3.5 w-3.5" /> Live
              </span>
              <h3 className="mt-3 font-display text-xl font-semibold text-ink">Broadcast to campus</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink2">
                Go live with your camera. Your followers get notified, and viewers can chat and send hearts in real time.
              </p>
            </div>
            <div>
              <label className="label">Title</label>
              <input value={liveTitle} onChange={(e) => setLiveTitle(e.target.value)} maxLength={120} placeholder="e.g. Placement prep Q&A" className="input" />
            </div>
            <p className="text-xs text-ink3">You'll be asked to allow camera and microphone access.</p>
          </div>
        )}
      </div>
    </Sheet>
  );
};
