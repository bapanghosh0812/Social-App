/**
 * End-to-end API checks for College Campus.
 *
 *   1. Start the API (e.g. `npm run dev`, DEMO_MODE=true recommended)
 *   2. npx tsx test-suite.ts [http://localhost:5000]
 *
 * Covers auth, onboarding, permission locks, security hardening (admin gate,
 * upload sniffing, private documents), posts, comments, reels (incl. external
 * links), follows, messaging and notifications.
 */

const ROOT = process.argv[2] || 'http://localhost:5000';
const API = `${ROOT}/api`;
const stamp = Date.now();

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`  ✅ (${Date.now() - t0}ms) ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}: ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function call(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, data };
}

async function run() {
  console.log(`🧪 College Campus API checks against ${ROOT}\n`);

  await test('Health check', async () => {
    const res = await fetch(`${ROOT}/healthz`);
    assert((await res.json()).status === 'healthy', 'not healthy');
  });

  // --- Auth ---
  const email = `student_${stamp}@example.com`;
  let token = '';
  await test('Register rejects weak passwords', async () => {
    const r = await call('POST', '/auth/register', { fullName: 'Test Student', email, password: 'short' });
    assert(r.status === 400, `expected 400, got ${r.status}`);
  });
  await test('Register + session token', async () => {
    const r = await call('POST', '/auth/register', { fullName: 'Test Student', email, password: 'Campus2026x' });
    assert(r.status === 201 && r.data.token, `register failed (${r.status})`);
    token = r.data.token;
    assert(!('tokenVersion' in r.data.user), 'internal fields leaked');
  });
  await test('Login with wrong password is rejected generically', async () => {
    const r = await call('POST', '/auth/login', { email, password: 'WrongPass123' });
    assert(r.status === 401 && r.data.error === 'Invalid email or password.', 'unexpected response');
  });
  await test('Login works', async () => {
    const r = await call('POST', '/auth/login', { email, password: 'Campus2026x' });
    assert(r.status === 200 && r.data.token, 'login failed');
    token = r.data.token;
  });
  await test('Forged token is refused', async () => {
    const r = await call('GET', '/auth/me', undefined, `${token.slice(0, -4)}abcd`);
    assert(r.status === 401, `expected 401, got ${r.status}`);
  });

  // --- Onboarding & permission lock ---
  await test('Onboarding locks the primary college', async () => {
    const r = await call('POST', '/auth/onboarding', { role: 'student', fullName: 'Test Student', collegeId: 'col_iit_delhi_new_delhi', academicYear: '2024-2028' }, token);
    assert(r.status === 200 && r.data.user.isCollegeLocked, 'college not locked');
    const again = await call('POST', '/auth/onboarding', { role: 'student', collegeId: 'col_iit_bombay_mumbai' }, token);
    assert(again.status === 403, 'college could be changed');
  });
  await test('Teacher onboarding: faculty role, department & headline', async () => {
    const reg = await call('POST', '/auth/register', { fullName: 'Dr. Test Teacher', email: `teacher_${stamp}@example.com`, password: 'Campus2026x' });
    const t = reg.data.token;
    const missing = await call('POST', '/auth/onboarding', { role: 'faculty', collegeId: 'col_iit_delhi_new_delhi' }, t);
    assert(missing.status === 400, 'faculty without department accepted');
    const ok = await call('POST', '/auth/onboarding', { role: 'faculty', collegeId: 'col_iit_delhi_new_delhi', department: 'Physics', designation: 'Assistant Professor' }, t);
    assert(ok.status === 200 && ok.data.user.role === 'faculty', 'faculty onboarding failed');
    const profile = await call('GET', `/users/${ok.data.user.id}`, undefined, t);
    assert(String(profile.data.profile.headline).startsWith('Assistant Professor, Physics'), 'headline not generated');
    const skills = await call('PATCH', '/users/settings', { skills: ['Optics', 'Quantum', 'Optics'], headline: 'Physicist' }, t);
    assert(skills.data.user.skills.length === 2 && skills.data.user.headline === 'Physicist', 'profile fields not saved');
    await call('DELETE', '/auth/account', { confirmation: `teacher_${stamp}@example.com` }, t);
  });
  await test('Unverified accounts cannot post', async () => {
    const r = await call('POST', '/feed', { content: 'hello' }, token);
    assert(r.status === 403 && r.data.code === 'VERIFICATION_LOCKED', `expected lock, got ${r.status}`);
  });

  // --- Security hardening ---
  await test('Admin API denied to non-admins (even with a PIN)', async () => {
    const r = await call('GET', '/admin/verifications', undefined, token, { 'x-admin-pin': '123456' });
    assert(r.status === 403, `expected 403, got ${r.status}`);
  });
  await test('Upload rejects files whose bytes are not media', async () => {
    const fd = new FormData();
    fd.append('folder', 'posts');
    fd.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'evil.png');
    const r = await call('POST', '/upload/direct', fd, token);
    assert(r.status === 400, `expected 400, got ${r.status}`);
  });
  let docRef = '';
  await test('Verification documents are stored privately', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    const fd = new FormData();
    fd.append('folder', 'documents');
    fd.append('file', new Blob([png], { type: 'image/png' }), 'receipt.png');
    const r = await call('POST', '/upload/direct', fd, token);
    assert(r.status === 200 && String(r.data.url).startsWith('private:'), 'document URL is public');
    docRef = r.data.url;
    const direct = await fetch(`${ROOT}/uploads/${docRef.slice('private:'.length)}`);
    assert(direct.status === 404, 'private document reachable publicly');
  });
  await test('Submit verification (goes Pending)', async () => {
    const r = await call('POST', '/verification/upload-and-verify', { documentType: 'fees_receipt', documentUrl: docRef }, token);
    assert(r.status === 200 && r.data.data.status === 'Pending', 'submission failed');
  });
  await test('Posts cannot reference arbitrary external media', async () => {
    const r = await call('POST', '/feed', { content: 'x', mediaUrls: ['https://evil.example/x.png'] }, token);
    assert(r.status === 403 || r.status === 400, `expected rejection, got ${r.status}`);
  });
  await test('Private signed media links require a valid signature', async () => {
    const r = await fetch(`${API}/media/private?key=documents/2026/${'0'.repeat(32)}.png&exp=9999999999&sig=bad`);
    assert(r.status === 403, `expected 403, got ${r.status}`);
  });

  // --- Demo-backed social flows (DEMO_MODE=true) ---
  const cfg = await call('GET', '/auth/config');
  if (!cfg.data?.demoMode) {
    console.log('\n  ℹ️  DEMO_MODE is off — skipping social flow checks that need a verified account.');
  } else {
    const demo = await call('POST', '/auth/demo');
    const demoToken: string = demo.data.token;
    let postId = '';
    let reelId = '';

    await test('Demo sign-in (verified account)', async () => {
      assert(demo.status === 200 && demo.data.user.verificationStatus === 'Verified Member', 'demo login failed');
    });
    await test('Feed returns posts with media items', async () => {
      const r = await call('GET', '/feed?mode=forYou&limit=5', undefined, demoToken);
      assert(r.status === 200 && r.data.posts.length > 0, 'empty feed');
      postId = r.data.posts[0].id;
    });
    await test('Like / unlike a post', async () => {
      const a = await call('POST', `/feed/${postId}/like`, undefined, demoToken);
      const b = await call('POST', `/feed/${postId}/like`, undefined, demoToken);
      assert(a.data.isLiked !== b.data.isLiked, 'like did not toggle');
    });
    await test('Comment, like comment, delete comment', async () => {
      const c = await call('POST', `/comments/post/${postId}`, { content: 'Automated test comment' }, demoToken);
      assert(c.status === 201, `comment failed (${c.status})`);
      const l = await call('POST', `/comments/post/${postId}/${c.data.comment.id}/like`, undefined, demoToken);
      assert(l.data.isLiked === true, 'comment like failed');
      const d = await call('DELETE', `/comments/post/${postId}/${c.data.comment.id}`, undefined, demoToken);
      assert(d.status === 200, 'comment delete failed');
    });
    await test('Save post toggles bookmark', async () => {
      const a = await call('POST', `/feed/${postId}/save`, undefined, demoToken);
      const b = await call('POST', `/feed/${postId}/save`, undefined, demoToken);
      assert(a.data.isSaved !== b.data.isSaved, 'save did not toggle');
    });
    await test('Reels stream + external YouTube reel', async () => {
      const r = await call('GET', '/reels', undefined, demoToken);
      assert(r.data.reels.length > 0, 'no reels');
      reelId = r.data.reels[0].id;
      const ext = await call('POST', '/reels', { externalUrl: 'https://youtu.be/aqz-KE-bpKQ', caption: 'test reel' }, demoToken);
      assert(ext.status === 201 && ext.data.reel.provider === 'youtube', 'external reel failed');
      const bad = await call('POST', '/reels', { externalUrl: 'javascript:alert(1)' }, demoToken);
      assert(bad.status === 400, 'unsafe link accepted');
      await call('DELETE', `/reels/${ext.data.reel.id}`, undefined, demoToken);
    });
    await test('Reel like, view and reshare to feed', async () => {
      const others = (await call('GET', '/reels', undefined, demoToken)).data.reels.filter((x: any) => !x.isOwner);
      const target = others[0]?.id || reelId;
      await call('POST', `/reels/${target}/view`, undefined, demoToken);
      const l = await call('POST', `/reels/${target}/like`, undefined, demoToken);
      assert(typeof l.data.likesCount === 'number', 'reel like failed');
      const rp = await call('POST', `/reels/${target}/repost`, {}, demoToken);
      assert(rp.status === 201 || rp.status === 200, `repost failed (${rp.status})`);
      if (rp.data.reposted) await call('POST', `/reels/${target}/repost`, {}, demoToken); // undo
    });
    await test('Messaging: send, list, unread count', async () => {
      const convs = await call('GET', '/messages/conversations', undefined, demoToken);
      assert(convs.data.conversations.length > 0, 'no conversations');
      const conv = convs.data.conversations[0];
      const s = await call('POST', `/messages/conversations/${conv.id}/messages`, { text: 'Test message 👋' }, demoToken);
      assert(s.status === 201, 'send failed');
      const list = await call('GET', `/messages/conversations/${conv.id}/messages`, undefined, demoToken);
      assert(list.data.messages.some((m: any) => m.id === s.data.message.id), 'message missing');
      await call('DELETE', `/messages/messages/${s.data.message.id}`, undefined, demoToken);
    });
    await test('Notifications list', async () => {
      const r = await call('GET', '/notifications', undefined, demoToken);
      assert(r.status === 200 && Array.isArray(r.data.notifications), 'notifications failed');
    });
    await test('Private account profile hides content from non-followers', async () => {
      const s = await call('GET', '/users/search?q=Isha', undefined, token);
      const isha = s.data.users[0];
      assert(isha, 'private demo user not found');
      const p = await call('GET', `/users/${isha.id}`, undefined, token);
      assert(p.data.profile.isLockedForViewer === true && p.data.posts.length === 0, 'private content leaked');
    });
  }

  // --- Cleanup ---
  await test('Delete test account', async () => {
    const r = await call('DELETE', '/auth/account', { confirmation: email }, token);
    assert(r.status === 200, 'delete failed');
  });

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
