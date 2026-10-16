# Bucks County Photo Printing — Static Site

This repository contains the static export of the Bucks County Photo Printing website, ready for deployment to **GitHub Pages**, **Netlify**, **Cloudflare Pages**, or any static host.

## Deploying to GitHub Pages

### Method 1: Push directly to a GitHub repository
1. Initialize git in this directory (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Static export of Bucks County Photo Printing"
   git branch -M main
   ```
2. Create a new repository on GitHub (e.g. `buckscountyphotoprinting` or `<username>.github.io`).
3. Link and push:
   ```bash
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
4. In your GitHub repository:
   - Go to **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, select **Deploy from a branch**.
   - Select branch **main** and folder **/** (root), then click **Save**.
   - Your site will be live within 1–2 minutes!

### Method 2: Custom Domain (e.g. buckscountyphotoprinting.com)
If deploying under a custom domain:
1. Create a `CNAME` file in this directory containing your domain name:
   ```
   buckscountyphotoprinting.com
   ```
2. Configure your DNS provider with the appropriate A records / CNAME pointing to GitHub Pages.

## Site Structure
- `index.html` — Homepage
- `<slug>/index.html` — All 32 inner service, genre, pricing, and resource pages
- `404.html` — Branded 404 error page
- `wp-content/` — All required CSS, JS, fonts, images, and ICC profile downloads
- `.nojekyll` — Required for GitHub Pages to serve all directories without Jekyll interference
- `sitemap.xml` & `robots.txt` — SEO ready

## Re-generating the Static Site
Whenever you make changes in the local WordPress site:
```bash
php _deploy/scripts/convert-to-static.php
```