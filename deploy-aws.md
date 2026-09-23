# Deploying College Campus on AWS

This guide runs the app on one EC2 server with Docker. Photos, reels and documents go to S3. It's the simplest setup that's safe for production, and it costs very little until you have real traffic.

```
Phone / browser ──HTTPS──▶ EC2 (Docker: nginx web app ─▶ Node API + SQLite on a volume)
                                                   └──▶ S3 bucket (media; documents stay private)
```

> **Never paste real keys into code, docs or chat.** All secrets live in `server/.env` on the server. That file is git-ignored.

---

## 1. Create the S3 bucket

1. Go to **S3 → Create bucket**. Name it something like `collegecampus-media-<random>`. Region: `ap-south-1` (Mumbai).
2. Leave **Block all public access = ON**.
3. Choose one way to serve public media:
   - **CloudFront (recommended).** Create a distribution with the bucket as origin and **Origin Access Control** enabled. Let CloudFront update the bucket policy. Then add a deny for the private folder so verification documents never go out through the CDN (step 4). Put the distribution URL in `AWS_CLOUDFRONT_URL`.
   - **Direct bucket URLs.** Turn off "Block public access" and allow public `GetObject` only on the media folders:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [{
         "Sid": "PublicMediaOnly",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": [
           "arn:aws:s3:::YOUR_BUCKET/avatars/*",
           "arn:aws:s3:::YOUR_BUCKET/posts/*",
           "arn:aws:s3:::YOUR_BUCKET/reels/*",
           "arn:aws:s3:::YOUR_BUCKET/stories/*"
         ]
       }]
     }
     ```
4. **Verification documents (`documents/*`) must never be public.** The API opens them only through short-lived signed links, and only for admins. If you use CloudFront, add this deny statement to the bucket policy:
   ```json
   {
     "Sid": "NoCdnForDocuments",
     "Effect": "Deny",
     "Principal": { "Service": "cloudfront.amazonaws.com" },
     "Action": "s3:GetObject",
     "Resource": "arn:aws:s3:::YOUR_BUCKET/documents/*"
   }
   ```

Uploads go through the API, which checks each file's real type. The bucket doesn't need a CORS rule.

## 2. Create a least-privilege IAM user for the app

**IAM → Users → Create user** (`campus-app`), with no console access. Attach this inline policy and nothing else. Don't use `AmazonS3FullAccess` or admin policies.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::YOUR_BUCKET/*"
  }]
}
```

Create an access key for this user. Copy it straight into `server/.env` on the server and nowhere else.

**If a key ever leaks:**
1. Go to **IAM → Users → Security credentials → Deactivate → Delete**.
2. Create a new key.
3. Check **Billing** and **CloudTrail** for activity you don't recognise.

## 3. Launch the server

1. **EC2 → Launch instance**: Ubuntu 24.04, `t3.small` or larger, 30 GB disk.
2. Security group: allow **80** and **443** from anywhere. Allow **22 only from your IP**.
3. Install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER && newgrp docker
   ```
4. Copy the project and create the secrets file:
   ```bash
   git clone https://github.com/<you>/<repo>.git college-campus && cd college-campus
   cp server/.env.example server/.env
   nano server/.env
   ```
5. Generate secrets. Run this once for `JWT_SECRET` and once for `OWNER_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

### Minimum production `server/.env`

```ini
NODE_ENV=production
APP_URL=https://app.yourdomain.in
CORS_ORIGINS=https://app.yourdomain.in,capacitor://localhost,https://localhost
JWT_SECRET=<64+ random hex chars>
ADMIN_EMAILS=you@yourdomain.in
ADMIN_PIN=<6 digits you choose>
OWNER_SECRET=<random, at least 12 chars>
DEMO_MODE=false

AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=<campus-app key>
AWS_SECRET_ACCESS_KEY=<campus-app secret>
AWS_S3_BUCKET=<your bucket>
AWS_CLOUDFRONT_URL=https://dxxxxxxxx.cloudfront.net

SMTP_HOST=email-smtp.ap-south-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=<SES SMTP user>
SMTP_PASS=<SES SMTP password>
SMTP_FROM=College Campus <no-reply@yourdomain.in>

GOOGLE_CLIENT_ID=<optional>
ICE_SERVERS=<optional TURN servers for live video>
```

In production the API refuses to start without a strong `JWT_SECRET`. It also refuses known-leaked values.

6. Start everything:
   ```bash
   docker compose up --build -d
   docker compose logs -f server
   ```
   The web app is served on port 80. `/api`, `/uploads` and `/ws` are passed through to the API.

## 4. HTTPS

1. Point your domain's A record at the EC2 IP.
2. Put HTTPS in front of it. Either:
   - an **Application Load Balancer** with an **ACM** certificate (forwarding to port 80), or
   - Caddy / Certbot on the instance.
3. Keep `APP_URL` and `CORS_ORIGINS` set to the `https://` address.

## 5. Backups

The database is a single file inside the `campus_data` Docker volume. Take a daily **EBS snapshot** of the instance (Data Lifecycle Manager), or copy the file out:

```bash
docker compose exec server node -e "require('better-sqlite3')('/app/data/campus.db').backup('/app/data/backup.db').then(() => console.log('backup ok'))"
docker cp college_campus_server:/app/data/backup.db ./backup-$(date +%F).db
```

## Old RDS / PostgreSQL resources

Earlier versions of this project created an RDS PostgreSQL instance. The app no longer needs it. If it still exists:
- **delete it**, or at least change its master password and turn off public access;
- remove any security-group rule that opens port 5432 to the internet.
