# Stream Relay Server

Relays internet streams (YouTube, live sports, etc.) to your local TV receiver via M3U playlist.

## Requirements

- Node.js
- yt-dlp (put the executable in project root): https://github.com/yt-dlp/yt-dlp/releases
- ffmpeg (add to PATH): `winget install ffmpeg`

## Setup

```bash
npm install
```

- For Windows: needs `npm install -g deno`

## Run

```bash
npm start
```
## Tips

- Keep yt-dlp updated: `yt-dlp -U`
- If receiver can't play the stream, change `-c copy` to `-c:v libx264 -c:a aac` in server.js (uses more CPU)
- For live streams, the `-re` flag in ffmpeg keeps playback real-time
- yt-dlp supported channels: https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md
- yt-dlp list format: ./yt-dlp.exe -F "url"
