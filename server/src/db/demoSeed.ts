import { db } from './database.js';
import { meta } from './sqlite.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { unusablePasswordHash } from '../config/auth.js';
import { Comment, JobPosting, PinnedCollegeFeed, Post, Reel, Story, User } from '../types/index.js';
import { messaging } from '../services/messaging.js';
import { notifications } from '../services/notify.js';
import { newId } from '../services/present.js';
import { storage, sniffFile } from '../services/s3.service.js';
import { parseExternalVideo } from '../services/externalMedia.js';

/**
 * Optional demo campus (DEMO_MODE=true).
 *
 * Everything created here is flagged `isDemo` so it can be removed cleanly:
 * switching DEMO_MODE off purges it on the next boot. Media is loaded from
 * freely-licensed public sources (Mixkit videos, Lorem Picsum photos,
 * DiceBear illustrated avatars) and one Blender open movie on YouTube.
 */

const DEMO_VERSION = '2026-09-v5';
const DEMO_DOMAIN = 'campus.test';

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const avatar = (seed: string, bg: string) =>
  `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}`;
const photo = (id: number, w = 1080, h = 1350) => `https://picsum.photos/id/${id}/${w}/${h}`;
const mixkit = (id: number) => ({
  videoUrl: `https://assets.mixkit.co/videos/${id}/${id}-720.mp4`,
  thumbnailUrl: `https://assets.mixkit.co/videos/${id}/${id}-thumb-720-0.jpg`,
});

interface DemoPerson {
  key: string;
  fullName: string;
  collegeId?: string;
  academicYear?: string;
  gender: User['gender'];
  bio: string;
  bg: string;
  isPrivate?: boolean;
  role?: User['role'];
  status?: User['verificationStatus'];
  department?: string;
  designation?: string;
  skills?: string[];
}

const PEOPLE: DemoPerson[] = [
  { key: 'aarav', fullName: 'Aarav Sharma', collegeId: 'col_iit_bombay_mumbai', academicYear: '2023-2027', gender: 'Male', department: 'Computer Science & Engineering', skills: ['React', 'Node.js', 'Robotics', 'DSA'], bio: "CSE '27 · Techfest core team · building things that ship 🚀", bg: 'c9e4de' },
  { key: 'ananya', fullName: 'Ananya Iyer', collegeId: 'col_iit_delhi_new_delhi', academicYear: '2024-2028', gender: 'Female', department: 'Design', skills: ['Figma', 'UI/UX', 'Illustration'], bio: 'Design × code · Rendezvous crew · chai > coffee ☕', bg: 'f4d9b0' },
  { key: 'rohan', fullName: 'Rohan Mehta', collegeId: 'col_bits_pilani_pilani', academicYear: '2022-2026', gender: 'Male', department: 'Economics & Finance', skills: ['Python', 'Quant Finance', 'Statistics'], bio: 'Quant club · APOGEE · half-marathoner 🏃', bg: 'd4c1ec' },
  { key: 'priya', fullName: 'Priya Nair', collegeId: 'col_nit_trichy_tiruchirappalli', academicYear: '2023-2027', gender: 'Female', department: 'Electronics & Communication', skills: ['VLSI', 'Embedded C', 'Carnatic Music'], bio: 'ECE · Festember · Carnatic vocals 🎶', bg: 'ffd5dc' },
  { key: 'kabir', fullName: 'Kabir Singh', collegeId: 'col_du_new_delhi', academicYear: '2024-2028', gender: 'Male', department: 'Economics (Hons.)', skills: ['Film Making', 'Photography', 'Public Policy'], bio: 'Economics (H) · film club · shoots on 35mm 🎞️', bg: 'b6e3f4' },
  { key: 'meera', fullName: 'Meera Reddy', collegeId: 'col_iiit_hyderabad_hyderabad', academicYear: '2023-2027', gender: 'Female', department: 'Computer Science', skills: ['Machine Learning', 'NLP', 'PyTorch'], bio: 'ML research · open source · Felicity ✨', bg: 'ffdfbf' },
  { key: 'arjun', fullName: 'Arjun Das', collegeId: 'col_ju_kolkata', academicYear: '2022-2026', gender: 'Male', department: 'Mechanical Engineering', skills: ['SolidWorks', 'Formula Student', 'CAD'], bio: 'Mech · Sanskriti · Kolkata foodie 🐟', bg: 'c0aede' },
  { key: 'isha', fullName: 'Isha Gupta', collegeId: 'col_iim_ahmedabad_ahmedabad', academicYear: '2025-2027', gender: 'Female', department: 'PGP in Management', skills: ['Strategy', 'Consulting'], bio: 'PGP · consulting club · private account 🔒', bg: 'e2d4b7', isPrivate: true },
  { key: 'sneha', fullName: 'Sneha Patel', collegeId: 'col_iit_bombay_mumbai', academicYear: '2025-2029', gender: 'Female', department: 'Electrical Engineering', bio: 'Fresher at IIT Bombay 👋', bg: 'd1f4d9', status: 'Pending' },
  { key: 'promo', fullName: 'Followers Deals Official', collegeId: 'col_du_new_delhi', academicYear: '2024-2028', gender: 'Prefer not to say', bio: 'Best deals!!!', bg: 'eeeeee' },
  {
    key: 'rajesh',
    fullName: 'Dr. Rajesh Kumar',
    collegeId: 'col_iit_bombay_mumbai',
    gender: 'Male',
    role: 'faculty',
    designation: 'Professor',
    department: 'Computer Science & Engineering',
    skills: ['Machine Learning', 'Healthcare AI', 'Research Mentoring'],
    bio: 'Professor, CSE at IIT Bombay. Working on AI for affordable healthcare. Always happy to mentor curious students.',
    bg: 'dbe4f5',
  },
  {
    key: 'kavita',
    fullName: 'Prof. Kavita Menon',
    collegeId: 'col_du_new_delhi',
    gender: 'Female',
    role: 'faculty',
    designation: 'Head of Department',
    department: 'Economics',
    skills: ['Development Economics', 'Public Policy', 'Econometrics'],
    bio: 'HOD Economics, University of Delhi. Teaching development economics for 18 years.',
    bg: 'f2e2c9',
  },
  {
    key: 'neha',
    fullName: 'Neha Kapoor',
    collegeId: 'col_iit_bombay_mumbai',
    gender: 'Female',
    role: 'faculty',
    designation: 'Training & Placement Officer',
    department: 'Training & Placement Cell',
    skills: ['Campus Placements', 'Career Counselling', 'Industry Relations'],
    bio: 'Training & Placement Officer at IIT Bombay — sharing verified internships and jobs for students across India.',
    bg: 'f9c9b6',
  },
];

/** Tiny valid one-page PDF used as the pending verification document. */
function samplePdf(lines: string[]): Buffer {
  const text = lines
    .map((l, i) => `BT /F1 ${i === 0 ? 18 : 12} Tf 40 ${250 - i * 26} Td (${l.replace(/[()\\]/g, '')}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 297] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

function purgeDemo(): void {
  const demoUsers = Array.from(db.users.values()).filter((u) => u.isDemo);
  for (const u of demoUsers) db.deleteUser(u.id);
  for (const [id, f] of Array.from(db.pinnedFeeds.entries())) if (f.isDemo) db.pinnedFeeds.delete(id);
  meta.remove('demo_primary_user');
  meta.remove('demo_seed_version');
  if (demoUsers.length) logger.info(`Removed demo content (${demoUsers.length} demo accounts).`);
}

async function seedDemo(): Promise<void> {
  const ids: Record<string, string> = {};
  const users: Record<string, User> = {};

  for (const p of PEOPLE) {
    const college = p.collegeId ? db.colleges.get(p.collegeId) : undefined;
    const email = `${p.key}@${DEMO_DOMAIN}`;
    const user: User = {
      id: newId('usr'),
      fullName: p.fullName,
      email,
      phoneNumber: '',
      role: p.role || 'student',
      gender: p.gender,
      avatarUrl: p.key === 'promo' ? '' : avatar(p.fullName, p.bg),
      collegeId: college?.id,
      collegeName: college?.name,
      isCollegeLocked: Boolean(college),
      verificationStatus: p.status || 'Verified Member',
      academicYear: p.academicYear,
      department: p.department,
      designation: p.designation,
      skills: p.skills,
      authProvider: 'password',
      isProfileComplete: true,
      isPrivate: Boolean(p.isPrivate),
      bio: p.bio,
      createdAt: ago(60 * 24 * 40),
      updatedAt: ago(60),
      lastActiveAt: new Date().toISOString(),
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      collegeNotificationsEnabled: college ? { [college.id]: true } : {},
      globalNotificationsEnabled: true,
      tokenVersion: 0,
      isDemo: true,
    };
    db.users.set(user.id, user);
    db.credentials.create(email, user.id, await unusablePasswordHash());
    ids[p.key] = user.id;
    users[p.key] = user;
  }

  // --- Follow graph ---
  const follow = (a: string, b: string, status: 'accepted' | 'pending' = 'accepted') => db.follows.add(ids[a], ids[b], status);
  for (const k of ['ananya', 'rohan', 'priya', 'meera', 'neha', 'kabir']) follow('aarav', k);
  for (const k of ['ananya', 'rohan', 'kabir', 'arjun', 'meera', 'priya']) follow(k, 'aarav');
  follow('aarav', 'isha', 'pending');
  follow('ananya', 'meera');
  follow('meera', 'ananya');
  follow('rohan', 'priya');
  follow('priya', 'kabir');
  follow('kabir', 'arjun');
  follow('arjun', 'kabir');
  follow('isha', 'ananya');
  follow('sneha', 'aarav');
  for (const k of ['aarav', 'sneha', 'meera', 'ananya']) follow(k, 'rajesh');
  follow('rajesh', 'aarav');
  for (const k of ['kabir', 'rohan', 'isha']) follow(k, 'kavita');
  follow('kavita', 'kabir');
  for (const k of ['sneha', 'rohan', 'meera']) follow(k, 'neha');
  follow('neha', 'aarav');

  // --- Posts ---
  const mkPost = (author: string, minutesAgo: number, content: string, media: string[] = [], extra: Partial<Post> = {}): Post => {
    const u = users[author];
    const post: Post = {
      id: newId('post'),
      authorId: u.id,
      authorName: u.fullName,
      authorAvatar: u.avatarUrl,
      authorRole: u.role,
      authorVerificationStatus: u.verificationStatus,
      collegeId: u.collegeId,
      collegeName: u.collegeName,
      content,
      mediaUrls: media,
      mediaType: media.length ? 'image' : 'text',
      likesCount: 0,
      commentsCount: 0,
      sharesCount: Math.floor(Math.random() * 12),
      repostsCount: 0,
      createdAt: ago(minutesAgo),
      isDemo: true,
      ...extra,
    };
    db.posts.set(post.id, post);
    return post;
  };

  const posts = {
    techfest: mkPost('aarav', 95, 'Techfest prep is officially ON 🔥 Two weeks of late nights, one crazy robotics arena. Who is coming to Powai this December? #Techfest #IITB #CampusLife', [photo(1047), photo(0), photo(2)]),
    ananyaDesign: mkPost('ananya', 180, 'Redesigned our society app over the weekend — dark mode, gold accents, zero clutter. Feedback welcome! ✨ #Design #UIUX', [photo(20)]),
    rohanRun: mkPost('rohan', 320, 'Sunrise 10K before the quant midsem. Legs are gone, brain is somehow sharper 🏃‍♂️ #FitnessOnCampus', [photo(1018)]),
    priyaMusic: mkPost('priya', 460, 'Festember rehearsals by the lake. Some evenings just sound better 🎶 #Festember #NITTrichy', [photo(1039)]),
    meeraPaper: mkPost('meera', 700, 'Our workshop paper on low-resource Indic speech recognition got accepted! 🎉 Huge thanks to the lab. Open-sourcing the dataset next week. #Research #MachineLearning #OpenSource'),
    kabirFilm: mkPost('kabir', 900, 'Film club is screening open movies all week in the seminar hall 🎬 Popcorn on us. #FilmClub #DU', [photo(1015)]),
    arjunFood: mkPost('arjun', 1300, 'Kolkata food walk after Sanskriti practice — kathi rolls, phuchka and way too much mishti 🐟 #Kolkata #JU', [photo(1080)]),
    nehaHiring: mkPost('neha', 1500, 'Placement update 📢 Zentrix Labs is hiring 40+ interns for Summer 2027 — SDE, Data and Design, stipend up to ₹60k/month. Open to verified students from every college. Apply from the Opportunities tab. #Placements #Internships'),
    rajeshLab: mkPost('rajesh', 420, 'Summer research internships are open in my lab 🔬 We are building low-cost AI screening tools for rural clinics. Looking for 3 students comfortable with Python and curious about healthcare. Students from any college in India can apply — DM me with a short note and your GitHub. #Research #MachineLearning #Internships'),
    kavitaLecture: mkPost('kavita', 1100, 'Delighted to announce our guest lecture series on “India at 2047: Growth, Jobs & Inclusion” starting next Monday at the Department of Economics. Open to students and faculty from all colleges — livestreamed on College Campus. 🎓 #PublicPolicy #DU', [photo(24)]),
    aaravStudy: mkPost('aarav', 2600, 'Library grind before end-sems. Sharing my DSA revision sheet in the comments if anyone wants it 📚 #ExamNotes', [photo(4)]),
    ananyaCampus: mkPost('ananya', 3200, 'IIT Delhi after rain hits different 🌧️', [photo(10), photo(15)]),
    promoSpam: mkPost('promo', 240, 'GET 10,000 FOLLOWERS FOR ONLY ₹99!!! 💰💰 DM NOW limited offer!!! click link in bio'),
  };
  // A reshare of Ananya's design post by Meera.
  mkPost('meera', 150, 'This is so clean 😍 @Ananya teach us!', [], { repostOf: { type: 'post', id: posts.ananyaDesign.id } });
  db.posts.set(posts.ananyaDesign.id, { ...posts.ananyaDesign, repostsCount: 1 });

  // --- Likes ---
  const like = (post: Post, ...who: string[]) => who.forEach((k) => db.postLikes.add(ids[k], post.id));
  like(posts.techfest, 'ananya', 'rohan', 'priya', 'kabir', 'meera', 'arjun', 'sneha');
  like(posts.ananyaDesign, 'aarav', 'meera', 'priya', 'isha', 'rohan');
  like(posts.rohanRun, 'aarav', 'priya', 'arjun');
  like(posts.priyaMusic, 'aarav', 'rohan', 'kabir', 'ananya');
  like(posts.meeraPaper, 'aarav', 'ananya', 'rohan', 'priya', 'kabir', 'arjun', 'neha');
  like(posts.kabirFilm, 'arjun', 'priya');
  like(posts.arjunFood, 'aarav', 'kabir', 'priya', 'ananya');
  like(posts.nehaHiring, 'aarav', 'rohan', 'meera');
  like(posts.aaravStudy, 'ananya', 'meera', 'sneha');
  like(posts.ananyaCampus, 'aarav', 'isha');

  // --- Comments ---
  const comment = (targetId: string, targetType: 'post' | 'reel', author: string, minutesAgo: number, content: string, likers: string[] = []): Comment => {
    const u = users[author];
    const c: Comment = {
      id: newId('cmt'),
      postId: targetId,
      targetType,
      authorId: u.id,
      authorName: u.fullName,
      authorAvatar: u.avatarUrl,
      authorVerificationStatus: u.verificationStatus,
      content,
      createdAt: ago(minutesAgo),
      likesCount: 0,
      isDemo: true,
    };
    const list = db.comments.get(targetId) || [];
    list.push(c);
    db.comments.set(targetId, list);
    likers.forEach((k) => db.commentLikes.add(ids[k], c.id));
    const post = db.posts.get(targetId);
    if (post) db.posts.set(post.id, { ...post, commentsCount: list.length });
    const reel = db.reels.get(targetId);
    if (reel) db.reels.set(reel.id, { ...reel, commentsCount: list.length });
    return c;
  };
  comment(posts.techfest.id, 'post', 'ananya', 80, 'Rendezvous team will be there! Save us a spot at the robo arena 🤖', ['aarav']);
  comment(posts.techfest.id, 'post', 'rohan', 70, 'Coming with the whole quant club 🔥');
  comment(posts.techfest.id, 'post', 'sneha', 40, 'First Techfest as a fresher, so excited!!', ['aarav', 'ananya']);
  comment(posts.ananyaDesign.id, 'post', 'aarav', 170, 'The gold accents are 🤌 share the Figma?', ['ananya']);
  comment(posts.ananyaDesign.id, 'post', 'isha', 120, 'Hire her already 😄');
  comment(posts.meeraPaper.id, 'post', 'aarav', 650, 'Massive congrats Meera! 👏', ['meera']);
  comment(posts.meeraPaper.id, 'post', 'rajesh', 600, 'Excellent work, Meera. Would love to discuss a collaboration with our healthcare AI group.', ['meera', 'aarav']);
  comment(posts.meeraPaper.id, 'post', 'neha', 590, 'Congratulations! Sharing this with our industry partners.', ['meera']);
  comment(posts.aaravStudy.id, 'post', 'meera', 2500, 'Yes please! Graph algorithms section especially 🙏');
  comment(posts.priyaMusic.id, 'post', 'kabir', 400, 'Need a video of this next time!');

  // --- Reels ---
  const mkReel = (author: string, minutesAgo: number, caption: string, music: string, source: Partial<Reel>, views: number): Reel => {
    const u = users[author];
    const reel: Reel = {
      id: newId('reel'),
      authorId: u.id,
      authorName: u.fullName,
      authorAvatar: u.avatarUrl,
      authorCollege: u.collegeName || '',
      videoUrl: '',
      thumbnailUrl: '',
      provider: 'upload',
      caption,
      musicTrack: music,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: Math.floor(views / 40),
      viewsCount: views,
      repostsCount: 0,
      createdAt: ago(minutesAgo),
      isPublic: true,
      isDemo: true,
      ...source,
    };
    db.reels.set(reel.id, reel);
    return reel;
  };
  const yt = parseExternalVideo('https://www.youtube.com/watch?v=aqz-KE-bpKQ')!;
  const flower = parseExternalVideo('https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4')!;
  const reels = [
    mkReel('ananya', 60, 'POV: the last hour before a design jury 😮‍💨 #DesignLife', 'Lo-fi study beats', { ...mixkit(34563), provider: 'direct' }, 1840),
    mkReel('aarav', 140, 'Campus walk at golden hour ✨ #IITB #GoldenHour', 'Original audio · Aarav Sharma', { ...mixkit(1164), provider: 'direct' }, 2310),
    mkReel('priya', 260, 'Fest night energy ⚡ #Festember', 'Festember Anthem', { ...mixkit(39770), provider: 'direct' }, 3120),
    mkReel('kabir', 330, 'Film club screening tonight — Big Buck Bunny, the Blender open movie 🐰 #FilmClub', 'Big Buck Bunny OST', { videoUrl: yt.videoUrl, thumbnailUrl: yt.thumbnailUrl, provider: 'youtube', sourceUrl: yt.sourceUrl }, 980),
    mkReel('rohan', 520, 'Morning miles before class 🏃 #RunClub', 'Run It Up', { ...mixkit(1238), provider: 'direct' }, 1560),
    mkReel('meera', 800, 'Lab days in slow motion 🔬 #Research', 'Ambient Lab', { ...mixkit(39767), provider: 'direct' }, 1200),
    mkReel('priya', 980, 'Spring in the botanical garden 🌸', 'Nature sounds', { videoUrl: flower.videoUrl, provider: 'direct', sourceUrl: flower.sourceUrl }, 760),
    mkReel('arjun', 1250, 'Weekend vibes in the city 🌆 #Kolkata', 'City Pop', { ...mixkit(1173), provider: 'direct' }, 2045),
    mkReel('ananya', 1600, 'Studio session with the band 🎧', 'Rendezvous Jam', { ...mixkit(1224), provider: 'direct' }, 1410),
    mkReel('rohan', 2100, 'APOGEE setup timelapse 🛠️ #APOGEE', 'Build Mode', { ...mixkit(1166), provider: 'direct' }, 890),
    mkReel('kabir', 2600, 'Shot this between lectures 🎞️ #Photography', 'Film Grain', { ...mixkit(34487), provider: 'direct' }, 670),
  ];
  const likeReel = (r: Reel, ...who: string[]) => who.forEach((k) => db.reelLikes.add(ids[k], r.id));
  likeReel(reels[0], 'aarav', 'meera', 'priya', 'rohan', 'isha');
  likeReel(reels[1], 'ananya', 'rohan', 'priya', 'kabir', 'meera', 'arjun', 'sneha');
  likeReel(reels[2], 'aarav', 'kabir', 'rohan', 'ananya');
  likeReel(reels[3], 'arjun', 'priya', 'aarav');
  likeReel(reels[4], 'aarav', 'priya');
  likeReel(reels[5], 'ananya', 'aarav', 'neha');
  likeReel(reels[7], 'kabir', 'aarav', 'priya');
  comment(reels[0].id, 'reel', 'aarav', 50, 'The jury panic is too real 😂', ['ananya']);
  comment(reels[0].id, 'reel', 'meera', 45, 'Good luck!! You got this ✨');
  comment(reels[1].id, 'reel', 'ananya', 120, 'Powai lake looks unreal', ['aarav']);
  comment(reels[2].id, 'reel', 'rohan', 200, 'Take me back 🔥');
  comment(reels[3].id, 'reel', 'arjun', 300, 'Seminar hall is going to be packed 🍿');
  db.bookmarks.toggle(ids.aarav, 'reel', reels[2].id);
  db.bookmarks.toggle(ids.aarav, 'post', posts.meeraPaper.id);
  db.bookmarks.toggle(ids.aarav, 'post', posts.nehaHiring.id);

  // A reel reshared into the feed by Rohan.
  mkPost('rohan', 190, 'Priya’s fest edit is 🔥', [], { repostOf: { type: 'reel', id: reels[2].id } });
  db.reels.set(reels[2].id, { ...db.reels.get(reels[2].id)!, repostsCount: 1 });

  // --- Jobs ---
  const neha = users.neha;
  const mkJob = (minutesAgo: number, job: Partial<JobPosting>): JobPosting => {
    const j: JobPosting = {
      id: newId('job'),
      recruiterId: neha.id,
      recruiterName: neha.fullName,
      recruiterAvatar: neha.avatarUrl,
      companyName: 'Zentrix Labs Pvt Ltd',
      companyLogo: '',
      corporateTaxId: '',
      isCorporateVerified: true,
      jobTitle: '',
      jobType: 'Internship',
      location: 'Bengaluru (Hybrid)',
      salaryBracket: '',
      detailedRequirements: '',
      officialCompanyEmail: `careers@zentrixlabs.${DEMO_DOMAIN}`,
      eligibleBatches: '2027 & 2028 batches',
      tags: [],
      applicationCount: 0,
      deadline: new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10),
      createdAt: ago(minutesAgo),
      isDemo: true,
      ...job,
    };
    db.jobs.set(j.id, j);
    return j;
  };
  const sdeJob = mkJob(600, {
    jobTitle: 'Software Engineering Intern — Summer 2027',
    salaryBracket: '₹60,000 / month',
    detailedRequirements: 'Build product features across React + Node.js. Strong DSA, curiosity, and a GitHub you are proud of. 10-week program with a return-offer track.',
    tags: ['React', 'Node.js', 'TypeScript'],
  });
  mkJob(1400, {
    jobTitle: 'Associate Product Manager',
    jobType: 'Full-Time',
    location: 'Gurugram',
    salaryBracket: '₹22 LPA',
    detailedRequirements: 'Own a product area end-to-end with engineering and design. Great written communication and a bias for shipping.',
    eligibleBatches: '2026 graduates',
    tags: ['Product', 'Strategy'],
  });
  mkJob(2000, {
    jobTitle: 'Data Science Intern',
    location: 'Remote',
    salaryBracket: '₹45,000 / month',
    detailedRequirements: 'Python, SQL and experimentation. Work on recommendation models serving millions of users.',
    tags: ['Python', 'ML', 'SQL'],
  });
  mkJob(2600, {
    jobTitle: 'UI/UX Design Intern',
    location: 'Mumbai',
    salaryBracket: '₹35,000 / month',
    detailedRequirements: 'Portfolio showing product thinking. Figma fluency; motion design is a plus.',
    tags: ['Figma', 'Design Systems'],
  });
  db.jobApplications.add(ids.rohan, sdeJob.id);
  db.jobApplications.add(ids.meera, sdeJob.id);

  // --- Campus hub (IIT Bombay) ---
  const hub: PinnedCollegeFeed = {
    collegeId: 'col_iit_bombay_mumbai',
    collegeName: 'Indian Institute of Technology Bombay',
    shortCode: 'IIT Bombay',
    announcementsCount: 3,
    noticeBoard: [
      { id: newId('ntc'), title: 'End-semester examination timetable released', category: 'Exam', publishedAt: 'Today', isPinned: true },
      { id: newId('ntc'), title: 'Techfest volunteer registrations close Friday', category: 'Fest', publishedAt: 'Yesterday', isPinned: true },
      { id: newId('ntc'), title: 'Pre-placement talk: Zentrix Labs — LH 101, 5 PM', category: 'Placement', publishedAt: '2 days ago', isPinned: true },
    ],
    todaysPlanning: [
      { id: newId('evt'), title: 'Robotics workshop', time: '4:00 PM', location: 'SAC Hall', organizer: 'Robotics Club', badge: 'Workshop' },
      { id: newId('evt'), title: 'Open mic night', time: '7:30 PM', location: 'Convocation lawns', organizer: 'Literary Arts', badge: 'Culture' },
      { id: newId('evt'), title: 'Star-gazing meetup', time: '9:30 PM', location: 'Hostel 12 terrace', organizer: 'Astronomy Club', badge: 'Club' },
    ],
    clubHighlights: [
      { id: newId('club'), clubName: 'Photography Club', eventTitle: 'Monsoon photo walk', imageUrl: photo(1039, 800, 600), timeAgo: '2h ago' },
      { id: newId('club'), clubName: 'Dance Crew', eventTitle: 'Mood Indigo auditions', imageUrl: photo(1047, 800, 600), timeAgo: '1d ago' },
    ],
    isDemo: true,
  };
  db.pinnedFeeds.set(hub.collegeId, hub);

  // --- Direct messages ---
  /** `unreadForA` = how many trailing messages stay unread for the demo account. */
  const convo = (a: string, b: string, msgs: [who: string, minutesAgo: number, body: string, attach?: Parameters<typeof messaging.insertAt>[4]][], unreadForA = 0) => {
    const c = messaging.getOrCreate(ids[a], ids[b]);
    for (const [who, m, body, attach] of msgs) messaging.insertAt(c.id, ids[who], body, ago(m), attach);
    const readIdx = msgs.length - 1 - unreadForA;
    if (readIdx >= 0) messaging.markRead(c.id, ids[a], ago(msgs[readIdx][1] - 0.5));
    messaging.markRead(c.id, ids[b], ago(msgs[msgs.length - 1][1] - 0.5));
  };
  convo('aarav', 'ananya', [
    ['ananya', 300, 'Hey! Are you coming for Rendezvous this year? 🎉'],
    ['aarav', 290, 'Obviously 😄 Techfest first though, then Delhi'],
    ['ananya', 285, 'Deal. Also your robotics post was 🔥'],
    ['aarav', 280, 'Haha thanks! Loved your app redesign too'],
    ['ananya', 30, 'Sending you the Figma link tonight ✨'],
  ], 1);
  convo('aarav', 'rohan', [
    ['rohan', 900, 'Bro check this reel', { type: 'reel', id: reels[2].id, title: reels[2].caption, thumbUrl: reels[2].thumbnailUrl, authorName: 'Priya Nair' }],
    ['aarav', 880, 'That crowd 😳 NIT Trichy doesn’t play around'],
    ['rohan', 870, 'Next year we go together'],
  ]);
  convo('aarav', 'neha', [
    ['neha', 1400, 'Hi Aarav — Zentrix Labs asked the placement cell to shortlist students for their Summer 2027 SDE internship. Your Techfest robotics work stands out. Interested?'],
    ['aarav', 1390, 'Hi Neha, thank you! Yes, definitely interested 🙌'],
    ['neha', 1385, 'Great — apply from the Opportunities tab and I’ll forward your profile.'],
  ]);
  convo('aarav', 'meera', [
    ['meera', 20, 'Are you free for a quick call about the open-source dataset?'],
    ['meera', 18, 'Would love your help with the data loader 🙏'],
  ], 2);

  // --- Notifications for the demo account ---
  const n = (actor: string, minutesAgo: number, input: Omit<Parameters<typeof notifications.create>[1], 'actorId' | 'createdAt'>) =>
    notifications.create(ids.aarav, { ...input, actorId: ids[actor], createdAt: ago(minutesAgo) });
  n('rohan', 1200, { type: 'follow', targetType: 'user', targetId: ids.rohan, title: 'New follower', message: 'Rohan Mehta started following you.' });
  n('meera', 900, { type: 'like', targetType: 'post', targetId: posts.aaravStudy.id, thumbUrl: photo(4), title: 'New like', message: 'Meera Reddy liked your post.' });
  n('ananya', 80, { type: 'comment', targetType: 'post', targetId: posts.techfest.id, thumbUrl: photo(1047), title: 'New comment', message: 'Ananya Iyer commented: "Rendezvous team will be there! Save us a spot at the robo arena 🤖"' });
  n('sneha', 40, { type: 'comment', targetType: 'post', targetId: posts.techfest.id, thumbUrl: photo(1047), title: 'New comment', message: 'Sneha Patel commented: "First Techfest as a fresher, so excited!!"' });
  n('priya', 25, { type: 'like', targetType: 'post', targetId: posts.techfest.id, thumbUrl: photo(1047), title: 'New like', message: 'Priya Nair liked your post.' });
  n('kabir', 12, { type: 'like', targetType: 'reel', targetId: reels[1].id, thumbUrl: reels[1].thumbnailUrl, title: 'New like', message: 'Kabir Singh liked your reel.' });
  n('neha', 8, { type: 'system', title: 'New opening', message: 'Placement cell shared “Software Engineering Intern — Summer 2027” at Zentrix Labs. Check Opportunities.' });

  // --- Pending verification (for the admin console demo) ---
  const pdf = samplePdf([
    'IIT BOMBAY - FEE RECEIPT',
    'Student: Sneha Patel',
    'Programme: B.Tech (2025-2029)',
    'Semester: Autumn 2025',
    'Amount paid: Rs 1,12,500',
    'Receipt No: IITB/2025/88412',
    '(Demo document)',
  ]);
  const docUrl = await storage.store(pdf, 'documents', sniffFile(pdf)!);
  const docId = newId('vdoc');
  db.verificationDocuments.set(docId, {
    id: docId,
    userId: ids.sneha,
    userName: 'Sneha Patel',
    userEmail: users.sneha.email,
    userPhone: '',
    collegeName: users.sneha.collegeName || '',
    documentType: 'fees_receipt',
    documentUrl: docUrl,
    fuzzyScore: 0,
    status: 'Pending',
    submittedAt: ago(35),
  });

  // --- A spam report waiting for moderation ---
  const reportId = newId('rpt');
  db.reports.set(reportId, {
    id: reportId,
    reporterId: ids.ananya,
    reporterName: 'Ananya Iyer',
    targetType: 'post',
    targetId: posts.promoSpam.id,
    targetOwnerId: ids.promo,
    reason: 'Scam or fraud',
    details: 'Selling fake followers.',
    snapshot: posts.promoSpam.content,
    status: 'open',
    createdAt: ago(200),
  });

  // --- A resolved support ticket ---
  db.supportTickets.set('TCK-DEMO01', {
    id: 'TCK-DEMO01',
    userId: ids.aarav,
    userName: 'Aarav Sharma',
    userEmail: users.aarav.email,
    category: 'Bug',
    subject: 'Reel audio stayed muted after unmuting',
    description: 'On one reel the sound did not turn on until I scrolled.',
    priority: 'Low',
    status: 'Resolved',
    adminNote: 'Fixed in the latest update — thanks for reporting!',
    createdAt: ago(60 * 24 * 3),
    updatedAt: ago(60 * 24 * 2),
  });

  meta.set('demo_primary_user', ids.aarav);
  meta.set('demo_seed_version', DEMO_VERSION);
  logger.info(`🎬 Demo campus ready: ${PEOPLE.length} people, ${db.posts.size} posts, ${db.reels.size} reels.`);
}

/** Stories expire after 24h — recreate the demo ones on every boot. */
function refreshDemoStories(): void {
  const primary = meta.get('demo_primary_user');
  if (!primary) return;
  for (const s of Array.from(db.stories.values())) if (s.isDemo) db.deleteStory(s.id);

  const byName = new Map(Array.from(db.users.values()).filter((u) => u.isDemo).map((u) => [u.fullName, u]));
  const mk = (name: string, minutesAgo: number, mediaUrl: string, caption: string, mediaType: 'image' | 'video' = 'image') => {
    const u = byName.get(name);
    if (!u) return null;
    const created = ago(minutesAgo);
    const story: Story = {
      id: newId('story'),
      userId: u.id,
      userName: u.fullName,
      userAvatar: u.avatarUrl,
      collegeName: u.collegeName || '',
      mediaUrl,
      mediaType,
      caption,
      createdAtISO: created,
      expiresAt: new Date(new Date(created).getTime() + 24 * 3600_000).toISOString(),
      isDemo: true,
    };
    db.stories.set(story.id, story);
    return story;
  };
  const mine = mk('Aarav Sharma', 90, photo(6, 1080, 1920), 'Late night build session 💻');
  mk('Ananya Iyer', 30, photo(20, 1080, 1920), 'Figma > sleep');
  mk('Ananya Iyer', 25, photo(1015, 1080, 1920), 'Weekend escape 🏔️');
  mk('Priya Nair', 55, mixkit(39770).videoUrl, 'Rehearsal night ⚡', 'video');
  mk('Rohan Mehta', 120, photo(1018, 1080, 1920), 'Sunrise run done ✅');
  mk('Meera Reddy', 200, photo(2, 1080, 1920), 'Paper accepted 🎉');
  mk('Kabir Singh', 260, photo(1047, 1080, 1920), 'Seminar hall setup for tonight 🎬');
  mk('Arjun Das', 400, photo(1080, 1080, 1920), 'Mishti haul 🍬');
  if (mine) {
    for (const name of ['Ananya Iyer', 'Rohan Mehta', 'Meera Reddy']) {
      const u = byName.get(name);
      if (u) db.storyViews.add(u.id, mine.id);
    }
  }
}

export async function syncDemoContent(): Promise<void> {
  try {
    if (!env.demoMode) {
      if (meta.get('demo_seed_version') || Array.from(db.users.values()).some((u) => u.isDemo)) purgeDemo();
      return;
    }
    if (meta.get('demo_seed_version') !== DEMO_VERSION) {
      purgeDemo();
      await seedDemo();
    }
    refreshDemoStories();
    const now = new Date().toISOString();
    for (const u of db.users.values()) if (u.isDemo) db.users.set(u.id, { ...u, lastActiveAt: now });
  } catch (err) {
    logger.error('Demo content sync failed', { error: String(err) });
  }
}

