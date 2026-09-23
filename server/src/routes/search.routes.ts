import { Router } from 'express';
import { db } from '../db/database.js';
import { redis } from '../services/redisCacheService.js';

const router = Router();

/**
 * Typo-tolerant multi-tenant college search (trigram similarity).
 */
router.get('/', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const type = typeof req.query.type === 'string' ? req.query.type : '';
  const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);

  const cacheKey = `search:colleges:${query.toLowerCase().trim()}:${state || 'all'}:${type || 'all'}`;
  const cached = await redis.get<any>(cacheKey);
  if (cached) {
    res.setHeader('X-Cache-Status', 'HIT');
    return res.json({ success: true, fromCache: true, ...cached });
  }
  res.setHeader('X-Cache-Status', 'MISS');

  let results = db.searchColleges(query, limit).map((c) => ({
    ...c,
    verifiedStudentCount: db.verifiedMemberCount(c.id),
  }));

  if (state && state !== 'All') {
    results = results.filter((c) => c.state.toLowerCase() === state.toLowerCase());
  }
  if (type && type !== 'All') {
    results = results.filter((c) => c.type.toLowerCase() === type.toLowerCase());
  }

  const payload = { results, count: results.length, query };
  await redis.set(cacheKey, payload, 60);
  res.json({ success: true, ...payload });
});

/**
 * College hub details with live member and post counts.
 */
router.get('/:collegeId', (req, res) => {
  const { collegeId } = req.params;
  const college = db.colleges.get(collegeId);
  if (!college) return res.status(404).json({ success: false, error: 'College not found.' });

  const collegePosts = Array.from(db.posts.values()).filter((p) => p.collegeId === collegeId);
  const collegeMembers = Array.from(db.users.values()).filter(
    (u) => u.collegeId === collegeId && u.verificationStatus === 'Verified Member' && !u.isPrivate && u.isProfileComplete
  );

  res.json({
    success: true,
    college: {
      ...college,
      verifiedStudentCount: db.verifiedMemberCount(collegeId),
      activePostsCount: collegePosts.length,
      verifiedMembersList: collegeMembers.slice(0, 12).map((u) => ({
        id: u.id,
        name: u.fullName,
        avatar: u.avatarUrl,
      })),
    },
  });
});

export default router;
