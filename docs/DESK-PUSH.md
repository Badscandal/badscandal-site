# Desk push

Each bot can have one outgoing webhook on the desk. The field starts empty. Empty means off. HQ does not invent an address, and the address is never written into this repo.

## What Luke pastes

On `/hq`, open Team, then Desk push. There is one box per bot. Paste the https address that bot's app gives you, then Save. Nova collects the address from that bot and sends it to Luke. She does not paste it. Only Luke can save it.

To turn a bot off, clear the box and Save. The page shows the host only, never the full address.

## What HQ sends

When a message, a task update, or a card answer for that bot is saved, HQ POSTs exactly this JSON. There is no message text, no amount and no link.

```json
{ "desk": "badscandal", "kind": "message", "bot": "Nova", "id": "m…", "at": "2026-11-18T15:00:00.000Z" }
```

`kind` is `message`, `task` or `card`. The bot then calls `my_day`.

Until each address is pasted, that bot stays off and HQ does not call out.
