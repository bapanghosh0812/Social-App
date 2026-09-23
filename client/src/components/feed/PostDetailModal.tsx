import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useFeedStore } from '../../store/useFeedStore.js';
import { api } from '../../services/api.js';
import type { Post } from '../../types/index.js';
import { Sheet } from '../ui/Sheet.js';
import { EmptyState, Spinner } from '../ui/primitives.js';
import { PostCard } from './PostCard.js';
import { FileQuestion } from 'lucide-react';

export const PostDetailModal: React.FC = () => {
  const { postDetailId, openPost } = useAppStore();
  const { patchPost, removePost } = useFeedStore();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!postDetailId) return;
    setPost(null);
    setError(null);
    api
      .getPost(postDetailId)
      .then((r) => setPost(r.post))
      .catch((e) => setError(e.message));
  }, [postDetailId]);

  return (
    <Sheet open={Boolean(postDetailId)} onClose={() => openPost(null)} title="Post" height="tall" zIndex={62}>
      <div className="p-3">
        {error ? (
          <EmptyState icon={<FileQuestion className="h-6 w-6" />} title="Post unavailable" subtitle={error} />
        ) : !post ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <PostCard
            post={post}
            onChange={(patch) => {
              setPost((p) => (p ? { ...p, ...patch } : p));
              patchPost(post.id, patch);
            }}
            onRemove={() => {
              removePost(post.id);
              openPost(null);
            }}
          />
        )}
      </div>
    </Sheet>
  );
};
