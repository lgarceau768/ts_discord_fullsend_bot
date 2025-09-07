### Run to setup cron job (after moving discord-bot-update.sh to /usr/local/bin)

```
crontab -e


17 4 * * * /usr/local/bin/discord-bot-update.sh >> /var/log/discord-bot-update.cron.log 2>&1
```