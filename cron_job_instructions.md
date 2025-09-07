crontab -e

17 4 * * * /usr/local/bin/discord-bot-update.sh >> /var/log/discord-bot-update.cron.log 2>&1
