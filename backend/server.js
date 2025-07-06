const express = require('express');        // for creating the server - web framework for Node.js
const fs = require('fs').promises;         // for file system operations
const path = require('path');              // for handling file paths  
const cors = require('cors');              // for handling CORS
const { exec } = require('child_process'); // for executing shell commands

const app = express();                     // create express application
const PORT = 3001;                         // define port

// enable CORS for frontend
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET'],
  credentials: false
}));

// serve static files from the 'public' directory,
// is where the frontend will be served from
app.use(express.static('public'));

// endpoint to list drives
app.get('/drives', (req, res) => {
  // get drives
  exec('powershell "Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root"', (err, stdout) => {
    if (err) return res.status(500).json({ error: 'Failed to list drives' });

    // parse output for drive letters
    const drives = stdout
      .split('\r\n')
      .map(line => line.trim())
      .filter(line => /^[A-Z]:\\$/i.test(line))
      .map(line => line.replace('\\', ''));

    console.log('[/drives] Found drives:', drives);
    res.json(drives);
  });
});

// func to calc directory size recursively
async function getDirectorySize(dirPath) {
  let total = 0;
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    const sizePromises = files.map(async file => {
      const fullPath = path.join(dirPath, file.name);
      try {
        if (file.isDirectory()) {
          return await getDirectorySize(fullPath); // recurse into subdir
        } else {
          const stats = await fs.stat(fullPath);   // get file stats
          return stats.size;                       // return file size
        }
      } catch {
        return 0; // skip inaccessible files
      }
    });
    const sizes = await Promise.all(sizePromises);
    total = sizes.reduce((acc, size) => acc + size, 0); // sum of all sizes
  } catch {
    console.warn('[/getDirectorySize] Skipped inaccessible folder:', dirPath);
  }
  return total;
}

// generic traversal func for both scan and stream
async function traverseDirectory(dirPath, depth, maxDepth, onFolder, prefix = '') {
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory()) continue;

      const fullPath = path.join(dirPath, item.name);
      try {
        const size = await getDirectorySize(fullPath);
        const name = prefix ? `${prefix}/${item.name}` : item.name;

        await onFolder({ name, size, fullPath, depth });

        if (depth < maxDepth) {
          await traverseDirectory(fullPath, depth + 1, maxDepth, onFolder, name);
        }
      } catch (err) {
        console.warn('⚠️ [traverseDirectory] Skipped:', fullPath, err.message);
      }
    }
  } catch (err) {
    console.error('❌ [traverseDirectory] Failed to read:', dirPath, err.message);
  }
}

// endpoint to scan a directory and return folder sizes or total size
app.get('/scan', async (req, res) => {
  const dirPath = req.query.path || 'C:\\';
  const maxDepth = parseInt(req.query.depth) || 1;
  const summary = req.query.summary === 'true';

  console.log('🔍 [scan] Scanning:', dirPath, 'Depth:', maxDepth, 'Summary:', summary);

  try {
    if (summary) {
      const totalSize = await getDirectorySize(dirPath);
      res.json({ path: dirPath, size: totalSize });
    } else {
      const results = [];
      await traverseDirectory(dirPath, 1, maxDepth, async ({ name, size }) => {
        results.push({ name, size });
      });
      res.json(results);
    }
  } catch (err) {
    console.error('❌ [scan] Failed to scan:', err.message);
    res.status(500).json({ error: 'Failed to scan directory.' });
  }
});

// endpoint to stream folder sizes as they're calculated
app.get('/scan-stream', async (req, res) => {
  const dirPath = req.query.path.endsWith(':') ? req.query.path + '\\' : req.query.path || 'C:\\';
  const maxDepth = parseInt(req.query.depth) || 1;

  console.log('\n[/scan-stream] Request received for:', dirPath);

  // setup SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': keep-alive\n\n');
    console.log('[/scan-stream] Still scanning! Be patient..');
  }, 30000);

  // cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    console.log('[/scan-stream] Endpoint closed');
    res.end();
  });

  // stream folder sizes
  await traverseDirectory(dirPath, 1, maxDepth, async ({ name, size }) => {
    console.log('[/scan-stream] ', name, 'Size:', size);
    res.write(`data: ${JSON.stringify({ name, size })}\n\n`);
  });

  console.log('[/scan-stream] Stream complete for:', dirPath);
  res.write('event: done\ndata: done\n\n');
  res.end();
});

// start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});