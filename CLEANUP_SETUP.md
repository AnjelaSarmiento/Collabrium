# Post Management Cleanup Setup

This document explains how to set up automatic cleanup of deleted posts after 30 days.

## Manual Cleanup

To manually run the cleanup script:

```bash
npm run cleanup
```

## Automatic Cleanup Setup

### Option 1: Using Cron (Linux/macOS)

Add this to your crontab to run cleanup daily at 2 AM:

```bash
# Edit crontab
crontab -e

# Add this line:
0 2 * * * cd /path/to/collabrium && npm run cleanup
```

### Option 2: Using Windows Task Scheduler

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger to "Daily" at 2:00 AM
4. Set action to "Start a program"
5. Program: `cmd`
6. Arguments: `/c cd /d C:\path\to\collabrium && npm run cleanup`

### Option 3: Using PM2 (Recommended for Production)

If you're using PM2 to manage your Node.js processes:

```bash
# Install PM2 if not already installed
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'collabrium-api',
      script: 'server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'cleanup-cron',
      script: 'cleanup-deleted-posts.js',
      cron_restart: '0 2 * * *',
      autorestart: false,
      watch: false
    }
  ]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## What the Cleanup Does

The cleanup script:
1. Finds posts that were deleted more than 30 days ago
2. Permanently removes them from the database
3. Logs the cleanup activity
4. Refunds any escrow funds for paid tasks

## Monitoring

Check the cleanup logs by running:

```bash
# If using PM2
pm2 logs cleanup-cron

# If using cron, check system logs
tail -f /var/log/syslog | grep cleanup
```

## Environment Variables

Make sure these are set in your environment:

- `MONGODB_URI`: MongoDB connection string
- `NODE_ENV`: Set to 'production' for production environments
