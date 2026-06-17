const express = require('express');
const { spawn } = require('child_process');
const app = express();
const PORT = 8080;

const YTDLP_PATH = process.platform === "linux" ? "yt-dlp" : "./yt-dlp.exe";

let CHANNELS = [];
async function initializeChannels(){
	if(!CHANNELS.length){
		CHANNELS = await fetchTextArray('https://raw.githubusercontent.com/uzayyli/iptv/refs/heads/master/channels.json');
		let extraChannels_ifAny = require('./extra_channels.json');
		CHANNELS = CHANNELS.concat(extraChannels_ifAny);
	}
	return CHANNELS
}
async function fetchTextArray(url) {
  try {
    const response = await fetch(url);
    const textData = await response.text();
    return JSON.parse(textData);
  } catch (error) {
    console.error("Failed to fetch file:", error);
    return [];
  }
}

// Serve M3U playlist
app.get('/playlist.m3u', async (req, res) => {
	CHANNELS = await initializeChannels();
  const host = req.headers.host;
  let m3u = '#EXTM3U\n';
  CHANNELS.forEach((ch, i) => {
    m3u += `#EXTINF:-1,${ch.name}\n`;
    m3u += `http://${host}/stream/${i}\n`;
  });
  res.setHeader('Content-Type', 'audio/x-mpegurl');
  res.send(m3u);
});

// Relay stream by channel index
app.get('/stream/:id', async (req, res) => {
  CHANNELS = await initializeChannels();
  const ch = CHANNELS[parseInt(req.params.id)];
  if (!ch) return res.status(404).send('Channel not found');

  console.log(`[START] Streaming: ${ch.name}`);

  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Transfer-Encoding', 'chunked');

  let ytdlp = null;
  let ffmpeg = null;
  
  const customHeaders = 
    "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n" +
    "Referer: https://www.youtube.com/\r\n";

  // Helper function to spin up FFmpeg with optimized args
  const startFFmpeg = (inputs) => {
    const ffmpegArgs = [
      '-loglevel', 'error', // 1. Silence the console spam completely
      '-re'
    ];

    // Add inputs with headers
    inputs.forEach(url => {
      ffmpegArgs.push('-headers', customHeaders, '-i', url);
    });

    // 2. ULTRA FAST: Copy codec directly without transcoding video or audio
    ffmpegArgs.push(
      '-c:v', 'copy', 
      '-c:a', 'copy',
      '-f', 'mpegts',
      'pipe:1'
    );

    ffmpeg = spawn('ffmpeg', ffmpegArgs);

    ffmpeg.stdout.pipe(res);
    
    // Only logs critical errors now due to -loglevel error
    ffmpeg.stderr.on('data', d => process.stderr.write(`[FFmpeg Error] ${d}`));

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      console.log(`[STOP] Client disconnected from channel: ${ch.name}`);
      try { ffmpeg.stdout.unpipe(res); } catch (e) {}
      if (ffmpeg && !ffmpeg.killed) ffmpeg.kill('SIGKILL');
    };

    req.on('close', cleanup);
    res.on('close', cleanup);
  };

  // --- Route Execution ---
  if (ch.type === 'direct') {
    startFFmpeg([ch.url]);
    return;
  }

  // Handle yt-dlp streams
  ytdlp = spawn(YTDLP_PATH, [
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best', // Force compatible formats for direct copying
    '--no-playlist',
    '-g',
    ch.url,
  ]);

  let urlBuf = '';
  ytdlp.stdout.on('data', d => urlBuf += d.toString());

  ytdlp.on('close', code => {
    const urls = urlBuf.trim().split('\n').filter(Boolean);
    if (code !== 0 || urls.length === 0) {
      console.error(`[ERROR] yt-dlp failed for ${ch.name}`);
      if (!res.headersSent) res.status(500).send('Could not resolve stream URL');
      return;
    }
    startFFmpeg(urls);
  });

  ytdlp.on('error', err => console.error('yt-dlp spawn error:', err));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Relay server running at http://0.0.0.0:${PORT}`);
});

process.on('uncaughtException', err => {
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
  console.error('Uncaught exception:', err);
});