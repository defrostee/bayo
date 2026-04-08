# Discord Bot

Prefix: `+` | No slash commands. You're welcome.

## Setup

```bash
npm install
cp .env.example .env
# put your token in .env
node index.js
```

## Required Bot Permissions
- Manage Nicknames
- Ban Members
- Kick Members
- Moderate Members (Timeout)
- Read Messages / Send Messages
- Read Message History
- Manage Messages

## Required Privileged Intents (Discord Dev Portal)
- Server Members Intent
- Message Content Intent
- Presence Intent

---

## Commands

| Command | Who | What |
|---|---|---|
| `+ping` | Anyone | checks if bot is alive |
| `+changerole @role` | Server Owner | sets role that can change bot appearance |
| `+modrole @role` | Server Owner | sets role that can use mod commands |
| `+avatar` + image attachment | Bot Role | changes bot avatar |
| `+nickname <name>` | Bot Role | changes bot nickname |
| `+ban @user` | Mod Role | bans user |
| `+kick @user` | Mod Role | kicks user |
| `+timeout @user [minutes]` | Mod Role | times out user (default 10min) |
| `+watch @user` | Mod Role | toggle watch on user (run again to remove) |
| `+watchlog #channel` | Mod Role | set channel for watch logs |
| `+send #channel message` | Mod Role | sends message as bot to channel |

## Notes
- `data.json` is auto-created — stores roles + watchlist per guild
- `+watch` toggles: run again on same user to remove them from watch
- Watch logs go to the channel you ran `+watch` in unless you set one with `+watchlog`
- Timeout duration is in minutes (e.g. `+timeout @user 30` = 30 min)
